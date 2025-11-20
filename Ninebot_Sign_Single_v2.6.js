/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新日期：2025/11/21/16/30/00
Telegram 群： https://t.me/JiuHaoAPP
适配系统：iOS,iPadOS,macOS
*/

const isReq = typeof $request !== "undefined" && $request.headers;

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_TITLE = "ninebot.titlePrefix";

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

    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
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
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包以写入 Authorization 与 DeviceId");
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

// ---------- 辅助函数 ----------
function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";
  log("开始执行九号签到脚本...");

  try {
    // 1) 查询状态
    const st = await httpGet({ url: END.status, headers });
    log("当前签到状态：", st);

    // 2) 签到
    log("开始签到...");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("签到结果：", sign);
    if (sign && sign.code === 0) notifyBody += `• 签到成功\n+${sign.data?.nCoin || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `• 今日已签到`;
    else notifyBody += `• 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;

    // 3) 查询余额
    const bal = await httpGet({ url: END.balance, headers });
    log("N币余额：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒任务
    log("获取盲盒任务列表...");
    const box = await httpGet({ url: END.blindBoxList, headers });
    log("盲盒任务列表结果：", box);
    const notOpened = box?.data?.notOpenedBoxes || [];
    if (notOpened.length > 0) {
      notifyBody += `\n• 🎁盲盒任务：`;
      for (const b of notOpened) {
        const days = b.awardDays;
        const left = b.leftDaysToOpen ?? "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;

        // 自动开启盲盒
        if (cfg.autoOpenBox && left === 0) {
          try {
            const r = await httpPost({ url: END.blindBoxReceive, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
            log(`${days}天盲盒领取结果：`, r);
            if (r?.code === 0) notifyBody += `\n🎁 ${days}天盲盒获得：${r.data.rewardValue || 0} (${r.data.rewardType === 1 ? "经验" : "N币"})`;
            else notifyBody += `\n❌ ${days}天盲盒领取失败：${r.msg || safeStr(r)}`;
          } catch(e){ log("盲盒领取异常：", e); }
        }
      }
    }

    // 5) 自动补签
    if (cfg.autoRepair) {
      try {
        const cards = st.data?.signCardsNum || 0;
        const days = st.data?.consecutiveDays || 0;
        if (cards > 0 && days === 0) {
          log("触发自动补签");
          const rep = await httpPost({ url: END.repair, headers, body: "{}" });
          log("补签返回：", rep);
          if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
          else notifyBody += `\n🔧 自动补签失败：${rep.msg || safeStr(rep)}`;
        }
      } catch(e){ log("自动补签异常：", e); }
    }

    // 6) 内测申请
    if (cfg.autoApplyBeta) {
      try {
        const beta = await httpGet({url:END.betaStatus, headers});
        log("内测状态：", beta);
        if(beta?.data?.qualified) notifyBody += `\n🚀 已获得内测资格`;
        else {
          const applyResp = await httpPost({
            url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
            headers,
            body: JSON.stringify({deviceId: cfg.DeviceId})
          });
          log("内测自动申请返回：", applyResp);
          if(applyResp?.success) notifyBody += `\n⚠️ 未获得内测资格 → 自动申请成功 🎉`;
          else notifyBody += `\n⚠️ 未获得内测资格 → 自动申请失败 ❌`;
        }
      } catch(e){ log("内测申请异常：", e); }
    }

    log("脚本执行完成.");
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();