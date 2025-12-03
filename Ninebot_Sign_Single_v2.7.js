/***********************************************
Ninebot_Sign_Single_v2.8.js （Loon修复版）
2025-12-05 20:30 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

const IS_LOON = (typeof $httpClient !== "undefined" && $httpClient?.version) || (typeof $notification !== "undefined" && $notification?.post);
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 诊断代码：环境检测
logInfo("环境检测：", {
    IS_LOON: IS_LOON,
    HAS_PERSIST: HAS_PERSIST,
    HAS_NOTIFY: HAS_NOTIFY,
    HAS_HTTP: HAS_HTTP
});

// 参数处理（强制优先使用Loon参数）
const ARG = {
    titlePrefix: IS_LOON ? ($argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手") : readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: IS_LOON ? ($argument?.logLevel || readPS("ninebot.logLevel") || "debug") : readPS("ninebot.logLevel") || "debug",
    notify: IS_LOON ? ($argument?.notify === "true") : (readPS("ninebot.notify") === "true")
};

// 参数来源日志
logInfo("参数来源：", {
    isLoon: IS_LOON,
    titlePrefix: ARG.titlePrefix,
    logLevel: ARG.logLevel,
    notify: ARG.notify
});

// 强制开启日志验证
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
function getLogLevel() { return LOG_LEVEL_MAP.full; }

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { 
    logInfo("通知参数：", {
        title: ARG.titlePrefix + (title || ""),
        sub: sub,
        body: body
    });
    if (HAS_NOTIFY) {
        $notification.post(ARG.titlePrefix + (title || ""), sub, body);
        logInfo("通知发送成功");
    } else {
        logWarn("通知未发送：缺少通知API支持");
    }
}
function nowStr() { return new Date().toLocaleString(); }

// 关键修复：添加日志函数定义
function logInfo(...args) {
    const formattedArgs = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a));
    console.log(`[${nowStr()}] info ${formattedArgs.join(" ")}`);
}
function logWarn(...args) {
    const formattedArgs = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a));
    console.warn(`[${nowStr()}] warn ${formattedArgs.join(" ")}`);
}
function logErr(...args) {
    const formattedArgs = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a));
    console.error(`[${nowStr()}] error ${formattedArgs.join(" ")}`);
}

// 其他代码与之前版本一致...

const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_DEBUG = "ninebot.debug";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_LOG_LEVEL = "ninebot.logLevel";

const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;

function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return !(hasInvalidCode || hasInvalidMsg);
}

const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        const capUrl = $request.url || "";

        let changed = false;
        if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }

        if (changed) {
            const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
            writePS(currentTime, "ninebot.lastCaptureAt");
            notify("九号智能电动车", "抓包成功 ✓", `数据已写入 BoxJS\n最后抓包时间：${currentTime}`);
        }
    } catch (e) {
        logErr("抓包异常：", e);
        notify("九号智能电动车", "抓包失败 ⚠️", `抓包过程出错：${String(e).slice(0, 50)}`);
    }
    $done({});
}

const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    debug: (readPS(KEY_DEBUG) === null || readPS(KEY_DEBUG) === undefined) ? true : (readPS(KEY_DEBUG) !== "false"),
    notify: ARG.notify,
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null || readPS(KEY_NOTIFYFAIL) === undefined) ? true : (readPS(KEY_NOTIFYFAIL) !== "false"),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null || readPS(KEY_ENABLE_RETRY) === undefined) ? true : (readPS(KEY_ENABLE_RETRY) !== "false"),
    logLevel: getLogLevel()
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

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

function generateSign(deviceId, timestamp) {
    try {
        const str = `deviceId=${deviceId}&timestamp=${timestamp}&secret=ninebot_share_2024`;
        return require("crypto").createHash("md5").update(str).digest("hex");
    } catch (e) {
        logWarn("签名生成失败，使用默认值", e);
        return "default_sign";
    }
}

function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT }) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") opts.body = body;
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
function httpPost(url, headers = {}, body = {}) { return requestWithRetry({ method: "POST", url, headers, body }); }

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

async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱已关闭（BoxJS配置），跳过");
        return [];
    }

    logInfo("查询可开启盲盒...");
    try {
        const boxResp = await httpGet(END.blindBoxList, headers);
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen ?? b.remaining) === 0);
        logInfo("可开启盲盒：", availableBoxes);

        const openResults = [];
        for (const box of availableBoxes) {
            const boxType = Number(box.awardDays ?? box.totalDays) === 7 ? "seven" : "normal";
            const openUrl = boxType === "seven" ? END_OPEN.openSeven : END_OPEN.openNormal;
            const boxId = box.id ?? box.boxId ?? "";
            const timestamp = Date.now();
            const sign = generateSign(cfg.DeviceId, timestamp);

            logInfo(`开启${box.awardDays ?? box.totalDays}天盲盒（类型：${boxType}，ID：${boxId}）`);
            try {
                const openResp = await httpPost(openUrl, headers, {
                    deviceId: cfg.DeviceId,
                    boxId: boxId,
                    timestamp: timestamp,
                    sign: sign
                });
                if (openResp?.code === 0 || openResp?.success === true) {
                    const reward = openResp.data?.awardName ?? "未知奖励";
                    openResults.push(`✅ ${box.awardDays}天盲盒：${reward}`);
                } else {
                    const errMsg = openResp.msg || openResp.message || "开箱失败";
                    openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                }
            } catch (e) {
                const errMsg = String(e);
                openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return openResults;
    } catch (e) {
        logErr("盲盒查询/开启异常：", String(e));
        return ["❌ 盲盒功能异常：" + String(e)];
    }
}

(async () => {
    try {
        const headers = makeHeaders();
        const today = todayKey();
        const lastSignDate = readPS("ninebot.lastSignDate") || "";

        let isTodaySigned = lastSignDate === today;
        if (!isTodaySigned) {
            logInfo("查询签到状态...");
            let statusResp = null;
            try { statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); } catch (e) { logWarn("状态请求异常：", String(e)); }
            const statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus ?? statusData?.currentSign ?? null;
            const knownSignedValues = [1, '1', true, 'true'];
            isTodaySigned = knownSignedValues.includes(currentSignStatus);
        }

        let consecutiveDays = 0;
        let signCards = 0;
        try {
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            consecutiveDays = statusResp?.data?.consecutiveDays ?? statusResp?.data?.continuousDays ?? 0;
            signCards = statusResp?.data?.signCardsNum ?? statusResp?.data?.remedyCard ?? 0;
        } catch (e) { logWarn("读取连续签到天数/补签卡异常：", String(e)); }

        let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("今日未签到，尝试执行签到...");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId });
                const isSignSuccess = signResp.code === 0 && Array.isArray(signResp.data?.rewardList);
                if (isSignSuccess) {
                    consecutiveDays += 1;
                    writePS(today, "ninebot.lastSignDate");
                    signMsg = `✨ 今日签到：成功`;
                } else if (signResp.code === 540004 || /已签到/.test(signResp.msg)) {
                    signMsg = "✨ 今日签到：已签到（接口重复请求）";
                    writePS(today, "ninebot.lastSignDate");
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
        }

        const boxOpenResults = await openAllAvailableBoxes(headers);
        const boxMsg = boxOpenResults.length > 0 
            ? `📦 盲盒开箱结果\n${boxOpenResults.join("\n")}` 
            : "📦 盲盒开箱结果：无可用盲盒";

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

        let balLine = "", bal = {};
        try {
            bal = await httpGet(END.balance, headers);
            if (bal?.code === 0) balLine = `- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
        } catch (e) { logWarn("余额查询异常：", String(e)); }

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

        if (cfg.notify) {
            let notifyBody = `${signMsg}
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
        }

        logInfo("九号自动签到任务完成（v2.8 最终修复版）");
    } catch (e) {
        logErr("自动签到主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e));
    }
})();