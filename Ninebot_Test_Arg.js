/***********************************************
 Minimal Test Script for Loon Plugin Arguments
 Purpose: Verify plugin UI select/switch parameters
***********************************************/

const IS_ARG = typeof $argument !== "undefined";

const logLevel = IS_ARG && $argument.logLevel !== undefined ? $argument.logLevel : "未传";
const style = IS_ARG && $argument.style !== undefined ? $argument.style : "未传";

console.log("✅ 测试日志等级 logLevel =", logLevel);
console.log("✅ 测试盲盒样式 style =", style);

$done({
    title: "测试参数输出",
    content: `日志等级：${logLevel}\n盲盒样式：${style}`,
    icon: "📦"
});