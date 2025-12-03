/***********************************************
Ninebot_Sign_Single_v2.7.js （纯净无分享版）
2025-12-04 20:00 更新
核心变更：
1. 移除全部分享任务逻辑（含执行、奖励领取）
2. 删除分享接口抓包、Base64编码捕获与存储
3. 清理BoxJS中分享相关配置项与存储键
4. 精简通知文案与日志输出，聚焦核心功能
适配工具：Surge/Quantumult X/Loon
功能覆盖：自动签到、全盲盒开箱、资产查询、美化通知
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
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
    const month = String(date.getMonth()+1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/* BoxJS keys（移除所有分享相关键） */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";

/* Endpoints（移除分享相关接口） */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

/* 基础配置 */
const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };

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

/* 抓包处理（仅保留基础鉴权信息捕获，移除分享相关） */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包写入流程（仅基础鉴权）");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        logInfo("抓包 URL：", $request.url);

        let changed = false;
        if (auth && readPS(KEY_AUTH)!== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV)!== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA)!== ua) { writePS(ua, KEY_UA); changed = true; }

        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, KEY_LAST_CAPTURE);
            notify("九号智能电动车", "抓包成功 ✓", `数据已写入 BoxJS\n最后抓包时间：${currentTime}`);
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

/* 读取配置（移除分享相关配置） */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    debug: (readPS(KEY_DEBUG) === null || readPS(KEY_DEBUG) === undefined)? true : (readPS(KEY_DEBUG)!== "false"),
    notify: (readPS(KEY_NOTIFY) === null || readPS(KEY_NOTIFY) === undefined)? true : (readPS(KEY_NOTIFY)!== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTOREPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null || readPS(KEY_NOTIFYFAIL) === undefined)? true : (readPS(KEY_NOTIFYFAIL)!== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    logLevel: getLogLevel(),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null || readPS(KEY_ENABLE_RETRY) === undefined)? true : (readPS(KEY_ENABLE_RETRY)!== "false")
};

logInfo("九号自动签到（纯净无分享版 v2.8.2）开始");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    enableRetry: cfg.enableRetry,
    logLevel: cfg.logLevel,
    lastCaptureAt: readPS(KEY_LAST_CAPTURE) || "未抓包",
    lastSignDate: readPS(KEY_LAST_SIGN_DATE) || "未签到"
});

