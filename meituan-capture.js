// 美团多维度鉴权抓取 | 抓取最新字段+双存储兜底 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-capture.js
const $ = new Env("美团鉴权抓取");
const STORE_PREFIX = "meituan_";
// 强制调试配置（忽略插件参数，优先定位问题）
const NOTIFY_SWITCH = true;
const LOG_LEVEL = 2;

// 接收插件参数（仅作备份，调试完成后可恢复）
const args = $argument ? (() => {
    try {
        return JSON.parse($argument);
    } catch (e) {
        const arr = $argument.split(",");
        return { notify: arr[0] || "true", log_level: arr[1] || "2" };
    }
})() : { notify: "true", log_level: "2" };

(async function() {
    try {
        log(1, "【抓包调试】脚本开始执行，时间：", new Date().toLocaleString());
        log(1, "【抓包调试】当前请求URL：", $request.url);
        log(1, "【抓包调试】当前请求方法：", $request.method);

        // 1. 初始化扩展鉴权字段（包含美团最新核心字段）
        const authData = {
            token: "",
            authorization: "",
            deviceId: "",
            uuid: "",
            mtFingerprint: "",
            userAgent: "",
            cookie: "",
            appVersion: "", // 新增：美团App版本
            fpPlatform: "", // 新增：指纹平台
            ctype: "",      // 新增：设备类型标识
            deviceType: "", // 新增：设备类型
            gdPageId: "",   // 新增：页面ID
            activityKey: "" // 新增：活动Key
        };

        // 2. 解析请求头（扩展字段解析）
        parseHeaders($request.headers, authData);
        log(2, "【抓包调试】解析请求头后字段：", getExistKeys(authData));

        // 3. 解析URL参数（深度提取美团特有参数）
        if ($request.url) {
            parseUrlParams($request.url, authData);
            log(2, "【抓包调试】解析URL参数后字段：", getExistKeys(authData));
        }

        // 4. 解析请求体（支持JSON/表单/多表单格式）
        if (["POST", "PUT", "PATCH"].includes($request.method) && $request.body) {
            parseBody($request.body, authData);
            log(2, "【抓包调试】解析请求体后字段：", getExistKeys(authData));
        }

        // 5. 从User-Agent提取appVersion（兜底）
        if (!authData.appVersion && authData.userAgent) {
            const uaMatch = authData.userAgent.match(/Meituan\/(\d+\.\d+\.\d+)/);
            if (uaMatch) authData.appVersion = uaMatch[1];
            log(2, "【抓包调试】从UA提取appVersion：", authData.appVersion);
        }

        // 6. 验证核心字段（放宽条件，只要有任意关键字段就写入）
        const coreKeys = ["token", "authorization", "cookie", "deviceId"];
        const hasCore = coreKeys.some(key => authData[key]);
        if (!hasCore) throw new Error("未抓取到任何美团核心鉴权字段（token/deviceId/authorization等）");

        // 7. 双存储写入（BoxJS + Loon本地临时存储）
        await saveToBoxJS(authData);
        saveToLocalStorage(authData); // 本地存储兜底
        const now = new Date().toLocaleString();
        await setBoxJSData("lastCaptureAt", now);

        // 8. 推送通知（显示抓取到的字段数量）
        const existKeys = getExistKeys(authData);
        const successMsg = `✅ 美团鉴权抓取成功\n共抓取${existKeys.length}个字段：${existKeys.join(", ")}\n最后更新：${now}`;
        if (NOTIFY_SWITCH) $notification.post("美团抓包·调试结果", "", successMsg);
        log(1, "【抓包调试】脚本执行完成，存储已更新");

    } catch (error) {
        const errMsg = `❌ 美团抓包脚本执行失败：${error.message}`;
        log(1, errMsg);
        if (NOTIFY_SWITCH) $notification.post("美团抓包·调试错误", "", errMsg);
    } finally {
        log(1, "【抓包调试】脚本执行结束");
        $done({});
    }
})();

