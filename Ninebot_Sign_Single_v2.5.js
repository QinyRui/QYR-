/***************************
 * 九号账号抓包自动写入模块（修复版）
 * 功能：
 *  - 自动写入 Authorization / DeviceId / User-Agent
 *  - 写入成功会通知
 *  - UI 可实时读取已写入数据
 ***************************/

const isRequest = typeof $request !== "undefined";

function notify(title, body) {
  $notification.post(title, "", body);
}

function writeArgument(key, val) {
  // Loon 专用写入 UI 的接口
  return $persistentStore.write(val, key);
}

if (isRequest) {
  const url = $request.url;
  const headers = $request.headers || {};

  // 只处理 Ninebot 相关请求
  if (/ninebot\.com/.test(url)) {
    const Authorization = headers["Authorization"] || headers["authorization"] || "";
    const DeviceId = headers["DeviceId"] || headers["deviceid"] || "";
    const UserAgent = headers["User-Agent"] || headers["user-agent"] || "";

    let msg = "";

    if (Authorization) {
      writeArgument("Authorization", Authorization);
      msg += `Authorization 写入成功\n`;
    }

    if (DeviceId) {
      writeArgument("DeviceId", DeviceId);
      msg += `DeviceId 写入成功\n`;
    }

    if (UserAgent) {
      writeArgument("UserAgent", UserAgent);
      msg += `User-Agent 写入成功\n`;
    }

    if (msg.length > 0) {
      notify("九号签到助手 · 抓包写入成功", msg);
    }
  }

  // 必须结束 request
  $done({});
  return;
}