/* 米游社抓包脚本 - Loon专用 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
if (!boxjs) { $done({}); return; }

// 读取插件参数和BoxJS开关
const captureEnable = boxjs.getItem("mihoyo.captureEnable") === "true";
const notify = $argument?.[0] === "true";
const titlePrefix = $argument?.[1] || "米游社抓包助手";

// 开关关闭直接退出
if (!captureEnable) {
    notify && $notification.post(titlePrefix, "抓包未执行", "自动抓包开关已关闭");
    $done({});
}

// 抓包核心逻辑
if (typeof $request !== 'undefined') {
    // 提取Cookie和SToken
    const cookie = $request.headers?.Cookie?.match(/(cookie_token=.*?;|account_id=.*?;)/g)?.join(" ") || "";
    const stoken = $request.headers?.["x-rpc-stoken"] || "";
    const now = new Date().toLocaleString();

    if (cookie || stoken) {
        // 写入BoxJS
        cookie && boxjs.setItem("mihoyo.cookie", cookie);
        stoken && boxjs.setItem("mihoyo.stoken", stoken);
        boxjs.setItem("mihoyo.lastCaptureAt", now);
        // 推送成功通知
        notify && $notification.post(titlePrefix, "抓包成功", "凭证已写入BoxJS");
    } else if (notify) {
        // 无数据通知
        $notification.post(titlePrefix, "抓包无数据", "未提取到Cookie/SToken");
    }
}

$done({});