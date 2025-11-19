/*
📱 九号智能电动车 · 全功能签到（单号版 v2.5）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - 支持 Loon UI 开关控制
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys / UI keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_CAPTURE = "ninebot.autoCapture";
const KEY_MANUAL = "ninebot.manualSign";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_CRON = "ninebot.cronTime";

// ---------- 抓包写入 ----------
if (isReq) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed && (read(KEY_CAPTURE) === "true")) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 UI");
      console.log("[Ninebot] 抓包写入成功:", {auth, dev, ua});
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取配置 ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "true",
  notify: read(KEY_NOTIFY) !== "false",
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  autoCapture: read(KEY_CAPTURE) === "true",
  manualSign: read(KEY_MANUAL) === "true",
  titlePrefix: read(KEY_TITLE) || "九号签到",
  cronTime: read(KEY_CRON) || "10 8 * * *"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未绑定账号", "请先抓包或在插件 UI 填写 Authorization 与 DeviceId");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- Endpoints ----------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
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
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 日志 ----------
function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    log("开始签到请求");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;

    // 状态
    const st = await httpGet({ url: END.status, headers });
    log("状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      notifyBody += `\n🗓 连续签到：${data.consecutiveDays || 0} 天\n🎫 补签卡：${data.signCardsNum || 0} 张`;
    }

    // 余额
    const bal = await httpGet({ url: END.balance, headers });
    log("余额返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 盲盒
    const box = await httpGet({ url: END.blindBoxList, headers });
    log("盲盒返回：", box);
    const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if (cfg.autoOpenBox) {
        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        for (const b of ready) {
          try {
            const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
            log("盲盒领取返回：", r);
            if (r && r.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
            else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
          } catch (e) { log("盲盒领取异常：", e); notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`; }
        }
      }
    }

    // 自动补签
    if (cfg.autoRepair && st?.code === 0) {
      const cards = st.data?.signCardsNum || 0;
      if (cards > 0) {
        try {
          const rep = await httpPost({ url: END.repair, headers, body: "{}" });
          log("补签返回：", rep);
          notifyBody += `\n🔧 自动补签${rep?.code === 0 ? "成功" : "失败"}`;
        } catch (e) { log("自动补签异常：", e); notifyBody += `\n🔧 自动补签异常`; }
      }
    }

    // 内测资格检测 + 自动申请
    try {
      const beta = await httpGet({url:END.betaStatus, headers});
      log("内测状态：", beta);
      if(beta?.data?.qualified) notifyBody+="\n🚀 已获得内测资格";
      else if(cfg.autoApplyBeta) {
        try {
          const applyResp = await httpPost({ url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
          notifyBody+="\n⚠️ 自动申请内测" + (applyResp?.success ? "成功 🎉" : "失败 ❌");
        } catch(e){ log("内测申请异常", e); notifyBody+="\n⚠️ 内测申请异常 ❌"; }
      } else notifyBody+="\n⚠️ 未获得内测资格";
    } catch(e){ log("内测检测异常", e); }

    // 最终通知
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();