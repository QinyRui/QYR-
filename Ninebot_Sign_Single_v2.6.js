/***********************************************
 Ninebot_Sign_Single_v2.6.js  （最终修正版）
 2025-12-01 09:09 更新（修复今日积分/N币统计 + 连续签到 + 简化盲盒显示）
 功能：
 - 抓包写入 Authorization / DeviceId / User-Agent / shareTaskUrl
 - 自动签到 / 分享奖励领取
 - 盲盒显示（简化）
 - 今日积分/N币统计修复
 - 通知美化
***********************************************/

const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){return null;} }
function writePS(val,key){ try { if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){return false;} }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

const KEY_AUTH="ninebot.authorization", KEY_DEV="ninebot.deviceId", KEY_UA="ninebot.userAgent";
const KEY_SHARE="ninebot.shareTaskUrl", KEY_NOTIFY="ninebot.notify", KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair", KEY_NOTIFYFAIL="ninebot.notifyFail", KEY_TITLE="ninebot.titlePrefix";

const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst"
};

const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

const REQUEST_TIMEOUT=12000, MAX_RETRY=3, RETRY_DELAY=1500;

function getDebugFlag(){ const v=readPS("ninebot.debug"); return (v===null||v===undefined)?true:(v!=="false"); }
function logInfo(...args){ if(getDebugFlag()) console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

function mask(s){ if(!s) return ""; return s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function toDateKeyFromAny(ts){
  if(!ts && ts!==0) return null;
  if(typeof ts==="string"&&/^\d+$/.test(ts)) ts=Number(ts);
  if(typeof ts==="string"&&/\D/.test(ts)){
    const d=new Date(ts); if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; return null;
  }
  if(typeof ts==="number"){ if(ts>1e12) ts=Math.floor(ts/1000); const d=new Date(ts*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  return null;
}

function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  };
}

function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=(typeof body==='string')?body:JSON.stringify(body===null?{}:body);
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err.error||err.message||err);
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY&&shouldRetry){ setTimeout(once,RETRY_DELAY); return; } else { reject(err); return; }
        }
        if(resp&&resp.status&&resp.status>=500&&attempts<MAX_RETRY){ setTimeout(once,RETRY_DELAY); return; }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={}){ return requestWithRetry({method:"POST",url,headers,body}); }

const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debug: getDebugFlag(),
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到助手"
};

logInfo("九号自动签到开始");
logInfo("当前配置：", cfg);

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请开启抓包并在九号 APP 执行签到/分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）"); $done();
}

(async()=>{
  try{
    const headers=makeHeaders();
    logInfo("查询签到状态...");
    const statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
    const status=statusResp?.data||{};
    let consecutiveDays=status.consecutiveDays||0;
    const signCards=status.signCardsNum||0;
    const currentSignStatus=status.currentSignStatus||0;
    const isSigned=[1,'1',true,'true'].includes(currentSignStatus);
    logInfo("签到状态返回：",statusResp);

    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(!isSigned){
      logInfo("今日未签到，尝试执行签到...");
      try{
        const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
        logInfo("签到接口返回：",signResp);
        if(signResp.code===0||signResp.code===1||signResp.success===true){
          consecutiveDays+=1;
          const rewardList=signResp.data?.rewardList||[];
          for(const r of rewardList){
            const type=Number(r.rewardType||0), val=Number(r.rewardValue||0);
            if(type===1) todayGainExp+=val; else todayGainNcoin+=val;
          }
          signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N币`;
        } else { signMsg="❌ 今日签到失败"; }
      }catch(e){ logWarn("签到请求异常：",String(e)); if(cfg.notifyFail) signMsg=`❌ 签到异常：${String(e)}`; }
    } else { signMsg="✨ 今日签到：已签到"; logInfo("今日已签到"); }

    // 今日积分/N币统计（确保接口字段兼容）
    try{
      const today=todayKey();
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      for(const it of creditList){
        const k=toDateKeyFromAny(it.create_date||it.createTime||it.create_date_str||it.create_time);
        if(k===today) todayGainExp+=Number(it.credit||it.amount||0);
      }
      const nCoinResp=await httpPost(END.balance,headers);
      todayGainNcoin+=Number(nCoinResp.data?.balance||0); // 兼容接口直接获取余额作为N币
      logInfo(`今日积分/ N币统计完成：`,todayGainExp,todayGainNcoin);
    } catch(e){ logWarn("积分/N币统计异常：",String(e)); }

    // 盲盒列表
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList,headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      for(const b of notOpened){
        const target=Number(b.awardDays||b.totalDays||b.daysRequired||0);
        const left=Number(b.leftDaysToOpen||b.remaining||0);
        const opened=Math.max(0,target-left);
        blindInfo.push({target,opened});
      }
      logInfo("盲盒列表：",blindInfo);
    } catch(e){ logWarn("盲盒查询异常：",String(e)); }

    // 自动开盲盒
    if(cfg.autoOpenBox){
      for(const b of blindInfo){
        if(b.target===7 && b.opened>=7){
          try{ const openR=await httpPost(END_OPEN.openSeven,headers,{}); logInfo("开箱返回：",openR); }catch(e){ logWarn("开箱异常：",String(e)); }
        }
      }
    }

    // 发送通知
    if(cfg.notify){
      let blindLines="无";
      if(blindInfo.length>0) blindLines=blindInfo.map(b=>`${b.target} 天盲盒：${b.opened} / ${b.target} 天`).join("\n| ");
      const upgradeLine=`- 当前经验：${statusResp.data?.credit||0}（LV.${statusResp.data?.level||13}）\n- 距离升级：${statusResp.data?.credit_upgrade||0} 经验`;
      const balLine=`- 当前 N 币：${nCoinResp.data?.balance||0}`;
      const notifyBody=`${signMsg}\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      notify(cfg.titlePrefix,"",notifyBody);
      logInfo("发送通知：",notifyBody);
    }

    logInfo("九号自动签到完成，通知已发送。");
  }catch(e){ logErr("自动签到主流程异常：",e); }
})();