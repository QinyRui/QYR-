/***********************************************
Ninebot_Sign_Single_v2.7.2.js 
// version: 2.7.2
2025-12-27 18:00 更新
核心变更：优化通知签到状态行，首次签到显示经验、无经验仅展示状态
适配工具：Surge/Quantumult X/Loon
功能覆盖：自动签到、全盲盒开箱、资产查询、美化通知、自动补签、BoxJs写入
脚本作者：QinyRui
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request!== "undefined";
const HAS_PERSIST = typeof $persistentStore!== "undefined";
const HAS_NOTIFY = typeof $notification!== "undefined";
const HAS_HTTP = typeof $httpClient!== "undefined";

function readPS(key) { try { return HAS_PERSIST? $persistentStore.read(key) : null; } catch (e) { return null; } }
function writePS(val, key) { try { return HAS_PERSIST? $persistentStore.write(val, key) : false; } catch (e) { return false; } }
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
/* BoxJS 配置 - 新增 */
const BOXJS_ROOT_KEY = "ComponentService";
const BOXJS_NINEBOT_KEY = "ninebot";
const BOXJS_URL = "http://boxjs.com"; // 可改为你的私有BoxJs地址
/* BoxJS keys */
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
const KEY_AUTO_REPAIR = "ninebot.autoRepairCard"; // 自动补签开关

/* Endpoints（更新盲盒领取接口） */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive", // 新盲盒领取接口
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    repairSign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair" // 补签接口
};

/* 基础配置（优化重试策略） */
const RETRY_CONFIG = {
    default: { max: 3, delay: 1500 },
    sign: { max: 2, delay: 1000 },
    blindBox: { max: 2, delay: 2000 },
    query: { max: 3, delay: 1500 }
};
const REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };

/* 日志分级（优化输出格式） */
function getLogLevel() {
    const v = readPS(KEY_LOG_LEVEL) || "full";
    return LOG_LEVEL_MAP[v]?? LOG_LEVEL_MAP.full;
}
function logInfo(...args) {
    const level = getLogLevel();
    if (level < 2) return;
    console.log(`[${nowStr()}] INFO: ${args.map(a => typeof a === "object"? JSON.stringify(a, null, 2) : String(a)).join(" ")}`);
}
function logWarn(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.warn(`[${nowStr()}] WARN: ${args.join(" ")}`);
}
function logErr(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.error(`[${nowStr()}] ERROR: ${args.join(" ")}`);
}

/* Token有效性校验（增强规则） */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization", "请重新登录"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg.toLowerCase()));
    return!(hasInvalidCode || hasInvalidMsg);
}

/* ========== 新增 BoxJs 写入函数 ========== */
async function writeToBoxJs(auth, deviceId, ua) {
    if (!HAS_HTTP) {
        logWarn("当前环境不支持 HTTP 请求，跳过 BoxJs 写入");
        return false;
    }
    try {
        // 1. 读取 BoxJs 现有数据
        let boxData = {};
        const queryUrl = `${BOXJS_URL}/query/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.get({ url: queryUrl, headers: { "Accept": "application/json" } }, (err, res, data) => {
                if (!err && res?.status === 200) {
                    try { boxData = JSON.parse(data)?.val || {}; } catch (e) { logWarn("解析 BoxJs 现有数据失败", e); }
                }
                resolve();
            });
        });

        // 2. 更新九号鉴权信息
        boxData[BOXJS_NINEBOT_KEY] = {
            authorization: auth,
            deviceId: deviceId,
            userAgent: ua,
            updateTime: formatDateTime()
        };

        // 3. 写入 BoxJs
        const updateUrl = `${BOXJS_URL}/update/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.post({
                url: updateUrl,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ val: boxData })
            }, (err, res) => {
                if (!err && res?.status === 200) {
                    logInfo("鉴权信息成功写入 BoxJs");
                    notify("九号 BoxJs 同步", "成功 ✓", "Authorization/DeviceId 已更新");
                    resolve(true);
                } else {
                    logErr("写入 BoxJs 失败", err || `状态码: ${res?.status}`);
                    notify("九号 BoxJs 同步", "失败 ⚠️", "请检查 BoxJs 服务是否正常");
                    resolve(false);
                }
            });
        });
        return true;
    } catch (e) {
        logErr("BoxJs 写入异常", e);
        return false;
    }
}

