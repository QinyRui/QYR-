/***********************************************
Ninebot_Sign_Double_v2.7.0.js 
// version: 2.7.0 (双账号+独立开关版)
2025-12-22 18:00 更新
核心变更：新增账号独立启用开关、支持单独启停账号、保留原有双账号隔离逻辑
适配工具：Surge/Quantumult X/Loon
功能覆盖：双账号独立签到/开箱/开关、资产查询、美化通知、自动补签、BoxJs鉴权同步
脚本作者：QinyRui（双账号+开关适配修改）
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

/* BoxJS 配置 - 双账号+独立开关 */
const BOXJS_ROOT_KEY = "ComponentService";
const BOXJS_URL = "http://boxjs.com"; // 可改为你的私有BoxJs地址
// 双账号配置模板：新增 account.enable 开关字段
function getBoxJsKeys(account) {
    const prefix = `ninebot.${account}`;
    return {
        KEY_AUTH: `${prefix}.authorization`,
        KEY_DEV: `${prefix}.deviceId`,
        KEY_UA: `${prefix}.userAgent`,
        KEY_DEBUG: `${prefix}.debug`,
        KEY_NOTIFY: `${prefix}.notify`,
        KEY_AUTOBOX: `${prefix}.autoOpenBox`,
        KEY_AUTOREPAIR: `${prefix}.autoRepair`,
        KEY_NOTIFYFAIL: `${prefix}.notifyFail`,
        KEY_TITLE: `${prefix}.titlePrefix`,
        KEY_LAST_CAPTURE: `${prefix}.lastCaptureAt`,
        KEY_LOG_LEVEL: `${prefix}.logLevel`,
        KEY_LAST_SIGN_DATE: `${prefix}.lastSignDate`,
        KEY_ENABLE_RETRY: `${prefix}.enableRetry`,
        KEY_AUTO_REPAIR: `${prefix}.autoRepairCard`,
        KEY_ENABLE: `${prefix}.enable` // 新增：账号启用开关
    };
}
// 定义两个账号
const ACCOUNTS = ["account1", "account2"];

/* Endpoints（保持不变） */
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

/* 基础配置（保持不变） */
const RETRY_CONFIG = {
    default: { max: 3, delay: 1500 },
    sign: { max: 2, delay: 1000 },
    blindBox: { max: 2, delay: 2000 },
    query: { max: 3, delay: 1500 }
};
const REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };

/* 日志分级（适配账号标识） */
function getLogLevel(keys) {
    const v = readPS(keys.KEY_LOG_LEVEL) || "full";
    return LOG_LEVEL_MAP[v]?? LOG_LEVEL_MAP.full;
}
function logInfo(account, ...args) {
    const keys = getBoxJsKeys(account);
    const level = getLogLevel(keys);
    if (level < 2) return;
    console.log(`[${nowStr()}] [${account}] INFO: ${args.map(a => typeof a === "object"? JSON.stringify(a, null, 2) : String(a)).join(" ")}`);
}
function logWarn(account, ...args) {
    const keys = getBoxJsKeys(account);
    const level = getLogLevel(keys);
    if (level < 1) return;
    console.warn(`[${nowStr()}] [${account}] WARN: ${args.join(" ")}`);
}
function logErr(account, ...args) {
    const keys = getBoxJsKeys(account);
    const level = getLogLevel(keys);
    if (level < 1) return;
    console.error(`[${nowStr()}] [${account}] ERROR: ${args.join(" ")}`);
}

/* Token有效性校验（保持不变） */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization", "请重新登录"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg.toLowerCase()));
    return!(hasInvalidCode || hasInvalidMsg);
}

