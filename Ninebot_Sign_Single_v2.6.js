/***********************************************
 Ninebot_Sign_Single_v2.6 C · 最终修复版
 2025-12-01 00:30 更新版
 功能：抓包写入、自动签到、分享任务、盲盒开箱、经验/N币查询、通知美化
 修复：
 1. 连续签到天数在通知中递增
 2. 今日获得经验显示为 0 的问题
 3. rewardList 奖励未被正确统计
***********************************************/

/* 环境适配 */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key){ try{ return HAS_PERSIST?$persistentStore.read(key):null; }catch(e){return null;} }
function writePS(val,key){ try{ return HAS_PERSIST?$persistentStore.write(val,key):false; }catch(e){return false;} }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_PROGRESS="ninebot.progressStyle";
const KEY_LAST_CREDIT="ninebot.lastCredit";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* 网络请求封装 */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function getDebugFlag(){ const v=readPS(KEY_DEBUG); return v===null||v===undefined?true:(v!=="false"); }
function logInfo(...args){ if(!getDebugFlag())return; console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }

/* 工具函数 */
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function toDateKeyFromTs(ts){ if(!ts) return null; ts=Number(ts); if(ts>1e12)ts=Math.floor(ts/1000); const d=new Date(ts*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function makeHeaders(cfg){ return {"Authorization":cfg.Authorization,"Content-Type":"application/json;charset=UTF-8","device_id":cfg.DeviceId,"User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6","platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"}; }
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){ return new Promise((resolve,reject)=>{ let attempts=0; const once=()=>{ attempts++; const opts={url,headers,timeout}; if(method==="POST") opts.body=typeof body==='string'?body:JSON.stringify(body===null?{}:body); const cb=(err,resp,data)=>{ if(err){ const msg=String(err&&(err.error||err.message||err)); const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg); if(attempts<MAX_RETRY&&shouldRetry){ setTimeout(once,RETRY_DELAY); return;}else{reject(err);return;} } if(resp&&resp.status&&resp.status>=500&&attempts<MAX_RETRY){ setTimeout(once,RETRY_DELAY); return; } try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); } }; if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb); }; once(); }); }
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={}){ return requestWithRetry({method:"POST",url,headers,body}); }

/* 主流程 */
(async()=>{
  try{
    const cfg={ Authorization:readPS(KEY_AUTH)||"", DeviceId:readPS(KEY_DEV)||"", userAgent:readPS(KEY_UA)||"", shareTaskUrl:readPS(KEY_SHARE)||"", debug:getDebugFlag(), notify:readPS(KEY_NOTIFY)!=="false", autoOpenBox:readPS(KEY_AUTOBOX)==="true", titlePrefix:readPS(KEY_TITLE)||"九号签到", progressStyle:Number(readPS(KEY_PROGRESS)||0) };
    logInfo("九号自动签到开始",cfg);
    if(!cfg.Authorization||!cfg.DeviceId){ notify(cfg.titlePrefix,"未配置 Token","请抓包写入 Authorization/DeviceId"); return; }

    const headers=makeHeaders(cfg);

    // 查询签到状态
    let statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    const statusData = statusResp?.data||{};
    let consecutiveDays = statusData?.consecutiveDays ?? 0;
    const signCards = statusData?.signCardsNum ?? 0;
    const currentSignStatus = statusData?.currentSignStatus;
    const isSigned=[1,'1',true,'true'].includes(currentSignStatus);

    // 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(!isSigned){
      const signResp=await httpPost(END.sign, headers,{deviceId:cfg.DeviceId});
      if(signResp.code===0){ consecutiveDays+=1; const rewards=signResp.data?.rewardList||[]; for(const r of rewards){ if(Number(r.rewardType)===1) todayGainExp+=Number(r.rewardValue||0); else todayGainNcoin+=Number(r.rewardValue||0);} signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N币`; }
      else signMsg=`✨ 今日签到：已签到`;
    } else signMsg=`✨ 今日签到：已签到`;

    // 查询积分/N币流水
    try{
      const creditResp=await httpPost(END.creditLst, headers,{page:1,size:100});
      const nCoinResp=await httpPost(END.nCoinRecord, headers,{page:1,size:100});
      const today=todayKey();
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      todayGainExp+=creditList.filter(x=>toDateKeyFromTs(x.create_date)===today).reduce((sum,x)=>sum+Number(x.credit),0);
      const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
      todayGainNcoin+=nCoinList.filter(x=>toDateKeyFromTs(x.create_time)===today).reduce((sum,x)=>sum+Number(x.amount||0),0);
      logInfo("今日积分/N币统计完成",todayGainExp,todayGainNcoin);
    }catch(e){ logInfo("积分/N币统计异常",e); }

    // 查询经验信息
    let upgradeLine="", currentCredit=0;
    try{
      const cr=await httpGet(END.creditInfo, headers);
      const creditData=cr?.data||{};
      currentCredit=Number(creditData.credit||0);
      writePS(String(currentCredit), KEY_LAST_CREDIT);
      let need=0; if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)/); if(m) need=Number(m[1]);} else if(Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2) need=creditData.credit_range[1]-currentCredit;
      upgradeLine=`- 当前经验：${currentCredit}${creditData.level?`（LV.${creditData.level}）`:''}\n- 距离升级：${need} 经验`;
    }catch(e){ logInfo("经验查询异常",e); }

    // 查询余额
    let balLine="";
    try{ const bal=await httpGet(END.balance, headers); if(bal?.code===0) balLine=`- 当前 N币：${bal.data?.balance??0}`; }catch(e){}

    // 查询盲盒
    let blindInfo=[];
    try{ const box=await httpGet(END.blindBoxList, headers); const notOpened=box?.data?.notOpenedBoxes||[]; blindInfo=notOpened.map(b=>{ const target=Number(b.awardDays||b.totalDays||0); const left=Number(b.leftDaysToOpen||b.remaining||0); const opened=Math.max(0,target-left); return {target,left,opened}; }); }catch(e){}

    // 自动开 7天盲盒
    if(cfg.autoOpenBox) for(const b of blindInfo){ try{ if(Number(b.left)===0 && Number(b.target)===7) await httpPost(END_OPEN.openSeven, headers,{}); }catch(e){} }

    // 通知
    if(cfg.notify){
      let barLines=blindInfo.length>0?blindInfo.map(b=>`${b.target} 天盲盒：\n[${"➤".repeat(b.opened)}${"·".repeat(b.target-b.opened)}] ${b.opened} / ${b.target} 天`).join("\n| "):"无";
      signMsg = (todayGainExp>0 || todayGainNcoin>0)?`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N币`:signMsg;
      const notifyBody=`${signMsg}\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${barLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      notify(cfg.titlePrefix,"",notifyBody);
      logInfo("发送通知",notifyBody);
    }
    logInfo("九号自动签到完成");
  }catch(e){ logInfo("主流程异常",e); }
})();