/* 抓包处理 - 集成 BoxJs 写入 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/blind-box/receive"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包写入流程（含盲盒接口+BoxJs同步）");
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
            // 新增：写入 BoxJs 改为非阻塞执行
            writeToBoxJs(auth, dev, ua).catch(err => logErr("BoxJs 写入失败", err));
        } else {
            logInfo("抓包数据无变化，跳过 BoxJs 写入");
        }
    } catch (e) {
        logErr("抓包异常：", e);
        notify("九号智能电动车", "抓包失败 ⚠️", `抓包过程出错：${String(e).slice(0, 50)}`);
    }
    $done({});
}

/* 读取配置（新增自动补签开关） */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
    debug: (readPS(KEY_DEBUG) === null)? true : (readPS(KEY_DEBUG)!== "false"),
    notify: (readPS(KEY_NOTIFY) === null)? true : (readPS(KEY_NOTIFY)!== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTO_REPAIR) === "true", // 自动补签
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null)? true : (readPS(KEY_NOTIFYFAIL)!== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    logLevel: getLogLevel(),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null)? true : (readPS(KEY_ENABLE_RETRY)!== "false")
};

logInfo("九号自动签到（纯净无分享版 v2.7.2）开始");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    autoRepair: cfg.autoRepair,
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
        "accept": "application/json",
        "sys_language": "zh-CN",
        "referer": "https://h5-bj.ninebot.com/"
    };
}

