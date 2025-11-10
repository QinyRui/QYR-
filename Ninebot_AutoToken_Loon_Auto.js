/*
📱 九号智能电动车 - Loon 自动抓取 Token v3.2
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/11
💬 功能：
   - 完全自动抓取 Authorization / deviceId
   - 自动保存到 $persistentStore
   - 支持 Loon 网络请求拦截
   - 自动发送抓取结果通知
*/

const authKey = "ninebot_authorization";
const deviceIdKey = "ninebot_device_id";

// Loon 通知函数
function notify(title, msg) {
  $notification.post(title, "", msg);
}

// 拦截九号 App 登录请求
if ($request && $request.url.includes("user/phoneCodeLogin")) {
  const headers = $request.headers || {};
  const auth = headers.Authorization || headers.authorization;
  const deviceId = headers.deviceId || headers["device-id"];

  if (auth && deviceId) {
    // 保存到 $persistentStore
    $persistentStore.write(auth, authKey);
    $persistentStore.write(deviceId, deviceIdKey);

    notify("九号 Token 抓取成功", `✅ Authorization 与 deviceId 已保存`);
    console.log("Authorization:", auth);
    console.log("deviceId:", deviceId);
  } else {
    notify("抓取失败", "⚠️ 未能获取 Authorization 或 deviceId，请确保 App 已登录并重新触发请求");
  }
  $done();
} else {
  // 脚本主动运行时（非拦截请求）
  const currentAuth = $persistentStore.read(authKey);
  const currentDeviceId = $persistentStore.read(deviceIdKey);

  if (currentAuth && currentDeviceId) {
    notify("九号 Token 已存在", "✅ 已检测到 Authorization 和 deviceId，可直接签到");
    console.log("Authorization:", currentAuth);
    console.log("deviceId:", currentDeviceId);
  } else {
    notify("抓取提示", "⚠️ 请打开九号 App 登录账户，触发登录请求以抓取 Token");
    console.log("当前 Authorization:", currentAuth || "未获取");
    console.log("当前 deviceId:", currentDeviceId || "未获取");
  }
  $done();
}

/*
💡 使用说明：
1️⃣ 将此脚本导入 Loon 并启用。
2️⃣ 首次执行时，打开九号 App登录账户。
3️⃣ 登录请求触发后，Loon 拦截并抓取 Authorization 与 deviceId。
4️⃣ 自动保存到 $persistentStore，供 v2.2 签到脚本直接读取。
5️⃣ 可设置每天定时运行，确保 Token 始终最新。
*/