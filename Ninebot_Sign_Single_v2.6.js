/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

function log(...args){
  const now = new Date().toLocaleString();
  console.log(`[${now}]`, ...args);
}
function info(...args){ log("INFO:", ...args); }
function warn(...args){ log("WARN:", ...args); }
function error(...args){ log("ERROR:", ...args); }
function safeStr(v){ try { return JSON.stringify(v,null,2); } catch { return String(v); } }

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
    log("进入抓包写入流程…");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    if (!auth || !dev || !ua) {
      warn("抓包失败：字段不完整");
    } else {
      let changed = false;
      if (read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
      if (read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
      if (read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }
      if (changed) notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      info("抓包写入成功:", {auth, dev, ua});
    }
  } catch(e) {
    error("抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取配置 ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) !== "false",
  notify: read(KEY_NOTIFY) !== "false",
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  notifyFail: read(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  warn("未读取到账号信息");
  notify(cfg.titlePrefix, "未配置 Token", "请在插件 UI 填写 Authorization / DeviceId / User-Agent");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body={} }) {
  return new Promise((resolve,reject)=>{
    $httpClient.post({url,headers,body:typeof body==="object"?JSON.stringify(body):body},(err,resp,data)=>{
      if(err){ reject(err); } else {
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((resolve,reject)=>{
    $httpClient.get({url,headers},(err,resp,data)=>{
      if(err){ reject(err); } else {
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
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
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 主流程 ----------
!(async ()=>{
  const now = new Date().toLocaleString();
  info("======== 九号自动签到开始 ========", now);

  let notifyBody = "";

  try{
    // 1) 签到
    info("开始签到请求");
    const sign = await httpPost({url:END.sign, headers, body:{deviceId:cfg.DeviceId}});
    info("签到返回：", safeStr(sign));
    if(sign?.code===0) notifyBody+=`🎉 签到成功\n🎁 +${sign.data?.nCoin||sign.data?.score||0} N币`;
    else if(sign?.code===540004) notifyBody+=`⚠️ 今日已签到`;
    else {
      notifyBody+=`❌ 签到失败：${sign?.msg||safeStr(sign)}`;
      if(!cfg.notifyFail) notifyBody="";
    }

    // 2) 状态
    const st = await httpGet({url:END.status, headers});
    info("状态返回：", safeStr(st));
    if(st?.code===0){
      const data = st.data || {};
      const days = data.consecutiveDays || 0;
      const cards = data.signCardsNum || 0;
      notifyBody+=`\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 3) 余额
    const bal = await httpGet({url:END.balance, headers});
    info("余额返回：", safeStr(bal));
    if(bal?.code===0) notifyBody+=`\n💰 N币余额：${bal.data?.balance||0}`;

    // 4) 盲盒
    const box = await httpGet({url:END.blindBoxList, headers});
    info("盲盒返回：", safeStr(box));
    const notOpened = box?.data?.notOpenedBoxes || [];
    if(Array.isArray(notOpened) && notOpened.length>0){
      notifyBody+=`\n\n📦 盲盒任务：`;
      notOpened.forEach(b=>{
        const days = b.awardDays||"?";
        const left = b.leftDaysToOpen??"?";
        notifyBody+=`\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if(cfg.autoOpenBox){
        const ready = notOpened.filter(b=>(b.leftDaysToOpen===0) && (b.rewardStatus===2));
        if(ready.length>0){
          notifyBody+=`\n\n🎉 自动开启盲盒：`;
          for(const b of ready){
            try{
              const r = await httpPost({url:END.blindBoxReceive, headers, body:{awardDays:b.awardDays}});
              info("盲盒领取返回：", safeStr(r));
              if(r?.code===0) notifyBody+=`\n🎁 ${b.awardDays}天盲盒获得：${r.data?.rewardValue||r.data?.score||"未知"}`;
              else notifyBody+=`\n❌ ${b.awardDays}天盲盒领取失败`;
            }catch(e){error("盲盒领取异常：", e); notifyBody+=`\n❌ ${b.awardDays}天盲盒领取异常`;}
          }
        }
      }
    }

    // 5) 自动补签
    if(cfg.autoRepair && st?.code===0){
      const cards = st.data?.signCardsNum||0;
      const days = st.data?.consecutiveDays||0;
      if(cards>0 && days===0){
        info("触发自动补签");
        const rep = await httpPost({url:END.repair, headers, body:{}});
        info("补签返回：", safeStr(rep));
        if(rep?.code===0) notifyBody+=`\n🔧 自动补签成功`;
        else notifyBody+=`\n🔧 自动补签失败：${rep?.msg||"未知"}`;
      }
    }

    // 6) 内测资格检测 & 自动申请
    try{
      const beta = await httpGet({url:END.betaStatus, headers});
      info("内测状态：", safeStr(beta));
      if(beta?.data?.qualified) notifyBody+="\n🚀 已获得内测资格";
      else{
        notifyBody+="\n⚠️ 未获得内测资格";
        if(cfg.autoApplyBeta){
          try{
            const applyResp = await httpPost({url:END.betaApply, headers, body:{deviceId:cfg.DeviceId}});
            info("内测申请返回：", safeStr(applyResp));
            if(applyResp?.success) notifyBody+=" → 自动申请成功 🎉";
            else notifyBody+=" → 自动申请失败 ❌";
          }catch(e){error("内测自动申请异常：", e); notifyBody+=" → 自动申请异常 ❌";}
        }
      }
    }catch(e){error("内测检测异常：", e);}

    // ✅ 最终通知
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  }catch(e){
    error("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  info("======== 九号自动签到结束 ========");
  $done();
})();