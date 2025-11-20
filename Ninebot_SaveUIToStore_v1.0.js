/*
Ninebot_SaveUIToStore_v1.0.js
说明：把 Loon 插件 UI 的 input 字段写入 $persistentStore，执行一次即可。
*/

try {
  // Loon 会把 UI 的值传给脚本的 $argument（不同环境存在差异）
  // 这里尝试读取 $argument 或者从 $persistentStore 读取（兼容性写法）
  const arg = (typeof $argument !== "undefined" && $argument) ? $argument : {};

  // UI 字段名（与 .plugin 中的名字一致）
  const uiAuth = arg.ui_Authorization || "";
  const uiDev = arg.ui_DeviceId || "";
  const uiUa = arg.ui_UserAgent || "";

  if (uiAuth) $persistentStore.write(uiAuth, "ninebot.Authorization");
  if (uiDev) $persistentStore.write(uiDev, "ninebot.DeviceId");
  if (uiUa) $persistentStore.write(uiUa, "ninebot.UserAgent");

  if (uiAuth || uiDev || uiUa) {
    $notification.post("九号签到助手", "UI 配置已保存", "Authorization / DeviceId / User-Agent 已写入插件存储");
    console.log("[Ninebot] UI 保存到持久化完成");
  } else {
    $notification.post("九号签到助手", "未检测到 UI 值", "请在插件 UI 填写后再执行此操作");
    console.log("[Ninebot] 未检测到 UI 值");
  }
} catch (e) {
  console.log("[Ninebot] 保存 UI 到存储异常：", e);
  $notification.post("九号签到助手", "保存失败", String(e));
}
$done();