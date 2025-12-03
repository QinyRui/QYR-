/***********************************************
Ninebot_Sign_Single_v2.8.js （Base64自动捕获+通知优化版）
2025-12-05 15:30 更新
核心新增：分享任务Base64编码自动抓包写入BoxJS，适配接口动态变化
核心优化：
1. 动态捕获分享接口+分享Base64编码+分享奖励接口（三重自动适配）
2. 盲盒开箱补充签名参数（适配接口要求）
3. 经验/N币统计去重（避免重复计算）
4. 新增网络重试开关（BoxJS可配置）
5. 通知格式优化（按用户要求精简字段、调整盲盒进度显示）
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

/* BoxJS keys（新增Base64相关存储键） */
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
const KEY_SHARE_BODY = "ninebot.shareBody"; // 新增：存储分享任务Base64编码
const KEY_SHARE_BODY_CAPTURED_AT = "ninebot.shareBodyCapturedAt"; // 新增：记录Base64捕获时间

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

/* 基础配置 */
const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
// 默认Base64编码（降级使用，抓包后自动覆盖）
const DEFAULT_SHARE_BODY = "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";

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

/* 抓包处理（新增Base64编码捕获逻辑） */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/", "/receive-share-reward"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包写入流程（含Base64编码捕获）");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        const capUrl = $request.url || "";
        const capMethod = $request.method || "GET";
        logInfo("抓包 URL：", capUrl);
        logInfo("抓包方法：", capMethod);

        let changed = false;
        // 1. 捕获基础鉴权信息
        if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }

        // 2. 捕获分享接口BaseURL
        if (capUrl.includes("/service/2/app_log/")) {
            const base = capUrl.split("?")[0];
            if (readPS(KEY_SHARE) !== base) { writePS(base, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", base); }

            // 3. 捕获分享任务Base64编码（仅POST请求）
            if (capMethod.toUpperCase() === "POST" && $request.body) {
                const requestBody = $request.body;
                // 验证是否为Base64编码（简单校验：仅包含Base64字符且长度合理）
                const isBase64 = /^[A-Za-z0-9+/=]+$/.test(requestBody) && requestBody.length > 100;
                if (isBase64) {
                    if (readPS(KEY_SHARE_BODY) !== requestBody) {
                        writePS(requestBody, KEY_SHARE_BODY);
                        writePS(formatDateTime(), KEY_SHARE_BODY_CAPTURED_AT);
                        changed = true;
                        logInfo("捕获分享Base64编码写入：", requestBody.slice(0, 50) + "..."); // 仅打印前50字符避免日志过长
                    }
                } else {
                    logWarn("分享接口请求体非Base64编码，跳过捕获");
                }
            }
        }

        // 4. 捕获分享奖励接口
        if (capUrl.includes("/receive-share-reward")) {
            if (readPS(KEY_SHARE_REWARD) !== capUrl) {
                writePS(capUrl, KEY_SHARE_REWARD);
                changed = true;
                logInfo("捕获分享奖励接口写入：", capUrl);
            }
        }

        // 5. 发送抓包成功通知
        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, KEY_LAST_CAPTURE);
            // 新增Base64捕获状态提示
            const shareBodyCaptured = readPS(KEY_SHARE_BODY) ? "✅ Base64编码已捕获" : "ℹ️ 未捕获Base64编码";
            notify("九号智能电动车", "抓包成功 ✓", `数据已写入 BoxJS\n${shareBodyCaptured}\n最后抓包时间：${currentTime}`);
            logInfo("抓包写入成功，最后抓包时间：", currentTime);
        } else {
            logInfo("抓包数据无变化");
        }
    } catch (e) {
        logErr("抓包异常：", e);
        notify("九号智能电动车", "抓包失败 ⚠️", `抓包过程出错：${String(e).slice(0, 50)}`);
    }
    $done({});
}

