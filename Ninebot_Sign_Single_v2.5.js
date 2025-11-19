/*
📱 九号智能电动车 · 单号签到脚本
👤 作者：QinyRui（改版 by ChatGPT）
📆 版本：2.5（2025/11/19）
🧰 功能：
  - 自动签到、查询状态、余额、盲盒
  - 自动补签（可关闭）
  - 自动开启 & 自动领取盲盒奖励（可关闭）
  - 内测资格自动申请（可关闭）
  - 完整日志输出（控制台 + 通知）
  - 自动抓包写入 Authorization / DeviceId / User-Agent
*/

// ---------- 判断抓包 ----------
const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS 不再依赖 ----------
// ---------- 配置 ----------
const cfg = {
  Authorization: read("ninebot.authorization") || "",
  DeviceId: read("ninebot.deviceId") || "",
  userAgent: read("ninebot.userAgent") || "",
  debug: read("ninebot.debug") !== "false",  // 默认 true
  notify: read("ninebot.notify") !== "false",
  autoOpenBox: read("ninebot.autoOpenBox") !== "false",
  autoRepair: read("ninebot.autoRepair") !== "false",
  autoBeta: read("ninebot.autoBeta") === "true",
  titlePrefix: read("ninebot.titlePrefix") || "九号智能电动车"
};

// ---------- 抓包写入 ----------
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
      notify(cfg.titlePrefix, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入");
      console.log("[Ninebot] 抓包写入成功:", {auth, dev, ua});
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// ---------- 检查必填 ----------
if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先抓包写入 Authorization 与 DeviceId");
  $done();
}

// ---------- HTTP Helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- API Endpoints ----------
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
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    // 1) 签到
    console.log("[Ninebot] 开始签到请求");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    console.log("[Ninebot] 签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${(sign && (sign.msg || JSON.stringify(sign))) || "未知"}`;

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    console.log("[Ninebot] 状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      notifyBody += `\n🗓 连续签到：${data.consecutiveDays || 0} 天\n🎫 补签卡：${data.signCardsNum || 0} 张`;
    } else notifyBody += `\n🗓 状态获取失败`;

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    console.log("[Ninebot] 余额返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;
    else notifyBody += `\n💰 N币获取失败`;

    // 4) 盲盒
    const box = await httpGet({ url: END.blindBoxList, headers });
    console.log("[Ninebot] 盲盒返回：", box);
    const notOpened = box?.data?.notOpenedBoxes || [];
    if (notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const days = b.awardDays || b.boxDays || "?";
        const left = b.leftDaysToOpen || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if (cfg.autoOpenBox) {
        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            try {
              const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
              console.log("[Ninebot] 盲盒领取返回：", r);
              if (r && r.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
              else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
            } catch (e) { console.log("[Ninebot] 盲盒领取异常：", e); notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`; }
          }
        }
      }
    } else notifyBody += `\n📦 无盲盒任务`;

    // 5) 自动补签
    if (cfg.autoRepair && st && st.code === 0) {
      const cards = st.data?.signCardsNum || 0;
      const days = st.data?.consecutiveDays || 0;
      if (cards > 0 && days === 0) {
        console.log("[Ninebot] 触发自动补签");
        const rep = await httpPost({ url: END.repair, headers, body: "{}" });
        console.log("[Ninebot] 补签返回：", rep);
        if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
        else notifyBody += `\n🔧 自动补签失败：${rep?.msg || "未知"}`;
      }
    }

    // 6) 内测资格自动申请
    if (cfg.autoBeta) {
      try {
        const beta = await httpGet({ url: END.betaStatus, headers });
        console.log("[Ninebot] 内测状态：", beta);
        if (beta?.data?.registered) notifyBody += `\n🚀 已获得内测资格`;
        else {
          const apply = await httpPost({ url: END.betaApply, headers, body: "{}" });
          console.log("[Ninebot] 内测申请返回：", apply);
          if (apply?.data?.success) notifyBody += `\n🚀 内测申请成功`;
          else notifyBody += `\n❌ 内测申请失败`;
        }
      } catch (e) { console.log("[Ninebot] 内测申请异常：", e); notifyBody += `\n❌ 内测申请异常`; }
    }

    // ✅ 通知
    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);
    console.log("[Ninebot] 签到流程完成");
  } catch (e) {
    console.log("[Ninebot] 主流程异常：", e);
    notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();