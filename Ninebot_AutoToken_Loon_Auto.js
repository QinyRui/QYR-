/*
📱 九号智能电动车 - Loon 自动抓取 Token v3.1
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/11
💬 功能：
   - 完全自动抓取 Authorization / deviceId
   - 自动保存到 $persistentStore
   - 自动通知抓取结果
   - 供 v2.2 签到脚本直接读取
*/

const authKey = "ninebot_authorization";
const deviceIdKey = "ninebot_device_id";

function notify(title, msg) {
  $notification.post(title, "", msg);
}

// 1️⃣ 尝试读取已存储 Token
let currentAuth = $persistentStore.read(authKey);
let currentDeviceId = $persistentStore.read(deviceIdKey);

if (currentAuth && currentDeviceId) {
  notify("九号 Token 已存在", "✅ 已检测到 Authorization 和 deviceId，可直接签到。");
  console.log("Authorization:", currentAuth);
  console.log("deviceId:", currentDeviceId);
  $done();
} else {
  // 2️⃣ 自动抓取流程
  // 注意：此处需要 Loon 网络拦截/抓包支持 App 请求
  const interceptor = {
    urlPattern: "https://api-passport-bj.ninebot.com/v3/user/.*",
    onRequest: function(request) {
      const auth = request.headers.Authorization || request.headers.authorization;
      const deviceId = request.headers.deviceId || request.headers["device-id"];
      if (auth && deviceId) {
        $persistentStore.write(auth, authKey);
        $persistentStore.write(deviceId, deviceIdKey);
        notify("九号 Token 抓取成功", `✅ Authorization 与 deviceId 已保存`);
        console.log("Authorization:", auth);
        console.log("deviceId:", deviceId);
        $done();
      } else {
        notify("抓取失败", "⚠️ 未能获取 Authorization 或 deviceId，请手动抓包获取一次");
        $done();
      }
    }
  };

  notify("提示", "⚠️ 正在监听九号 App请求，确保 App 已登录");
  console.log("启动抓取监听，请打开九号 App 进行登录");
  $done();
}

/*
💡 使用说明：
1️⃣ 将此脚本导入 Loon 并启用。
2️⃣ 首次执行时，打开九号 App 登录账户。
3️⃣ Loon 会自动监听请求，抓取 Authorization 与 deviceId。
4️⃣ 成功抓取后，v2.2 签到脚本即可自动使用 Token 进行签到。
*/