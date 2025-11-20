const isReq = typeof $request !== "undefined" && $request.headers;

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k)=>{if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k);}
const notify = (title, sub, body)=>{if(typeof $notification!=="undefined") $notification.post(title, sub, body);}

// BoxJS 配置
const cfg = {
  debug: read("ninebot.debug")!=="false",
  notify: read("ninebot.notify")!=="false",
  autoOpenBox: read("ninebot.autoOpenBox")==="true",
  autoRepair: read("ninebot.autoRepair")==="true",
  autoApplyBeta: read("ninebot.autoApplyBeta")==="true",
  titlePrefix: read("ninebot.titlePrefix")||"九号签到"
};

function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";

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
      console.log("[Ninebot] 抓包写入成功:",{auth,dev,ua});
    }
  }catch(e){log("抓包写入异常:",e);}
  $done({});
}

// 获取 Header
const headers={
  "Authorization": read(KEY_AUTH)||"",
  "device_id": read(KEY_DEV)||"",
  "User-Agent": read(KEY_UA)||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "Content-Type":"application/json",
  "platform":"h5",
  "Origin":"https://h5-bj.ninebot.com",
  "language":"zh"
};

// HTTP Helper
function httpPost({url,headers,body="{}"}){
  return new Promise((resolve,reject)=>{
    $httpClient.post({url,headers,body},(err,resp,data)=>{
      if(err) reject(err);
      else{ try{resolve(JSON.parse(data||"{}"))}catch{resolve({raw:data});} }
    });
  });
}
function httpGet({url,headers}){
  return new Promise((resolve,reject)=>{
    $httpClient.get({url,headers},(err,resp,data)=>{
      if(err) reject(err);
      else{ try{resolve(JSON.parse(data||"{}"))}catch{resolve({raw:data});} }
    });
  });
}

// Endpoints
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

// 主流程
!(async()=>{
  let notifyBody="";

  try{
    log("开始执行九号签到脚本...");

    // 1. 状态
    const st = await httpGet({url:END.status, headers});
    const days = st?.data?.consecutiveDays||0;
    log(`当前连续签到天数: ${days}`);

    // 2. 签到
    log("开始签到...");
    const sign = await httpPost({url:END.sign, headers, body:JSON.stringify({deviceId:read(KEY_DEV)})});
    log("签到结果:",sign?.msg||safeStr(sign));
    if(sign?.code===0) notifyBody+=`🎉 签到成功 +${sign.data?.nCoin||0} N币`;
    else if(sign?.code===540004) notifyBody+="⚠️ 今日已签到";
    else notifyBody+=`❌ 签到失败: ${sign?.msg||safeStr(sign)}`;

    // 3. 余额
    const bal = await httpGet({url:END.balance, headers});
    log("获取余额结果:", bal?.data?.balance||0);

    // 4. 盲盒
    log("获取盲盒任务列表...");
    const box = await httpGet({url:END.blindBoxList, headers});
    log("盲盒任务列表结果:", box?.data?.notOpenedBoxes||"无");

    // 5. 自动补签
    if(cfg.autoRepair && st?.data?.signCardsNum>0){
      log("触发自动补签...");
      const rep = await httpPost({url:END.repair, headers, body:"{}"});
      log("补签结果:", rep);
    }

    // 6. 内测
    try{
      const beta = await httpGet({url:END.betaStatus, headers});
      if(beta?.data?.qualified) notifyBody+="\n🚀 已获得内测资格";
      else if(cfg.autoApplyBeta){
        const applyResp = await httpPost({url:END.betaApply, headers, body:JSON.stringify({deviceId:read(KEY_DEV)})});
        log("内测申请返回:", applyResp);
        if(applyResp?.success) notifyBody+=" → 自动申请成功 🎉";
        else notifyBody+=" → 自动申请失败 ❌";
      }
    }catch(e){log("内测异常:", e);}

    log("脚本执行完成.");
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  }catch(e){
    log("脚本异常:", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",safeStr(e));
  }

  $done();
})();