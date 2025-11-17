/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/17
📦 版本：v1.2
📱 适配：iOS 系统
✈️ 群 telegram = https://t.me/JiuHaoAPP
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null;
const persistentWrite = (v, k) => typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : null;
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

// ---------- BoxJS 配置读取 ----------
let config = {
  Authorization: persistentRead("ninebot.authorization"),
  DeviceId: persistentRead("ninebot.deviceId"),
  userAgent: persistentRead("ninebot.userAgent"),
  debug: persistentRead("ninebot.debug") === "true",
  notify: persistentRead("ninebot.notify") === "true",
  autoOpenBox: persistentRead("ninebot.autoOpenBox") === "true",
  titlePrefix: persistentRead("ninebot.titlePrefix") || "九号签到"
};

// ---------- 抓包捕获 Token ----------
if (isReq) {
  try {
    const auth = $request.headers["Authorization"] || $request.headers["authorization"];
    const devId = $request.headers["deviceId"] || $request.headers["device_id"];
    const ua = $request.headers["User-Agent"] || "";
    let changed = false;
    if (auth) { persistentWrite(auth, "ninebot.authorization"); changed = true; }
    if (devId) { persistentWrite(devId, "ninebot.deviceId"); changed = true; }
    if (ua) { persistentWrite(ua, "ninebot.userAgent"); changed = true; }

    if (changed) noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
  } catch (e) {
    console.log("Token 捕获异常：", e);
  }
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
    "User-Agent": config.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com"
  };

  let notifyBody = "";

  try {
    // ===== 签到 =====
    const signRes = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: "{}" // 空 body 避免 Params error
    });
    if (signRes.code === 0) notifyBody += `🎉 签到成功\n🎁 +${signRes.data.nCoin || 0} N币`;
    else if (signRes.code === 540004) notifyBody += "⚠️ 今日已签到";
    else notifyBody += `❌ 签到失败：${signRes.msg || JSON.stringify(signRes)}`;

    // ===== 状态 =====
    const statusRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    notifyBody += `\n🗓 连续签到：${statusRes.data?.consecutiveDays || 0} 天\n🎫 补签卡：${statusRes.data?.signCardsNum || 0} 张`;

    // ===== N币余额 =====
    const balRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    notifyBody += `\n💰 N币余额：${balRes.data?.balance || 0}`;

    // ===== 盲盒列表 =====
    const boxRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });
    const boxes = boxRes.data?.notOpenedBoxes || [];
    if (boxes.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      for (const b of boxes) {
        notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;
      }

      // ===== 自动开启盲盒 =====
      if (config.autoOpenBox) {
        const ready = boxes.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            const rewardRes = await httpPost({
              url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
              headers,
              body: "{}"
            });
            const rewardText = rewardRes.code === 0
              ? `${rewardRes.data?.rewardValue || rewardRes.data?.score || "未知奖励"}`
              : rewardRes.msg || "领取失败";
            notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${rewardText}`;
          }
        }
      }
    } else {
      notifyBody += "\n📦 无盲盒任务";
    }

    // ===== 发送通知 =====
    if (config.notify) noti(config.titlePrefix, "签到结果", notifyBody);

  } catch (err) {
    if (config.notify) noti(config.titlePrefix, "脚本异常", String(err));
  }

  $done();
})();