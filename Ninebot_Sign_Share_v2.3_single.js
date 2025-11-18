/*
📱 九号智能电动车 · 全功能签到（单号版）
👤 作者：QinyRui（改版 by ChatGPT）
📆 版本：2.3（含完整 BoxJS 开关）
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// ---------- BoxJS keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_TITLE = "ninebot.titlePrefix";

// ---------- Storage ----------
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (t, s, b) => { if (cfg.notify && typeof $notification !== "undefined") $notification.post(t, s, b); };
const log = (...x) => cfg.debug && console.log("[Ninebot]", ...x);

// ---------- 抓包逻辑（万能触发版） ----------
if (isReq) {
  try {
    const h = $request.headers || {};

    const auth = h["Authorization"] || h["authorization"];
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"];
    const ua = h["User-Agent"] || h["user-agent"];

    let changed = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed) {
      notify("九号抓包成功 ✓", "", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("抓包写入成功：", { auth, dev, ua });
    }
  } catch (e) {
    log("抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取 BoxJS 配置 ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) !== "false",   // 默认开启
  notify: read(KEY_NOTIFY) !== "false", // 默认开启
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  titlePrefix: read(KEY_TITLE) || "九号智能电动车"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先打开九号 App 任意页面完成抓包写入");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) return resolve({ err });
      try { resolve(JSON.parse(data || "{}")); }
      catch { resolve({ raw: data }); }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((resolve) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) return resolve({ err });
      try { resolve(JSON.parse(data || "{}")); }
      catch { resolve({ raw: data }); }
    });
  });
}

// ---------- API ----------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent,
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
};

// ---------- 主流程 ----------
!(async () => {
  let msg = "";

  // 签到
  const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
  log("签到返回：", sign);
  if (sign?.code === 0)
    msg += `🎉 签到成功 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
  else if (sign?.code === 540004)
    msg += `⚠️ 今日已签到`;
  else
    msg += `❌ 签到失败：${sign?.msg || JSON.stringify(sign)}`;

  // 状态
  const st = await httpGet({ url: END.status, headers });
  log("状态返回：", st);
  const days = st?.data?.consecutiveDays || st?.data?.continuousDays || 0;
  const cards = st?.data?.signCardsNum || st?.data?.remedyCard || 0;
  msg += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;

  // 余额
  const bal = await httpGet({ url: END.balance, headers });
  msg += `\n💰 N币余额：${bal?.data?.balance || 0}`;

  // 盲盒
  const box = await httpGet({ url: END.blindBoxList, headers });
  const list = box?.data?.notOpenedBoxes || box?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    msg += `\n\n📦 盲盒任务：`;
    list.forEach(b => {
      msg += `\n- ${b.awardDays || b.boxDays} 天盲盒，还需 ${b.leftDaysToOpen || b.diffDays} 天`;
    });

    // 自动领取
    if (cfg.autoOpenBox) {
      for (const b of list.filter(x => (x.leftDaysToOpen === 0 || x.diffDays === 0))) {
        const r = await httpPost({ url: END.blindBoxReceive, headers });
        if (r?.code === 0)
          msg += `\n🎁 自动开启：${r.data?.rewardValue || r.data?.score}`;
      }
    }
  }

  // 自动补签
  if (cfg.autoRepair && cards > 0 && days === 0) {
    const rep = await httpPost({ url: END.repair, headers });
    msg += rep?.code === 0 ? `\n🔧 自动补签成功` : `\n🔧 自动补签失败`;
  }

  notify(cfg.titlePrefix, "签到结果", msg);
  $done();
})();