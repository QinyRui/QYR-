/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - 支持抓包写入 BoxJS / Loon 插件配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS / 插件 UI keys ----------
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
    if (auth) { write(auth, "ninebot.authorization"); changed = true; }
    if (dev) { write(dev, "ninebot.deviceId"); changed = true; }
    if (ua) { write(ua, "ninebot.userAgent"); changed = true; }

    if (changed) notify("九号签到", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取配置 ----------
const cfg = {
  Authorization: read("ninebot.authorization") || "",
  DeviceId: read("ninebot.deviceId") || "",
  userAgent: read("ninebot.userAgent") || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包写入 Authorization 与 DeviceId");
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
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 请求头 ----------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile Segway",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};

// ---------- 日志函数 ----------
function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    log("开始执行九号签到脚本...");
    
    // 1) 签到
    log("开始签到...");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("签到结果:", sign);

    if (sign?.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign?.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else {
      notifyBody += `❌ 签到失败：${sign?.msg || safeStr(sign)}`;
      if(!cfg.notifyFail) notifyBody = "";
    }

    // 2) 状态
    log("获取签到状态...");
    const st = await httpGet({ url: END.status, headers });
    log("签到状态返回:", st);
    if(st?.code===0){
      const data = st.data || {};
      const days = data.consecutiveDays || 0;
      const cards = data.signCardsNum || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 3) 余额
    log("获取 N币余额...");
    const bal = await httpGet({ url: END.balance, headers });
    log("余额返回:", bal);
    if(bal?.code===0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    log("获取盲盒任务列表...");
    const box = await httpGet({ url: END.blindBoxList, headers });
    log("盲盒任务列表返回:", box);

    const notOpened = box?.data?.notOpenedBoxes || [];
    if(notOpened.length>0){
      notifyBody += `\n\n📦 盲盒任务：`;
      for(const b of notOpened){
        const days = b.awardDays || "?";
        const left = b.leftDaysToOpen ?? "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;

        if(cfg.autoOpenBox && (left===0)){
          try{
            const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
            log(`盲盒领取 ${days}天返回:`, r);
            if(r?.code===0) notifyBody += `\n🎁 ${days}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
            else notifyBody += `\n❌ ${days}天盲盒领取失败：${r?.msg || safeStr(r)}`;
          }catch(e){
            log(`盲盒领取异常 ${days}天:`, e);
            notifyBody += `\n❌ ${days}天盲盒领取异常`;
          }
        }
      }
    }

    // 5) 自动补签
    if(cfg.autoRepair && st?.code===0){
      const cards = st.data?.signCardsNum || 0;
      const days = st.data?.consecutiveDays || 0;
      if(cards>0 && days===0){
        log("触发自动补签...");
        const rep = await httpPost({ url: END.repair, headers, body: "{}" });
        log("补签返回:", rep);
        if(rep?.code===0) notifyBody += `\n🔧 自动补签成功`;
        else notifyBody += `\n🔧 自动补签失败：${rep?.msg || safeStr(rep)}`;
      }
    }

    // 6) 内测资格检测 & 自动申请
    try{
      const beta = await httpGet({url:END.betaStatus, headers});
      log("内测状态返回:", beta);
      if(beta?.data?.qualified) notifyBody+="\n🚀 已获得内测资格";
      else{
        notifyBody+="\n⚠️ 未获得内测资格";
        if(cfg.autoApplyBeta){
          try{
            const applyResp = await httpPost({url:END.betaApply, headers, body: JSON.stringify({deviceId: cfg.DeviceId})});
            log("内测申请返回:", applyResp);
            if(applyResp?.success) notifyBody+=" → 自动申请成功 🎉";
            else notifyBody+=" → 自动申请失败 ❌";
          }catch(e){ log("内测申请异常：", e); notifyBody+=" → 自动申请异常 ❌"; }
        }
      }
    }catch(e){ log("内测检测异常：", e); }

    log("脚本执行完成.");
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch(e){
    log("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();