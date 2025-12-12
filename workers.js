// ================== 配置项 ==================
const CONFIG = {
    AUTH_KEY: "dt201019901988",
    ALLOWED_METHODS: ["GET", "POST", "OPTIONS"],
    AUTO_REFRESH_INTERVAL: 10000,
    HEALTHY_CHECK_INTERVAL: 30000,
    CORS_HEADERS: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Custom-Auth"
    },
    UPSTREAMS: [
        { name: "OpenRouter", base: "https://openrouter.ai/api/v1", key: "sk-or-v1-你的OpenRouterKey" },
        { name: "OpenAI", base: "https://api.openai.com/v1", key: "sk-你的OpenAIKey" },
        { name: "Groq", base: "https://api.groq.com/v1", key: "gsk-你的GroqKey" }
    ]
};

const upstreamStatus = new Map();
const upstreamInfo = new Map();

// 跨域 OPTIONS
function handleOptions() {
    return new Response(null, { headers: CONFIG.CORS_HEADERS });
}

// 鉴权
function validateAuth(request) {
    return request.headers.get("X-Custom-Auth") === CONFIG.AUTH_KEY;
}

// 转发请求
async function forwardRequest(request) {
    const url = new URL(request.url);
    const target = CONFIG.UPSTREAMS.find(u => url.pathname.startsWith(`/v1`)) || null;
    if (!target) return new Response(JSON.stringify({ error: "No upstream found" }), { status: 404, headers: CONFIG.CORS_HEADERS });

    const targetUrl = target.base + url.pathname + url.search;
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete("X-Custom-Auth");
    forwardHeaders.set("Authorization", `Bearer ${target.key}`);
    forwardHeaders.set("Host", new URL(target.base).host);
    forwardHeaders.set("Referer", target.base);

    const body = request.method === "POST" ? request.body : null;
    return fetch(targetUrl, { method: request.method, headers: forwardHeaders, body, redirect: "follow" });
}

// 上游健康检查
async function checkUpstreams() {
    for (const u of CONFIG.UPSTREAMS) {
        try {
            const res = await fetch(`${u.base}/models`, { headers: { "Authorization": `Bearer ${u.key}` } });
            const data = await res.json();
            upstreamStatus.set(u.name, res.ok);
            upstreamInfo.set(u.name, { lastCheck: new Date().toISOString(), error: res.ok ? null : JSON.stringify(data), models: res.ok && data.data ? data.data : [] });
        } catch (e) {
            upstreamStatus.set(u.name, false);
            upstreamInfo.set(u.name, { lastCheck: new Date().toISOString(), error: e.message, models: [] });
        }
    }
}
setInterval(checkUpstreams, CONFIG.HEALTHY_CHECK_INTERVAL);
checkUpstreams();

// Worker 主处理
export default {
    async fetch(request, env, ctx) {
        const { method } = request;
        const url = new URL(request.url);
        const pathname = url.pathname;

        if (method === "OPTIONS") return handleOptions();

        if (!validateAuth(request)) {
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid X-Custom-Auth" }), {
                status: 401,
                headers: { ...CONFIG.CORS_HEADERS, "Content-Type": "application/json" }
            });
        }

        // 调试接口
        if (pathname === "/models-debug") {
            return new Response(JSON.stringify(
                CONFIG.UPSTREAMS.map(u => ({
                    name: u.name,
                    status: upstreamStatus.get(u.name) || false,
                    lastCheck: upstreamInfo.get(u.name)?.lastCheck || null,
                    error: upstreamInfo.get(u.name)?.error || null,
                    modelCount: upstreamInfo.get(u.name)?.models?.length || 0
                }))
            ), {
                status: 200,
                headers: { ...CONFIG.CORS_HEADERS, "Content-Type": "application/json" }
            });
        }

        // /models 页面
        if (pathname === "/models") {
            const rows = CONFIG.UPSTREAMS.map(u => {
                const info = upstreamInfo.get(u.name) || {};
                const status = upstreamStatus.get(u.name) ? 'green' : 'red';
                const modelCount = info.models?.length || 0;
                const error = info.error || '';
                return `<tr>
                    <td>${u.name}</td>
                    <td style="color:${status}">${status}</td>
                    <td>${modelCount} models ${error ? '- '+error : ''}</td>
                </tr>`;
            }).join('');

            const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Merged Models</title>
            <style>
                body{font-family:sans-serif;padding:20px;}
                table{border-collapse:collapse;width:100%;}
                th,td{border:1px solid #ccc;padding:8px;text-align:left;}
                th{background:#f0f0f0;}
            </style>
            </head>
            <body>
                <h2>Available Models (Merged)</h2>
                <p>自动刷新间隔: ${CONFIG.AUTO_REFRESH_INTERVAL/1000}s</p>
                <table>
                    <thead><tr><th>Upstream</th><th>Status</th><th>Models / Error</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <script>setTimeout(()=>{ location.reload(); }, ${CONFIG.AUTO_REFRESH_INTERVAL});</script>
            </body>
            </html>`;
            return new Response(html, { headers: { "Content-Type": "text/html" } });
        }

        if (!CONFIG.ALLOWED_METHODS.includes(method)) {
            return new Response(JSON.stringify({ error: `Method ${method} Not Allowed` }), {
                status: 405,
                headers: { ...CONFIG.CORS_HEADERS, "Content-Type": "application/json" }
            });
        }

        try {
            return await forwardRequest(request);
        } catch (err) {
            return new Response(JSON.stringify({ error: "Proxy request failed", details: err.message }), {
                status: 500,
                headers: { ...CONFIG.CORS_HEADERS, "Content-Type": "application/json" }
            });
        }
    }
};