// 解析请求头（扩展美团特有字段）
function parseHeaders(headers, authData) {
    if (!headers) return;
    // 基础鉴权字段
    authData.token = headers.token || headers.Token || authData.token;
    authData.authorization = headers.authorization || headers.Authorization || authData.authorization;
    authData.deviceId = headers.deviceid || headers.deviceId || headers["Device-ID"] || headers["device-id"] || authData.deviceId;
    authData.userAgent = headers["User-Agent"] || headers["user-agent"] || authData.userAgent;
    authData.cookie = headers.Cookie || headers.cookie || authData.cookie;
    // 美团特有字段
    authData.ctype = headers.ctype || headers.Ctype || authData.ctype;
    authData.deviceType = headers.devicetype || headers.deviceType || authData.deviceType;
}

// 解析URL参数（深度提取美团参数）
function parseUrlParams(url, authData) {
    try {
        const urlObj = new URL(decodeURIComponent(url));
        // 基础鉴权参数
        authData.token = urlObj.searchParams.get("token") || authData.token;
        authData.uuid = urlObj.searchParams.get("uuid") || authData.uuid;
        authData.mtFingerprint = urlObj.searchParams.get("mtFingerprint") || authData.mtFingerprint;
        authData.deviceId = urlObj.searchParams.get("deviceId") || authData.deviceId;
        // 美团特有参数
        authData.fpPlatform = urlObj.searchParams.get("fpPlatform") || authData.fpPlatform;
        authData.appVersion = urlObj.searchParams.get("appVersion") || authData.appVersion;
        authData.gdPageId = urlObj.searchParams.get("gdPageId") || authData.gdPageId;
        authData.activityKey = urlObj.searchParams.get("activityKey") || authData.activityKey;
    } catch (e) {
        log(1, "【抓包调试】URL解析失败：", e.message);
    }
}

