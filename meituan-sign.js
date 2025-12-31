// 美团签到脚本 | 强制调试版 + 本地存储兜底 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const $ = new Env("美团签到");
const API_HOST = "https://api.meituan.com";
const STORE_PREFIX = "meituan_";

// 强制开启调试（忽略插件参数，优先定位问题）
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
        log(1, "【调试】脚本开始执行，时间：", new Date().toLocaleString());
        log(1, "【调试】插件传递参数：", args);

        // 1. 读取BoxJS鉴权字段（增加日志输出）
        const authData = await loadAuthData();
        log(1, "【调试】从BoxJS读取的所有字段：", JSON.stringify(authData));
        log(1, "【调试】非空鉴权字段：", getExistKeys(authData));

        // 2. 本地存储兜底（若BoxJS无数据，尝试读取Loon本地存储）
        if (!Object.values(authData).some(v => v)) {
            log(1, "【调试】BoxJS无数据，尝试读取Loon本地存储...");
            const localToken = $persistentStore.read("meituan_token_temp") || "";
            if (localToken) {
                authData.token = localToken;
                log(1, "【调试】从本地存储读取到token：", localToken.substring(0, 50) + "...");
            } else {
                throw new Error("BoxJS和本地存储均无鉴权字段，请先打开美团App触发抓包脚本");
            }
        }

        // 3. 构造请求头（强制携带User-Agent和基础字段）
        const headers = {
            "User-Agent": authData.userAgent || "Meituan/9.0.0 iOS/18.0",
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "*/*",
            "Connection": "keep-alive"
        };
        if (authData.token) headers.token = authData.token;
        if (authData.authorization) headers.Authorization = authData.authorization;
        if (authData.cookie) headers.Cookie = authData.cookie;
        if (authData.deviceId) headers["Device-ID"] = authData.deviceId;
        log(2, "【调试】最终请求头：", JSON.stringify(headers));

        // 4. 构造请求体（适配美团最新接口参数）
        const body = {
            appVersion: authData.appVersion || "9.0.0",
            platform: "iOS",
            signType: "DAILY_SIGN",
            deviceType: 2,
            ctype: "iphone",
            deviceId: authData.deviceId || "unknown",
            uuid: authData.uuid || "00000000-0000-0000-0000-000000000000"
        };
        if (authData.mtFingerprint) body.mtFingerprint = authData.mtFingerprint;
        log(2, "【调试】最终请求体：", JSON.stringify(body));

        // 5. 执行签到请求（增加超时和错误捕获）
        log(1, "【调试】发起签到请求，接口地址：", `${API_HOST}/user/sign/v2/sign`);
        const signRes = await $task.fetch({
            url: `${API_HOST}/user/sign/v2/sign`,
            method: "POST",
            headers: headers,
            body: JSON.stringify(body),
            timeout: 10 // 超时时间10秒
        });

        // 6. 解析响应（强制输出原始响应）
        log(2, "【调试】接口原始响应：", signRes.statusCode, signRes.body);
        if (signRes.statusCode !== 200) throw new Error(`接口返回非200状态码：${signRes.statusCode}`);
        
        const signData = JSON.parse(signRes.body);
        if (signData.code !== 0) throw new Error(`签到失败：${signData.msg || "未知错误，code=" + signData.code}`);

        // 7. 结果处理
        let notifyMsg = "✅ 美团签到成功！";
        log(1, notifyMsg);
        
        // 尝试领取神券（单独捕获错误，不影响主流程）
        try {
            const couponRes = await $task.fetch({
                url: `${API_HOST}/coupon/sign/receive`,
                method: "GET",
                headers: headers,
                timeout: 5
            });
            const couponData = JSON.parse(couponRes.body);
            if (couponData.code === 0 && couponData.data) {
                notifyMsg += `\n🎫 领取神券：${couponData.data.couponName || "美团通用神券"}`;
            } else {
                notifyMsg += `\n🎫 ${couponData.msg || "今日无可用神券"}`;
            }
        } catch (e) {
            notifyMsg += `\n🎫 神券领取失败：${e.message}`;
            log(1, "【调试】神券领取失败：", e.message);
        }

        // 推送通知
        $notification.post("美团签到·调试结果", "", notifyMsg);
        log(1, "【调试】脚本执行完成，通知已推送");

    } catch (error) {
        const errMsg = `❌ 签到脚本执行失败：${error.message}`;
        log(1, errMsg);
        $notification.post("美团签到·调试错误", "", errMsg);
    } finally {
        log(1, "【调试】脚本执行结束");
        $done({});
    }
})();

// 从BoxJS加载鉴权字段（增加错误捕获）
async function loadAuthData() {
    const keys = ["token", "authorization", "deviceId", "uuid", "mtFingerprint", "userAgent", "cookie", "appVersion"];
    const authData = {};
    for (const key of keys) {
        try {
            authData[key] = await getBoxJSData(key) || "";
        } catch (e) {
            log(1, "【调试】读取字段" + key + "失败：", e.message);
            authData[key] = "";
        }
    }
    return authData;
}

// BoxJS读取函数（优化Promise逻辑）
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

// 强制日志输出函数
function log(level, ...msg) {
    console.log(`[美团签到-${new Date().toLocaleTimeString()}] [LV${level}]`, ...msg);
}

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(msg);
    this.notify = (t, s, m) => $notification.post(t, s, m);
}