/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · 终极完整版）
 2025-12-01 16:00 更新
 功能：抓包写入、自动签到、自动分享（加密体适配）、自动领分享奖励、盲盒开箱、经验/N币查询、通知美化
 适配工具：Surge/Quantumult X/Loon（支持Base64自动解码）
 核心优化：解决invalid appid、加密请求体适配、自动领取奖励、优化奖励统计
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE="ninebot.lastCaptureAt";
const KEY_LAST_SHARE="ninebot.lastShareDate"; // 记录上次分享日期，避免重复

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward" // 推测领取接口（后续可替换真实接口）
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;

/* Debug */
function getDebugFlag(){ const v=readPS(KEY_DEBUG); if(v===null||v===undefined) return true; return (v!=="false"); }

/* Logging */
function logInfo(...args){ if(!getDebugFlag()) return; console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* Capture handling */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest=IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";
    logInfo("抓包 URL：", capUrl);

    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",base); }
    }
    if(changed){ writePS(String(Date.now()),KEY_LAST_CAPTURE); notify("九号智能电动车","抓包成功 ✓","数据已写入 BoxJS（含分享接口）"); logInfo("抓包写入成功"); }
    else logInfo("抓包数据无变化");
  }catch(e){ logErr("抓包异常：",e); }
  $done({});
}

/* Read config */
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0", // 默认抓包UA
  shareTaskUrl: readPS(KEY_SHARE)||"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004", // 固定抓包接口URL
  debug: getDebugFlag(),
  notify: (readPS(KEY_NOTIFY)===null||readPS(KEY_NOTIFY)===undefined)?true:(readPS(KEY_NOTIFY)!=="false"),
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: (readPS(KEY_NOTIFYFAIL)===null||readPS(KEY_NOTIFYFAIL)===undefined)?true:(readPS(KEY_NOTIFYFAIL)!=="false"),
  titlePrefix: readPS(KEY_TITLE)||"九号签到助手",
};

logInfo("九号自动签到+分享任务开始");
logInfo("当前配置：", { notify:cfg.notify, autoOpenBox:cfg.autoOpenBox, shareUrlExist:!!cfg.shareTaskUrl });

if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包执行签到/分享动作以写入 Authorization / DeviceId");
  logWarn("终止：未读取到账号信息");
  $done();
}

/* Compose headers（100% 匹配抓包） */
function makeHeaders(){
  return {
    "Authorization":cfg.Authorization,
    "Content-Type":"application/octet-stream;tt-data=a",
    "device_id":cfg.DeviceId,
    "User-Agent":"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    "platform":"h5",
    "Origin":"https://h5-bj.ninebot.com",
    "language":"zh",
    "aid":"10000004",
    "Cookie":"install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
    "accept-encoding":"gzip, deflate, br",
    "priority":"u=3",
    "accept-language":"zh-CN,zh-Hans;q=0.9",
    "accept":"application/json"
  };
}

/* HTTP retry（支持Base64自动解码） */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT,isBase64=false}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST"){
        opts.body=body;
        if(isBase64) opts["body-base64"]=true; // 标记Base64编码，自动解码
      }
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err&&(err.error||err.message||err));
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){ 
            console.warn(`[${nowStr()}] warn 请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`); 
            setTimeout(once,RETRY_DELAY); 
            return; 
          }
          else{ reject(err); return; }
        }
        if(resp && resp.status && resp.status>=500 && attempts<MAX_RETRY){ 
          console.warn(`[${nowStr()}] warn 服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`); 
          setTimeout(once,RETRY_DELAY); 
          return; 
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={},isBase64=false){ return requestWithRetry({method:"POST",url,headers,body,isBase64}); }

