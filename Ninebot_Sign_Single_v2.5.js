/*
📱 九号智能电动车 · 单号自动签到（v2.5）
👤 作者：QinyRui（改版 by ChatGPT）
📆 版本：2.5（2025/11/19）
🧰 功能：
  - 自动签到、查询状态、余额、盲盒
  - 自动补签（可关闭）
  - 自动开启 & 自动领取盲盒奖励（可关闭）
  - 自动申请内测资格 & 自动检测状态
  - 自动抓包写入 Authorization / DeviceId / User-Agent
  - 完整日志输出（控制台 + 通知）
  - 自定义通知标题 + 自定义签到时间
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- 自动抓包写入 ----------
if (isReq) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth && read("ninebot.authorization") !== auth) { write(auth, "ninebot.authorization"); changed = true; }
    if (dev && read("ninebot.deviceId") !== dev) { write(dev, "ninebot.deviceId"); changed = true; }
    if (ua && read("ninebot.userAgent") !== ua) { write(ua, "ninebot.userAgent"); changed = true; }

    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入本地存储");
      console.log("[Ninebot] 抓包写入成功:", {auth, dev, ua});
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取存储 ----------
const cfg = {
  Authorization: read("ninebot.authorization") || "",
  DeviceId: read("ninebot.deviceId") || "",
  userAgent: read("ninebot.userAgent") || "",
  debug: true,
  notify: true,
  autoOpenBox: true,
  autoRepair: true,
  autoApplyBeta: true,
  titlePrefix: "九号签到",
  cronTime: "10 8 * * *"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
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
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/apply"
};

// ---------- 辅助函数 ----------
function log(...args){ console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    log("开始签到请求");
    // 1) 签到
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    log("状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      const days = data.consecutiveDays || data.continuousDays || 0;
      const cards = data.signCardsNum || data.remedyCard || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    } else notifyBody += `\n🗓 状态获取失败`;

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    log("余额返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;
    else notifyBody += `\n💰 N币获取失败`;

    // 4) 盲盒
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
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
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
    } else notifyBody += `\n📦 无盲盒任务`;

    // 5) 自动补签
    if (cfg.autoRepair) {
      try {
        if (st && st.code === 0) {
          const cards = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            log("触发自动补签");
            const rep = await httpPost({ url: END.repair, headers, body: "{}" });
            log("补签返回：", rep);
            if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
            else notifyBody += `\n🔧 自动补签失败：${rep && rep.msg ? rep.msg : "未知"}`;
          }
        }
      } catch (e) { log("自动补签异常：", e); }
    }

    // 6) 自动申请内测资格
    if (cfg.autoApplyBeta) {
      try {
        const betaStatus = await httpGet({ url: END.betaStatus, headers });
        log("内测状态：", betaStatus);
        if (betaStatus?.data?.registered) {
          notifyBody += `\n🚀 内测资格：已申请`;
        } else {
          const apply = await httpPost({ url: END.betaApply, headers, body: "{}" });
          log("内测申请返回：", apply);
          if (apply?.code === 0) notifyBody += `\n🚀 内测资格：申请成功`;
          else notifyBody += `\n⚠️ 内测资格：申请失败`;
        }
      } catch (e) { log("内测申请异常：", e); notifyBody += `\n⚠️ 内测资格异常`; }
    }

    // ✅ 最终通知
    notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();