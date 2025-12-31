// 美团签到脚本 | 适配多维度鉴权字段 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const $ = new Env("美团签到");
const API_HOST = "https://api.meituan.com";
const STORE_PREFIX = "meituan_"; // 与抓包脚本前缀一致

(async function() {
    try {
        // 1. 从BoxJS读取所有鉴权字段
        const authData = await loadAuthData();
        console.log("【签到】读取到鉴权字段：", getExistKeys(authData));

        // 2. 验证核心鉴权字段
        const coreKeys = ["token", "authorization", "cookie"];
        const hasCore = coreKeys.some(key => authData[key]);
        if (!hasCore) throw new Error("无有效鉴权字段，请先打开美团App触发抓包");

        // 3. 构造签到请求头
        const headers = {
            "User-Agent": authData.userAgent || "Meituan/8.65.0 iOS/17.0",
            "Content-Type": "application/json;charset=utf-8"
        };
        // 填充可用的鉴权字段
        if (authData.token) headers.token = authData.token;
        if (authData.authorization) headers.Authorization = authData.authorization;
        if (authData.cookie) headers.Cookie = authData.cookie;
        if (authData.deviceId) headers.deviceId = authData.deviceId;

        // 4. 构造签到请求体
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

        // 5. 执行签到请求
        console.log("【签到】发起请求，接口：/user/sign/v2/sign");
        const signRes = await $task.fetch({
            url: `${API_HOST}/user/sign/v2/sign`,
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        // 6. 解析响应结果
        const signData = JSON.parse(signRes.body);
        if (signData.code !== 0) throw new Error(`接口返回错误：${signData.msg || signData.code}`);

        // 7. 领取神券（可选）
        let notifyMsg = "✅ 美团签到成功！";
        if (authData.token) {
            try {
                const couponRes = await $task.fetch({
                    url: `${API_HOST}/coupon/sign/receive`,
                    method: "GET",
                    headers: headers
                });
                const couponData = JSON.parse(couponRes.body);
                if (couponData.code === 0 && couponData.data) {
                    notifyMsg += `\n🎫 领取神券：${couponData.data.couponName || "美团通用神券"}`;
                } else {
                    notifyMsg += `\n🎫 ${couponData.msg || "今日无可用神券"}`;
                }
            } catch (e) {
                notifyMsg += `\n🎫 神券领取接口调用失败：${e.message}`;
            }
        }

        // 8. 推送结果通知
        $notification.post("美团签到结果", "", notifyMsg);
        console.log(notifyMsg);

    } catch (error) {
        const errMsg = `❌ 签到失败：${error.message}`;
        $notification.post("美团签到结果", "", errMsg);
        console.log(errMsg);
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

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}