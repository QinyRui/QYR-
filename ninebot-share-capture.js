/**
 * 九号智能分享任务参数自动写入 BoxJS
 * 作者: QinyRui
 * 适配版本: Loon 2.1.0+
 * 功能: 捕获分享任务接口参数并自动更新到 BoxJS
 */

const BOXJS_PREFIX = "ninebot";

// 工具函数：写入 BoxJS 配置（自动拼接前缀）
function writeToBoxJS(key, value) {
    if (!value || value.trim() === "") return;
    const fullKey = `${BOXJS_PREFIX}.${key}`;
    $persistentStore.write(value, fullKey);
    console.log(`✅ 写入 BoxJS: ${fullKey} (长度: ${value.length})`);
}

// 工具函数：更新最后抓包时间戳
function updateCaptureTimestamp() {
    const now = new Date().toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    writeToBoxJS("lastCaptureTime", now);
}

// 1. 处理任务提交接口（snssdk.ninebot.com）
// 目标：提取 install_id、ttreq（Cookie）和 task_complete_body（Base64请求体）
function handleTaskReportRequest(request) {
    try {
        // 提取 Cookie 中的 install_id 和 ttreq
        const cookie = request.headers["Cookie"] || request.headers["cookie"] || "";
        if (cookie) {
            const installIdMatch = cookie.match(/install_id=([^;]+)/);
            const ttreqMatch = cookie.match(/ttreq=([^;]+)/);
            if (installIdMatch) writeToBoxJS("install_id", installIdMatch[1]);
            if (ttreqMatch) writeToBoxJS("ttreq", ttreqMatch[1]);
        }

        // 提取 Base64 编码的任务提交 Body
        const body = request.body;
        if (body && body.length > 500) { // 过滤无效短Body
            writeToBoxJS("task_complete_body", body);
        }

        updateCaptureTimestamp();
        console.log("📥 捕获分享任务提交参数成功");
    } catch (error) {
        console.error("⚠️ 处理任务提交接口失败:", error.message);
    }
    return request;
}

// 2. 处理奖励领取接口（cn-cbu-gateway.ninebot.com）
// 目标：提取 v、s、r 加密参数（请求体JSON）
function handleRewardClaimRequest(request) {
    try {
        // 解析请求体JSON
        const bodyStr = request.body || "{}";
        const body = JSON.parse(bodyStr);

        // 提取并写入 v/s/r 参数
        if (body.v) writeToBoxJS("v", body.v);
        if (body.s) writeToBoxJS("s", body.s);
        if (body.r) writeToBoxJS("r", body.r);

        // 额外捕获 Authorization 和 deviceId（从请求头）
        const authorization = request.headers["Authorization"] || request.headers["authorization"] || "";
        const deviceId = request.headers["device_id"] || request.headers["Device-Id"] || "";
        if (authorization) writeToBoxJS("authorization", authorization);
        if (deviceId) writeToBoxJS("deviceId", deviceId);

        updateCaptureTimestamp();
        console.log("📥 捕获奖励领取参数成功");
    } catch (error) {
        console.error("⚠️ 处理奖励领取接口失败:", error.message);
    }
    return request;
}

// 入口：根据请求URL分发处理逻辑（关键修改：将 $request 改为 $httpRequest）
const requestUrl = $httpRequest.url;
if (requestUrl.includes("snssdk.ninebot.com/service/2/app_log")) {
    handleTaskReportRequest($httpRequest);
} else if (requestUrl.includes("cn-cbu-gateway.ninebot.com/portal/self-service/task/reward")) {
    handleRewardClaimRequest($httpRequest);
}

// 放行请求（不修改原始请求）
$done({});