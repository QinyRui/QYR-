/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 C+ · 最终整合版）
 2025-12-01 更新版（积分/N币统计修复 + 通知显示 + 简化盲盒）
 功能：抓包写入、自动签到、分享任务重放/领取、盲盒开箱、经验/N币查询、通知美化
 [FIXED] 2025-12-01: 修复签到成功后，连续签到天数未在通知中递增的问题。
 [FIXED] 2025-12-01: 修复签到接口返回的 rewardList 奖励未被正确统计的问题。
 [FIXED] 2025-12-01: 通知盲盒进度简化为 X / Y 天，去掉进度条与百分比。
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){return null;} }
function writePS(val,key){ try { if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){return false;} }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization", KEY_DEV="ninebot.deviceId", KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug", KEY_NOTIFY="ninebot.notify", KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair", KEY_NOTIFYFAIL="ninebot.notifyFail", KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl", KEY_PROGRESS="ninebot.progressStyle", KEY_LAST_CAPTURE="ninebot.lastCaptureAt";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry network helper */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;

/* Debug */
function getDebugFlag(){ const v=readPS(KEY_DEBUG); if(v===null||v===undefined) return true; return v!=="false"; }
function logInfo(...args){ if(!getDebugFlag()) return; console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* Capture handling */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest=IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    const h=$request.headers||{}, auth=h["Authorization"]||h["authorization"]||"", dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"", ua=h["User-Agent"]||h["user-agent"]||"", capUrl=$request.url||"";
    logInfo("抓包 URL：", capUrl);
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){ const base=capUrl.split("?")[0]; if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",base); } }
    if(changed){ writePS(String(Date.now()),KEY_LAST_CAPTURE); notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入 BoxJS"); logInfo("抓包写入成功"); }
    else logInfo("抓包数据无变化");
  }catch(e){ logErr("抓包写入异常：", e);}
  $done({});
}

/* Read config */
const cfg={
  Authorization:readPS(KEY_AUTH)||"",
  DeviceId:readPS(KEY_DEV)||"",
  userAgent:readPS(KEY_UA)||"",
  shareTaskUrl:readPS(KEY_SHARE)||"",
  debug:getDebugFlag(),
  notify:(readPS(KEY_NOTIFY)===null||readPS(KEY_NOTIFY)===undefined)?true:(readPS(KEY_NOTIFY)!=="false"),
  autoOpenBox:readPS(KEY_AUTOBOX)==="true",
  autoRepair:readPS(KEY_AUTOREPAIR)==="true",
  notifyFail:(readPS(KEY_NOTIFYFAIL)===null||readPS(KEY_NOTIFYFAIL)===undefined)?true:(readPS(KEY_NOTIFYFAIL)!=="false"),
  titlePrefix:readPS(KEY_TITLE)||"九号签到",
};

/* Helpers */
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function toDateKeyFromAny(ts){ if(!ts&&ts!==0) return null; if(typeof ts==="string"&&/^\d+$/.test(ts)) ts=Number(ts); if(typeof ts==="string"&&/\D/.test(ts)){ const d=new Date(ts); if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; return null;} if(typeof ts==="number"){ if(ts>1e12) ts=Math.floor(ts/1000); const d=new Date(ts*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;} return null;}
function makeHeaders(){ return { "Authorization":cfg.Authorization,"Content-Type":"application/json;charset=UTF-8","device_id":cfg.DeviceId,"User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6","platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh" }; }
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){ return new Promise((resolve,reject)=>{ let attempts=0; const once=()=>{ attempts++; const opts={url,headers,timeout}; if(method==="POST") opts.body=typeof body==="string"?body:JSON.stringify(body===null?{}:body); const cb=(err,resp,data)=>{ if(err){ const msg=String(err&&(err.error||err.message||err)); const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg); if(attempts<MAX_RETRY&&shouldRetry){ console.warn(`[${nowStr()}] warn 请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`); setTimeout(once,RETRY_DELAY); return;} else { reject(err); return; } } if(resp && resp.status && resp.status>=500 && attempts<MAX_RETRY){ console.warn(`[${nowStr()}] warn 服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`); setTimeout(once,RETRY_DELAY); return; } try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); } }; if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb); }; once(); }); }
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={}){ return requestWithRetry({method:"POST",url,headers,body}); }

