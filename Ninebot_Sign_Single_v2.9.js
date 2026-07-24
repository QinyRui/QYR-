/***********************************************
Ninebot_Sign_Single_v2.9.2【成就数据自动抓取版】
// 新增：Loon抓包自动提取uid/vehicle_type/wnumber
// 修复：waitDay替换leftDaysToOpen、receive领盒、open传boxId、自动开箱失效根治
适配：Surge/Quantumult X/Loon/Scripting
功能：自动签到/补签/每日领盲盒+全盲盒自动开箱/车辆数据抓取存BoxJs/成就数据自动抓取
***********************************************/
/* 环境兼容封装（核心优化：适配Scripting APP） */
const IS_SCRIPTING = typeof $task !== "undefined";
const IS_REQUEST = typeof $request !== "undefined" || (IS_SCRIPTING && typeof $request !== "undefined");
const HAS_PERSIST = typeof $persistentStore !== "undefined" || (IS_SCRIPTING && typeof $prefs !== "undefined");
const HAS_NOTIFY = typeof $notification !== "undefined" || (IS_SCRIPTING && typeof $notify !== "undefined");
const HAS_HTTP = typeof $httpClient !== "undefined" || (IS_SCRIPTING && typeof $http !== "undefined");
// 跨环境持久化存储
function readPS(key) {
    try {
        return HAS_PERSIST
            ? (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : $prefs.valueForKey(key))
            : null;
    } catch (e) { return null; }
}
function writePS(val, key) {
    try {
        return HAS_PERSIST
            ? (typeof $persistentStore !== "undefined" ? $persistentStore.write(val, key) : $prefs.setValueForKey(val, key))
            : false;
    } catch (e) { return false; }
}
// 跨环境通知
function notify(title, sub, body) {
    if (!HAS_NOTIFY) return;
    try {
        if (typeof $notification !== "undefined") $notification.post(title, sub, body);
        else if (IS_SCRIPTING) $notify(title, sub, body);
    } catch (e) { console.log("通知异常：", e); }
}
// 工具函数
function nowStr() { return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }); }
function formatDateTime(date = new Date()) {
    const tz = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
    return tz.replace(/\//g, "-");
}
/* BoxJS 配置 */
const BOXJS_ROOT_KEY = "ComponentService";
const BOXJS_NINEBOT_KEY = "ninebot";
const BOXJS_URL = "http://boxjs.com";
/* BoxJS 存储键 */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_AUTO_REPAIR = "ninebot.autoRepairCard";
// 车辆数据键
const KEY_VEHICLE_SN = "ninebot.vehicleSn";
const KEY_BATTERY_SOC = "ninebot.batterySoc";
const KEY_CAL_SOC = "ninebot.calSoc";
const KEY_MILEAGE = "ninebot.mileage";
const KEY_TOTAL_MILEAGE = "ninebot.totalMileage";
const KEY_LOCK_STATUS = "ninebot.lockStatus";
const KEY_BATTERY_TEMP = "ninebot.batteryTemp";
const KEY_SPEED = "ninebot.speed";
const KEY_VEHICLE_UPDATE = "ninebot.vehicleLastUpdate";
// 成就数据键（新增 - 从Loon抓包写入）
const KEY_ACHIEVEMENT_UID = "ninebot.achievementUid";
const KEY_ACHIEVEMENT_VTYPE = "ninebot.achievementVehicleType";
const KEY_ACHIEVEMENT_WNUMBER = "ninebot.achievementWnumber";
/* 接口地址（官方最新） */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    blindBoxOpen: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/open",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    repairSign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    vehicleRealTime: "https://api-ninebot.9fevs.com/api/vehicle/v1/device/realTimeData",
    vehicleStatus: "https://api-jhcx-v6-bj.ninebot.com/vehicle/v1/device/status",
    socInfo: "https://ebike.ninebot.com/vehicle/vehicle/battery-soc-info"
};
/* 重试/超时配置 */
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
    return LOG_LEVEL_MAP[v] ?? LOG_LEVEL_MAP.full;
}
function logInfo(...args) {
    const level = getLogLevel();
    if (level < 2) return;
    console.log("[" + nowStr() + "] INFO: " + args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" "));
}
function logWarn(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.warn("[" + nowStr() + "] WARN: " + args.join(" "));
}
function logErr(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.error("[" + nowStr() + "] ERROR: " + args.join(" "));
}
/* Token有效性校验 */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization", "请重新登录"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return !(hasInvalidCode || hasInvalidMsg);
}
/* BoxJs 鉴权信息同步 */
async function writeToBoxJs(auth, deviceId, ua) {
    if (!HAS_HTTP) {
        logWarn("当前环境不支持HTTP，跳过BoxJs同步");
        return false;
    }
    try {
        let boxData = {};
        await new Promise((resolve) => {
            const httpReq = typeof $httpClient !== "undefined" ? $httpClient : $http;
            httpReq.get({
                url: BOXJS_URL + "/query/data/" + BOXJS_ROOT_KEY,
                headers: { "Accept": "application/json" },
                timeout: REQUEST_TIMEOUT
            }, (err, res, data) => {
                if (!err && res && res.status === 200) {
                    try { boxData = JSON.parse(data).val || {}; } catch (e) { logWarn("解析BoxJs数据失败：", e); }
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
        await new Promise((resolve) => {
            const httpReq = typeof $httpClient !== "undefined" ? $httpClient : $http;
            httpReq.post({
                url: BOXJS_URL + "/update/data/" + BOXJS_ROOT_KEY,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ val: boxData }),
                timeout: REQUEST_TIMEOUT
            }, (err, res) => {
                if (!err && res && res.status === 200) {
                    logInfo("BoxJs同步成功");
                    resolve(true);
                } else {
                    logErr("BoxJs写入失败：", err || "状态码" + (res && res.status));
                    resolve(false);
                }
            });
        });
        return true;
    } catch (e) {
        logErr("BoxJs同步异常：", e);
        return false;
    }
}
/* 车辆数据自动抓取写入 */
async function captureVehicleData() {
    if (!IS_REQUEST || !$response || !$response.body) return;
    var url = $request.url;
    if (!url.includes("/device/realTimeData") && !url.includes("/vehicle/v1/device/status") && !url.includes("battery-soc-info")) return;
    try {
        var json = JSON.parse($response.body);
        var d = json.data || json;
        if (!d) return;
        var write = function(k, v) { if (v !== undefined) writePS(String(v), k); };
        write(KEY_VEHICLE_SN, d.sn || d.vehicleSn);
        write(KEY_BATTERY_SOC, d.soc || d.batterySoc);
        write(KEY_CAL_SOC, d.calSoc);
        write(KEY_MILEAGE, d.mileage);
        write(KEY_TOTAL_MILEAGE, d.totalMileage);
        write(KEY_LOCK_STATUS, d.lockStatus);
        write(KEY_BATTERY_TEMP, d.batTemp || d.batteryTemp);
        write(KEY_SPEED, d.speed);
        writePS(formatDateTime(), KEY_VEHICLE_UPDATE);
        logInfo("车辆数据已同步到BoxJs:", {
            "动态电量": (d.batterySoc || "0") + "%",
            "校准电量": (d.calSoc || "0") + "%",
            "续航": (d.mileage || "0") + "km",
            "总里程": (d.totalMileage || "0") + "km"
        });
    } catch (e) {
        logErr("车辆数据解析失败", e);
    }
}
/* ====== 抓包入口（签到/盲盒/成就 三合一） ====== */
const CAPTURE_SIGN_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/blind-box/receive"];
const CAPTURE_ACHIEVEMENT_PATTERN = "/web/rank/my-achievement";
const isCaptureRequest = IS_REQUEST && (typeof $request !== "undefined" && $request.url);

if (isCaptureRequest) {
    var reqUrl = $request.url || "";

    /* ========== 分支1：成就API抓包 ========== */
    if (reqUrl.includes(CAPTURE_ACHIEVEMENT_PATTERN)) {
        try {
            logInfo("进入成就数据抓包流程");
            var achBody = {};
            try {
                achBody = JSON.parse($request.body || "{}");
            } catch (e) {
                logWarn("成就API body解析失败:", e);
            }

            var achChanged = false;
            if (achBody.uid) {
                writePS(String(achBody.uid), KEY_ACHIEVEMENT_UID);
                logInfo("抓包成就数据 uid:", achBody.uid);
                achChanged = true;
            }
            if (achBody.vehicle_type) {
                writePS(String(achBody.vehicle_type), KEY_ACHIEVEMENT_VTYPE);
                logInfo("抓包成就数据 vehicle_type:", achBody.vehicle_type);
                achChanged = true;
            }
            if (achBody.wnumber) {
                writePS(String(achBody.wnumber), KEY_ACHIEVEMENT_WNUMBER);
                logInfo("抓包成就数据 wnumber:", achBody.wnumber);
                achChanged = true;
            }

            if (achChanged) {
                var achTitle = readPS(KEY_TITLE) || "九号签到助手";
                notify(
                    achTitle,
                    "成就数据已抓取 ✅",
                    "uid: " + (achBody.uid || "无") +
                    "\n车型编号: " + (achBody.vehicle_type || "无") +
                    "\n设备序列号: " + (achBody.wnumber || "无")
                );
                logInfo("成就数据抓取完成并已通知");
            } else {
                logWarn("成就API请求body中无有效数据");
            }
        } catch (e) {
            logErr("成就数据抓包异常:", e);
        }
        $done({});
        return;
    }

    /* ========== 分支2：签到/盲盒API抓包 ========== */
    if (CAPTURE_SIGN_PATTERNS.some(function(p) { return reqUrl.includes(p); })) {
        try {
            logInfo("进入签到/盲盒抓包流程，开始提取鉴权信息");
            var h = $request.headers || {};
            var auth = h["Authorization"] || h["authorization"] || "";
            var dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
            var ua = h["User-Agent"] || h["user-agent"] || "";

            if (!auth || !dev) {
                logWarn("抓包未提取到有效信息：Authorization/DeviceId缺失");
                $done({});
                return;
            }
            var changed = false;
            if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
            if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
            if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
            if (changed) {
                var currentTime = formatDateTime();
                writePS(currentTime, KEY_LAST_CAPTURE);
                await writeToBoxJs(auth, dev, ua);
            } else {
                logInfo("抓包信息无变化，跳过写入");
            }
        } catch (e) {
            logErr("签到抓包流程异常：", e);
            notify("九号抓包", "失败 ⚠️", "错误：" + String(e).slice(0, 50));
        }
        $done({});
        return;
    }
}

/* 非抓包模式：执行车辆数据抓取 */
await captureVehicleData();

/* 读取脚本配置 */
var cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
    debug: (readPS(KEY_DEBUG) === null) ? true : (readPS(KEY_DEBUG) !== "false"),
    notify: (readPS(KEY_NOTIFY) === null) ? true : (readPS(KEY_NOTIFY) !== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTO_REPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null) ? true : (readPS(KEY_NOTIFYFAIL) !== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    logLevel: getLogLevel(),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null) ? true : (readPS(KEY_ENABLE_RETRY) !== "false")
};
// 校验配置
if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "配置缺失 ⚠️", "请先抓包执行签到，自动写入Authorization/DeviceId");
    logWarn("脚本终止：未读取到有效账号信息");
    $done && $done();
    process.exit && process.exit();
}
logInfo("九号自动签到 v2.9.2 成就数据自动抓取版启动");
logInfo("当前配置：", {
    "自动开箱": cfg.autoOpenBox,
    "自动补签": cfg.autoRepair,
    "开启重试": cfg.enableRetry,
    "最后抓包": readPS(KEY_LAST_CAPTURE) || "未抓包",
    "最后签到": readPS(KEY_LAST_SIGN_DATE) || "未签到",
    "成就uid": readPS(KEY_ACHIEVEMENT_UID) || "未抓取",
    "车型编号": readPS(KEY_ACHIEVEMENT_VTYPE) || "未抓取",
    "设备序列号": readPS(KEY_ACHIEVEMENT_WNUMBER) || "未抓取"
});
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
/* 跨环境HTTP请求（带重试） */
function requestWithRetry(opts) {
    return new Promise(function(resolve, reject) {
        var method = opts.method || "GET";
        var url = opts.url;
        var headers = opts.headers || {};
        var body = opts.body || null;
        var timeout = opts.timeout || REQUEST_TIMEOUT;
        var retryType = opts.retryType || "default";
        var rc = RETRY_CONFIG[retryType] || RETRY_CONFIG["default"];
        var MAX_RETRY = rc.max;
        var RETRY_DELAY = rc.delay;
        var attempts = 0;
        var httpReq = typeof $httpClient !== "undefined" ? $httpClient : $http;
        var once = function() {
            attempts++;
            var reqOpts = { url: url, headers: headers, timeout: timeout };
            if (method === "POST") reqOpts.body = body ? JSON.stringify(body) : null;
            logInfo("[请求] " + method + " " + url + " (尝试" + attempts + "/" + MAX_RETRY + ")");
            if (method === "POST" && body) logInfo("[请求体]", body);
            var cb = function(err, resp, data) {
                if (err) {
                    var msg = String(err && (err.error || err.message || err));
                    var shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed|502|504)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn("请求错误：" + msg + "，" + RETRY_DELAY + "ms后重试");
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    logErr("请求最终失败：" + msg);
                    reject(new Error("请求异常: " + msg));
                    return;
                }
                logInfo("[响应] 状态码: " + resp.status + ", 数据长度: " + (data ? data.length : 0));
                var respData = {};
                try { respData = data ? JSON.parse(data) : {}; } catch (e) { respData = { raw: data, parseErr: e.message }; }
                if (!checkTokenValid(Object.assign({ code: resp.status }, respData))) {
                    var errMsg = "Token失效/未授权，请重新抓包";
                    notify(cfg.titlePrefix, "Token失效 ⚠️", errMsg);
                    logErr(errMsg);
                    reject(new Error(errMsg));
                    return;
                }
                if (resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn("服务端错误" + resp.status + "，" + RETRY_DELAY + "ms后重试");
                    setTimeout(once, RETRY_DELAY);
                    return;
                }
                resolve(respData);
            };
            if (method === "GET") httpReq.get(reqOpts, cb);
            else httpReq.post(reqOpts, cb);
        };
        once();
    });
}
function httpGet(url, headers, retryType) {
    return requestWithRetry({ method: "GET", url: url, headers: headers || {}, retryType: retryType || "query" });
}
function httpPost(url, headers, body, retryType) {
    return requestWithRetry({ method: "POST", url: url, headers: headers || {}, body: body || {}, retryType: retryType || "default" });
}
/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    try {
        var d;
        if (typeof ts === "number") {
            ts = ts > 1e12 ? Math.floor(ts / 1000) : ts;
            d = new Date(ts * 1000);
        } else if (typeof ts === "string") {
            d = /^\d+$/.test(ts) ? new Date(Number(ts) * (ts.length > 10 ? 1 : 1000)) : new Date(ts);
        }
        return !isNaN(d.getTime())
            ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/\//g, "-")
            : null;
    } catch (e) {
        logWarn("时间转换异常：", e);
        return null;
    }
}
function todayKey() {
    return toDateKeyAny(new Date().getTime());
}
/* 自动补签功能 */
async function autoRepairSign(headers, signCards) {
    if (!cfg.autoRepair || signCards <= 0) {
        logInfo(cfg.autoRepair ? "补签卡数量不足，跳过补签" : "自动补签已关闭，跳过");
        return "";
    }
    try {
        logInfo("执行自动补签（剩余补签卡：" + signCards + "）");
        var repairResp = await httpPost(END.repairSign, headers, { deviceId: cfg.DeviceId }, "sign");
        if (repairResp && repairResp.code === 0) {
            var msg = "🔧 自动补签成功（剩余补签卡：" + (signCards - 1) + "）";
            logInfo(msg);
            return msg;
        } else {
            var errMsg = (repairResp && (repairResp.msg || repairResp.message)) || "补签失败，原因未知";
            logWarn("补签失败：" + errMsg);
            return "🔧 补签失败：" + errMsg;
        }
    } catch (e) {
        logErr("补签请求异常：", e);
        return "🔧 补签异常：" + String(e).slice(0, 30);
    }
}
/* 盲盒自动开箱：waitDay筛选+boxId开箱 */
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱功能已关闭，跳过");
        return [];
    }
    var openResults = [];
    try {
        var boxResp = await httpGet(END.blindBoxList, headers, "blindBox");
        var allNotOpened = (boxResp && boxResp.data && boxResp.data.notOpenedBoxes) || [];
        // 使用waitDay=0筛选可开盲盒
        var availableBoxes = allNotOpened.filter(function(b) { return Number(b.waitDay || 0) === 0; });

        if (availableBoxes.length === 0) {
            logInfo("无即时可开箱盲盒，待攒：" + allNotOpened.length + "个");
            return ["- 无可用盲盒，待开" + allNotOpened.length + "个"];
        }
        logInfo("待开箱总数：" + availableBoxes.length);

        for (var i = 0; i < availableBoxes.length; i++) {
            var box = availableBoxes[i];
            var boxId = box.boxId;
            if (!boxId) {
                openResults.push("❌ 盲盒缺失boxId");
                continue;
            }
            try {
                var openResp = await httpPost(END.blindBoxOpen, headers, { boxId: boxId }, "blindBox");
                if (openResp.code === 0) {
                    var typeName = openResp.data.rewardType === 1 ? "经验" : "N币";
                    openResults.push("✅" + (box.awardDays || "") + "天盲盒: +" + openResp.data.rewardValue + typeName);
                    logInfo("开箱成功 boxId:" + boxId);
                } else {
                    openResults.push("❌" + (box.awardDays || "") + "盲盒:" + openResp.msg);
                }
            } catch (e) {
                openResults.push("❌" + (box.awardDays || "") + "异常:" + String(e).substring(0, 25));
            }
            await new Promise(function(res) { setTimeout(res, 1200); });
        }
    } catch (e) {
        logErr("盲盒列表请求异常", e);
        openResults.push("❌列表接口异常:" + String(e).slice(0, 30));
    }
    return openResults;
}
/* 脚本主流程 */
(async function() {
    try {
        var headers = makeHeaders();
        var today = todayKey();
        var lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";
        var isTodaySigned = lastSignDate === today;
        var statusData = {};
        if (!isTodaySigned) {
            logInfo("本地未检测到今日签到，查询官方签到状态");
            var statusResp = await httpGet(END.status + "?t=" + Date.now(), headers);
            statusData = (statusResp && statusResp.data) || {};
            var currentSignStatus = statusData.currentSignStatus != null ? statusData.currentSignStatus : (statusData.currentSign != null ? statusData.currentSign : null);
            isTodaySigned = [1, "1", true, "true"].indexOf(currentSignStatus) !== -1;
            logInfo("官方签到状态：" + (isTodaySigned ? "已签到" : "未签到"));
        }
        var consecutiveDays = statusData.consecutiveDays || statusData.continuousDays || 0;
        var signCards = statusData.signCardsNum || statusData.remedyCard || 0;
        if (!consecutiveDays || !signCards) {
            try {
                var statusResp2 = await httpGet(END.status + "?t=" + Date.now(), headers);
                consecutiveDays = (statusResp2 && statusResp2.data && statusResp2.data.consecutiveDays) || 0;
                signCards = (statusResp2 && statusResp2.data && statusResp2.data.signCardsNum) || 0;
            } catch (e) { logWarn("读取基础数据异常：", e); }
        }
        var signMsg = "", repairMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("开始执行今日签到");
            try {
                var signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId }, "sign");
                if (signResp && signResp.code === 0 && Array.isArray(signResp.data && signResp.data.rewardList)) {
                    consecutiveDays += 1;
                    writePS(today, KEY_LAST_SIGN_DATE);
                    todayGainExp = signResp.data.rewardList.filter(function(r) { return r.rewardType === 1; }).reduce(function(s, r) { return s + Number(r.rewardValue); }, 0);
                    signMsg = "✨ 今日签到：成功（+" + todayGainExp + "经验）";
                    logInfo("签到成功：" + signMsg);
                    // 签到成功自动领盲盒 receive POST {}
                    try {
                        var getBoxRes = await httpPost(END.blindBoxReceive, headers, {}, "blindBox");
                        if (getBoxRes.code === 0) {
                            logInfo("✅当日盲盒领取成功");
                        } else {
                            logInfo("当日盲盒已领取/无法领取：" + (getBoxRes.msg || ""));
                        }
                    } catch (e) {
                        logWarn("领取盲盒异常：" + e);
                    }
                } else if (signResp && (signResp.code === 540004 || /已签到/.test(signResp.msg || signResp.message || ""))) {
                    signMsg = "✨ 今日签到：已完成（重复请求）";
                    writePS(today, KEY_LAST_SIGN_DATE);
                } else {
                    var errMsg2 = (signResp && (signResp.msg || signResp.message)) || "未知错误";
                    signMsg = "❌ 签到失败：" + errMsg2;
                    logWarn("签到失败：" + errMsg2);
                    if (cfg.autoRepair && signCards > 0) {
                        repairMsg = await autoRepairSign(headers, signCards);
                        signCards -= 1;
                    }
                }
            } catch (e) {
                signMsg = "❌ 签到异常：" + String(e).slice(0, 30);
                logErr("签到请求异常：", e);
            }
        } else {
            signMsg = "✨ 今日签到：已完成";
            logInfo("今日已签到，跳过签到流程");
            try {
                var creditResp = await httpPost(END.creditLst, headers, { page: 1, size: 100 });
                var creditList = Array.isArray(creditResp && creditResp.data && creditResp.data.list) ? creditResp.data.list : [];
                var todayRecords = creditList.filter(function(it) { return toDateKeyAny(it.create_date) === today; });
                var signRecords = todayRecords.filter(function(it) { return it.change_msg === "每日签到" || it.change_code === "1"; });
                todayGainExp = signRecords.reduce(function(sum, it) { return sum + (Number(it.credit) || 0); }, 0);
                logInfo("已签到，今日签到经验：+" + todayGainExp);
            } catch (e) { logWarn("统计已签到经验异常：", e); }
        }
        try {
            var nCoinResp = await httpPost(END.nCoinRecord, headers, { tranType: 1, size: 10, page: 1 }, "query");
            var nCoinList = Array.isArray(nCoinResp && nCoinResp.data && nCoinResp.data.list) ? nCoinResp.data.list : [];
            var todayShareRecords = nCoinList.filter(function(it) { return toDateKeyAny(it.occurrenceTime) === today && it.source === "分享"; });
            todayGainNcoin = todayShareRecords.reduce(function(sum, it) { return sum + Number(it.count || 0); }, 0);
            logInfo("今日分享获得N币：+" + todayGainNcoin);
        } catch (e) { logWarn("统计N币异常：", e); }
        var creditData = {}, needExp = 0;
        try {
            var cr = await httpGet(END.creditInfo, headers);
            creditData = (cr && cr.data) || {};
            var currentExp = Number(creditData.credit || 0);
            if (creditData.credit_upgrade) {
                var m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                needExp = m && m[1] ? Number(m[1]) : 0;
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                needExp = creditData.credit_range[1] - currentExp;
            }
            needExp = Math.max(0, needExp);
        } catch (e) { logWarn("查询经验等级异常：", e); }
        var nCoinBalance = 0;
        try {
            var balResp = await httpGet(END.balance, headers);
            nCoinBalance = Number((balResp && balResp.data && (balResp.data.balance || balResp.data.coin)) || 0);
        } catch (e) { logWarn("查询N币余额异常：", e); }
        var boxOpenResults = await openAllAvailableBoxes(headers);
        var boxMsg = boxOpenResults.length > 0
            ? "📦 盲盒开箱结果\n" + boxOpenResults.join("\n")
            : "📦 盲盒开箱：无可用盲盒";
        if (cfg.notify) {
            var rewardDetail = "🎁 今日奖励：+" + (todayGainExp || 0) + "经验 / +" + (todayGainNcoin || 0) + "N币";
            var blindProgress = "- 待开盲盒：查询中...";
            try {
                var boxResp2 = await httpGet(END.blindBoxList, headers);
                var notOpened = (boxResp2 && boxResp2.data && boxResp2.data.notOpenedBoxes) || [];
                var opened = (boxResp2 && boxResp2.data && boxResp2.data.openedBoxes) || [];
                blindProgress = notOpened.length > 0
                    ? "- 待开盲盒：" + notOpened.length + "个（可开：" + notOpened.filter(function(b) { return Number(b.waitDay || 0) === 0; }).length + "个）"
                    : "- 待开盲盒：0个";
                blindProgress += "\n- 已开盲盒：" + opened.length + "个";
            } catch (e) { blindProgress = "- 待开盲盒：查询异常"; }
            var notifyBody = signMsg + "\n"
                + (repairMsg ? repairMsg + "\n" : "")
                + rewardDetail + "\n"
                + boxMsg + "\n"
                + "📊 账户状态\n"
                + "- 等级：" + (creditData.level ? "LV." + creditData.level : "未知") + "\n"
                + "- 当前经验：" + (creditData.credit || 0) + "\n"
                + "- 升级还需：" + needExp + "经验\n"
                + "- 持有N币：" + (nCoinBalance || 0) + "\n"
                + "- 补签卡：" + signCards + "张\n"
                + "- 连续签到：" + consecutiveDays + "天\n"
                + "📦 盲盒进度\n"
                + blindProgress;
            var MAX_LEN = 800;
            if (notifyBody.length > MAX_LEN) notifyBody = notifyBody.slice(0, MAX_LEN - 3) + "...";
            notify(cfg.titlePrefix, "任务完成 ✅", notifyBody);
            logInfo("通知已发送");
        }
        logInfo("九号自动签到脚本执行完成");
    } catch (e) {
        logErr("脚本主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", "执行失败：" + String(e).slice(0, 50));
    } finally {
        $done && $done();
        process.exit && process.exit();
    }
})();
