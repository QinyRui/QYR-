/*
📱 九号智能电动车 · 单号自动签到 v2.6
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志（带时间戳和分级）+ 通知
  - BoxJS 配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
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

// ---------- 日志函数 ----------
function log(level, ...args){
  const ts = new Date().toLocaleString("zh-CN", { hour12: false });
  const prefix = `[${ts}]`;
  const formatted = args.map(a => typeof a === 'object' ? JSON.stringify(a,null,2) : a);
  switch(level){
    case "info": console.info(prefix, ...formatted); break;
    case "warn": console.warn(prefix, ...formatted); break;
    case "error": console.error(prefix, ...formatted); break;
    default: console.log(prefix, ...formatted);
  }
}
function safeStr(v){ try{ return JSON.stringify(v); }catch{ return String(v); } }

// ---------- 抓包写入 ----------
if(isReq){
  try{
    const h = $request.headers || {};
    const auth = h["Authorization"]||h["authorization"]||"";
    const dev = h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){ write(auth, KEY_AUTH); changed=true; }
    if(dev && read(KEY_DEV)!==dev){ write(dev, KEY_DEV); changed=true; }
    if(ua && read(KEY_UA)!==ua){ write(ua, KEY_UA); changed=true; }
    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info","抓包写入成功:",{auth,dev,ua});
    }else{
      log("info","抓包数据无变化，无需写入。");
    }
  }catch(e){
    log("error","抓包写入异常：",e);
  }
  $done({});
}

// ---------- 读取配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到"
};
log("info","当前配置:",cfg);

if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请在插件 UI 填写 Authorization / DeviceId / User-Agent");
  log("warn","配置缺失，脚本终止。");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({url,headers,body="{}"}){ return new Promise((res,rej)=>{$httpClient.post({url,headers,body},(e,r,d)=>{if(e) rej(e); else {try{res(JSON.parse(d||"{}"))}catch{res({raw:d})}}});}); }
function httpGet({url,headers}){ return new Promise((res,rej)=>{$httpClient.get({url,headers},(e,r,d)=>{if(e) rej(e); else {try{res(JSON.parse(d||"{}"))}catch{res({raw:d})}}});}); }

// ---------- Endpoints ----------
const headers={
  "Authorization": cfg.Authorization,
  "Content-Type":"application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform":"h5",
  "Origin":"https://h5-bj.ninebot.com",
  "language":"zh"
};
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  betaStatus:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 主流程 ----------
!(async()=>{
  let notifyBody="";
  try{
    log("info","========== 开始签到流程 ==========");

    // 1) 签到
    log("info","发送签到请求...");
    const sign = await httpPost({url:END.sign,headers,body:JSON.stringify({deviceId:cfg.DeviceId})});
    log("info","签到返回：",sign);
    if(sign && sign.code===0){ notifyBody+=`🎉 签到成功\n🎁 +${sign.data?.nCoin||sign.data?.score||0} N币`; }
    else if(sign && sign.code===540004){ notifyBody+=`⚠️ 今日已签到`; }
    else{ notifyBody+=`❌ 签到失败：${(sign && (sign.msg||safeStr(sign)))||"未知"}`; if(!cfg.notifyFail) notifyBody=""; }

    // 2) 状态
    log("info","查询签到状态...");
    const st = await httpGet({url:END.status,headers});
    log("info","状态返回：",st);
    if(st && st.code===0){
      const days = st.data?.consecutiveDays||st.data?.continuousDays||0;
      const cards = st.data?.signCardsNum||st.data?.remedyCard||0;
      notifyBody+=`\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 3) 余额
    log("info","查询N币余额...");
    const bal = await httpGet({url:END.balance,headers});
    log("info","余额返回：",bal);
    if(bal && bal.code===0) notifyBody+=`\n💰 N币余额：${bal.data?.balance||0}`;

    // 4) 盲盒
    log("info","查询盲盒列表...");
    const box = await httpGet({url:END.blindBoxList,headers});
    log("info","盲盒返回：",box);
    const notOpened = box?.data?.notOpenedBoxes||box?.data||[];
    if(Array.isArray(notOpened) && notOpened.length>0){
      notifyBody+=`\n\n📦 盲盒任务：`;
      notOpened.forEach(b=>{
        const days=b.awardDays||b.boxDays||b.days||"?";
        const left=b.leftDaysToOpen||b.diffDays||"?";
        notifyBody+=`\n- ${days}天盲盒，还需 ${left} 天`;
      });
      if(cfg.autoOpenBox){
        const ready = notOpened.filter(b=>(b.leftDaysToOpen===0||b.diffDays===0)&&(b.rewardStatus===2||b.status===2));
        if(ready.length>0){
          notifyBody+=`\n\n🎉 自动开启盲盒：`;
          for(const b of ready){
            try{
              const r = await httpPost({url:END.blindBoxReceive,headers,body:"{}"});
              log("info","盲盒领取返回：",r);
              if(r && r.code===0) notifyBody+=`\n🎁 ${b.awardDays||b.boxDays}天盲盒获得：${r.data?.rewardValue||r.data?.score||"未知"}`;
              else notifyBody+=`\n❌ ${b.awardDays||b.boxDays}天盲盒领取失败`;
            }catch(e){ log("error","盲盒领取异常：",e); notifyBody+=`\n❌ ${b.awardDays}天盲盒领取异常`; }
          }
        }
      }
    }

    // 5) 自动补签
    if(cfg.autoRepair){
      try{
        if(st && st.code===0){
          const cards = st.data?.signCardsNum||st.data?.remedyCard||0;
          const days = st.data?.consecutiveDays||st.data?.continuousDays||0;
          if(cards>0 && days===0){
            log("info","触发自动补签");
            const rep = await httpPost({url:END.repair,headers,body:"{}"});
            log("info","补签返回：",rep);
            if(rep && rep.code===0) notifyBody+=`\n🔧 自动补签成功`;
            else notifyBody+=`\n🔧 自动补签失败：${rep && rep.msg?rep.msg:"未知"}`;
          }
        }
      }catch(e){ log("error","自动补签异常：",e); }
    }

    // 6) 内测检测 & 自动申请
    try{
      log("info","检测内测资格...");
      const beta = await httpGet({url:END.betaStatus,headers});
      log("info","内测状态：",beta);
      if(beta?.data?.qualified){ notifyBody+="\n🚀 已获得内测资格"; }
      else{
        notifyBody+="\n⚠️ 未获得内测资格";
        if(cfg.autoApplyBeta){
          try{
            const applyResp = await httpPost({url:END.betaApply,headers,body:JSON.stringify({deviceId:cfg.DeviceId})});
            log("info","内测申请返回：",applyResp);
            if(applyResp?.success){ notifyBody+=" → 自动申请成功 🎉"; }
            else{ notifyBody+=" → 自动申请失败 ❌"; }
          }catch(e){ log("error","内测自动申请异常：",e); notifyBody+=" → 自动申请异常 ❌"; }
        }
      }
    }catch(e){ log("error","内测检测异常：",e); }

    // ✅ 发送通知
    log("info","========== 签到流程结束 ==========");
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  }catch(e){
    log("error","主流程异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }
  $done();
})();