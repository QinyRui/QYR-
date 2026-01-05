/*
 * BoxJS 跨域重写通用脚本（调试日志版）
 * 文件名: BoxJsCors.js
 * 适配: Loon/Quantumult X/Shadowrocket
 * 功能: 为 GitHub 仓库的 BoxJS 配置文件添加跨域响应头 + 调试日志输出
 */

// 日志输出函数（按级别区分）
function log(level, message) {
    const timestamp = new Date().toLocaleString("zh-CN");
    console.log(`[BoxJsCors-${level}] [${timestamp}] ${message}`);
}

// 非响应场景直接退出
if (typeof $response === 'undefined') {
    log("WARN", "当前非响应请求，脚本退出");
    $done({});
    return;
}

log("INFO", "开始处理跨域重写请求");
log("INFO", `原始请求URL: ${$request?.url || "未知"}`);
log("INFO", `原始响应状态码: ${$response.status || "未知"}`);

// 核心跨域头配置
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
};

// 打印原始响应头
log("DEBUG", "原始响应头:");
for (const [key, value] of Object.entries($response.headers)) {
    log("DEBUG", `  ${key}: ${value}`);
}

// 合并原有响应头与跨域头
const modifiedHeaders = {
    ...$response.headers,
    ...corsHeaders
};

// 打印修改后的响应头
log("DEBUG", "修改后响应头（新增跨域头）:");
for (const [key, value] of Object.entries(modifiedHeaders)) {
    log("DEBUG", `  ${key}: ${value}`);
}

// 构造响应结果
const result = {
    headers: modifiedHeaders,
    body: $response.body
};

log("INFO", "跨域重写处理完成，返回修改后响应");
$done(result);