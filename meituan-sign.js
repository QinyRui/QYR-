// 美团签到领神券脚本 | 从BoxJS自动读取Cookie | 适配Loon
// 仓库链接: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const $ = new Env("美团签到");
const BOXJS_DOMAIN = "meituan-sign"; // 与BoxJS配置的domain保持一致
const API_HOST = "https://api.meituan.com";

(async function() {
    try {
        // 从BoxJS读取存储的美团Cookie
        const cookie = await getBoxJSData("cookie");
        if (!cookie) throw new Error("BoxJS中无有效Cookie，请先打开美团App触发抓取");

        // 1. 执行签到请求
        const signRes = await $task.fetch({
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
        });

        const signData = JSON.parse(signRes.body);
        if (signData.code !== 0) throw new Error(signData.msg || "签到接口调用失败");

        let notifyMsg = "✅ 美团签到成功！";
        $.log(notifyMsg);

        // 2. 签到成功后领取神券
        const couponRes = await $task.fetch({
            url: `${API_HOST}/coupon/sign/receive`,
            method: "GET",
            headers: {
                "User-Agent": "Meituan/12.10.2 iOS/17.0",
                "Cookie": cookie
            }
        });

        const couponData = JSON.parse(couponRes.body);
        if (couponData.code === 0 && couponData.data) {
            const couponName = couponData.data.couponName || "未知神券";
            notifyMsg += `\n🎫 已领取神券：${couponName}`;
        } else {
            notifyMsg += `\n🎫 ${couponData.msg || "今日无可用神券"}`;
        }

        // 推送签到结果通知
        $.notify("美团签到领神券", "", notifyMsg);

    } catch (error) {
        const errMsg = `❌ 执行失败：${error.message}`;
        $.notify("美团签到失败", "", errMsg);
        $.log(errMsg);
    } finally {
        $.done({});
    }
})();

// 从BoxJS读取数据的工具函数
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(`${BOXJS_DOMAIN}.${key}`, value => {
            resolve(value || "");
        });
    });
}

// Loon环境适配函数
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${this.name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}