/***********************************************
 Ninebot_Sign_Single_v2.6.js  （最终整合版 · 带分享奖励 + 美化通知 + 盲盒）
 更新日期：2025-11-29
 功能：
 - 抓包写入 Authorization / DeviceId / User-Agent / 分享任务 URL
 - 自动签到（签到奖励经验）
 - 分享任务自动领取（奖励 N币）
 - 盲盒进度显示（7天 / 666天，8种样式可选）
 - 日志等级可调（0关闭，1信息，2警告，3调试）
 - 通知美化（签到/经验/N币/补签卡/连续签到/盲盒/今日获得）
 - 插件可选择盲盒样式和日志等级
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* Helper functions for persistent store */
function readPS(key){ try { return HAS_PERSIST ? $persistentStore.read(key) : null; } catch(e){ return null; } }
function writePS(val,key){ try { return HAS_PERSIST ? $persistentStore.write(val,key) : false; } catch(e){ return false; } }

/* Helper for notifications */
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debugLevel";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_SHARE = "ninebot.shareTaskUrl";
const KEY_PROGRESS = "ninebot.barStyle";

/* API Endpoints */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Network retry settings */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

/* Network helper with retry */
function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts = 0;
    const once = ()=>{
      attempts++;
      const opts = {url, headers, timeout};
      if(method==="POST") opts.body = body===null?"{}":body;
      const cb = (err,resp,data)=>{
        if(err){
          const msg = String(err && (err.error||err.message||err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){ setTimeout(once,RETRY_DELAY); return; }
          else { reject(err); return; }
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb);
      else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body="{}"){ return requestWithRetry({method:"POST",url,headers,body}); }

/* Logging */
const debugLevel = Number(readPS(KEY_DEBUG)||1);
function logInfo(...args){ if(debugLevel>=1) console.log(`[${nowStr()}] info`,...args); }
function logWarn(...args){ if(debugLevel>=2) console.warn(`[${nowStr()}] warn`,...args); }
function logDebug(...args){ if(debugLevel>=3) console.debug(`[${nowStr()}] debug`,...args); }

/* Progress bar styles (8) */
const PROGRESS_STYLES = [
  ["█","░"], // 0
  ["▓","░"], // 1
  ["▰","▱"], // 2
  ["●","○"], // 3
  ["■","□"], // 4
  ["➤","·"], // 5
  ["▮","▯"], // 6
  ["⣿","⣀"]  // 7
];
function renderProgressBar(current,total,styleIndex=0,length=20){
  try{
    styleIndex = Number(styleIndex)||0;
    if(styleIndex<0||styleIndex>PROGRESS_STYLES.length-1) styleIndex=0;
    const [FULL,EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0?current/total:0;
    const filled = Math.round(ratio*length);
    const empty = Math.max(0,length-filled);
    return FULL.repeat(filled)+EMPTY.repeat(empty);
  }catch(e){ return "██████████----------"; }
}

/* 抓包写入 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
if(IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u))){
  try{
    const h = $request.headers||{};
    const auth = h["Authorization"]||h["authorization"]||"";
    const dev = h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    const capUrl = $request.url||"";
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){ const base=capUrl.split("?")[0]; if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; } }
    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入 BoxJS");
  }catch(e){ logWarn("抓包写入异常",e); }
  $done({});
}

/* 读取配置 */
const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debugLevel,
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: (IS_ARG && $argument && $argument.barStyle!==undefined)?Number($argument.barStyle):Number(readPS(KEY_PROGRESS)||0)
};

/* 检查必要信息 */
if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包并执行签到/分享动作写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息");
  $done();
}

/* 组合 headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type":"application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
    "platform":"h5",
    "Origin":"https://h5-bj.ninebot.com",
    "language":"zh"
  };
}

/* 主流程 */
(async ()=>{
  try{
    const headers = makeHeaders();
    let todayGainExp=0, todayGainNcoin=0;

    // 查询签到状态
    let statusResp=null;
    try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); }catch(e){ logWarn("状态请求异常",e); }
    const statusData=statusResp?.data||{};
    const consecutiveDays = statusData?.consecutiveDays||statusData?.continuousDays||0;
    const signCards = statusData?.signCardsNum||statusData?.remedyCard||0;
    const currentSignStatus = statusData?.currentSignStatus ?? null;
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    // 签到
    let signMsg="";
    if(currentSignStatus===0||currentSignStatus===undefined||currentSignStatus===null){
      try{
        const signResp = await httpPost(END.sign, headers, JSON.stringify({deviceId:cfg.DeviceId}));
        if(signResp.code===0||signResp.code===1){
          const score = Number(signResp.data?.score||0);
          todayGainExp += score;
          signMsg=`🎉 今日签到：成功\n+${score} 经验（签到奖励）`;
        }else if(signResp.code===540004||/已签到/.test(signResp.msg)){ signMsg="🎉 今日签到：已签到"; }
        else{ signMsg=`❌ 签到失败：${signResp.msg||JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
      }catch(e){ signMsg="❌ 签到请求异常"; if(!cfg.notifyFail) signMsg=""; }
    }else signMsg="🎉 今日签到：已签到";

    // 分享任务
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      try{
        let shareResp=null;
        try{ shareResp=await httpPost(cfg.shareTaskUrl,headers,JSON.stringify({page:1,size:20})); }
        catch(e){ try{ shareResp=await httpGet(cfg.shareTaskUrl,headers); }catch(e2){ logWarn("分享任务异常",e2); } }
        const listArr = Array.isArray(shareResp?.data?.list)?shareResp.data.list:[];
        if(listArr.length>0){
          const today = new Date(); const todayKey = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
          listArr.forEach(it=>{
            const t = Number(it?.occurrenceTime||0);
            const d = new Date(t*1000); const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
            if(key===todayKey){ shareGain += Number(it.count||0); }
          });
          if(shareGain>0) shareTaskLine=`- 今日分享奖励：+${shareGain} N币`;
          todayGainNcoin += shareGain;
        }
      }catch(e){ logWarn("分享任务处理异常",e); }
    }

    // 查询经验/等级
    let upgradeLine="", creditData={};
    try{
      const cr = await httpGet(END.creditInfo,headers);
      creditData=cr?.data||{};
      const credit = Number(creditData.credit||0);
      const level = creditData.level||0;
      let need = 0;
      if(creditData.credit_upgrade){ const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range?.length>=2){ need=creditData.credit_range[1]-credit; }
      upgradeLine=`等级：LV.${level}\n当前经验：${credit}\n距离升级：${need}`;
    }catch(e){ logWarn("经验信息查询异常",e); }

    // N币余额
    let balLine="";
    try{ const bal=await httpGet(END.balance,headers); if(bal?.code===0) balLine=`当前 N币：${bal.data?.balance||bal.data?.coin||0}`; }catch(e){ logWarn("余额查询异常",e); }

    // 盲盒列表
    let blindInfo=[];
    try{
      const box = await httpGet(END.blindBoxList,headers);
      const notOpened = box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{
        const target=Number(b.awardDays);
        const left=Number(b.leftDaysToOpen);
        const opened = Math.max(0,target-left);
        blindInfo.push({target,left,opened});
      });
    }catch(e){ logWarn("盲盒查询异常",e); }

    // 自动开箱7天盲盒
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        try{
          if(b.left===0 && b.target===7){
            const openR = await httpPost(END_OPEN.openSeven,headers,JSON.stringify({}));
            if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启并领取奖励");
          }
        }catch(e){ logWarn("7天盲盒开箱异常",e); }
      }
    }

    // 组织通知
    let notifyLines=[];
    if(signMsg) notifyLines.push(signMsg);
    if(shareTaskLine) notifyLines.push(shareTaskLine);
    notifyLines.push("");
    notifyLines.push("📊 账户状态");
    if(upgradeLine) notifyLines.push(upgradeLine);
    if(balLine) notifyLines.push(balLine);
    notifyLines.push(`补签卡：${signCards} 张`);
    notifyLines.push(`连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      notifyLines.push("");
      notifyLines.push("🎁 盲盒进度");
      blindInfo.forEach(info=>{
        const width = info.target===7?18:(info.target===666?30:22);
        const bar = renderProgressBar(info.opened, info.target, cfg.progressStyle, width);
        notifyLines.push(`${info.target} 天盲盒：`);
        notifyLines.push(`[${bar}] ${info.opened} / ${info.target} 天`);
      });
    }

    if(todayGainExp || todayGainNcoin){
      notifyLines.push("");
      notifyLines.push(`🎯 今日获得：`);
      if(todayGainExp) notifyLines.push(`- 积分 ${todayGainExp}`);
      if(todayGainNcoin) notifyLines.push(`- N币 ${todayGainNcoin}（分享任务奖励）`);
    }

    const title=`${cfg.titlePrefix} · 今日签到结果`;
    const body = notifyLines.join("\n");

    if(cfg.notify && body) { notify(title,"",body); logInfo("发送通知：",body.replace(/\n/g," | ")); }
    else logInfo("通知已禁用或无内容，跳过发送。");

  }catch(e){ logWarn("主流程异常",e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ logInfo("九号自动签到结束"); $done(); }
})();