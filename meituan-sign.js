// 美团签到脚本 | 适配cube.meituan.com接口 + 修复语法错误 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const STORE_PREFIX = "meituan_";
// 强制调试配置
const NOTIFY_SWITCH = true;
const LOG_LEVEL = 2;

// 接收插件参数（仅作备份）
const args = $argument ? (() => {
    try {
        return JSON.parse($argument);
    } catch (e) {
        const arr = $argument.split(",");
        return { notify: arr[0] || "true", log_level: arr[1] || "2" };
    }
})() : { notify: "true", log_level: "2" };

// 初始化环境（扩展内置$对象）
Env("美团签到");

(async function() {
    try {
        log(1, "【调试】脚本开始执行，时间：", new Date().toLocaleString());
        log(1, "【调试】目标接口：cube.meituan.com/taskCenter/getUserTaskByScene");

        // 1. 读取鉴权字段
        const authData = await loadAuthData();
        log(1, "【调试】非空鉴权字段：", getExistKeys(authData));

        // 2. 验证核心字段
        if (!authData.token && !authData.cookie && !authData.deviceId) {
            throw new Error("无有效鉴权字段（token/cookie/deviceId），请先触发抓包");
        }

        // 3. 构造请求URL（带真实接口参数）
        const requestUrl = buildRequestUrl(authData);
        log(2, "【调试】最终请求URL：", requestUrl);

        // 4. 构造请求头
        const headers = {
            "User-Agent": authData.userAgent || "Meituan/12.49.410 iOS/18.0",
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "*/*",
            "Connection": "keep-alive"
        };
        if (authData.token) headers.token = authData.token;
        if (authData.cookie) headers.Cookie = authData.cookie;
        if (authData.deviceId) headers["Device-ID"] = authData.deviceId;
        // 补充美团接口必传头
        headers["csecplatform"] = authData.csecplatform || "2";
        headers["csecversion"] = authData.csecversion || "1.0.18";
        headers["csecpkgname"] = authData.csecpkgname || "com.meituan.imeituan";
        log(2, "【调试】请求头：", JSON.stringify(headers));

        // 5. 执行签到请求（GET方式，适配该接口）
        const signRes = await $task.fetch({
            url: requestUrl,
            method: "GET",
            headers: headers,
            timeout: 15
        });

        // 6. 解析响应
        log(2, "【调试】接口响应状态：", signRes.statusCode);
        log(2, "【调试】接口响应内容：", signRes.body);
        if (signRes.statusCode !== 200) {
            throw new Error(`接口返回非200状态码：${signRes.statusCode}`);
        }

        const signData = JSON.parse(signRes.body);
        // 适配美团接口响应格式（不同接口返回码规则不同）
        if (signData.code === 0 || signData.success || signData.data) {
            let notifyMsg = "✅ 美团签到接口请求成功！";
            // 提取签到结果
            if (signData.data && signData.data.signStatus) {
                notifyMsg += `\n📌 签到状态：${signData.data.signStatus === 1 ? "已签到" : "未签到/签到成功"}`;
            }
            if (signData.data && signData.data.reward) {
                notifyMsg += `\n🎁 签到奖励：${JSON.stringify(signData.data.reward)}`;
            }
            // 推送通知
            $.notify("美团签到·结果", "", notifyMsg);
            log(1, notifyMsg);
        } else {
            throw new Error(`签到失败：${signData.msg || "接口返回无签到数据"}`);
        }

    } catch (error) {
        const errMsg = `❌ 签到失败：${error.message}`;
        log(1, errMsg);
        $.notify("美团签到·错误", "", errMsg);
    } finally {
        log(1, "【调试】脚本执行结束");
        $done({});
    }
})();

// 构造请求URL（拼接接口参数）
function buildRequestUrl(authData) {
    const baseUrl = "https://cube.meituan.com/topcube/api/toc/taskCenter/getUserTaskByScene";
    const params = new URLSearchParams();
    // 接口必传参数
    params.append("k", "member_1");
    params.append("csecpkgname", authData.csecpkgname || "com.meituan.imeituan");
    params.append("csecplatform", authData.csecplatform || "2");
    params.append("csecversion", authData.csecversion || "1.0.18");
    params.append("csecversionname", authData.csecversionname || "12.49.410");
    // 补充抓取到的参数
    if (authData.uuid) params.append("uuid", authData.uuid);
    if (authData.mtFingerprint) params.append("mtFingerprint", authData.mtFingerprint);
    return `${baseUrl}?${params.toString()}`;
}

// 从BoxJS加载鉴权字段
async function loadAuthData() {
    const keys = [
        "token", "authorization", "deviceId", "uuid", "mtFingerprint", 
        "userAgent", "cookie", "csecplatform", "csecversion", "csecpkgname", "csecversionname"
    ];
    const authData = {};
    for (const key of keys) {
        try {
            authData[key] = await getBoxJSData(key) || "";
        } catch (e) {
            log(1, "【调试】读取字段" + key + "失败：", e.message);
            authData[key] = "";
        }
    }
    // 本地存储兜底
    authData.token = authData.token || $persistentStore.read("meituan_token_temp") || "";
    authData.deviceId = authData.deviceId || $persistentStore.read("meituan_deviceId_temp") || "";
    return authData;
}

// BoxJS读取函数
function getBoxJSData(key) {
    return new Promise(resolve => {
        try {
            $persistentStore.read(STORE_PREFIX + key, value => {
                resolve(value || "");
            });
        } catch (e) {
            resolve("");
        }
    });
}

// 获取非空字段名
function getExistKeys(obj) {
    return Object.keys(obj).filter(key => obj[key] && obj[key] !== "");
}

// 日志函数
function log(level, ...msg) {
    if (level <= LOG_LEVEL) {
        console.log(`[美团签到-${new Date().toLocaleTimeString()}] [LV${level}]`, ...msg);
    }
}

// 环境适配函数
function Env(name) {
    $.name = name;
    $.log = msg => console.log(`[${name}] ${msg}`);
    $.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}