/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新：2025/11/20
🆕 更新内容（v2.6）
  - 内测资格检测全面修复（官方接口变更）
  - 新增状态 0/1/2 精准判断
  - 自动申请改用正确接口 /registration/apply
  - 通知内容优化
  - 保持你原来所有功能逻辑不变
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
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
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
  notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
  titlePrefix: read(KEY_TITLE) || "九号签到"
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
  "device-id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform": "iOS",
  "language": "zh"
};

const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",

  // ✔ 修复后的内测接口
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply:  "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/apply"
};

// ---------- 辅助函数 ----------
function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {

  let notifyBody = "";

  try {
    // 1) 签到
    log("开始签到请求");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else {
      notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;
      if(!cfg.notifyFail) notifyBody = "";
    }

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    log("状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      notifyBody += `\n🗓 连续签到：${data.consecutiveDays || data.continuousDays || 0} 天`;
      notifyBody += `\n🎫 补签卡：${data.signCardsNum || data.remedyCard || 0} 张`;
    }

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    const boxes = await httpGet({ url: END.blindBoxList, headers });
    log("盲盒返回：", boxes);

    const list = boxes?.data?.notOpenedBoxes || boxes?.data || [];
    if (Array.isArray(list) && list.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      list.forEach(b => {
        notifyBody += `\n- ${b.awardDays || b.boxDays} 天盲盒，还需 ${b.leftDaysToOpen ?? b.diffDays ?? "?"} 天`;
      });
    }

    // 自动开启盲盒
    if (cfg.autoOpenBox && list.length > 0) {
      const ready = list.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
      for (const b of ready) {
        const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
        if (r && r.code === 0) notifyBody += `\n🎁 自动开启 ${b.awardDays} 天盲盒：${r.data?.rewardValue || r.data?.score}`;
      }
    }

    // 5) 自动补签
    try {
      if (cfg.autoRepair && st?.data) {
        const cards = st.data.signCardsNum || st.data.remedyCard || 0;
        const days  = st.data.consecutiveDays || st.data.continuousDays || 0;

        if (cards > 0 && days === 0) {
          const rep = await httpPost({ url: END.repair, headers, body: "{}" });
          if (rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
          else notifyBody += `\n🔧 自动补签失败：${rep.msg || "未知"}`;
        }
      }
    }catch(e){ log("补签异常：", e); }

    // 6) 内测资格检测 & 自动申请（✔ v2.6 完整修复）
    try {
      const beta = await httpGet({ url: END.betaStatus, headers });
      log("内测状态：", beta);

      const st = beta?.data?.status ?? -1;

      if (st === 2) {
        notifyBody += `\n🚀 已获得内测资格`;
      }
      else if (st === 1) {
        notifyBody += `\n⏳ 内测申请已提交（审核中）`;
      }
      else if (st === 0) {
        notifyBody += `\n⚠️ 未申请内测`;

        if (cfg.autoApplyBeta) {
          notifyBody += ` → 自动申请中`;

          const apply = await httpPost({
            url: END.betaApply,
            headers,
            body: JSON.stringify({ deviceId: cfg.DeviceId })
          });

          log("内测自动申请：", apply);

          if (apply?.code === 0 || apply?.success) {
            notifyBody += ` → 成功 🎉`;
          } else {
            notifyBody += ` → 失败 ❌ (${apply?.msg || apply?.message || "未知"})`;
          }
        }
      }
      else {
        notifyBody += `\n❓ 内测状态未知：${safeStr(beta)}`;
      }
    } catch(e){
      log("内测检测异常：", e);
      notifyBody += `\n⚠️ 内测检测异常`;
    }

    // 通知
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();