if (!cfg.Authorization ||!cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

/* 构造请求头 */
function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/json",
        "device_id": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "aid": "10000004",
        "accept-encoding": "gzip, deflate, br",
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

/* HTTP请求（含重试开关控制） */
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
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed|502 Bad Gateway|504 Gateway Timeout)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    else { reject(err); return; }
                }
                const respData = JSON.parse(data || "{}");
                if (!checkTokenValid({ code: resp.status,...respData })) {
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

/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    if (typeof ts === "number") {
        if (ts > 1e12) ts = Math.floor(ts / 1000);
        const d = new Date(ts * 1000);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (typeof ts === "string") {
        if (/^\d+/.test(ts)) {
            let n = Number(ts);
            if (n > 1e12) n = Math.floor(n / 1000);
            const d = new Date(n * 1000);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        } else {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
    }
    return null;
}
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) === 0);
        logInfo("可开启盲盒：", availableBoxes);
        logInfo("待开启盲盒：", notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) > 0));

        const openResults = [];
        for (const box of availableBoxes) {
            const boxType = Number(box.awardDays?? box.totalDays) === 7? "seven" : "normal";
            const openUrl = boxType === "seven"? END_OPEN.openSeven : END_OPEN.openNormal;
            const boxId = box.id?? box.boxId?? "";
            if (!boxId) {
                openResults.push(`❌ ${box.awardDays}天盲盒：缺失boxId`);
                logWarn(`盲盒ID为空，跳过`);
                continue;
            }
            const timestamp = Date.now();
            const sign = generateSign(cfg.DeviceId, timestamp);

            logInfo(`开启${box.awardDays}天盲盒（类型：${boxType}，ID：${boxId}）`);
            try {
                const openResp = await httpPost(openUrl, headers, {
                    deviceId: cfg.DeviceId,
                    boxId: boxId,
                    timestamp: timestamp,
                    sign: sign
                });
                if (openResp?.code === 0 || openResp?.success === true) {
                    const reward = openResp.data?.awardName?? "未知奖励";
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

/* 主流程 */
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
            const currentSignStatus = statusData?.currentSignStatus?? statusData?.currentSign?? null;
            const knownSignedValues = [1, '1', true, 'true'];
            isTodaySigned = knownSignedValues.includes(currentSignStatus);
            logInfo("签到状态返回：", statusResp);
            logInfo("当前签到状态判断：", isTodaySigned? "已签到" : "未签到");
        }

        let consecutiveDays = 0;
        let signCards = 0;
        // 读取连续签到天数和补签卡（从status接口）
        try {
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            consecutiveDays = statusResp?.data?.consecutiveDays?? statusResp?.data?.continuousDays?? 0;
            signCards = statusResp?.data?.signCardsNum?? statusResp?.data?.remedyCard?? 0;
        } catch (e) { logWarn("读取连续签到天数/补签卡异常：", String(e)); }

        // 执行签到
        let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("今日未签到，尝试执行签到...");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId });
                logInfo("签到接口返回（原始数据）：", signResp);

                const isSignSuccess = signResp.code === 0 && Array.isArray(signResp.data?.rewardList);
                if (isSignSuccess) {
                    consecutiveDays += 1;
                    writePS(today, KEY_LAST_SIGN_DATE);

                    let signExp = 0, signCoin = 0;
                    for (const r of signResp.data.rewardList) {
                        const v = Number(r.rewardValue?? 0);
                        const t = Number(r.rewardType?? 0);
                        if (t === 1) signExp += v; else signCoin += v;
                    }
                    todayGainExp += signExp;
                    todayGainNcoin += signCoin;

                    signMsg = `✨ 今日签到：成功（+${signExp}经验、+${signCoin}N币）`;
                    logInfo("签到成功：", signMsg);
                } else if (signResp.code === 540004 || (signResp.msg && /已签到/.test(signResp.msg)) || (signResp.message && /已签到/.test(signResp.message))) {
                    signMsg = "✨ 今日签到：已签到（接口重复请求）";
                    writePS(today, KEY_LAST_SIGN_DATE);
                } else {
                    const rawMsg = signResp.msg?? signResp.message?? JSON.stringify(signResp);
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
                const creditList = Array.isArray(creditResp?.data?.list)? creditResp.data.list : [];
                const todayRecords = creditList.filter(it => toDateKeyAny(it.create_date) === today);
                const signRecords = todayRecords.filter(it => (it.change_msg === "每日签到" || it.change_code === "1"));
                if (signRecords.length > 0) {
                    const exp = signRecords.reduce((sum, it) => sum + (Number(it.credit?? 0) || 0), 0);
                    todayGainExp = exp;
                    logInfo(`已签到时统计经验：+${exp}（去重后）`);
                }
            } catch (e) { logWarn("已签到时统计经验异常：", e); }
        }

        // 补充统计今日奖励（仅签到相关）
        try {
            const nCoinResp = await httpPost(END.nCoinRecord, headers, { page: 1, size: 100 });
            const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
            const todayNcoinRecords = nCoinList.filter(it => toDateKeyAny(it.create_time) === today && (it.type.includes("签到") || it.type.includes("daily")));
            for (const it of todayNcoinRecords) {
                const coinVal = Number(it.amount?? it.coin?? it.value?? it.nCoin?? 0) || 0;
                todayGainNcoin += coinVal;
                logInfo(`统计签到N币：+${coinVal}（类型：${it.type}）`);
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
            const credit = Number(creditData.credit?? 0);
            const level = creditData.level?? null;
            if (creditData.credit_upgrade) {
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                if (m && m[1]) need = Number(m[1]);
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                need = creditData.credit_range[1] - credit;
            }
        } catch (e) { logWarn("经验信息查询异常：", String(e)); }

        // 查询N币余额
        let bal = {};
        try {
            bal = await httpGet(END.balance, headers);
        } catch (e) { logWarn("余额查询异常：", String(e)); }

        // 自动开启盲盒
        const boxOpenResults = await openAllAvailableBoxes(headers);
        const boxMsg = boxOpenResults.length > 0 
            ? `📦 盲盒开箱结果\n${boxOpenResults.join("\n")}` 
            : "📦 盲盒开箱结果：无可用盲盒";

        // 盲盒进度
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
                const remaining = Number(b.leftDaysToOpen?? 0);
                return `- ${b.awardDays}天盲盒（剩余${remaining}天）`;
            }).join("\n");

            blindProgress = openedDesc + (waitingBoxes? `\n- 待开盲盒：\n${waitingBoxes}` : "\n- 待开盲盒：无");
        } catch (e) {
            logWarn("盲盒进度查询异常：", String(e));
            blindProgress = "查询异常：" + String(e).slice(0, 20);
        }

        // 发送通知（精简格式，移除分享相关内容）
        if (cfg.notify) {
            let rewardDetail = "";
            if (todayGainExp > 0) rewardDetail += `🎁 今日奖励明细：+${todayGainExp} 经验`;
            if (todayGainNcoin > 0) rewardDetail += `、+${todayGainNcoin} N 币`;
            if (rewardDetail === "") rewardDetail = "🎁 今日奖励明细：无新增";

            let notifyBody = `${signMsg}
${rewardDetail}
${boxMsg}
📊 账户状态
- 当前经验：${creditData.credit?? 0}${creditData.level? `（LV.${creditData.level}）` : ''}
- 距离升级：${need?? 0} 经验
- 当前 N 币：${bal.data?.balance?? bal.data?.coin?? 0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
📦 盲盒进度
${blindProgress}`;

            const MAX_NOTIFY_LEN = 1000;
            if (notifyBody.length > MAX_NOTIFY_LEN) notifyBody = notifyBody.slice(0, MAX_NOTIFY_LEN - 3) + '...';
            notify(cfg.titlePrefix, "", notifyBody);
            logInfo("发送通知：", notifyBody);
        }

        logInfo("九号自动签到（纯净无分享版 v2.8.2）完成");
    } catch (e) {
        logErr("自动签到主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e));
    }
})();