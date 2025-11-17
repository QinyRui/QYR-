/*
📱 九号智能电动车自动签到脚本（单账号）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/17
📦 版本：v1.2
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// BoxJS 读取/写入
const read = k => $persistentStore.read(k);
const write = (v, k) => $persistentStore.write(v, k);

// 抓包写入 Token
if (isReq) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const devId = $request.headers["deviceId"] || $request.headers["device_id"];
  const ua = $request.headers["User-Agent"] || "";

  if (auth) write(auth, "ninebot.authorization");
  if (devId) write(devId, "ninebot.deviceId");
  if (ua) write(ua, "ninebot.userAgent");

  $notification.post("九号 Token 捕获成功", "", "Authorization / DeviceId 已写入 BoxJS");
  $done({});
}

// 读取 BoxJS
const Authorization = read("ninebot.authorization");
const DeviceId = read("ninebot.deviceId");
const userAgent = read("ninebot.userAgent") || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6";
const debug = read("ninebot.debug") === "true";
const notify = read("ninebot.notify") === "true";
const autoOpenBox = read("ninebot.autoOpenBox") === "true";
const titlePrefix = read("ninebot.titlePrefix") || "九号签到";

// HTTP 封装
function post(req) {
  return new Promise((resolve, reject) =>
    $httpClient.post(req, (err, resp, data) =>
      err ? reject(err) : resolve(JSON.parse(data || "{}"))
    )
  );
}
function get(req) {
  return new Promise((resolve, reject) =>
    $httpClient.get(req, (err, resp, data) =>
      err ? reject(err) : resolve(JSON.parse(data || "{}"))
    )
  );
}

// 主流程
!(async () => {
  if (!Authorization || !DeviceId) {
    if (notify) $notification.post(titlePrefix, "未配置 Token", "请先抓包一次自动写入 BoxJS");
    return $done();
  }

  const headers = {
    "Authorization": Authorization,
    "Content-Type": "application/json",
    "device_id": DeviceId,
    "User-Agent": userAgent
  };

  let text = "";

  try {
    // 签到
    const sign = await post({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: JSON.stringify({ deviceId: DeviceId })
    });

    if (sign.code === 0)
      text += `🎉 签到成功：+${sign.data?.nCoin || 0} N币`;
    else if (sign.code === 540004)
      text += `📌 今日已签到`;
    else
      text += `❌ 签到失败：${sign.msg || JSON.stringify(sign)}`;

    // 状态
    const st = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    text += `\n🗓 连续签到：${st.data?.consecutiveDays || 0} 天`;
    text += `\n🎫 补签卡：${st.data?.signCardsNum || 0} 张`;

    // N币余额
    const bal = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    text += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 盲盒
    const box = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });
    const list = box.data?.notOpenedBoxes || [];

    if (list.length === 0) {
      text += "\n📦 无盲盒任务";
    } else {
      text += "\n📦 盲盒：";
      for (const b of list)
        text += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;

      if (autoOpenBox) {
        const ready = list.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        if (ready.length > 0) {
          text += "\n\n🎉 自动开启盲盒：";
          for (const b of ready) {
            const r = await post({
              url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
              headers,
              body: "{}"
            });
            text += `\n🎁 ${b.awardDays}天盲盒奖励：${r.data?.score || r.data?.rewardValue || "未知"}`;
          }
        }
      }
    }

    if (notify) $notification.post(titlePrefix, "签到结果", text);

  } catch (e) {
    if (notify) $notification.post(titlePrefix, "脚本异常", String(e));
  }

  $done();
})();