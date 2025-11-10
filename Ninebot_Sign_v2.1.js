/*
📱 九号智能电动车 - 自动抓取 Authorization / deviceId v3.0
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/11
💬 功能：
   - 自动抓取九号 APP 登录后的 Authorization
   - 自动抓取 deviceId
   - 保存到 $persistentStore
   - 供 v2.2 签到脚本直接读取
*/

const authKey = "ninebot_authorization";
const deviceIdKey = "ninebot_device_id";

function notify(title, message) {
  if ($notification) $notification.post(title, "", message);
  else console.log(`${title}\n${message}`);
}

// 检查是否存在 Authorization 与 deviceId
const currentAuth = $persistentStore.read(authKey);
const currentDeviceId = $persistentStore.read(deviceIdKey);

if (currentAuth && currentDeviceId) {
  notify("九号 Token 已存在", `Authorization 与 deviceId 已存在，可直接签到。`);
  $done();
} else {
  notify("抓取提示", "请打开九号 APP，登录后执行抓包/调试以获取 Authorization 和 deviceId");
  console.log("当前 Authorization:", currentAuth || "未获取");
  console.log("当前 deviceId:", currentDeviceId || "未获取");
  $done();
}