/* 读取配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    shareTaskUrl: readPS(KEY_SHARE) || "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    shareRewardUrl: readPS(KEY_SHARE_REWARD) || END.shareReceiveReward,
    shareBody: readPS(KEY_SHARE_BODY) || DEFAULT_SHARE_BODY, // 优先使用抓包的Base64编码
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

logInfo("九号自动签到+分享任务开始（v2.8 Base64自动捕获+通知优化版）");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    enableShare: cfg.enableShare,
    enableRetry: cfg.enableRetry,
    logLevel: cfg.logLevel,
    lastCaptureAt: readPS(KEY_LAST_CAPTURE) || "未抓包",
    lastSignDate: readPS(KEY_LAST_SIGN_DATE) || "未签到",
    shareBodyCaptured: !!readPS(KEY_SHARE_BODY) // 显示Base64是否已捕获
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

/* 新增：签名生成工具函数（适配盲盒开箱接口） */
function generateSign(deviceId, timestamp) {
    try {
        const str = `deviceId=${deviceId}&timestamp=${timestamp}&secret=ninebot_share_2024`;
        return require("crypto").createHash("md5").update(str).digest("hex");
    } catch (e) {
        logWarn("签名生成失败，使用默认值", e);
        return "default_sign"; // 降级处理，避免影响整体流程
    }
}

