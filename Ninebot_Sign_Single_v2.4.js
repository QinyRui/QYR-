/*
📱 九号智能电动车 · 全功能签到（单号版 v2.4）
👤 作者：QinyRui（改版 by ChatGPT）
🧰 功能：
  - 自动签到 + 补签 + 盲盒
  - 内测资格检测（未申请 → 通知提醒）
  - 控制台 + 通知日志
  - BoxJS 配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k) => { if(typeof $persistentStore !=="undefined") return $persistentStore.write(v,k); };
const notify = (title, sub, body) => { if(typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_AUTOAPPLY="ninebot.autoApplyBeta";
const KEY_FAILNOTICE="ninebot.notifyFail";

// ---------- 抓包写入 ----------
if(isReq){
  try{
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";

    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){write(auth,KEY_AUTH);changed=true;}
    if(dev && read(KEY_DEV)!==dev){write(dev,KEY_DEV);changed=true;}
    if(ua && read(KEY_UA)!==ua){write(ua,KEY_UA);changed=true;}

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent 已写入 BoxJS");
      console.log("[Ninebot] 抓包写入成功:", {auth, dev, ua});
    }
  }catch(e){console.log("[Ninebot] 抓包写入异常：", e);}
  $done({});
}

// ---------- 读取配置 ----------
const cfg={
  Authorization:read(KEY_AUTH)||"",
  DeviceId:read(KEY_DEV)||"",
  userAgent:read(KEY_UA)||"",
  debug:read(KEY_DEBUG)==="true"?true:true,
  notify:read(KEY_NOTIFY)!=="false",
  autoOpenBox:read(KEY_AUTOBOX)==="true",
  autoRepair:read(KEY_AUTOREPAIR)==="true",
  autoApplyBeta:read(KEY_AUTOAPPLY)==="true",
  notifyFail:read(KEY_FAILNOTICE)!=="false",
  titlePrefix:read(KEY_TITLE)||"九号签到"
};

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization 与 DeviceId");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({url,headers,body="{}"}){
  return new Promise((resolve,reject)=>{
    if(typeof $httpClient!=="undefined"){
      $httpClient.post({url,headers,body},(err,resp,data)=>{
        if(err) reject(err);
        else { try{resolve(JSON.parse(data||"{}"));}catch{resolve({raw:data});} }
      });
    }else if(typeof $task!=="undefined"){
      $task.fetch({url,method:"POST",headers,body:body}).then(r=>{
        resolve(r.data ? JSON.parse(r.data) : {raw:r.data});
      }).catch(e=>reject(e));
    }else reject("No HTTPClient");
  });
}
function httpGet({url,headers}){
  return new Promise((resolve,reject)=>{
    if(typeof $httpClient!=="undefined"){
      $httpClient.get({url,headers},(err,resp,data)=>{
        if(err) reject(err);
        else { try{resolve(JSON.parse(data||"{}"));}catch{resolve({raw:data});} }
      });
    }else if(typeof $task!=="undefined"){
      $task.fetch({url,method:"GET",headers}).then(r=>{
        resolve(r.data ? JSON.parse(r.data) : {raw:r.data});
      }).catch(e=>reject(e));
    }else reject("No HTTPClient");
  });
}

// ---------- Endpoints ----------
const headers={
  "Authorization":cfg.Authorization,
  "Content-Type":"application/json",
  "device_id":cfg.DeviceId,
  "User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
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
  betaStatus:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 辅助 ----------
function log(...args){
    if(cfg.debug){
        const msgs = args.map(v => typeof v === "object" ? JSON.stringify(v,null,2) : v);
        console.log("[Ninebot]", ...msgs);
    }
}
function safeStr(v){try{return JSON.stringify(v);}catch{return String(v);}}

// ---------- 主流程 ----------
!(async()=>{
  let notifyBody="";

  try{
    log("开始签到流程...");

    // 1) 签到
    const sign = await httpPost({url:END.sign,headers,body:JSON.stringify({deviceId:cfg.DeviceId})});
    log("签到返回：", sign);
    if(sign?.code===0) notifyBody+=`🎉 签到成功 +${sign.data?.nCoin||0} N币`;
    else notifyBody+=`❌ 签到失败：${sign.msg||safeStr(sign)}`;

    // 2) 状态
    const st = await httpGet({url:END.status,headers});
    log("状态返回：", st);
    if(st?.code===0){
      const data=st.data||{};
      notifyBody+=`\n🗓 连续签到：${data.consecutiveDays||0} 天\n🎫 补签卡：${data.signCardsNum||0} 张`;
    }

    // 3) 余额
    const bal = await httpGet({url:END.balance,headers});
    log("余额返回：", bal);
    if(bal?.code===0) notifyBody+=`\n💰 N币余额：${bal.data?.balance||0}`;

    // 4) 盲盒
    const box = await httpGet({url:END.blindBoxList,headers});
    log("盲盒返回：", box);
    const notOpened = box?.data?.notOpenedBoxes||[];
    if(notOpened.length>0){
      notifyBody+="\n📦 盲盒任务：";
      for(const b of notOpened){
        const days=b.awardDays||b.boxDays||"?";
        const left=b.leftDaysToOpen||b.diffDays||"?";
        notifyBody+=`\n- ${days}天盲盒，还需 ${left} 天`;
      }
      if(cfg.autoOpenBox){
        const ready=notOpened.filter(b=>(b.leftDaysToOpen===0||b.diffDays===0)&&(b.rewardStatus===2||b.status===2));
        if(ready.length>0){
          notifyBody+="\n🎉 自动开启盲盒：";
          for(const b of ready){
            try{
              const r = await httpPost({url:END.blindBoxReceive,headers,body:"{}"});
              log("盲盒领取返回：", r);
              if(r?.code===0) notifyBody+=`\n🎁 ${b.awardDays||b.boxDays}天盲盒获得：${r.data?.rewardValue||r.data?.score||"未知"}`;
              else notifyBody+=`\n❌ ${b.awardDays||b.boxDays}天盲盒领取失败`;
            }catch(e){log("盲盒领取异常：", e);}
          }
        }
      }
    }

    // 5) 自动补签
    if(cfg.autoRepair){
      try{
        const cards=st?.data?.signCardsNum||0;
        const days=st?.data?.consecutiveDays||0;
        if(cards>0 && days===0){
          log("触发自动补签");
          const rep = await httpPost({url:END.repair,headers,body:"{}"});
          log("补签返回：", rep);
          if(rep?.code===0) notifyBody+="\n🔧 自动补签成功";
        }
      }catch(e){log("自动补签异常：", e);}
    }

    // 6) 内测资格检测
    try{
      const beta = await httpGet({url:END.betaStatus,headers});
      log("内测状态：", beta);
      if(beta?.data?.qualified){
        notifyBody+="\n🚀 已获得内测资格";
      }else{
        notifyBody+="\n⚠️ 未获得内测资格，请手动申请";
        // 预留自动申请接口
        // if(cfg.autoApplyBeta){ await applyBeta(); }
      }
    }catch(e){log("内测检测异常：", e);}

    // ✅ 发送通知（失败通知可开关）
    if(cfg.notify && (cfg.notifyFail || sign?.code===0)) notify(cfg.titlePrefix,"签到结果",notifyBody);

  }catch(e){log("主流程异常：", e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));}

  $done();
})();