/* Main flow */
(async()=>{
  try{
    logInfo("九号自动签到开始");
    if(!cfg.Authorization||!cfg.DeviceId){ notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent"); logWarn("终止：未读取到账号信息"); $done(); }

    const headers=makeHeaders();

    // 1. 查询签到状态
    let statusResp=null;
    try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); }catch(e){ logWarn("状态请求异常：", String(e)); }
    const statusData=statusResp?.data||{};
    let consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
    const blindBoxStatus=statusData?.blindBoxStatus??null;
    const knownSignedValues=[1,'1',true,'true'];
    const isSigned=knownSignedValues.includes(currentSignStatus);

    // 2. 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(!isSigned){
      try{
        const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
        if(signResp.code===0||signResp.code===1||signResp.success===true){
          consecutiveDays+=1; // 修复连续签到
          const rewardList=signResp.data?.rewardList;
          let newExp=0,newCoin=0;
          if(Array.isArray(rewardList)){
            for(const r of rewardList){
              const v=Number(r.rewardValue??0), t=Number(r.rewardType??0);
              if(t===1) newExp+=v; else newCoin+=v;
            }
          }
          todayGainExp+=(Number(signResp.data?.score??signResp.data?.credit??0)+newExp);
          todayGainNcoin+=(Number(signResp.data?.nCoin??signResp.data?.coin??0)+newCoin);
          signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币`;
        }else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))||(signResp.message&&/已签到/.test(signResp.message))){
          signMsg="✨ 今日签到：已签到";
        }else{
          const rawMsg=signResp.msg??signResp.message??JSON.stringify(signResp);
          signMsg=`❌ 签到失败：${rawMsg}`;
          if(!cfg.notifyFail) signMsg="";
        }
      }catch(e){ logWarn("签到请求异常：", String(e)); if(cfg.notifyFail) signMsg=`❌ 签到请求异常：${String(e)}`; }
    }else{
      signMsg="✨ 今日签到：已签到";
      logInfo("今日已签到，跳过签到接口");
    }

    // 3. 今日积分/N币
    try{
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      const today=todayKey();
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      for(const it of creditList){ const k=toDateKeyFromAny(it?.create_date??it?.createTime??it?.create_date_str??it?.create_time); if(k===today) todayGainExp+=Number(it.credit??it.amount??0); }
      const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
      const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
      for(const it of nCoinList){ const k=toDateKeyFromAny(it?.create_time??it?.createDate??it?.createTime??it?.create_date); if(k===today) todayGainNcoin+=Number(it.amount??it.coin??it.value??0); }
      logInfo(`今日积分/ N币统计完成：`, todayGainExp, todayGainNcoin);
    }catch(e){ logWarn("积分/N币统计异常：", String(e)); }

    // 4. 查询经验信息
    let upgradeLine="", creditData={};
    try{
      const cr=await httpGet(END.creditInfo,headers);
      creditData=cr?.data||{};
      const credit=Number(creditData.credit??0);
      const level=creditData.level??null;
      let need=0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length>=2){ need=creditData.credit_range[1]-credit; }
      upgradeLine=`- 当前经验：${credit}${level?`（LV.${level}）`:''}\n- 距离升级：${need} 经验`;
    }catch(e){ logWarn("经验信息查询异常：", String(e)); }

    // 5. 余额查询
    let balLine="";
    try{ const bal=await httpGet(END.balance,headers); if(bal?.code===0) balLine=`- 当前 N 币：${bal.data?.balance??bal.data?.coin??0}`; else if(bal?.data && (bal.data.balance!==undefined)) balLine=`- 当前 N 币：${bal.data.balance}`; }catch(e){ logWarn("余额查询异常：", String(e)); }

    // 6. 盲盒列表
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList,headers);
      const notOpened=box?.data?.notOpenedBoxes??[];
      if(Array.isArray(notOpened)&&notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays??b.totalDays??b.daysRequired??0);
          const left=Number(b.leftDaysToOpen??b.remaining??0);
          const opened=Math.max(0,target-left);
          blindInfo.push({target,opened});
        });
      }
    }catch(e){ logWarn("盲盒查询异常：", String(e)); }

    // 7. 自动开启7天盲盒
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        try{
          if(Number(b.opened)>=b.target && Number(b.target)===7){
            const openR=await httpPost(END_OPEN.openSeven,headers,{});
            if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启并领取奖励");
          }
        }catch(e){ logWarn("盲盒开箱异常：", String(e)); }
      }
    }

    // 8. 发送通知（简化盲盒显示 X / Y 天）
    if(cfg.notify){
      let barLines="无";
      if(blindInfo.length>0){
        barLines=blindInfo.map(b=>`${b.target} 天盲盒：${b.opened} / ${b.target} 天`).join("\n| ");
      }
      if(signMsg.includes("成功")) signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币`;
      let notifyBody=`${signMsg}\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${barLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      notify(cfg.titlePrefix,"",notifyBody);
      logInfo("发送通知：", notifyBody);
    }

    logInfo("九号自动签到完成，通知已发送。");

  }catch(e){ logErr("自动签到主流程异常：", e);}
})();