/* BoxJs 写入函数（适配双账号+开关字段） */
async function writeToBoxJs(account, auth, deviceId, ua) {
    if (!HAS_HTTP) {
        logWarn(account, "当前环境不支持 HTTP 请求，跳过 BoxJs 写入");
        return false;
    }
    try {
        let boxData = {};
        const queryUrl = `${BOXJS_URL}/query/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.get({ url: queryUrl, headers: { "Accept": "application/json" } }, (err, res, data) => {
                if (!err && res?.status === 200) {
                    try { boxData = JSON.parse(data)?.val || {}; } catch (e) { logWarn(account, "解析 BoxJs 现有数据失败", e); }
                }
                resolve();
            });
        });

        // 按账号命名空间存储，默认启用账号
        if (!boxData.ninebot) boxData.ninebot = {};
        boxData.ninebot[account] = {
            authorization: auth,
            deviceId: deviceId,
            userAgent: ua,
            updateTime: formatDateTime(),
            enable: boxData.ninebot[account]?.enable?? true // 默认启用
        };

        const updateUrl = `${BOXJS_URL}/update/data/${BOXJS_ROOT_KEY}`;
        await new Promise((resolve) => {
            $httpClient.post({
                url: updateUrl,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ val: boxData })
            }, (err, res) => {
                if (!err && res?.status === 200) {
                    logInfo(account, "鉴权信息成功写入 BoxJs");
                    notify(`九号 BoxJs 同步 [${account}]`, "成功 ✓", "Authorization/DeviceId 已更新");
                    resolve(true);
                } else {
                    logErr(account, "写入 BoxJs 失败", err || `状态码: ${res?.status}`);
                    notify(`九号 BoxJs 同步 [${account}]`, "失败 ⚠️", "请检查 BoxJs 服务是否正常");
                    resolve(false);
                }
            });
        });
        return true;
    } catch (e) {
        logErr(account, "BoxJs 写入异常", e);
        return false;
    }
}

/* 抓包处理 - 双账号适配（自动识别账号） */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/blind-box/receive"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("capture", "进入抓包写入流程（双账号+开关版）");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        logInfo("capture", "抓包 URL：", $request.url);

        // 优先写入 account1，若 account1 已存在则写入 account2
        let targetAccount = "account1";
        const account1Keys = getBoxJsKeys("account1");
        if (readPS(account1Keys.KEY_AUTH) && readPS(account1Keys.KEY_DEV)) {
            targetAccount = "account2";
        }
        const keys = getBoxJsKeys(targetAccount);

        let changed = false;
        if (auth && readPS(keys.KEY_AUTH)!== auth) { writePS(auth, keys.KEY_AUTH); changed = true; }
        if (dev && readPS(keys.KEY_DEV)!== dev) { writePS(dev, keys.KEY_DEV); changed = true; }
        if (ua && readPS(keys.KEY_UA)!== ua) { writePS(ua, keys.KEY_UA); changed = true; }

        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, keys.KEY_LAST_CAPTURE);
            // 首次抓包默认启用账号
            if (readPS(keys.KEY_ENABLE) === null) writePS("true", keys.KEY_ENABLE);
            await writeToBoxJs(targetAccount, auth, dev, ua);
            notify("九号抓包成功", `目标账号：${targetAccount}`, "鉴权信息已更新，账号默认启用");
        } else {
            logInfo("capture", `抓包数据无变化，${targetAccount} 跳过 BoxJs 写入`);
        }
    } catch (e) {
        logErr("capture", "抓包异常：", e);
        notify("九号智能电动车", "抓包失败 ⚠️", `抓包过程出错：${String(e).slice(0, 50)}`);
    }
    $done({});
}

/* 读取单账号配置：新增开关判断 */
function getAccountConfig(account) {
    const keys = getBoxJsKeys(account);
    return {
        keys: keys,
        account: account,
        // 新增：开关状态，默认启用
        enable: (readPS(keys.KEY_ENABLE) === null)? true : (readPS(keys.KEY_ENABLE) === "true"),
        Authorization: readPS(keys.KEY_AUTH) || "",
        DeviceId: readPS(keys.KEY_DEV) || "",
        userAgent: readPS(keys.KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
        debug: (readPS(keys.KEY_DEBUG) === null)? true : (readPS(keys.KEY_DEBUG)!== "false"),
        notify: (readPS(keys.KEY_NOTIFY) === null)? true : (readPS(keys.KEY_NOTIFY)!== "false"),
        autoOpenBox: readPS(keys.KEY_AUTOBOX) === "true",
        autoRepair: readPS(keys.KEY_AUTO_REPAIR) === "true",
        notifyFail: (readPS(keys.KEY_NOTIFYFAIL) === null)? true : (readPS(keys.KEY_NOTIFYFAIL)!== "false"),
        titlePrefix: readPS(keys.KEY_TITLE) || `九号签到助手（${account}）`,
        enableRetry: (readPS(keys.KEY_ENABLE_RETRY) === null)? true : (readPS(keys.KEY_ENABLE_RETRY)!== "false")
    };
}

/* 构造请求头（适配单账号配置） */
function makeHeaders(cfg) {
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

/* HTTP请求（适配账号标识） */
function requestWithRetry(cfg, { method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, retryType = "default" }) {
    return new Promise((resolve, reject) => {
        const { max: MAX_RETRY, delay: RETRY_DELAY } = RETRY_CONFIG[retryType] || RETRY_CONFIG.default;
        let attempts = 0;

        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") opts.body = JSON.stringify(body);
            logInfo(cfg.account, `[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`);
            if (method === "POST" && body) logInfo(cfg.account, "[请求体]", body);

            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed|502|504)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(cfg.account, `请求错误：${msg}，${RETRY_DELAY}ms 后重试`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    logErr(cfg.account, `请求失败：${msg}`);
                    reject(new Error(`请求异常: ${msg}`));
                    return;
                }

                logInfo(cfg.account, `[响应] 状态码: ${resp.status}, 数据: ${data?.slice(0, 500)}${data?.length > 500? "..." : ""}`);
                let respData = {};
                try { respData = JSON.parse(data || "{}"); } catch (e) { respData = { raw: data }; }

                if (!checkTokenValid({ code: resp.status,...respData })) {
                    const errMsg = "Token失效/未授权";
                    notify(cfg.titlePrefix, "Token失效 ⚠️", "请重新抓包写入Authorization");
                    logErr(cfg.account, errMsg);
                    reject(new Error(errMsg));
                    return;
                }

                if (resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn(cfg.account, `服务端错误 ${resp.status}，${RETRY_DELAY}ms 后重试`);
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
function httpGet(cfg, url, headers = {}, retryType = "query") {
    return requestWithRetry(cfg, { method: "GET", url, headers, retryType });
}
function httpPost(cfg, url, headers = {}, body = {}, retryType = "default") {
    return requestWithRetry(cfg, { method: "POST", url, headers, body, retryType });
}

/* 时间工具函数（保持不变） */
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
        logWarn("common", "时间转换异常", e);
        return null;
    }
}
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 自动补签功能（适配单账号） */
async function autoRepairSign(cfg, headers, signCards) {
    if (!cfg.autoRepair || signCards <= 0) {
        logInfo(cfg.account, cfg.autoRepair? "补签卡数量不足，跳过自动补签" : "自动补签已关闭，跳过");
        return "";
    }

    try {
        logInfo(cfg.account, "执行自动补签...");
        const repairResp = await httpPost(cfg, END.repairSign, headers, { deviceId: cfg.DeviceId }, "sign");
        if (repairResp?.code === 0) {
            const msg = `🔧 自动补签成功（剩余补签卡：${signCards - 1}）`;
            logInfo(cfg.account, msg);
            return msg;
        } else {
            const errMsg = repairResp.msg || repairResp.message || "补签失败";
            logWarn(cfg.account, `补签失败：${errMsg}`);
            return `🔧 补签失败：${errMsg}`;
        }
    } catch (e) {
        logErr(cfg.account, "补签异常：", e);
        return `🔧 补签异常：${String(e)}`;
    }
}

/* 盲盒开箱逻辑（适配单账号） */
async function openAllAvailableBoxes(cfg, headers) {
    if (!cfg.autoOpenBox) {
        logInfo(cfg.account, "自动开箱已关闭，跳过");
        return [];
    }

    try {
        const boxResp = await httpGet(cfg, END.blindBoxList, headers, "blindBox");
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) === 0);
        logInfo(cfg.account, "可开启盲盒：", availableBoxes);
        logInfo(cfg.account, "待开启盲盒（需等待）：", notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) > 0));

        const openResults = [];
        for (const box of availableBoxes) {
            const rewardId = box.rewardId?? box.id?? "";
            if (!rewardId) {
                openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：缺失rewardId`);
                logWarn(cfg.account, "盲盒rewardId为空，跳过");
                continue;
            }

            logInfo(cfg.account, `开启${box.awardDays || "未知"}天盲盒（rewardId：${rewardId}）`);
            try {
                const openResp = await httpPost(cfg, END.blindBoxReceive, headers, { rewardId: rewardId }, "blindBox");
                if (openResp?.code === 0) {
                    const rewardType = openResp.data?.rewardType === 1? "经验" : "N币";
                    const rewardValue = openResp.data?.rewardValue || 0;
                    openResults.push(`✅ ${box.awardDays || "未知"}天盲盒：+${rewardValue}${rewardType}`);
                    logInfo(cfg.account, `盲盒开启成功，奖励：+${rewardValue}${rewardType}`);
                } else {
                    const errMsg = openResp.msg || openResp.message || "开箱失败";
                    openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：${errMsg}`);
                    logWarn(cfg.account, `盲盒开启失败：${errMsg}`);
                }
            } catch (e) {
                openResults.push(`❌ ${box.awardDays || "未知"}天盲盒：${String(e).slice(0, 30)}`);
                logErr(cfg.account, "盲盒开启异常：", e);
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return openResults;
    } catch (e) {
        logErr(cfg.account, "盲盒查询异常：", e);
        return ["❌ 盲盒功能异常：" + String(e).slice(0, 30)];
    }
}

/* 单账号核心执行函数：新增开关判断 */
async function runSingleAccount(account) {
    const cfg = getAccountConfig(account);
    // 新增：判断账号是否启用，未启用则直接跳过
    if (!cfg.enable) {
        logInfo(account, "账号未启用，跳过执行");
        return;
    }

    logInfo(account, "九号自动签到（双账号+开关版）开始");
    logInfo(account, "当前配置：", {
        enable: cfg.enable,
        notify: cfg.notify,
        autoOpenBox: cfg.autoOpenBox,
        autoRepair: cfg.autoRepair,
        enableRetry: cfg.enableRetry,
        lastCaptureAt: readPS(cfg.keys.KEY_LAST_CAPTURE) || "未抓包",
        lastSignDate: readPS(cfg.keys.KEY_LAST_SIGN_DATE) || "未签到"
    });

    if (!cfg.Authorization ||!cfg.DeviceId) {
        notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
        logWarn(account, "终止：未读取到账号信息");
        return;
    }

    try {
        const headers = makeHeaders(cfg);
        const today = todayKey();
        const lastSignDate = readPS(cfg.keys.KEY_LAST_SIGN_DATE) || "";

        // 1. 签到状态双重校验
        let isTodaySigned = lastSignDate === today;
        let statusData = {};
        if (!isTodaySigned) {
            logInfo(account, "查询签到状态...");
            const statusResp = await httpGet(cfg, `${END.status}?t=${Date.now()}`, headers);
            statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus?? statusData?.currentSign?? null;
            const knownSignedValues = [1, '1', true, 'true'];
            isTodaySigned = knownSignedValues.includes(currentSignStatus);
            logInfo(account, "签到状态判断：", isTodaySigned? "已签到" : "未签到");
        }

        // 2. 获取基础数据
        let consecutiveDays = statusData?.consecutiveDays?? statusData?.continuousDays?? 0;
        let signCards = statusData?.signCardsNum?? statusData?.remedyCard?? 0;
        if (!consecutiveDays ||!signCards) {
            try {
                const statusResp = await httpGet(cfg, `${END.status}?t=${Date.now()}`, headers);
                consecutiveDays = statusResp?.data?.consecutiveDays?? 0;
                signCards = statusResp?.data?.signCardsNum?? 0;
            } catch (e) { logWarn(account, "读取连续签到天数异常：", e); }
        }

        // 3. 执行签到/补签
        let signMsg = "", repairMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo(account, "今日未签到，执行签到...");
            try {
                const signResp = await httpPost(cfg, END.sign, headers, { deviceId: cfg.DeviceId }, "sign");
                if (signResp?.code === 0 && Array.isArray(signResp.data?.rewardList)) {
                    consecutiveDays += 1;
                    writePS(today, cfg.keys.KEY_LAST_SIGN_DATE);
                    const signExp = signResp.data.rewardList.filter(r => r.rewardType === 1).reduce((s, r) => s + Number(r.rewardValue), 0);
                    todayGainExp = signExp;
                    signMsg = `✨ 今日签到：成功（+${signExp}经验）`;
                    logInfo(account, "签到成功", signMsg);
                } else if (signResp.code === 540004 || /已签到/.test(signResp.msg || signResp.message || "")) {
                    signMsg = "✨ 今日签到：已完成（重复请求）";
                    writePS(today, cfg.keys.KEY_LAST_SIGN_DATE);
                } else {
                    const errMsg = signResp.msg || signResp.message || "未知错误";
                    signMsg = `❌ 签到失败：${errMsg}`;
                    logWarn(account, "签到失败", errMsg);
                    if (cfg.autoRepair && signCards > 0) {
                        repairMsg = await autoRepairSign(cfg, headers, signCards);
                        signCards -= 1;
                    }
                }
            } catch (e) {
                signMsg = `❌ 签到异常：${String(e).slice(0, 30)}`;
                logErr(account, "签到请求异常", e);
            }
        } else {
            signMsg = "✨ 今日签到：已完成";
            logInfo(account, "今日已签到，跳过");
            try {
                const creditResp = await httpPost(cfg, END.creditLst, headers, { page: 1, size: 100 });
                const creditList = Array.isArray(creditResp?.data?.list)? creditResp.data.list : [];
                const todayRecords = creditList.filter(it => toDateKeyAny(it.create_date) === today);
                const signRecords = todayRecords.filter(it => (it.change_msg === "每日签到" || it.change_code === "1"));
                if (signRecords.length > 0) {
                    const exp = signRecords.reduce((sum, it) => sum + (Number(it.credit?? 0) || 0), 0);
                    todayGainExp = exp;
                    logInfo(account, `已签到时统计经验：+${exp}（去重后）`);
                }
            } catch (e) { logWarn(account, "已签到时统计经验异常：", e); }
        }

        // 4. 统计今日分享N币
        try {
            const nCoinResp = await httpPost(cfg, END.nCoinRecord, headers, { tranType: 1, size: 10, page: 1 }, "query");
            const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
            const todayShareRecords = nCoinList.filter(it => {
                const recordDate = toDateKeyAny(it.occurrenceTime);
                return recordDate === today && it.source === "分享";
            });
            todayGainNcoin = todayShareRecords.reduce((sum, it) => sum + Number(it.count?? 0), 0);
            logInfo(account, `今日分享获得N币：+${todayGainNcoin}（共${todayShareRecords.length}条记录）`);
        } catch (e) { 
            logWarn(account, "N币统计异常：", String(e)); 
        }

        // 5. 查询账户信息
        let creditData = {}, need = 0;
        try {
            const cr = await httpGet(cfg, END.creditInfo, headers);
            creditData = cr?.data || {};
            const credit = Number(creditData.credit?? 0);
            if (creditData.credit_upgrade) {
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                if (m && m[1]) need = Number(m[1]);
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                need = creditData.credit_range[1] - credit;
            }
        } catch (e) { logWarn(account, "经验信息查询异常：", String(e)); }

        // 6. 查询N币余额
        let nCoinBalance = 0;
        try {
            const balResp = await httpGet(cfg, END.balance, headers);
            nCoinBalance = Number(balResp?.data?.balance?? balResp?.data?.coin?? 0);
        } catch (e) { 
            logWarn(account, "N币余额查询异常：", String(e)); 
        }

        // 7. 自动开箱
        const boxOpenResults = await openAllAvailableBoxes(cfg, headers);
        const boxMsg = boxOpenResults.length > 0 
            ? `📦 盲盒开箱结果\n${boxOpenResults.join("\n")}` 
            : "📦 盲盒开箱结果：无可用盲盒";

        // 8. 发送通知
        if (cfg.notify) {
            const rewardDetail = `🎁 今日奖励明细：+${todayGainExp || 0} 经验/+${todayGainNcoin || 0} N 币`;

            let blindProgress = "";
            try {
                const boxResp = await httpGet(cfg, END.blindBoxList, headers);
                const notOpened = boxResp?.data?.notOpenedBoxes || [];
                const opened = boxResp?.data?.openedBoxes || [];

                const waitingBoxes = notOpened.length 
                   ? notOpened.map(b => `- ${b.awardDays || "未知"}天盲盒（剩余${Number(b.leftDaysToOpen?? 0)}天）`).join("\n")
                    : "- 无";

                const openedTypes = [...new Set(opened.map(b => b.awardDays + "天"))].join("、");
                const openedDesc = opened.length 
                   ? `🏆 已开${opened.length}个（类型：${openedTypes}）`
                    : "🏆 暂无已开盲盒";

                blindProgress = `- 待开盲盒：\n${waitingBoxes}\n${openedDesc}`;
            } catch (e) {
                blindProgress = `- 待开盲盒：\n- 查询异常\n🏆 已开盲盒：查询异常`;
            }

            let notifyBody = `${signMsg}
${repairMsg? `${repairMsg}\n` : ""}${rewardDetail}
${boxMsg}
📊 账户状态
- 当前经验：${creditData.credit?? 0}${creditData.level? `（LV.${creditData.level}）` : ""}
- 距离升级：${need?? 0} 经验
- 当前 N 币：${nCoinBalance || 0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
📦 盲盒进度
${blindProgress}`;

            const MAX_LEN = 1000;
            if (notifyBody.length > MAX_LEN) notifyBody = notifyBody.slice(0, MAX_LEN - 3) + "...";
            
            notify(cfg.titlePrefix, "", notifyBody);
            logInfo(account, "通知已发送：", notifyBody);
        }

        logInfo(account, "九号自动签到（双账号+开关版）完成");
    } catch (e) {
        logErr(account, "自动签到主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e).slice(0, 50));
    }
}

/* 主入口：循环执行双账号，跳过未启用账号 */
(async () => {
    logInfo("main", "九号双账号签到脚本（带独立开关）开始执行");
    for (const account of ACCOUNTS) {
        await runSingleAccount(account);
        // 账号间延迟，避免接口限流
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    logInfo("main", "九号双账号签到脚本全部执行完成");
    $done();
})();