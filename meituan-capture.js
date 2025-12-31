// 美团多维度鉴权抓取 | 解析请求头/URL/请求体 | Loon专用
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