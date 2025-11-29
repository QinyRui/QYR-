/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 E · 最终整合版）
 功能：抓包写入、自动签到、分享任务、盲盒、经验/N币查询、通知美化
 支持 BoxJS debugLevel 0~3
***********************************************/

const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if(HAS_PERSIST) return $persistentStore.read(key); } catch{} return null; }
function writePS(val, key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); }catch{} return false; }
function notify(title, sub, body){ if(HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debugLevel";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_PROGRESS="ninebot.progressStyle";

/* Logging with levels */
const debugLevel = Number(readPS(KEY_DEBUG)||1);
function logInfo(...a){ if(debugLevel>=1) console.log(`[${nowStr()}]`,...a);}
function logWarn(...a){ if(debugLevel>=2) console.warn(`[${nowStr()}]`,...a);}
function logErr(...a){ if(debugLevel>=3) console.error(`[${nowStr()}]`,...a);}

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry helpers */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err?.error||err?.message||err);
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry) return setTimeout(once,RETRY_DELAY);
          return reject(err);
        }
        try{ resolve(JSON.parse(data||"{}")); }catch{ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb);
      else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body="{}"){ return requestWithRetry({method:"POST",url,headers,body}); }

/* Config */
const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: Number(readPS(KEY_PROGRESS)||0),
};

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization/DeviceId/User-Agent");
  logErr("未配置 Token");
  $done(); 
}

/* Main */
(async()=>{
  try{
    const headers = {
      "Authorization": cfg.Authorization,
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone) Segway/6",
      "platform":"h5",
      "Origin":"https://h5-bj.ninebot.com",
      "language":"zh",
      "Content-Type":"application/json;charset=UTF-8",
    };
    logInfo("开始查询签到状态...");
    const statusResp = await httpGet(`${END.status}?t=${Date.now()}`,headers);
    const status = statusResp?.data||{};
    const consecutiveDays = status.consecutiveDays||0;
    const signCards = status.signCardsNum||0;
    const currentSignStatus = status.currentSignStatus||0;
    logInfo("签到状态：",status);

    /* 今日签到 */
    let signMsg="✨ 今日签到：已签到";
    let gainExp=0,gainN=0;

    if(currentSignStatus===0){
      const signResp = await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));
      if(signResp?.code===0){
        gainExp=Number(signResp.data?.score||0);
        gainN=Number(signResp.data?.nCoin||0);
        signMsg=`✨ 今日签到：成功`;
        logInfo("签到奖励：经验",gainExp,"N币",gainN);
      }else{
        logWarn("签到失败：",signResp);
        if(cfg.notify) notify(cfg.titlePrefix,"签到失败",signResp?.msg||"未知错误");
      }
    }

    /* 今日分享奖励 */
    let shareGain=0;
    if(cfg.shareTaskUrl){
      try{
        const share = await httpPost(cfg.shareTaskUrl,headers,JSON.stringify({page:1,size:20}));
        const list = Array.isArray(share?.data?.list)?share.data.list:[];
        const todayStr = new Date().toISOString().split("T")[0];
        list.forEach(it=>{
          const t=new Date(Number(it.occurrenceTime||0)).toISOString().split("T")[0];
          if(t===todayStr) shareGain+=Number(it.count||0);
        });
      }catch(e){ logWarn("分享任务查询失败",e);}
    }

    /* 账户信息 */
    const creditResp = await httpGet(END.creditInfo,headers);
    const credit=creditResp?.data?.credit||0;
    const level=creditResp?.data?.level||"";

    /* 余额 */
    let balance=0;
    try{
      const b = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",headers);
      balance=b?.data?.balance||0;
    }catch(e){ logWarn("余额查询失败",e); }

    /* 盲盒进度 */
    let blindInfo=[];
    try{
      const box = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>blindInfo.push({target:Number(b.awardDays),left:Number(b.leftDaysToOpen),opened:Number(b.awardDays)-Number(b.leftDaysToOpen)}));
    }catch(e){ logWarn("盲盒查询失败",e); }

    /* 自动开 7天盲盒 */
    if(cfg.autoOpenBox){
      for(const b of blindInfo){
        if(b.target===7 && b.left===0){
          try{ await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",headers,JSON.stringify({})); logInfo("7天盲盒已领取"); }catch(e){ logWarn("开盲盒失败",e);}
        }
      }
    }

    /* 生成通知文本 */
    let lines=[];
    lines.push(signMsg);
    if(shareGain) lines.push(`🎁 今日分享奖励：+${shareGain} N币`);
    lines.push(`📊 账户状态\n等级：LV.${level}\n- 当前经验：${credit}\n- 当前 N币：${balance}\n- 补签卡：${signCards}\n- 连续签到：${consecutiveDays} 天`);
    if(blindInfo.length>0){
      lines.push("📦 盲盒进度");
      for(const b of blindInfo){
        const len=b.target===7?18:22;
        const bar="⣿".repeat(b.opened)+ "⣀".repeat(b.target-b.opened);
        lines.push(`${b.target} 天盲盒：${bar} ${b.opened}/${b.target}`);
      }
    }
    if(gainExp||gainN) lines.push(`🎯 今日获得：经验 ${gainExp} / N币 ${gainN+shareGain}`);
    if(cfg.notify) notify(cfg.titlePrefix,"今日签到结果",lines.join("\n"));

  }catch(e){ logErr("脚本异常",e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ $done(); }
})();