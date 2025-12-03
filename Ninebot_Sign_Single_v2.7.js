/***********************************************
Ninebot_Sign_Single_v2.9.js （基于v2.8主体增强）
2025-12-05 更新
核心优化（保留v2.8所有功能，新增2大提醒）：
1. 新增盲盒到期提醒（到期前1天自动通知，避免失效）
2. 新增连续签到里程碑提醒（50/100/200/300/500/1000天，仪式感拉满）
3. 优化分享任务：用短Base64编码替换超长编码（缩减80%+，不影响功能）
4. 保留v2.8核心功能：动态捕获分享奖励接口、盲盒签名适配、经验/N币去重统计等
适配工具：Surge/Quantumult X/Loon（支持Base64自动解码）
功能覆盖：抓包写入、自动签到、加密分享、自动领奖励、全盲盒开箱、资产查询、美化通知
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { if (HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }

/* 格式化时间为 YYYY-MM-DD HH:mm:ss（用于BoxJS显示） */
function formatDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/* BoxJS keys（新增2个里程碑/盲盒提醒相关key） */
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
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LAST_SHARE = "ninebot.lastShareDate";
const KEY_ENABLE_SHARE = "ninebot.enableShare";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_SHARE_REWARD = "ninebot.shareRewardUrl";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_MILESTONE_NOTIFIED = "ninebot.milestoneNotified"; // 新增：记录已通知的里程碑
const KEY_BOX_EXPIRE_REMINDED = "ninebot.boxExpireReminded"; // 新增：记录已提醒的盲盒

/* Endpoints */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    shareReceiveReward: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

/* 基础配置（新增里程碑和盲盒提醒参数） */
const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
const SIGN_MILESTONES = [50, 100, 200, 300, 500, 1000]; // 连续签到里程碑
const BOX_REMIND_DAY = 1; // 盲盒到期前1天提醒

/* 日志分级 */
function getLogLevel() {
    const v = readPS(KEY_LOG_LEVEL) || "full";
    return LOG_LEVEL_MAP[v] ?? LOG_LEVEL_MAP.full;
}
function logInfo(...args) {
    const level = getLogLevel();
    if (level < 2) return;
    console.log(`[${nowStr()}] info ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}`);
}
function logWarn(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.warn(`[${nowStr()}] warn ${args.join(" ")}`);
}
function logErr(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.error(`[${nowStr()}] error ${args.join(" ")}`);
}

/* Token有效性校验 */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return !(hasInvalidCode || hasInvalidMsg);
}

/* 抓包处理 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/", "/receive-share-reward"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包写入流程");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        const capUrl = $request.url || "";
        logInfo("抓包 URL：", capUrl);

        let changed = false;
        if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
        if (capUrl.includes("/service/2/app_log/")) {
            const base = capUrl.split("?")[0];
            if (readPS(KEY_SHARE) !== base) { writePS(base, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", base); }
        }
        if (capUrl.includes("/receive-share-reward")) {
            if (readPS(KEY_SHARE_REWARD) !== capUrl) {
                writePS(capUrl, KEY_SHARE_REWARD);
                changed = true;
                logInfo("捕获分享奖励接口写入：", capUrl);
            }
        }
        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, KEY_LAST_CAPTURE);
            notify("九号智能电动车", "抓包成功 ✓", `数据已写入 BoxJS（含分享接口+奖励接口）\n最后抓包时间：${currentTime}`);
            logInfo("抓包写入成功，最后抓包时间：", currentTime);
        }
        else logInfo("抓包数据无变化");
    } catch (e) { logErr("抓包异常：", e); }
    $done({});
}

/* 读取配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    shareTaskUrl: readPS(KEY_SHARE) || "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    shareRewardUrl: readPS(KEY_SHARE_REWARD) || END.shareReceiveReward,
    debug: (readPS(KEY_DEBUG) === null || readPS(KEY_DEBUG) === undefined) ? true : (readPS(KEY_DEBUG) !== "false"),
    notify: (readPS(KEY_NOTIFY) === null || readPS(KEY_NOTIFY) === undefined) ? true : (readPS(KEY_NOTIFY) !== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTOREPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null || readPS(KEY_NOTIFYFAIL) === undefined) ? true : (readPS(KEY_NOTIFYFAIL) !== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    enableShare: (readPS(KEY_ENABLE_SHARE) === null || readPS(KEY_ENABLE_SHARE) === undefined) ? true : (readPS(KEY_ENABLE_SHARE) !== "false"),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null || readPS(KEY_ENABLE_RETRY) === undefined) ? true : (readPS(KEY_ENABLE_RETRY) !== "false"),
    logLevel: getLogLevel()
};

logInfo("九号自动签到+分享任务开始（v2.9增强版，基于v2.8主体）");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    enableShare: cfg.enableShare,
    enableRetry: cfg.enableRetry,
    logLevel: cfg.logLevel,
    lastCaptureAt: readPS(KEY_LAST_CAPTURE) || "未抓包",
    lastSignDate: readPS(KEY_LAST_SIGN_DATE) || "未签到"
});

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到/分享动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

/* 构造请求头 */
function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/octet-stream;tt-data=a",
        "device_id": cfg.DeviceId,
        "User-Agent": "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "aid": "10000004",
        "Cookie": "install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
        "accept-encoding": "gzip, deflate, br",
        "priority": "u=3",
        "accept-language": "zh-CN,zh-Hans;q=0.9",
        "accept": "application/json"
    };
}

/* 签名生成工具函数（适配盲盒开箱接口） */
function generateSign(deviceId, timestamp) {
    try {
        const str = `deviceId=${deviceId}&timestamp=${timestamp}&secret=ninebot_share_2024`;
        return require("crypto").createHash("md5").update(str).digest("hex");
    } catch (e) {
        logWarn("签名生成失败，使用默认值", e);
        return "default_sign";
    }
}

/* HTTP请求（保留v2.8重试开关控制） */
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, isBase64 = false }) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") {
                opts.body = body;
                if (isBase64) opts["body-base64"] = true;
            }
            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    else { reject(err); return; }
                }
                const respData = JSON.parse(data || "{}");
                if (!checkTokenValid({ code: resp.status, ...respData })) {
                    notify(cfg.titlePrefix, "Token失效 ⚠️", "Authorization已过期/无效，请重新抓包写入");
                    reject(new Error("Token invalid or expired"));
                    return;
                }
                if (resp && resp.status && resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn(`服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                    setTimeout(once, RETRY_DELAY);
                    return;
                }
                try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
            };
            if (method === "GET") $httpClient.get(opts, cb); else $httpClient.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers = {}) { return requestWithRetry({ method: "GET", url, headers }); }
function httpPost(url, headers = {}, body = {}, isBase64 = false) { return requestWithRetry({ method: "POST", url, headers, body, isBase64 }); }

/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    if (typeof ts === "number") {
        if (ts > 1e12) ts = Math.floor(ts / 1000);
        const d = new Date(ts * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (typeof ts === "string") {
        if (/^\d+/.test(ts)) {
            let n = Number(ts);
            if (n > 1e12) n = Math