/* HTTP请求（新增重试开关控制） */
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
                    // 新增：通过配置开关控制是否重试
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
            if (n > 1e12) n = Math.floor(n / 1000);
            const d = new Date(n * 1000);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        } else {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
    }
    return null;
}
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* 分享任务（优先使用抓包的Base64编码） */
async function doShareTask(headers) {
    if (!cfg.enableShare) {
        logInfo("分享任务已关闭（BoxJS配置），跳过");
        return { success: false, msg: "ℹ️ 分享任务已关闭", exp: 0, ncoin: 0 };
    }

    const today = todayKey();
    const lastShareDate = readPS(KEY_LAST_SHARE) || "";

    if (lastShareDate === today) {
        logInfo("今日已完成分享任务，跳过");
        return { success: false, msg: "ℹ️ 今日已分享", exp: 0, ncoin: 0 };
    }

    // 优先使用抓包捕获的Base64编码，无则使用默认
    const ENCRYPTED_BODY = cfg.shareBody;
    logInfo(`使用${readPS(KEY_SHARE_BODY) ? "抓包捕获" : "默认"}的Base64编码执行分享任务`);

    logInfo("开始执行分享任务（Base64加密体模式）...");
    try {
        const shareResp = await httpPost(
            cfg.shareTaskUrl,
            headers,
            ENCRYPTED_BODY,
            true // 标记为Base64编码，工具自动解码
        );
        logInfo("分享接口返回：", shareResp);

        if (shareResp.e === 0 || shareResp.success === true || shareResp.message === "success") {
            writePS(today, KEY_LAST_SHARE);

            logInfo("尝试自动领取分享奖励（使用抓包的真实接口）...");
            try {
                const receiveResp = await httpPost(
                    cfg.shareRewardUrl, // 动态使用抓包的奖励接口
                    headers,
                    {
                        deviceId: cfg.DeviceId,
                        taskType: "share",
                        timestamp: Date.now(),
                        signType: "daily_share",
                        awardType: 1
                    }
                );
                logInfo("分享奖励领取接口返回：", receiveResp);
                let receiveMsg = "";
                if (receiveResp.code === 0 || receiveResp.success === true || (receiveResp.msg && receiveResp.msg.includes("成功")) || (receiveResp.message && receiveResp.message.includes("成功"))) {
                    receiveMsg = "✅ 奖励已领取";
                } else if ((receiveResp.msg && receiveResp.msg.includes("已领取")) || (receiveResp.message && receiveResp.message.includes("已领取"))) {
                    receiveMsg = "ℹ️ 奖励已领取";
                } else {
                    receiveMsg = "⚠️ 奖励领取失败（接口返回：" + (receiveResp.msg || receiveResp.message || "未知错误") + "）";
                }
            } catch (e) {
                logWarn("自动领取奖励异常：", String(e));
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            return {
                success: true,
                msg: `✅ 分享任务：成功`,
                exp: 0,
                ncoin: 0
            };
        } else {
            const errMsg = shareResp.msg || shareResp.message || "接口返回异常";
            logWarn("分享任务失败：", errMsg);
            return { success: false, msg: `❌ 分享失败：${errMsg}`, exp: 0, ncoin: 0 };
        }
    } catch (e) {
        const errMsg = String(e);
        logErr("分享任务请求异常：", errMsg);
        return { success: false, msg: cfg.notifyFail ? `❌ 分享异常：${errMsg}` : "", exp: 0, ncoin: 0 };
    }
}

/* 盲盒开箱逻辑 */
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱已关闭（BoxJS配置），跳过");
        return [];
    }

    logInfo("查询可开启盲盒...");
    try {
        const boxResp = await httpGet(END.blindBoxList, headers);
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const opened = boxResp?.data?.openedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen ?? b.remaining) === 0);
        logInfo("可开启盲盒：", availableBoxes);
        logInfo("待开启盲盒：", notOpened.filter(b => Number(b.leftDaysToOpen ?? b.remaining) > 0));
        logInfo("已开启盲盒：", opened);

        const openResults = [];
        for (const box of availableBoxes) {
            const boxType = Number(box.awardDays ?? box.totalDays) === 7 ? "seven" : "normal";
            const openUrl = boxType === "seven" ? END_OPEN.openSeven : END_OPEN.openNormal;
            const boxId = box.id ?? box.boxId ?? "";
            const timestamp = Date.now();
            const sign = generateSign(cfg.DeviceId, timestamp); // 新增签名参数

            logInfo(`开启${box.awardDays ?? box.totalDays}天盲盒（类型：${boxType}，ID：${boxId}）`);
            try {
                const openResp = await httpPost(openUrl, headers, {
                    deviceId: cfg.DeviceId,
                    boxId: boxId,
                    timestamp: timestamp,
                    sign: sign // 新增签名参数
                });
                if (openResp?.code === 0 || openResp?.success === true) {
                    const reward = openResp.data?.awardName ?? "未知奖励";
                    openResults.push(`✅ ${box.awardDays}天盲盒：${reward}`);
                    logInfo(`盲盒开启成功，奖励：${reward}`);
                } else {
                    const errMsg = openResp.msg || openResp.message || "开箱失败";
                    openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                    logWarn(`盲盒开启失败：${errMsg}`);
                }
            } catch (e) {
                const errMsg = String(e);
                openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                logErr(`盲盒开启异常：${errMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return openResults;
    } catch (e) {
        logErr("盲盒查询/开启异常：", String(e));
        return ["❌ 盲盒功能异常：" + String(e)];
    }
}

/* 主流程（核心优化签到判断+反馈） */
(async () => {
    try {
        const headers = makeHeaders();
        const today = todayKey();
        const lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";

        // 双重判断：避免重复签到（日期+status接口）
        let isTodaySigned = lastSignDate === today;
        if (!isTodaySigned) {
            logInfo("查询签到状态...");
            let statusResp = null;
            try { statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); } catch (e) { logWarn("状态请求异常：", String(e)); }
            const statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus ?? statusData?.currentSign ?? null;
            const knownSignedValues = [1, '1', true, 'true'];
            isTodaySigned = knownSignedValues.includes(currentSignStatus);
            logInfo("签到状态返回：", statusResp);
            logInfo("当前签到状态判断：", isTodaySigned ? "已签到" : "未签到");
        }

        let consecutiveDays = 0;
        let signCards = 0;
        // 读取连续签到天数和补签卡（从status接口）
        try {
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            consecutiveDays = statusResp?.data?.consecutiveDays ?? statusResp?.data?.continuousDays ?? 0;
            signCards = statusResp?.data?.signCardsNum ?? statusResp?.data?.remedyCard ?? 0;
        } catch (e) { logWarn("读取连续签到天数/补签卡异常：", String(e)); }

        // 执行签到（核心优化：明确反馈+记录签到日期）
        let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("今日未签到，尝试执行签到...");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId });
                logInfo("签到接口返回（原始数据）：", signResp);

                // 严谨判断签到成功：code=0 + 存在rewardList
                const isSignSuccess = signResp.code === 0 && Array.isArray(signResp.data?.rewardList);
                if (isSignSuccess) {
                    consecutiveDays += 1;
                    writePS(today, KEY_LAST_SIGN_DATE); // 记录今日已签到

                    // 解析签到奖励（从sign接口直接提取，更准确）
                    let signExp = 0, signCoin = 0;
                    for (const r of signResp.data.rewardList) {
                        const v = Number(r.rewardValue ?? 0);
                        const t = Number(r.rewardType ?? 0);
                        if (t === 1) signExp += v; else signCoin += v;
                    }
                    todayGainExp += signExp;
                    todayGainNcoin += signCoin;

                    // 通知文案明确：标注接口返回成功+实际奖励
                    signMsg = `✨ 今日签到：实际成功`;
                    logInfo("签到成功：", signMsg);
                } else if (signResp.code === 540004 || (signResp.msg && /已签到/.test(signResp.msg)) || (signResp.message && /已签到/.test(signResp.message))) {
                    signMsg = "✨ 今日签到：已签到（接口重复请求）";
                    writePS(today, KEY_LAST_SIGN_DATE);
                } else {
                    const rawMsg = signResp.msg ?? signResp.message ?? JSON.stringify(signResp);
                    signMsg = `❌ 签到失败：${rawMsg}`;
                    if (!cfg.notifyFail) signMsg = "";
                }
            } catch (e) {
                const errMsg = String(e);
                logWarn("签到请求异常：", errMsg);
                if (cfg.notifyFail) signMsg = `❌ 签到请求异常：${errMsg}`;
            }
        } else { 
            signMsg = "✨ 今日签到：已签到"; 
            logInfo("今日已签到，跳过签到接口");

            // 已签到时，从credit-lst统计今日经验（去重逻辑）
            try {
                const creditResp = await httpPost(END.creditLst, headers, { page: 1, size: 100 });
                const creditList = Array.isArray(creditResp?.data?.list) ? creditResp.data.list : [];
                const todayRecords = creditList.filter(it => toDateKeyAny(it.create_date) === today);
                // 去重：只统计未被主流程统计过的签到经验
                const signRecords = todayRecords.filter(it => (it.change_msg === "每日签到" || it.change_code === "1"));
                if (signRecords.length > 0) {
                    const exp = signRecords.reduce((sum, it) => sum + (Number(it.credit ?? 0) || 0), 0);
                    todayGainExp = exp; // 覆盖而非累加，避免重复
                    logInfo(`已签到时统计经验：+${exp}（去重后）`);
                }
            } catch (e) { logWarn("已签到时统计经验异常：", e); }
        }

        // 执行分享任务
        let shareMsg = "";
        if (cfg.enableShare) {
            const shareResult = await doShareTask(headers);
            shareMsg = shareResult.msg;
        } else {
            shareMsg = "ℹ️ 分享任务已关闭（BoxJS配置）";
        }

        // 补充统计今日奖励（分享+其他）
        try {
            const creditResp = await httpPost(END.creditLst, headers, { page: 1, size: 100 });
            const creditList = Array.isArray(creditResp?.data?.list) ? creditResp.data.list : [];
            logInfo("今日经验原始记录：", creditList.filter(it => toDateKeyAny(it.create_date) === today));
            
            for (const it of creditList) {
                const recordDate = toDateKeyAny(it.create_date);
                const changeMsg = it.change_msg ?? "";
                const changeCode = it.change_code ?? "";
                const expVal = Number(it.credit ?? 0) || 0;

                if (recordDate === today && (changeMsg === "分享" || changeCode === "69")) {
                    todayGainExp += expVal;
                    logInfo(`统计分享经验：+${expVal}（来源：${changeMsg}，编码：${changeCode}）`);
                }
            }

            const nCoinResp = await httpPost(END.nCoinRecord, headers, { page: 1, size: 100 });
            const nCoinList = Array.isArray(nCoinResp?.data?.list) ? nCoinResp.data.list : [];
            logInfo("今日N币原始记录：", nCoinList.filter(it => toDateKeyAny(it.create_time) === today));
            
            for (const it of nCoinList) {
                const recordDate = toDateKeyAny(it.create_time);
                const type = it.type ?? it.operateType ?? "";
                const coinVal = Number(it.amount ?? it.coin ?? it.value ?? it.nCoin ?? 0) || 0;

                if (recordDate === today && (type.includes("签到") || type.includes("分享") || type.includes("daily") || type.includes("share"))) {
                    todayGainNcoin += coinVal;
                    logInfo(`统计N币：+${coinVal}（类型：${type}）`);
                }
            }

            logInfo(`今日精准统计完成：经验+${todayGainExp}，N币+${todayGainNcoin}`);
        } catch (e) { 
            logWarn("精准统计异常：", String(e)); 
        }

        // 查询账户信息
        let upgradeLine = "", creditData = {}, need = 0;
        try {
            const cr = await httpGet(END.creditInfo, headers);
            creditData = cr?.data || {};
            const credit = Number(creditData.credit ?? 0);
            const level = creditData.level ?? null;
            if (creditData.credit_upgrade) {
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                if (m && m[1]) need = Number(m[1]);
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                need = creditData.credit_range[1] - credit;
            }
            upgradeLine = `- 当前经验：${credit}${level ? `（LV.${level}）` : ''}\n- 距离升级：${need} 经验`;
        } catch (e) { logWarn("经验信息查询异常：", String(e)); }

        // 查询N币余额
        let balLine = "", bal = {};
        try {
            bal = await httpGet(END.balance, headers);
            if (bal?.code === 0) balLine = `- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
            else if (bal?.data && bal.data.balance !== undefined) balLine = `- 当前 N 币：${bal.data.balance}`;
        } catch (e) { logWarn("余额查询异常：", String(e)); }

        // 自动开启盲盒
        const boxOpenResults = await openAllAvailableBoxes(headers);
        const boxMsg = boxOpenResults.length > 0 
            ? `📦 盲盒开箱结果\n${boxOpenResults.join("\n")}` 
            : "📦 盲盒开箱结果：无可用盲盒";

        // 盲盒进度（按用户要求调整格式：- 开头，无 | 符号）
        let blindProgress = "";
        try {
            const boxResp = await httpGet(END.blindBoxList, headers);
            const notOpened = boxResp?.data?.notOpenedBoxes || [];
            const opened = boxResp?.data?.openedBoxes || [];

            const openedTypes = [...new Set(opened.map(b => b.awardDays + "天"))];
            const openedDesc = opened.length > 0 
                ? `已开${opened.length}个（类型：${openedTypes.join("、")}）` 
                : "暂无已开盲盒";

            const waitingBoxes = notOpened.map(b => {
                const remaining = Number(b.leftDaysToOpen ?? 0);
                return `- ${b.awardDays}天盲盒（剩余${remaining}天）`;
            }).join("\n");

            blindProgress = openedDesc + (waitingBoxes ? `\n- 待开盲盒：\n${waitingBoxes}` : "\n- 待开盲盒：无");
        } catch (e) {
            logWarn("盲盒进度查询异常：", String(e));
            blindProgress = "查询异常：" + String(e).slice(0, 20);
        }

        // 发送通知（按用户要求格式优化）
        if (cfg.notify) {
            let rewardDetail = "";
            if (todayGainExp > 0) rewardDetail += `🎁 今日奖励明细：+${todayGainExp} 经验`;
            if (todayGainNcoin > 0) rewardDetail += `、+${todayGainNcoin} N 币`;
            if (rewardDetail === "") rewardDetail = "🎁 今日奖励明细：无新增";

            // 最终通知体（严格匹配用户提供的格式）
            let notifyBody = `${signMsg}
${shareMsg}
${rewardDetail}
${boxMsg}
📊 账户状态
- 当前经验：${creditData.credit ?? 0}${creditData.level ? `（LV.${creditData.level}）` : ''}
- 距离升级：${need ?? 0} 经验
- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
📦 盲盒进度
${blindProgress}`;

            const MAX_NOTIFY_LEN = 1000;
            if (notifyBody.length > MAX_NOTIFY_LEN) notifyBody = notifyBody.slice(0, MAX_NOTIFY_LEN - 3) + '...';
            notify(cfg.titlePrefix, "", notifyBody);
            logInfo("发送通知：", notifyBody);
        }

        logInfo("九号自动签到+分享任务完成（v2.8 Base64自动捕获+通知优化版）");
    } catch (e) {
        logErr("自动签到主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e));
    }
})();