/* 解析时间兼容 */
function toDateKeyAny(ts){
  if(!ts) return null;
  if(typeof ts==="number"){
    if(ts>1e12) ts=Math.floor(ts/1000);
    const d=new Date(ts*1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  if(typeof ts==="string"){
    if(/^\d+$/.test(ts)){
      let n=Number(ts);
      if(n>1e12) n=Math.floor(n/1000);
      const d=new Date(n*1000);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    } else{
      const d=new Date(ts);
      if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
  }
  return null;
}
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* 分享任务核心逻辑（终极完整版：加密体+自动领取+精准统计） */
async function doShareTask(headers){
  const today=todayKey();
  const lastShareDate=readPS(KEY_LAST_SHARE)||"";
  
  // 1. 校验：是否已分享
  if(lastShareDate===today){
    logInfo("今日已完成分享任务，跳过");
    return { success:false, msg:"今日已分享", exp:0, ncoin:0 };
  }

  // 2. 直接复用Loon抓包的Base64加密请求体（无需修改！）
  const ENCRYPTED_BODY="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";

  // 3. 执行分享请求（Base64自动解码）
  logInfo("开始执行分享任务（Base64加密体模式）...");
  try{
    const shareResp=await httpPost(
      cfg.shareTaskUrl, 
      headers, 
      ENCRYPTED_BODY, 
      true // 标记为Base64编码，工具自动解码
    );
    logInfo("分享接口返回：", shareResp);

    // 4. 解析分享结果（e=0即为成功）
    if(shareResp.e===0||shareResp.success===true||shareResp.message==="success"){
      writePS(today, KEY_LAST_SHARE); // 记录今日已分享
      
      // 新增：自动领取分享奖励（兼容版，后续可替换真实接口）
      logInfo("尝试自动领取分享奖励（兼容模式）...");
      try{
        const receiveResp=await httpPost(
          END.shareReceiveReward, // 推测领取接口（抓包真实接口后可替换）
          headers,
          {
            deviceId: cfg.DeviceId,
            taskType: "share",
            timestamp: Date.now(),
            signType: "daily_share",
            awardType: 1
          }
        );
        logInfo("分享奖励领取接口返回：", receiveResp);
        if(receiveResp.code===0||receiveResp.success===true||(receiveResp.msg&&receiveResp.msg.includes("成功"))||(receiveResp.message&&receiveResp.message.includes("成功"))){
          logInfo("✅ 分享奖励领取成功");
        } else if((receiveResp.msg&&receiveResp.msg.includes("已领取"))||(receiveResp.message&&receiveResp.message.includes("已领取"))){
          logInfo("ℹ️ 分享奖励已领取，无需重复操作");
        }
      }catch(e){
        logWarn("自动领取奖励异常（可能是接口不匹配，需抓包真实领取接口）：", String(e));
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // 延迟2秒，确保奖励到账
      let shareExp=0, shareNcoin=0;
      
      // 查积分（经验）记录：打印今日所有记录+扩展关键词匹配
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      const todayCreditList=creditList.filter(it=>toDateKeyAny(it.create_date??it.createTime)===today);
      logInfo("今日积分记录（全部）：", todayCreditList);
      for(const it of creditList){
        const k=toDateKeyAny(it.create_date??it.createTime);
        const type=it.type??it.creditType??"未知类型";
        if(k===today){
          logInfo("今日积分记录 - 类型：", type, "数值：", it.credit??it.amount??it.value??0);
          // 扩展关键词，覆盖更多命名场景
          if(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")||type.includes("share_task")){
            shareExp+=Number(it.credit??it.amount??it.value??0);
            logInfo("匹配到分享积分奖励：", it.credit??it.amount??it.value??0, "类型：", type);
          }
        }
      }
      
      // 查N币记录：打印今日所有记录+扩展关键词匹配
      const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
      const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
      const todayNcoinList=nCoinList.filter(it=>toDateKeyAny(it.create_time??it.createDate)===today);
      logInfo("今日N币记录（全部）：", todayNcoinList);
      for(const it of nCoinList){
        const k=toDateKeyAny(it.create_time??it.createDate);
        const type=it.type??it.operateType??"未知类型";
        if(k===today){
          logInfo("今日N币记录 - 类型：", type, "数值：", it.amount??it.coin??it.value??it.nCoin??0);
          // 扩展关键词，覆盖更多命名场景
          if(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")||type.includes("share_task")){
            shareNcoin+=Number(it.amount??it.coin??it.value??it.nCoin??0);
            logInfo("匹配到分享N币奖励：", it.amount??it.coin??it.value??it.nCoin??0, "类型：", type);
          }
        }
      }

      return {
        success: true,
        msg: `✅ 分享任务：成功\n🎯 领取状态：已尝试自动领取\n🎁 分享奖励：+${shareExp} 经验、+${shareNcoin} N 币`,
        exp: shareExp,
        ncoin: shareNcoin
      };
    } else{
      const errMsg=shareResp.msg||shareResp.message||"接口返回异常";
      logWarn("分享任务失败：", errMsg);
      return { success:false, msg:`❌ 分享失败：${errMsg}`, exp:0, ncoin:0 };
    }
  }catch(e){
    const errMsg=String(e);
    logErr("分享任务请求异常：", errMsg);
    return { success:false, msg:cfg.notifyFail?`❌ 分享异常：${errMsg}`:"", exp:0, ncoin:0 };
  }
}

/* Main */
(async()=>{
  try{
    const headers=makeHeaders();

    logInfo("查询签到状态...");
    let statusResp=null;
    try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); } catch(e){ logWarn("状态请求异常：",String(e)); }
    const statusData=statusResp?.data||{};
    let consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
    const blindBoxStatus=statusData?.blindBoxStatus??null;
    logInfo("签到状态返回：",statusResp);

    const knownSignedValues=[1,'1',true,'true'];
    const isSigned=knownSignedValues.includes(currentSignStatus);

    // 2) 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(!isSigned){
      logInfo("今日未签到，尝试执行签到...");
      try{
        const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
        logInfo("签到接口返回：",signResp);
        if(signResp.code===0||signResp.code===1||signResp.success===true){
          consecutiveDays+=1; // 自动递增

          // 解析奖励
          const rewardList=signResp.data?.rewardList;
          let newExp=0,newCoin=0;
          if(Array.isArray(rewardList)){
            for(const r of rewardList){
              const v=Number(r.rewardValue??0);
              const t=Number(r.rewardType??0);
              if(t===1) newExp+=v; else newCoin+=v;
            }
          }
          const nCoin=Number(signResp.data?.nCoin??signResp.data?.coin??0);
          const score=Number(signResp.data?.score??signResp.data?.credit??0);
          todayGainExp+=(score+newExp);
          todayGainNcoin+=(nCoin+newCoin);
          signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币`;
        } else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))||(signResp.message&&/已签到/.test(signResp.message))){
          signMsg=`✨ 今日签到：已签到（接口）`;
        } else{
          const rawMsg=signResp.msg??signResp.message??JSON.stringify(signResp);
          signMsg=`❌ 签到失败：${rawMsg}`;
          if(!cfg.notifyFail) signMsg="";
        }
      }catch(e){ logWarn("签到请求异常：",String(e)); if(cfg.notifyFail) signMsg=`❌ 签到请求异常：${String(e)}`; }
    } else { signMsg=`✨ 今日签到：已签到`; logInfo("今日已签到，跳过签到接口"); }

    // 3) 执行分享任务（签到后执行）
    let shareMsg="";
    const shareResult=await doShareTask(headers);
    shareMsg=shareResult.msg;
    todayGainExp+=shareResult.exp;
    todayGainNcoin+=shareResult.ncoin;

    // 4) 补充统计今日积分/N币（避免遗漏）
    try{
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      const today=todayKey();
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      for(const it of creditList){
        const k=toDateKeyAny(it.create_date??it.createTime??it.create_date_str??it.create_time);
        const type=it.type??it.creditType??"";
        if(k===today && !(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取"))){
          todayGainExp+=Number(it.credit??it.amount??it.value??0)||0;
        }
      }
      const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
      const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
      for(const it of nCoinList){
        const k=toDateKeyAny(it.create_time??it.createDate??it.createTime??it.create_date);
        const type=it.type??it.operateType??"";
        if(k===today && !(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取"))){
          todayGainNcoin+=Number(it.amount??it.coin??it.value??it.nCoin??0)||0;
        }
      }
      logInfo("今日积分/N币统计完成：",todayGainExp,todayGainNcoin);
    }catch(e){ logWarn("积分/N币统计异常：",String(e)); }

    // 5) 查询经验信息
    let upgradeLine="", creditData={};
    try{
      const cr=await httpGet(END.creditInfo,headers);
      creditData=cr?.data||{};
      const credit=Number(creditData.credit??0);
      const level=creditData.level??null;
      let need=0;
      if(creditData.credit_upgrade){
        const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
        if(m&&m[1]) need=Number(m[1]);
      } else if(creditData.credit_range && Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2){
        need=creditData.credit_range[1]-credit;
      }
      upgradeLine=`- 当前经验：${credit}${level?`（LV.${level}）`:''}\n- 距离升级：${need} 经验`;
    }catch(e){ logWarn("经验信息查询异常：",String(e)); }

    // 6) 余额
    let balLine="";
    try{
      const bal=await httpGet(END.balance,headers);
      if(bal?.code===0) balLine=`- 当前 N 币：${bal.data?.balance??bal.data?.coin??0}`;
      else if(bal?.data && bal.data.balance!==undefined) balLine=`- 当前 N 币：${bal.data.balance}`;
    }catch(e){ logWarn("余额查询异常：",String(e)); }

    // 7) 盲盒列表
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList,headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays??b.totalDays??b.daysRequired??0);
          const left=Number(b.leftDaysToOpen??b.remaining??0);
          const opened=Math.max(0,target-left);
          blindInfo.push({target,opened});
        });
      }
    }catch(e){ logWarn("盲盒查询异常：",String(e)); }

    // 8) 自动开启盲盒
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        try{
          if(Number(b.left)===0 && Number(b.target)===7){
            logInfo("检测到7天盲盒可开，尝试开箱...");
            try{
              const openR=await httpPost(END_OPEN.openSeven,headers,{});
              if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启并领取奖励");
            }catch(e){ logWarn("7天开箱异常：",String(e)); }
          }
        }catch(e){ logWarn("盲盒处理异常：",String(e)); }
      }
    }

    // 9) 通知（整合签到+分享结果）
    if(cfg.notify){
      let blindLines="无";
      if(blindInfo.length>0){
        blindLines=blindInfo.map(b=>`${b.target} 天盲盒：${b.opened} / ${b.target} 天`).join("\n| ");
      }

      let notifyBody=`${signMsg}\n${shareMsg}\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      const MAX_NOTIFY_LEN=1000;
      if(notifyBody.length>MAX_NOTIFY_LEN) notifyBody=notifyBody.slice(0,MAX_NOTIFY_LEN-3)+'...';
      notify(cfg.titlePrefix,"",notifyBody);
      logInfo("发送通知：",notifyBody);
    }

    logInfo("九号自动签到+分享任务完成，通知已发送。");
  }catch(e){ logErr("自动签到主流程异常：",e); }
})();