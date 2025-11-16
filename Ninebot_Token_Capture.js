/**
 * 九号电动车 Token 捕获
 * 保存 Authorization + DeviceId（只通知一次）
 */

const isReq = typeof $request !== "undefined";
const read = key => $persistentStore.read(key);
const write = (val, key) => $persistentStore.write(val, key);

if (isReq) {
  try {
    const headers = $request.headers || {};

    const auth = headers["Authorization"] || headers["authorization"];
    const devId = headers["deviceId"] || headers["DeviceId"] || headers["device_id"];

    const captured = read("Ninebot_TokenCaptured");

    if (!captured && (auth || devId)) {
      if (auth) write(auth, "Ninebot_Authorization");
      if (devId) write(devId, "Ninebot_DeviceId");
      write("1", "Ninebot_TokenCaptured");

      $notification.post("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
    }
  } catch (e) {
    console.log("Token 捕获失败:", e);
  }

  $done({});
}