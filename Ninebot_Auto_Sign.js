/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/16
📦 版本：v1.0
📱 适配：iOS 系统
✈️ 群 telegram = https://t.me/JiuHaoAPP
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null;
const persistentWrite = (v, k) => typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : null;
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

let config = {
  Authorization: persistentRead("Ninebot_Authorization"),
  DeviceId: persistentRead("Ninebot_DeviceId"),
  debug: persistentRead("Ninebot_debug") === "true",
  notify: persistentRead("Ninebot_notify") === "true",
  autoOpenBox: persistentRead("Ninebot_autoOpenBox") === "true",
  titlePrefix: persistentRead("Ninebot_titlePrefix") || "九号签到"
};

// ---------- 抓包捕获 Token ----------
if (isReq) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const devId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) persistentWrite(auth, "Ninebot_Authorization");
  if (devId) persistentWrite(devId, "Ninebot_DeviceId");
  noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
  $done({});
}

// ---------- HTTP 封装 ----------
function httpPost(req) {
  return new Promise((resolve, reject) => $httpClient.post(req, (err, resp, data) => err ? reject(err) : resolve(JSON.parse(data || "{}"))));
}
function httpGet(req) {
  return new Promise((resolve, reject) => $httpClient.get(req, (err, resp, data) => err ? reject(err) : resolve(JSON.parse(data || "{}"))));
}

// ---------- 主流程 ----------
!(async () => {
  if (!config.Authorization || !config.DeviceId) {
    if (config.notify) noti(config.titlePrefix, "未配置 Token", "请先抓包获取 Authorization 与 DeviceId");
    return $done();
  }

  const headers = {
    "Authorization": config.Authorization,
    "Content-Type": "application/json",
    "device_id": config.DeviceId,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"
  };

  try {
    // 签到
    const signRes = await httpPost({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", headers, body: JSON.stringify({ deviceId: config.DeviceId }) });
    let notifyBody = signRes.code === 0 ? `🎉 签到成功\n🎁 +${signRes.data.nCoin || 0} N币` : `⚠️ ${signRes.msg || "签到失败"}`;

    // 查询状态
    const statusRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    notifyBody += `\n🗓 连续签到：${statusRes.data?.consecutiveDays || 0} 天\n🎫 补签卡：${statusRes.data?.signCardsNum || 0} 张`;

    // 查询余额
    const balRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    notifyBody += `\n💰 N币余额：${balRes.data?.balance || 0}`;

    // 盲盒
    const boxRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });
    if (boxRes.data?.notOpenedBoxes?.length) {
      notifyBody += `\n\n📦 盲盒任务：\n`;
      boxRes.data.notOpenedBoxes.forEach(b => notifyBody += `- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天\n`);
    }

    if (config.notify) noti(config.titlePrefix, "签到结果", notifyBody);

  } catch (err) {
    if (config.notify) noti(config.titlePrefix, "脚本异常", String(err));
  }

  $done();
})();