/* HTTP请求（优化重试策略，支持按接口类型配置） */
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, retryType = "default" }) {
    return new Promise((resolve, reject) => {
        const { max: MAX_RETRY, delay: RETRY_DELAY } = RETRY_CONFIG[retryType] || RETRY_CONFIG.default;
        let attempts = 0;

        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") opts.body = JSON.stringify(body); // 统一JSON序列化
            logInfo(`[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`);
            if (method === "POST" && body) logInfo("[请求体]", body);

            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed|502)/i.test(msg);
                    if (shouldRetry && attempts < MAX_RETRY && cfg.enableRetry) {
                        logWarn(`请求失败：${msg}，${RETRY_DELAY}ms 后重试`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    logErr(`请求失败：${msg}`);
                    reject(new Error(`请求异常: ${msg}`));
                    return;
                }

                logInfo(`[响应] 状态码: ${resp.status}, 数据: ${data?.slice(0, 500)}${data?.length > 500? "..." : ""}`);
                let respData = {};
                try { respData = JSON.parse(data || "{}"); } catch (e) { respData = { raw: data }; }

                if (!checkTokenValid({ code: resp.status,...respData })) {
                    const errMsg = "Token失效/未授权";
                    notify(cfg.titlePrefix, "Token失效 ⚠️", "请重新抓包写入Authorization");
                    logErr(errMsg);
                    reject(new Error(errMsg));
                    return;
                }

                if (resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn(`服务端错误 ${resp.status}，${RETRY_DELAY}ms 后重试`);
                    setTimeout(once, RETRY_DELAY);
                    return;
                }

                resolve(respData);
            };

            if (method === "GET") $httpClient.get(opts, cb);
            else $httpClient.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers = {}, retryType = "query") {
    return requestWithRetry({ method: "GET", url, headers, retryType });
}
function httpPost(url, headers = {}, body = {}, retryType = "default") {
    return requestWithRetry({ method: "POST", url, headers, body, retryType });
}

/* 时间工具函数（增强容错性） */
function toDateKeyAny(ts) {
    if (!ts) return null;
    try {
        let d;
        if (typeof ts === "number") {
            // 区分毫秒和秒级时间戳（13位为毫秒，10位为秒）
            ts = ts.toString().length === 13? ts : ts * 1000;
            d = new Date(ts);
        } else if (typeof ts === "string") {
            d = new Date(ts);
        } else {
            d = new Date(ts);
        }
        return!isNaN(d.getTime()) 
           ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            : null;
    } catch (e) {
        logWarn("时间转换异常", e);
        return null;
    }
}
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 自动补签功能 */
async function autoRepairSign(headers, signCards) {
    if (!cfg.autoRepair || Number(signCards) <= 0) {
        logInfo(cfg.autoRepair? "补签卡数量不足，跳过自动补签" : "自动补签已关闭，跳过");
        return "";
    }

    try {
        logInfo("执行自动补签...");
        const repairResp = await httpPost(END.repairSign, headers, { deviceId: cfg.DeviceId }, "sign");
        if (repairResp?.code === 0) {
            const msg = `🔧 自动补签成功（剩余补签卡：${signCards - 1}）`;
            logInfo(msg);
            return msg;
        } else {
            const errMsg = repairResp.msg || repairResp.message || "补签失败";
            logWarn(`补签失败：${errMsg}`);
            return `🔧 补签失败：${errMsg}`;
        }
    } catch (e) {
        logErr("补签异常：", e);
        return `🔧 补签异常：${String(e)}`;
    }
}

/* 盲盒开箱逻辑（适配新接口：blind-box/receive） */
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱已关闭，跳过");
        return [];
    }

    try {
        const boxResp = await httpGet(END.blindBoxList, headers, "blindBox");
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) === 0);
        logInfo("可开启盲盒：", availableBoxes);
        logInfo("待开启盲盒（需等待）：", notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) > 0));

        const openResults = [];
        for (const box of availableBoxes) {
            const rewardId = box.rewardId?? box.id?? box.reward_id?? ""; // 增加备选字段
            if (!rewardId) {
                openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：缺失rewardId`);
                logWarn("盲盒rewardId为空，跳过");
                continue;
            }

            logInfo(`  └─ 开启${box.awardDays || "未知"}天盲盒（rewardId：${rewardId}）`);
            try {
                // 调用新盲盒领取接口，请求体与抓包一致
                const openResp = await httpPost(END.blindBoxReceive, headers, {
                    rewardId: rewardId
                }, "blindBox");

                if (openResp?.code === 0) {
                    const rewardType = openResp.data?.rewardType === 1? "经验" : "N币";
                    const rewardValue = openResp.data?.rewardValue || 0;
                    openResults.push(`✅ ${box.awardDays || "未知"}天盲盒：+${rewardValue}${rewardType}`);
                    logInfo(`  └─ 开启成功：+${rewardValue}${rewardType}`);
                } else {
                    const errMsg = openResp.msg || openResp.message || "开箱失败";
                    openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：${errMsg}`);
                    logWarn(`  └─ 开启失败：${errMsg}`);
                }
            } catch (e) {
                openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：${String(e).slice(0, 30)}`);
                logErr("  └─ 开启异常：", e);
            }
            // 随机延迟，降低风控概率
            const delay = 1000 + Math.floor(Math.random() * 1000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return openResults;
    } catch (e) {
        logErr("盲盒查询异常：", e);
        return ["❌ 盲盒功能异常：" + String(e).slice(0, 30)];
    }
}

/* 新增：获取最近7天N币收入明细 */
async function getRecent7DaysNcoinRecords(headers) {
    try {
        const nCoinResp = await httpPost(END.nCoinRecord, headers, { tranType: 1, size: 20, page: 1 }, "query");
        const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoKey = toDateKeyAny(sevenDaysAgo.getTime());

        // 筛选7天内的记录并格式化
        return nCoinList
           .filter(it => {
                const recordDate = toDateKeyAny(it.occurrenceTime);
                return recordDate && recordDate >= sevenDaysAgoKey;
            })
           .map(it => {
                const date = toDateKeyAny(it.occurrenceTime) || "未知日期";
                const source = it.source || "未知来源";
                return `${date} N币 +${it.count || 0}（来源：${source}）`;
            })
           .slice(0, 7); // 最多取7条
    } catch (e) {
        logWarn("获取7天收入明细异常：", String(e));
        return ["获取收入明细失败"];
    }
}

/* 主流程 */
(async () => {
    try {
        const headers = makeHeaders();
        const today = todayKey();
        const lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";

        // 1. 签到状态双重校验
        let isTodaySigned = lastSignDate === today;
        let statusData = {};
        if (!isTodaySigned) {
            logInfo("查询签到状态...");
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus?? statusData?.currentSign?? null;
            const knownSignedValues = [1, '1', true, 'true'];
            isTodaySigned = knownSignedValues.includes(currentSignStatus);
            logInfo("签到状态判断：", isTodaySigned? "已签到" : "未签到");
        }

        // 2. 获取基础数据（连续天数/补签卡）
        let consecutiveDays = statusData?.consecutiveDays?? statusData?.continuousDays?? 0;
        let signCards = statusData?.signCardsNum?? statusData?.remedyCard?? 0;
        if (!consecutiveDays ||!signCards) {
            try {
                const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
                consecutiveDays = statusResp?.data?.consecutiveDays?? 0;
                signCards = statusResp?.data?.signCardsNum?? 0;
            } catch (e) { logWarn("读取连续签到天数异常：", e); }
        }

        // 3. 执行签到/补签
        let signMsg = "", repairMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("今日未签到，执行签到...");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId }, "sign");
                if (signResp?.code === 0 && Array.isArray(signResp.data?.rewardList)) {
                    consecutiveDays += 1;
                    writePS(today, KEY_LAST_SIGN_DATE);
                    const signExp = signResp.data.rewardList.filter(r => r.rewardType === 1).reduce((s, r) => s + Number(r.rewardValue), 0);
                    todayGainExp = signExp;
                    signMsg = "成功";
                    logInfo("签到成功", `+${signExp}经验`);
                } else if (signResp.code === 540004 || /已签到/.test(signResp.msg || signResp.message || "")) {
                    signMsg = "已完成";
                    todayGainExp = 0;
                    writePS(today, KEY_LAST_SIGN_DATE);
                } else {
                    const errMsg = signResp.msg || signResp.message || "未知错误";
                    signMsg = "失败";
                    logWarn("签到失败", errMsg);
                    if (cfg.autoRepair && Number(signCards) > 0) {
                        repairMsg = await autoRepairSign(headers, signCards);
                        signCards -= 1;
                    }
                }
            } catch (e) {
                signMsg = "失败";
                logErr("签到请求异常", e);
            }
        } else {
            signMsg = "已完成";
            todayGainExp = 0;
            logInfo("今日已签到，跳过");
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

        // 4. 统计今日分享获得的N币
        try {
            const nCoinResp = await httpPost(END.nCoinRecord, headers, { tranType: 1, size: 10, page: 1 }, "query");
            const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
            const todayShareRecords = nCoinList.filter(it => {
                const recordDate = toDateKeyAny(it.occurrenceTime);
                return recordDate === today && it.source === "分享";
            });
            todayGainNcoin = todayShareRecords.reduce((sum, it) => sum + Number(it.count?? 0), 0);
            logInfo(`今日分享获得N币：+${todayGainNcoin}（共${todayShareRecords.length}条记录）`);
        } catch (e) { 
            logWarn("N币统计异常：", String(e)); 
        }

        // 5. 查询账户信息（经验/等级）
        let creditData = {}, need = 0;
        try {
            const cr = await httpGet(END.creditInfo, headers);
            creditData = cr?.data || {};
            const credit = Number(creditData.credit?? 0);
            if (creditData.credit_upgrade) {
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                if (m && m[1]) need = Number(m[1]);
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                need = creditData.credit_range[1] - credit;
            }
        } catch (e) { logWarn("经验信息查询异常：", String(e)); }

        // 6. 查询N币总余额
        let nCoinBalance = 0;
        try {
            const balResp = await httpGet(END.balance, headers);
            nCoinBalance = Number(balResp?.data?.balance?? balResp?.data?.coin?? 0);
        } catch (e) { 
            logWarn("N币余额查询异常：", String(e)); 
        }

        // 7. 自动开启盲盒（核心修复）
        const boxOpenResults = await openAllAvailableBoxes(headers);
        logInfo("盲盒开箱结果：", boxOpenResults);

        // 8. 发送自定义格式通知
        if (cfg.notify) {
            // 获取最近7天收入明细
            const recent7DaysRecords = await getRecent7DaysNcoinRecords(headers);
            // 获取待开盲盒列表
            let waitingBoxes = [];
            try {
                const boxResp = await httpGet(END.blindBoxList, headers);
                waitingBoxes = (boxResp?.data?.notOpenedBoxes || []).map(b => 
                    `- ${b.awardDays || "未知"}天盲盒（剩余${Number(b.leftDaysToOpen?? 0)}天）`
                );
            } catch (e) {
                waitingBoxes = ["- 获取盲盒列表失败"];
            }

            // 核心修改：动态拼接签到状态行
            const signStatusLine = todayGainExp > 0 
               ? `✨ 今日签到状态：${signMsg} | 经验：+${todayGainExp}` 
                : `✨ 今日签到状态：${signMsg}`;

            // 组装最终通知内容
            const notifyBody = `${cfg.titlePrefix}
${signStatusLine}
📊 账户状态
- 当前经验：${creditData.credit?? 0}${creditData.level? `（LV.${creditData.level}）` : ""}
- 当前 N 币：${nCoinBalance || 0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
- 待开盲盒：
${waitingBoxes.join("\n")}
📈 最近7天收入明细：
${recent7DaysRecords.join("\n")}`;

            notify(cfg.titlePrefix, "", notifyBody);
            logInfo("通知已发送：", notifyBody);
        }

        logInfo("九号自动签到（纯净无分享版 v2.7.2）完成");
    } catch (e) {
        logErr("自动签到主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e).slice(0, 50));
    } finally {
        logInfo("------ Script done -------");
        $done();
    }
})();