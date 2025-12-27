/***********************************************
Ninebot_Sign_Single_v2.7.0.js 
// version: 2.7.0
2025-12-05 12:00 更新
核心变更：适配新盲盒领取接口 + 通知排版优化（待开盲盒并入账户状态）
适配工具：Surge/Quantumult X/Loon
功能覆盖：自动签到、全盲盒开箱、资产查询、美化通知、自动补签、BoxJs鉴权同步
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

/* BoxJS 配置 */
const BOXJS_ROOT_KEY = "ComponentService";
const BOXJS_NINEBOT_KEY = "ninebot";
const BOXJS_URL = "http://boxjs.com"; // 改为私有地址
/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTO_REPAIR = "ninebot.autoRepairCard";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";

/* Endpoints */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    repairSign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"
};

/* 基础配置 */
const RETRY_CONFIG = {
    default: { max: 3, delay: 1500 },
    sign: { max: 2, delay: 1000 },
    blindBox: { max: 2, delay: 2000 },
    query: { max: 3, delay: 1500 }
};
const REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };

/* 日志分级 */
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

/* Token有效性校验 */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization", "请重新登录"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg.toLowerCase()));
    return!(hasInvalidCode || hasInvalidMsg);
}

/* BoxJs 写入函数 */
async function writeToBoxJs(auth, deviceId, ua) {
    if (!HAS_HTTP) {
        logWarn("当前环境不支持 HTTP 请求，跳过 BoxJs 写入");
        return false;
    }
    try {
        let boxData = {};
        const queryUrl = `${BOXJS_URL}/query/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.get({ url: queryUrl, headers: { "Accept": "application/json" } }, (err, res, data) => {
                if (!err && res?.status === 200) {
                    try { boxData = JSON.parse(data)?.val || {}; } catch (e) { logWarn("解析 BoxJs 数据失败", e); }
                }
                resolve();
            });
        });

        boxData[BOXJS_NINEBOT_KEY] = {
            authorization: auth,
            deviceId: deviceId,
            userAgent: ua,
            updateTime: formatDateTime()
        };

        const updateUrl = `${BOXJS_URL}/update/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.post({
                url: updateUrl,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ val: boxData })
            }, (err, res) => {
                if (!err && res?.status === 200) {
                    logInfo("BoxJs 写入成功");
                    notify("九号 BoxJs 同步", "成功 ✓", "鉴权信息已更新");
                    resolve(true);
                } else {
                    logErr("BoxJs 写入失败", err || `状态码: ${res?.status}`);
                    notify("九号 BoxJs 同步", "失败 ⚠️", "请检查服务状态");
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

/* 抓包处理 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/blind-box/receive"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包流程");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";

        let changed = false;
        if (auth && readPS(KEY_AUTH)!== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV)!== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA)!== ua) { writePS(ua, KEY_UA); changed = true; }

        if (changed) {
            writePS(formatDateTime(), KEY_LAST_CAPTURE);
            await writeToBoxJs(auth, dev, ua);
        } else {
            logInfo("抓包数据无变化，跳过写入");
        }
    } catch (e) {
        logErr("抓包异常", e);
        notify("九号智能电动车", "抓包失败 ⚠️", `错误：${String(e).slice(0, 50)}`);
    }
    $done({});
}

/* 读取配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
    debug: (readPS(KEY_DEBUG) === null)? true : (readPS(KEY_DEBUG)!== "false"),
    notify: (readPS(KEY_NOTIFY) === null)? true : (readPS(KEY_NOTIFY)!== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTO_REPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null)? true : (readPS(KEY_NOTIFYFAIL)!== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    logLevel: getLogLevel(),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null)? true : (readPS(KEY_ENABLE_RETRY)!== "false")
};

logInfo("九号自动签到脚本启动");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    autoRepair: cfg.autoRepair,
    lastCaptureAt: readPS(KEY_LAST_CAPTURE) || "未抓包"
});

if (!cfg.Authorization ||!cfg.DeviceId) {
    notify(cfg.titlePrefix, "配置缺失", "请先抓包获取 Authorization 和 DeviceId");
    logWarn("配置缺失，脚本终止");
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

/* HTTP请求封装 */
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, retryType = "default" }) {
    return new Promise((resolve, reject) => {
        const { max: MAX_RETRY, delay: RETRY_DELAY } = RETRY_CONFIG[retryType] || RETRY_CONFIG.default;
        let attempts = 0;

        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") opts.body = JSON.stringify(body);
            logInfo(`[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`);
            if (method === "POST" && body) logInfo("[请求体]", body);

            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|502|504)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(`请求失败，${RETRY_DELAY}ms 后重试：${msg}`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    logErr(`请求最终失败：${msg}`);
                    reject(new Error(`请求异常: ${msg}`));
                    return;
                }

                logInfo(`[响应] 状态码: ${resp.status}, 数据长度: ${data?.length || 0}`);
                let respData = {};
                try { respData = JSON.parse(data || "{}"); } catch (e) { respData = { raw: data }; }

                if (!checkTokenValid({ code: resp.status,...respData })) {
                    const errMsg = "Token失效或未授权";
                    notify(cfg.titlePrefix, "鉴权失败", errMsg);
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

/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    try {
        let d;
        if (typeof ts === "number") {
            ts = ts > 1e12? Math.floor(ts / 1000) : ts;
            d = new Date(ts * 1000);
        } else if (typeof ts === "string") {
            if (/^\d+$/.test(ts)) {
                let n = Number(ts);
                n = n > 1e12? Math.floor(n / 1000) : n;
                d = new Date(n * 1000);
            } else {
                d = new Date(ts);
            }
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

/* 自动补签函数 */
async function autoRepairSign(headers, signCards) {
    if (!cfg.autoRepair || signCards <= 0) {
        logInfo("自动补签未开启或补签卡不足，跳过");
        return "";
    }

    try {
        logInfo("执行自动补签");
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
        logErr("补签异常", e);
        return `🔧 补签异常：${String(e).slice(0, 30)}`;
    }
}

/* 最近收入查询函数 */
async function getRecentIncome(headers) {
    try {
        const [nCoinResp, creditResp] = await Promise.all([
            httpPost(END.nCoinRecord, headers, { tranType: 1, size: 7, page: 1 }, "query"),
            httpPost(END.creditLst, headers, { page: 1, size: 7 }, "query")
        ]);

        const recentIncome = [];
        const today = todayKey();

        // 处理N币记录
        const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
        nCoinList.forEach(item => {
            const date = toDateKeyAny(item.occurrenceTime);
            if (!date) return;
            recentIncome.push(`${date === today? "[今日]" : date} N币 +${item.count || 0}（来源：${item.source || "未知"}）`);
        });

        // 处理经验记录（仅签到）
        const creditList = Array.isArray(creditResp?.data?.list)? creditResp.data.list : [];
        creditList.forEach(item => {
            const date = toDateKeyAny(item.create_date);
            if (!date || item.change_code!== "1") return;
            recentIncome.push(`${date === today? "[今日]" : date} 经验 +${item.credit || 0}（类型：${item.change_msg || "未知"}）`);
        });

        // 倒序排序
        return recentIncome.sort((a, b) => {
            const aDate = a.match(/\[今日\]|(\d{4}-\d{2}-\d{2})/)[0].replace("[今日]", today);
            const bDate = b.match(/\[今日\]|(\d{4}-\d{2}-\d{2})/)[0].replace("[今日]", today);
            return bDate.localeCompare(aDate);
        });
    } catch (e) {
        logErr("最近收入查询异常", e);
        return ["❌ 最近收入查询失败"];
    }
}

/* 盲盒开箱函数 */
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱未开启，跳过");
        return [];
    }

    try {
        const boxResp = await httpGet(END.blindBoxList, headers, "blindBox");
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen?? 0) === 0);
        logInfo(`可开启盲盒数量：${availableBoxes.length}`);

        const openResults = [];
        for (const box of availableBoxes) {
            const rewardId = box.rewardId?? box.id?? "";
            if (!rewardId) {
                openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：缺失rewardId`);
                logWarn("盲盒缺失rewardId，跳过");
                continue;
            }

            try {
                const openResp = await httpPost(END.blindBoxReceive, headers, { rewardId }, "blindBox");
                if (openResp?.code === 0) {
                    const rewardType = openResp.data?.rewardType === 1? "经验" : "N币";
                    const rewardValue = openResp.data?.rewardValue || 0;
                    const msg = `✅ ${box.awardDays}天盲盒：+${rewardValue}${rewardType}`;
                    openResults.push(msg);
                    logInfo(msg);
                } else {
                    const errMsg = openResp.msg || "开箱失败";
                    openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                    logWarn(`盲盒开箱失败：${errMsg}`);
                }
            } catch (e) {
                const errMsg = String(e).slice(0, 30);
                openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                logErr(`盲盒开箱异常：${errMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return openResults;
    } catch (e) {
        logErr("盲盒列表查询异常", e);
        return ["❌ 盲盒功能异常"];
    }
}

/* 主流程 */
(async () => {
    try {
        const headers = makeHeaders();
        const today = todayKey();
        const lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";

        // 1. 签到状态校验
        let isTodaySigned = lastSignDate === today;
        let statusData = {};
        if (!isTodaySigned) {
            logInfo("查询签到状态");
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus?? null;
            isTodaySigned = [1, "1", true, "true"].includes(currentSignStatus);
            logInfo(`签到状态：${isTodaySigned? "已签到" : "未签到"}`);
        }

        // 2. 获取基础数据
        let consecutiveDays = statusData?.consecutiveDays?? 0;
        let signCards = statusData?.signCardsNum?? 0;
        if (!consecutiveDays ||!signCards) {
            try {
                const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
                consecutiveDays = statusResp?.data?.consecutiveDays?? 0;
                signCards = statusResp?.data?.signCardsNum?? 0;
            } catch (e) {
                logWarn("获取基础数据异常", e);
            }
        }

        // 3. 执行签到/补签
        let signMsg = "", repairMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("执行签到操作");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId }, "sign");
                if (signResp?.code === 0 && Array.isArray(signResp.data?.rewardList)) {
                    writePS(today, KEY_LAST_SIGN_DATE);
                    consecutiveDays += 1;
                    todayGainExp = signResp.data.rewardList
                       .filter(r => r.rewardType === 1)
                       .reduce((sum, r) => sum + Number(r.rewardValue), 0);
                    signMsg = `✨ 今日签到状态：成功 | 签到经验：+${todayGainExp}`;
                    logInfo(signMsg);
                } else {
                    const errMsg = signResp.msg || "签到失败";
                    signMsg = `❌ 今日签到状态：失败 | 原因：${errMsg}`;
                    logWarn(signMsg);
                    // 尝试补签
                    if (cfg.autoRepair && signCards > 0) {
                        repairMsg = await autoRepairSign(headers, signCards);
                        signCards -= 1;
                    }
                }
            } catch (e) {
                const errMsg = String(e).slice(0, 30);
                signMsg = `❌ 今日签到状态：异常 | 原因：${errMsg}`;
                logErr(signMsg);
            }
        } else {
            // 已签到，查询今日经验
            try {
                const creditResp = await httpPost(END.creditLst, headers, { page: 1, size: 100 });
                const creditList = Array.isArray(creditResp?.data?.list)? creditResp.data.list : [];
                const todayRecords = creditList.filter(it => toDateKeyAny(it.create_date) === today);
                const signRecords = todayRecords.filter(it => it.change_code === "1" || it.change_msg === "每日签到");
                todayGainExp = signRecords.reduce((sum, it) => sum + Number(it.credit || 0), 0);
                signMsg = todayGainExp > 0 
                   ? `✨ 今日签到状态：已完成 | 签到经验：+${todayGainExp}` 
                    : `✨ 今日签到状态：已完成`;
            } catch (e) {
                signMsg = `✨ 今日签到状态：已完成`;
                logWarn("查询已签到经验异常", e);
            }
            logInfo(signMsg);
        }

        // 4. 统计今日分享N币
        try {
            const nCoinResp = await httpPost(END.nCoinRecord, headers, { tranType: 1, size: 10, page: 1 }, "query");
            const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
            todayGainNcoin = nCoinList
               .filter(it => toDateKeyAny(it.occurrenceTime) === today && it.source === "分享")
               .reduce((sum, it) => sum + Number(it.count || 0), 0);
            if (todayGainNcoin > 0) {
                logInfo(`今日分享获得N币：+${todayGainNcoin}`);
            }
        } catch (e) {
            logWarn("统计分享N币异常", e);
        }

        // 5. 查询账户信息
        let creditData = {}, need = 0;
        try {
            const creditResp = await httpGet(END.creditInfo, headers);
            creditData = creditResp?.data || {};
            const currentExp = Number(creditData.credit || 0);
            if (creditData.credit_upgrade) {
                const match = creditData.credit_upgrade.match(/还需\s*(\d+)\s*经验/);
                need = match? Number(match[1]) : 0;
            } else if (Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                need = Number(creditData.credit_range[1]) - currentExp;
            }
        } catch (e) {
            logWarn("查询账户信息异常", e);
        }

        // 6. 查询N币余额
        let nCoinBalance = 0;
        try {
            const balanceResp = await httpGet(END.balance, headers);
            nCoinBalance = Number(balanceResp?.data?.balance || 0);
        } catch (e) {
            logWarn("查询N币余额异常", e);
        }

        // 7. 执行盲盒开箱
        const boxOpenResults = await openAllAvailableBoxes(headers);

        // 8. 组装并发送通知
        if (cfg.notify) {
            // 今日奖励（0值隐藏）
            let rewardDetail = "";
            if (todayGainExp > 0 || todayGainNcoin > 0) {
                rewardDetail = `🎁 今日奖励明细：+${todayGainExp} 经验/+${todayGainNcoin} N 币`;
            }

            // 获取待开盲盒
            let pendingBoxes = "- 无";
            try {
                const boxResp = await httpGet(END.blindBoxList, headers);
                const notOpened = boxResp?.data?.notOpenedBoxes || [];
                if (notOpened.length > 0) {
                    pendingBoxes = notOpened.map(b => `- ${b.awardDays || "未知"}天盲盒（剩余${Number(b.leftDaysToOpen || 0)}天）`).join("\n");
                }
            } catch (e) {
                pendingBoxes = "- 查询异常";
            }

            // 最近7天收入
            const recentIncomeList = await getRecentIncome(headers);
            const recentIncomeText = `📈 最近7天收入明细：
${recentIncomeList.join("\n")}`;

            // 盲盒开箱汇总（有开箱才显示）
            let boxSummary = "";
            if (boxOpenResults.length > 0) {
                const totalExp = boxOpenResults.reduce((sum, item) => {
                    const match = item.match(/\+(\d+)经验/);
                    return sum + (match? Number(match[1]) : 0);
                }, 0);
                const totalNcoin = boxOpenResults.reduce((sum, item) => {
                    const match = item.match(/\+(\d+)N币/);
                    return sum + (match? Number(match[1]) : 0);
                }, 0);
                boxSummary = `📦 盲盒开箱汇总：共开${boxOpenResults.length}个，累计 +${totalExp} 经验 +${totalNcoin} N 币`;
            }

            // 最终通知体
            let notifyBody = [
                signMsg,
                rewardDetail || "",
                boxSummary || "",
                "📊 账户状态",
                `- 当前经验：${Number(creditData.credit || 0)}（LV.${creditData.level || "未知"}）`,
                `- 距离升级：${need} 经验`,
                `- 当前 N 币：${nCoinBalance}`,
                `- 补签卡：${signCards} 张`,
                `- 连续签到：${consecutiveDays} 天`,
                `- 待开盲盒：`,
                pendingBoxes,
                recentIncomeText
            ].filter(line => line.trim()!== "").join("\n");

            // 长度限制
            const MAX_LEN = 1500;
            if (notifyBody.length > MAX_LEN) {
                notifyBody = notifyBody.slice(0, MAX_LEN - 3) + "...";
            }

            notify(cfg.titlePrefix, "", notifyBody);
            logInfo("通知发送成功");
        }

        logInfo("九号签到脚本执行完成");
    } catch (e) {
        logErr("主流程异常", e);
        if (cfg.notifyFail) {
            notify(cfg.titlePrefix, "脚本执行异常", `错误信息：${String(e).slice(0, 100)}`);
        }
    } finally {
        $done();
    }
})();