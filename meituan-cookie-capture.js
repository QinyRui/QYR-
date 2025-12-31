// 美团Cookie抓取临时调试版 | 强制日志+通知
const $ = new Env("美团Cookie抓取");
const BOXJS_DOMAIN = "QinyRui.MeituanSign"; // 匹配新BoxJS的id

// 强制配置（临时跳过BoxJS）
const LOG_LEVEL = 2;
const NOTIFY_SWITCH = true;

(async function() {
    try {
        // 1. 强制输出请求头（排查是否抓到Cookie）
        console.log("【调试】请求头完整数据：", JSON.stringify($request.headers));
        
        // 2. 提取Cookie
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) throw new Error("请求头无Cookie字段");
        console.log("【调试】提取到Cookie：", cookie.substring(0, 100) + "...");

        // 3. 尝试写入BoxJS（强制指定key）
        await setBoxJSData("meituan.cookie", cookie);
        console.log("【调试】Cookie已写入BoxJS：meituan.cookie");

        // 4. 写入更新时间
        const now = new Date().toLocaleString();
        await setBoxJSData("meituan.lastCaptureAt", now);
        
        // 强制通知
        if (NOTIFY_SWITCH) {
            $notification.post("美团Cookie抓取调试", "", `✅ 提取Cookie成功\n更新时间：${now}`);
        }

    } catch (error) {
        console.log("【调试错误】", error.message);
        $notification.post("美团Cookie抓取调试", "", `❌ 失败：${error.message}`);
    } finally {
        $done({});
    }
})();

// 简化版BoxJS读写（直接指定key）
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(key, value => resolve(value || ""));
    });
}
function setBoxJSData(key, value) {
    return new Promise(resolve => {
        $persistentStore.write(value, key, () => resolve());
    });
}
function Env(name) {
    this.name = name;
    this.log = msg => console.log(msg);
    this.notify = (t, s, m) => $notification.post(t, s, m);
}