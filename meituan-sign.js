// 美团签到脚本 | 适配Loon插件可视化参数 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const $ = new Env("美团签到");
const API_HOST = "https://api.meituan.com";
const STORE_PREFIX = "meituan_";

// 接收插件传递的参数（notify开关、log_level等级）
const args = $argument ? (() => {
    try {
        return JSON.parse($argument);
    } catch (e) {
        // 兼容非JSON格式的参数传递（逗号分隔）
        const arr = $argument.split(",");
        return {
            notify: arr[0] || "true",
            log_level: arr[1] || "1"
        };
    }
})() : { notify: "true", log_level: "1" };

// 解析插件参数为运行时配置
const NOTIFY_SWITCH = args.notify === "true";
const LOG_LEVEL = parseInt(args.log_level) || 1;

(async function() {
    try {
        // 从BoxJS读取所有鉴权字段
        const authData = await loadAuthData();
        log(1, "【签到】读取到鉴权字段：", getExistKeys(authData));

        // 验证核心鉴权字段
        const coreKeys = ["token", "authorization", "cookie"];
        const hasCore = coreKeys.some(key => authData[key]);
        if (!hasCore) throw new Error("无有效鉴权字段，请先打开美团App触发抓包");

        // 构造签到请求头
        const headers = {
            "User-Agent": authData.userAgent || "Meituan/8.65.0 iOS/17.0",
            "Content-Type": "application/json;charset=utf-8"
        };
        // 填充可用的鉴权字段
        if (authData.token) headers.token = authData.token;
        if (authData.authorization) headers.Authorization = authData.authorization;
        if (authData.cookie) headers.Cookie = authData.cookie;
        if (authData.deviceId) headers.deviceId = authData.deviceId;
        log(2, "【签到】构造请求头：", headers);

        // 构造签到请求体
        const body = {
            appVersion: "8.65.0",
            platform: "iOS",
            signType: "DAILY_SIGN",
            deviceType: 2,
            ctype: "iphone"
        };
        if (authData.deviceId) body.deviceId = authData.deviceId;
        if (authData.uuid) body.uuid = authData.uuid;
        if (authData.mtFingerprint) body.mtFingerprint = authData.mtFingerprint;
        log(2, "【签到】构造请求体：", body);

        // 执行签到请求
        log(1, "【签到】发起请求，接口：/user/sign/v2/sign");
        const signRes = await $task.fetch({
            url: `${API_HOST}/user/sign/v2/sign`,
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        // 解析响应结果
        log(2, "【签到】接口响应：", signRes.body);
        const signData = JSON.parse(signRes.body);
        if (signData.code !== 0) throw new Error(`接口返回错误：${signData.msg || signData.code}`);

        // 领取神券（可选）
        let notifyMsg = "✅ 美团签到成功！";
        if (authData.token) {
            try {
                log(1, "【签到】尝试领取神券，接口：/coupon/sign/receive");
                const couponRes = await $task.fetch({
                    url: `${API_HOST}/coupon/sign/receive`,
                    method: "GET",
                    headers: headers
                });
                const couponData = JSON.parse(couponRes.body);
                log(2, "【签到】神券接口响应：", couponData);
                if (couponData.code === 0 && couponData.data) {
                    notifyMsg += `\n🎫 领取神券：${couponData.data.couponName || "美团通用神券"}`;
                } else {
                    notifyMsg += `\n🎫 ${couponData.msg || "今日无可用神券"}`;
                }
            } catch (e) {
                notifyMsg += `\n🎫 神券领取接口调用失败：${e.message}`;
                log(1, "【签到】神券领取失败：", e.message);
            }
        }

        // 推送结果通知（受插件开关控制）
        if (NOTIFY_SWITCH) {
            $notification.post("美团签到结果", "", notifyMsg);
        }
        log(1, notifyMsg);

    } catch (error) {
        const errMsg = `❌ 签到失败：${error.message}`;
        if (NOTIFY_SWITCH) {
            $notification.post("美团签到结果", "", errMsg);
        }
        log(1, errMsg);
    } finally {
        $done({});
    }
})();

// 从BoxJS加载鉴权字段
async function loadAuthData() {
    const keys = ["token", "authorization", "deviceId", "uuid", "mtFingerprint", "userAgent", "cookie"];
    const authData = {};
    for (const key of keys) {
        authData[key] = await getBoxJSData(key) || "";
    }
    return authData;
}

// BoxJS通用读取函数
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(STORE_PREFIX + key, value => {
            resolve(value || "");
        });
    });
}

// 获取非空字段名
function getExistKeys(obj) {
    return Object.keys(obj).filter(key => obj[key]);
}

// 带等级控制的日志函数（受插件log_level控制）
function log(level, ...msg) {
    if (level <= LOG_LEVEL) {
        console.log(`[${new Date().toLocaleTimeString()}]`, ...msg);
    }
}

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}