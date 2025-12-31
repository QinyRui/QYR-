// 美团签到临时调试版 | 强制日志+通知
const $ = new Env("美团签到");
const API_HOST = "https://api.meituan.com";

(async function() {
    try {
        // 1. 直接读取BoxJS的meituan.cookie
        let cookie = "";
        $persistentStore.read("meituan.cookie", value => {
            cookie = value || "";
        });
        console.log("【签到调试】从BoxJS读取Cookie：", cookie ? "有数据" : "无数据");
        if (!cookie) throw new Error("BoxJS中无meituan.cookie");

        // 2. 执行签到请求
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
        console.log("【签到调试】接口响应：", signRes.body);
        const signData = JSON.parse(signRes.body);
        
        if (signData.code !== 0) throw new Error(signData.msg || "签到失败");
        $notification.post("美团签到调试", "", "✅ 签到成功");

    } catch (error) {
        console.log("【签到调试错误】", error.message);
        $notification.post("美团签到调试", "", `❌ 失败：${error.message}`);
    } finally {
        $done({});
    }
})();

function Env(name) {
    this.name = name;
    this.log = msg => console.log(msg);
    this.notify = (t, s, m) => $notification.post(t, s, m);
}