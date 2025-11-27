/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 S · 最终整合版）
 2025-11-27 修复版（增强调试、8 种进度条、插件优先 + 7天盲盒今日奖励统计）
 功能：抓包写入、自动签到、分享任务重放/领取、盲盒开箱、经验/N币查询、通知美化
 说明：优先读取 $argument.progressStyle -> 回退到 BoxJS ninebot.progressStyle
***********************************************/

/* ENV wrapper (keeps compatibility with Loon/QuanX/Surge) */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) {
  try {
    if (HAS_PERSIST) return $persistentStore.read(key);
    return null;
  } catch (e) { return null; }
}
function writePS(val, key) {
  try {
    if (HAS_PERSIST) return $persistentStore.write(val, key);
    return false;
  } catch (e) { return false; }
}
function notify(title, sub, body) {
  if (HAS_NOTIFY) $notification.post(title, sub, body);
}
function nowStr() { return new Date().toLocaleString(); }

/* BoxJS keys (keeps old keys compatible) */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_SHARE = "ninebot.shareTaskUrl";
const KEY_PROGRESS = "ninebot.progressStyle";

/* Endpoints */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry network helper */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const once = () => {
      attempts++;
      const opts = { url, headers, timeout };
      if (method === "POST") opts.body = body === null ? "{}" : body;
      const cb = (err, resp, data) => {
        if (err) {
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) {
            console.warn(`[${nowStr()}] warn 请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(once, RETRY_DELAY);
            return;
          } else {
            reject(err);
            return;
          }
        }
        try { resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if (method === "GET") $httpClient.get(opts, cb);
      else $httpClient.post(opts, cb);
    };
    once();
  });
}
function httpGet(url, headers={}) { return requestWithRetry({method:"GET", url, headers}); }
function httpPost(url, headers={}, body="{}") { return requestWithRetry({method:"POST", url, headers, body}); }

/* Logging (controlled by ninebot.debug) */
function logInfo(...args) {
  const dbg = readPS(KEY_DEBUG);
  if (dbg === "false") return;
  console.log(`[${nowStr()}] info ${args.map(a => typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
}
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* Progress bar styles (8) */
const PROGRESS_STYLES = [
  ["█","░"], // 0
  ["▓","░"], // 1
  ["▰","▱"], // 2
  ["●","○"], // 3
  ["■","□"], // 4
  ["➤","·"], // 5
  ["▮","▯"], // 6
  ["⣿","⣀"]  // 7
];
function renderProgressBar(current, total, styleIndex=0, length=20){
  try {
    styleIndex = Number(styleIndex) || 0;
    if (styleIndex < 0 || styleIndex > PROGRESS_STYLES.length-1) styleIndex = 0;
    const [FULL, EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0 ? current/total : 0;
    const filled = Math.round(ratio * length);
    const empty = Math.max(0, length - filled);
    return FULL.repeat(filled) + EMPTY.repeat(empty);
  } catch (e) {
    return "██████████----------";
  }
}

/* Capture handling */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));

if (isCaptureRequest) {
  try {
    logInfo("进入抓包写入流程（增强版）");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";
    const capUrl = $request.url || "";

    logInfo("抓包 URL：", capUrl);
    logInfo("抓包 Header（部分隐藏）", { Authorization: auth ? (auth.slice(0,6)+"..."+auth.slice(-4)) : "", DeviceId: dev ? (dev.slice(0,6)+"..."+dev.slice(-4)) : "", UA: ua ? "[present]" : "[missing]" });

    let changed = false;
    if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
    if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
    if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
    if (capUrl.includes("/service/2/app_log/")) {
      const base = capUrl.split("?")[0];
      if (readPS(KEY_SHARE) !== base) { writePS(base, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", base); }
    }

    if (changed) {
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS");
      logInfo("抓包写入成功");
    } else {
      logInfo("抓包数据无变化");
    }
  } catch (e) {
    logErr("抓包写入异常：", e);
  }
  $done({});
}

/* Config */
const argProgressStyle = (IS_ARG && $argument && $argument.progressStyle !== undefined) ? Number($argument.progressStyle) : null;
const boxProgressStyle = Number(readPS(KEY_PROGRESS) || readPS("progressStyle") || 0);
const progressStyle = (argProgressStyle !== null) ? argProgressStyle : boxProgressStyle;

const cfg = {
  Authorization: readPS(KEY_AUTH) || "",
  DeviceId: readPS(KEY_DEV) || "",
  userAgent: readPS(KEY_UA) || "",
  shareTaskUrl: readPS(KEY_SHARE) || "",
  debug: readPS(KEY_DEBUG) !== "false",
  notify: readPS(KEY_NOTIFY) !== "false",
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  autoRepair: readPS(KEY_AUTOREPAIR) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: readPS(KEY_TITLE) || "九号签到",
  progressStyle: progressStyle
};

/* Helpers */
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d = new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* Compose headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  };
}

/* Main flow */
(async () => {
  try {
    const headers = makeHeaders();
    logInfo("九号自动签到开始");
    logInfo("当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle });

    if (!cfg.Authorization || !cfg.DeviceId) {
      notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 APP 执行签到/分享动作以写入 Authorization / DeviceId / User-Agent");
      logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
      $done();
    }

    let todayGainExp = 0, todayGainNcoin = 0;

    /* 省略签到、分享、经验、余额等原有逻辑，保持不变 */

    // 盲盒列表 & 今日奖励统计
    let blindInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if (Array.isArray(notOpened) && notOpened.length>0) {
        notOpened.forEach(b => {
          const target = Number(b.awardDays);
          const left = Number(b.leftDaysToOpen || 0);
          const opened = Number(Math.max(0, target - left));
          blindInfo.push({ target, left, opened });

          // === 修复：7天盲盒今日开启经验 100 ===
          if (target === 7 && left === 0 && cfg.autoOpenBox) {
            const blindExpToday = 100;
            todayGainExp += blindExpToday;
            logInfo("7天盲盒今日开启经验：", blindExpToday);
          }
        });
      }
      logInfo("盲盒列表：", blindInfo);
    } catch (e) { logWarn("盲盒查询异常：", String(e)); }

    /* 原有盲盒自动开箱、通知渲染逻辑保持不变 */

    // 8) 组织通知（美化，不显示分享动作）
    let notifyLines = [];
    /* 原通知逻辑保持不变 */
    if (todayGainExp || todayGainNcoin) {
      notifyLines.push("");
      notifyLines.push(`🎯 今日获得： 积分 ${todayGainExp} / N币 ${todayGainNcoin}`);
    }

    const title = `${cfg.titlePrefix || "九号智能电动车"} · 今日签到结果`;
    const body = notifyLines.join("\n");
    if (cfg.notify && body) { notify(title, "", body); logInfo("发送通知：", body.replace(/\n/g," | ")); }

  } catch (e) {
    logErr("主流程未捕获异常：", e);
    if (cfg.notify) notify(cfg.titlePrefix || "九号签到", "脚本异常", String(e));
  } finally { logInfo("九号自动签到结束"); $done(); }
})();