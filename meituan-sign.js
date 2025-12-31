// 美团签到领神券脚本 | BoxJS 远程控制日志+通知 | Loon专用
// 仓库链接: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const $ = new Env("美团签到");
const BOXJS_DOMAIN = "meituan-sign";
const API_HOST = "https://api.meituan.com";

let LOG_LEVEL = 1;
let NOTIFY_SWITCH = true;

(async function() {
    try {
        // 第一步：读取 BoxJS 配置参数
        await loadBoxJSConfig();
        log(1, "📌 已加载 BoxJS 配置 | 日志等级:" + LOG_LEVEL + " | 通知开关:" + NOTIFY_SWITCH);

        // 第二步：读取 BoxJS 中的 Cookie
        const cookie = await getBoxJSData("cookie");
        log(1, "📥 从BoxJS读取Cookie: " + (cookie ? "已获取" : "未获取"));
        if (!cookie) throw new Error("BoxJS中无有效Cookie，请先开启抓包开关");

        // 第三步：执行签到请求
        const signParams = {
            url: `${API_HOST}/user/sign/v2/sign`,
            method: "POST",
            headers: {
                "User-Agent": "Meituan/12.10.2 iOS/17.0",
                "Content-Type": "application/json",
                "Cookie": cookie
            },
            body: JSON.stringify({
                "appVersion": "12.10.2",
                "platform": "iOS",
                "signType": "DAILY_SIGN"
            })
        };
        log(2, "🔍 签到请求参数: " + JSON.stringify(signParams));

        const signRes = await $task.fetch(signParams);
        log(2, "🔌 签到接口响应: " + signRes.body);
        const signData = JSON.parse(signRes.body);
        
        if (signData.code !== 0) throw new Error(signData.msg || "签到接口调用失败");
        let notifyMsg = "✅ 美团签到成功！";
        log(1, notifyMsg);

        // 第四步：领取神券
        const couponParams = {
            url: `${API_HOST}/coupon/sign/receive`,
            method: "GET",
            headers: {
                "User-Agent": "Meituan/12.10.2 iOS/17.0",
                "Cookie": cookie
            }
        };
        log(2, "🔍 领券请求参数: " + JSON.stringify(couponParams));

        const couponRes = await $task.fetch(couponParams);
        log(2, "🔌 领券接口响应: " + couponRes.body);
        const couponData = JSON.parse(couponRes.body);
        
        if (couponData.code === 0 && couponData.data) {
            const couponName = couponData.data.couponName || "未知神券";
            notifyMsg += `\n🎫 已领取神券：${couponName}`;
        } else {
            notifyMsg += `\n🎫 ${couponData.msg || "今日无可用神券"}`;
        }

        if (NOTIFY_SWITCH) {
            $.notify("美团签到领神券", "", notifyMsg);
        }
        log(1, notifyMsg);

    } catch (error) {
        const errMsg = `❌ 执行失败：${error.message}`;
        if (NOTIFY_SWITCH) {
            $.notify("美团签到失败", "", errMsg);
        }
        log(1, errMsg);
    } finally {
        $.done({});
    }
})();

// 加载 BoxJS 配置（日志等级+通知开关）
async function loadBoxJSConfig() {
    const logLevel = await getBoxJSData("logLevel");
    LOG_LEVEL = logLevel ? parseInt(logLevel) : 1;

    const notifySwitch = await getBoxJSData("notifySwitch");
    NOTIFY_SWITCH = notifySwitch === "true" || notifySwitch === true;
}

// 带等级控制的日志函数
function log(level, msg) {
    if (level <= LOG_LEVEL) {
        $.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
}

// BoxJS 数据读取通用函数
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(`${BOXJS_DOMAIN}.${key}`, value => {
            resolve(value || "");
        });
    });
}

// Loon 环境适配函数
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}