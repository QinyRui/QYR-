/*
 * 米游社凭证自动抓包脚本 (Loon/BoxJS 配套)
 * 功能: 抓取 Cookie/SToken 写入 BoxJS + 更新抓包时间
 * 适配: 米游社 BoxJS 配置文件格式
 */
const box = typeof $box !== 'undefined' ? $box : null;
const captureEnable = box?.getItem("mihoyo.captureEnable") === "true";

// 跳过抓包开关关闭的情况
if (!captureEnable || !box) {
    $done({});
    return;
}

// 核心抓取函数
function captureMihoyoData(request) {
    try {
        let cookie = "";
        let stoken = "";
        const now = new Date().toLocaleString("zh-CN");

        // 1. 从请求头提取 Cookie (包含 cookie_token/account_id)
        if (request.headers?.Cookie) {
            const cookieMatch = request.headers.Cookie.match(/(cookie_token=.*?;|account_id=.*?;)/g);
            if (cookieMatch) cookie = cookieMatch.join(" ").trim();
        }

        // 2. 从请求头提取 SToken
        if (request.headers?.["x-rpc-stoken"]) {
            stoken = request.headers["x-rpc-stoken"].trim();
        }

        // 3. 写入 BoxJS (仅当数据有效时更新)
        if (cookie) box.setItem("mihoyo.cookie", cookie);
        if (stoken) box.setItem("mihoyo.stoken", stoken);
        // 4. 更新最后抓包时间
        if (cookie || stoken) box.setItem("mihoyo.lastCaptureAt", now);

        // 5. 日志输出 (根据配置的日志级别)
        const logLevel = box.getItem("mihoyo.logLevel") || "simple";
        if (logLevel === "full") {
            console.log(`[米游社抓包] 时间: ${now}\nCookie: ${cookie || "未获取"}\nSToken: ${stoken || "未获取"}`);
        }

        // 6. 推送通知 (仅当开启通知时)
        const notify = box.getItem("mihoyo.notify") === "true";
        if (notify && (cookie || stoken)) {
            box.notify(
                box.getItem("mihoyo.titlePrefix") || "米游社抓包助手",
                "凭证抓取成功",
                `最后更新: ${now}\nCookie: ${cookie ? "已更新" : "无变化"}\nSToken: ${stoken ? "已更新" : "无变化"}`
            );
        }
    } catch (e) {
        console.error(`[米游社抓包] 错误: ${e.message}`);
    }
}

// 主逻辑: 监听米游社核心接口请求
if (typeof $request !== 'undefined') {
    // 匹配米游社社区/签到相关接口
    const mihoyoHosts = ["api-takumi.mihoyo.com", "bbs-api.mihoyo.com"];
    const isTargetHost = mihoyoHosts.some(host => $request.url.includes(host));
    
    if (isTargetHost) {
        captureMihoyoData($request);
    }
}

$done({});