// 解析请求体（支持多种格式）
function parseBody(body, authData) {
    try {
        // JSON格式
        if (typeof body === "string" && (body.startsWith("{") || body.startsWith("["))) {
            const json = JSON.parse(body);
            authData.token = json.token || authData.token;
            authData.deviceId = json.deviceId || authData.deviceId;
            authData.uuid = json.uuid || authData.uuid;
            authData.mtFingerprint = json.mtFingerprint || authData.mtFingerprint;
            authData.appVersion = json.appVersion || authData.appVersion;
        }
        // 表单格式
        else if (typeof body === "string" && body.includes("=")) {
            const formData = new URLSearchParams(body);
            authData.token = formData.get("token") || authData.token;
            authData.deviceId = formData.get("deviceId") || authData.deviceId;
        }
        // 表单多部分格式（简易解析）
        else if (typeof body === "string" && body.includes("multipart/form-data")) {
            const tokenMatch = body.match(/token["']?\s*:\s*["']([^"']+)["']/);
            if (tokenMatch) authData.token = tokenMatch[1];
        }
    } catch (e) {
        log(1, "【抓包调试】请求体解析失败：", e.message);
    }
}

// 获取非空字段名
function getExistKeys(obj) {
    return Object.keys(obj).filter(key => obj[key] && obj[key] !== "");
}

// 写入BoxJS存储（增加错误捕获）
async function saveToBoxJS(authData) {
    const keys = Object.keys(authData);
    for (const key of keys) {
        if (authData[key]) {
            try {
                await setBoxJSData(key, authData[key]);
                log(2, "【抓包调试】写入BoxJS：", STORE_PREFIX + key, "=", authData[key].substring(0, 30) + "...");
            } catch (e) {
                log(1, "【抓包调试】写入BoxJS字段" + key + "失败：", e.message);
            }
        }
    }
}

// 写入Loon本地临时存储（兜底）
function saveToLocalStorage(authData) {
    if (authData.token) $persistentStore.write(authData.token, "meituan_token_temp");
    if (authData.deviceId) $persistentStore.write(authData.deviceId, "meituan_deviceId_temp");
    log(2, "【抓包调试】已写入本地临时存储：token/deviceId");
}

// BoxJS通用存储函数
function setBoxJSData(key, value) {
    return new Promise(resolve => {
        try {
            $persistentStore.write(value, STORE_PREFIX + key, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

// 强制日志输出函数
function log(level, ...msg) {
    console.log(`[美团抓包-${new Date().toLocaleTimeString()}] [LV${level}]`, ...msg);
}

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(msg);
    this.notify = (t, s, m) => $notification.post(t, s, m);
}// 美团多维度鉴权抓取 | 解析请求头/URL/请求体 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-capture.js
const $ = new Env("美团鉴权抓取");
const STORE_PREFIX = "meituan_"; // BoxJS存储前缀

(async function() {
    try {
        // 1. 初始化鉴权字段对象
        const authData = {
            token: "",
            authorization: "",
            deviceId: "",
            uuid: "",
            mtFingerprint: "",
            userAgent: "",
            cookie: ""
        };

        // 2. 解析请求头中的鉴权字段
        parseHeaders($request.headers, authData);
        console.log("【解析请求头】已提取字段：", getExistKeys(authData));

        // 3. 解析URL参数中的鉴权字段
        if ($request.url) {
            parseUrlParams($request.url, authData);
            console.log("【解析URL参数】已提取字段：", getExistKeys(authData));
        }

        // 4. 解析请求体中的鉴权字段（仅POST/PUT请求）
        if (["POST", "PUT"].includes($request.method) && $request.body) {
            parseBody($request.body, authData);
            console.log("【解析请求体】已提取字段：", getExistKeys(authData));
        }

        // 5. 验证是否抓取到核心字段
        const coreKeys = ["token", "authorization", "cookie"];
        const hasCore = coreKeys.some(key => authData[key]);
        if (!hasCore) throw new Error("未抓取到任何核心鉴权字段（token/authorization/cookie）");

        // 6. 写入BoxJS存储
        await saveToBoxJS(authData);
        const now = new Date().toLocaleString();
        await setBoxJSData("lastCaptureAt", now);

        // 7. 推送通知
        const successMsg = `✅ 抓取到${getExistKeys(authData).length}个鉴权字段\n最后更新：${now}`;
        $notification.post("美团鉴权抓取成功", "", successMsg);
        console.log(successMsg);

    } catch (error) {
        const errMsg = `❌ ${error.message}`;
        $notification.post("美团鉴权抓取失败", "", errMsg);
        console.log(errMsg);
    } finally {
        $done({});
    }
})();

// 解析请求头
function parseHeaders(headers, authData) {
    if (!headers) return;
    authData.token = headers.token || headers.Token || authData.token;
    authData.authorization = headers.authorization || headers.Authorization || authData.authorization;
    authData.deviceId = headers.deviceid || headers.deviceId || headers.DeviceId || authData.deviceId;
    authData.userAgent = headers["User-Agent"] || headers["user-agent"] || authData.userAgent;
    authData.cookie = headers.Cookie || headers.cookie || authData.cookie;
}

// 解析URL参数
function parseUrlParams(url, authData) {
    try {
        const urlObj = new URL(url);
        authData.token = urlObj.searchParams.get("token") || authData.token;
        authData.uuid = urlObj.searchParams.get("uuid") || authData.uuid;
        authData.mtFingerprint = urlObj.searchParams.get("mtFingerprint") || authData.mtFingerprint;
        authData.deviceId = urlObj.searchParams.get("deviceId") || authData.deviceId;
    } catch (e) {
        console.log("URL解析失败：", e.message);
    }
}

// 解析请求体
function parseBody(body, authData) {
    try {
        // 处理JSON格式请求体
        if (typeof body === "string" && (body.startsWith("{") || body.startsWith("["))) {
            const json = JSON.parse(body);
            authData.token = json.token || authData.token;
            authData.deviceId = json.deviceId || json.deviceId;
            authData.uuid = json.uuid || authData.uuid;
        }
        // 处理Form表单格式请求体
        else if (typeof body === "string" && body.includes("=")) {
            const formData = new URLSearchParams(body);
            authData.token = formData.get("token") || authData.token;
            authData.deviceId = formData.get("deviceId") || authData.deviceId;
        }
    } catch (e) {
        console.log("请求体解析失败：", e.message);
    }
}

// 获取非空字段名
function getExistKeys(obj) {
    return Object.keys(obj).filter(key => obj[key]);
}

// 写入BoxJS
async function saveToBoxJS(authData) {
    const keys = Object.keys(authData);
    for (const key of keys) {
        if (authData[key]) {
            await setBoxJSData(key, authData[key]);
        }
    }
}

// BoxJS通用存储函数
function setBoxJSData(key, value) {
    return new Promise(resolve => {
        $persistentStore.write(value, STORE_PREFIX + key, () => resolve());
    });
}

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}