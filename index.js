/**
 * 完整Cloudflare Worker反向代理脚本
 * 支持OpenAI/OpenRouter，自动容灾、CORS跨域、速率限制
 */

const CONFIG = {
  UPSTREAMS: [
    { base: "https://openrouter.ai", pathPrefix: "/v1", weight: 30 },
    { base: "https://api.openai.com", pathPrefix: "/v1", weight: 20 }
  ],
  ALLOWED_ORIGINS: [],
  RATE_LIMIT: { max: 5, windowMs: 1000 },
  MONITOR_KEY: "monitor_2025_cloudflare_worker_proxy",
  UPSTREAM_TIMEOUT: 15000,
  FAIL_THRESHOLD: 3,
  RECOVER_THRESHOLD: 5
};

const rateStore = new Map();
const usageStore = new Map();
const upstreamHealth = new Map(CONFIG.UPSTREAMS.map(u => [
  u.base, 
  { success: 0, fail: 0, latency: 0, consecutiveFail: 0, isDegraded: false }
]));

addEventListener("fetch", event => event.respondWith(handleRequest(event.request)));

function getRateKey(ip) {
  return `ip:${ip}`;
}

function isRateLimited(ip) {
  const key = getRateKey(ip);
  const now = Date.now();
  const window = CONFIG.RATE_LIMIT.windowMs;
  const records = rateStore.get(key) || [];
  
  const validRecords = records.filter(t => now - t < window);
  if (validRecords.length >= CONFIG.RATE_LIMIT.max) return true;
  
  validRecords.push(now);
  rateStore.set(key, validRecords);
  return false;
}

function updateUsage(ip, tokens = 0) {
  const data = usageStore.get(ip) || { requests: 0, tokens: 0, lastRequest: Date.now() };
  data.requests += 1;
  data.tokens += tokens;
  data.lastRequest = Date.now();
  usageStore.set(ip, data);
}

function updateUpstreamHealth(upstream, isSuccess, latency = 0) {
  const health = upstreamHealth.get(upstream);
  if (!health) return;

  if (isSuccess) {
    health.success += 1;
    health.consecutiveFail = 0;
    health.isDegraded = health.consecutiveFail < CONFIG.FAIL_THRESHOLD;
  } else {
    health.fail += 1;
    health.consecutiveFail += 1;
    health.isDegraded = health.consecutiveFail >= CONFIG.FAIL_THRESHOLD;
  }
  health.latency = latency ? (health.latency * 0.8 + latency * 0.2) : health.latency;
  upstreamHealth.set(upstream, health);
}

function selectBestUpstream() {
  return CONFIG.UPSTREAMS.sort((a, b) => {
    const aHealth = upstreamHealth.get(a.base);
    const bHealth = upstreamHealth.get(b.base);
    
    if (aHealth.isDegraded !== bHealth.isDegraded) return aHealth.isDegraded ? 1 : -1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return (aHealth.fail - bHealth.fail) || (aHealth.latency - bHealth.latency);
  })[0];
}

async function extractTokens(response) {
  try {
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.clone().json();
      return data.usage?.total_tokens || 0;
    }
  } catch {}
  return 0;
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Accept,OpenAI-Beta,X-OpenAI-Client-User-Agent",
    "Access-Control-Expose-Headers": "Content-Length,OpenAI-Organization,OpenAI-Processing-Time",
    "Access-Control-Max-Age": "86400"
  };
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!url.pathname.startsWith("/api")) {
    return new Response(JSON.stringify({ 
      error: "Request path must start with /api" 
    }), {
      status: 404,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" }
    });
  }
  const path = url.pathname.replace(/^\/api/, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ 
      error: "Too Many Requests" 
    }), {
      status: 429,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" }
    });
  }

  if (path === "/monitor") {
    const authKey = url.searchParams.get("key");
    if (authKey !== CONFIG.MONITOR_KEY) {
      return new Response(JSON.stringify({ error: "Invalid monitor key" }), { 
        status: 403, 
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      timestamp: Date.now(),
      usage: Object.fromEntries(usageStore),
      upstreamHealth: Object.fromEntries(upstreamHealth),
      config: { rateLimit: CONFIG.RATE_LIMIT, timeout: CONFIG.UPSTREAM_TIMEOUT }
    }, null, 2), {
      status: 200,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" }
    });
  }

  const upstream = selectBestUpstream();
  const targetUrl = `${upstream.base}${upstream.pathPrefix}${path}${url.search}`;
  const requestHeaders = new Headers(request.headers);

  requestHeaders.delete("Host");
  requestHeaders.delete("CF-Connecting-IP");
  requestHeaders.set("X-Forwarded-For", clientIp);
  requestHeaders.set("X-Forwarded-Proto", "https");

  let upstreamResp;
  const startTime = Date.now();
  try {
    upstreamResp = await fetch(targetUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(CONFIG.UPSTREAM_TIMEOUT)
    });
  } catch (err) {
    updateUpstreamHealth(upstream.base, false);
    return new Response(JSON.stringify({
      error: `Upstream request failed: ${err.message}`,
      upstream: upstream.base
    }), {
      status: 502,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" }
    });
  }

  const latency = Date.now() - startTime;
  const isUpstreamSuccess = upstreamResp.status >= 200 && upstreamResp.status < 500;
  updateUpstreamHealth(upstream.base, isUpstreamSuccess, latency);

  const tokens = await extractTokens(upstreamResp);
  updateUsage(clientIp, tokens);

  const responseHeaders = new Headers(upstreamResp.headers);
  Object.entries(getCorsHeaders()).forEach(([k, v]) => responseHeaders.set(k, v));
  ["Set-Cookie", "CF-Ray", "CF-Cache-Status", "Report-To", "NEL", "alt-svc", "vary"].forEach(h => responseHeaders.delete(h));

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: responseHeaders
  });
}