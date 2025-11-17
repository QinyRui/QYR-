/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/16
📦 版本：v1.3
📱 适配：iOS 系统
✈️ 群 telegram = https://t.me/JiuHaoAPP
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => $persistentStore.read(k);
const write = (v, k) => $persistentStore.write(v, k);
const notify = (a, b, c) => $notification.post(a, b, c);

// ---- BoxJS 配置 ----
let cfg = {
  authorization: read("ninebot.authorization"),
  deviceId: read("ninebot.deviceId"),
  userAgent: read("ninebot.userAgent") || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  debug: read("ninebot.debug") === "true",
  notify: read("ninebot.notify") === "true",
  autoOpenBox: read("ninebot.autoOpenBox") === "true",
  titlePrefix: read("ninebot.titlePrefix") || "九号签到",
};

// ---- 抓包写入 Token ----
if (isReq) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const devId = $request.headers["deviceId"] || $request.headers["device_id"];
  const ua = $request.headers["User-Agent"];

  if (auth) write(auth, "ninebot.authorization");
  if (devId) write(devId, "ninebot.deviceId");
  if (ua) write(ua, "ninebot.userAgent");

  notify("九号 Token 捕获成功", "", "已自动写入 BoxJS（Authorization/DeviceId/User-Agent）");
  $done({});
}

// ---- HTTP 封装 ----
const post = r => new Promise((res, rej) => $httpClient.post(r, (e, h, d) => e ? rej(e) : res(JSON.parse(d || "{}"))));
const get =  r => new Promise((res, rej) => $httpClient.get(r, (e, h, d) => e ? rej(e) : res(JSON.parse(d || "{}"))));

// ---- 主逻辑 ----
!(async () => {

  if (!cfg.authorization || !cfg.deviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包获取 Authorization 与 DeviceId");
    return $done();
  }

  const headers = {
    "Authorization": cfg.authorization,
    "device_id": cfg.deviceId,
    "User-Agent": cfg.userAgent,
    "Content-Type": "application/json"
  };

  let log = "";

  try {
    // 签到
    const sign = await post({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: JSON.stringify({ deviceId: cfg.deviceId })
    });

    if (sign.code === 0) log += `🎉 签到成功 +${sign.data?.nCoin || 0}N币`;
    else if (sign.code === 540004) log += "⚠️ 今日已签到";
    else log += `❌ 签到失败：${sign.msg}`;

    // 状态
    const st = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    log += `\n🗓 连续签到：${st.data?.consecutiveDays || 0} 天`;
    log += `\n🎫 补签卡：${st.data?.signCardsNum || 0} 张`;

    // 余额
    const bal = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    log += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 盲盒
    const box = await get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });

    const list = box.data?.notOpenedBoxes || [];
    if (list.length === 0) {
      log += "\n📦 无盲盒任务";
    } else {
      log += "\n📦 盲盒任务：";
      for (let b of list) log += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;

      if (cfg.autoOpenBox) {
        const ready = list.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        if (ready.length > 0) {
          log += "\n\n🎉 自动开启盲盒：";
          for (let b of ready) {
            const r = await post({
              url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
              headers,
              body: "{}"
            });
            log += `\n🎁 ${b.awardDays}天盲盒 → ${r.data?.rewardValue || "未知奖励"}`;
          }
        }
      }
    }

    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", log);

  } catch (e) {
    notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();