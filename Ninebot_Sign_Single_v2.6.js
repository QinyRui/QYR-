/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · 美化通知版）
 2025-11-29
 功能：
  - 自动签到
  - 自动分享任务领取
  - 盲盒查询及自动开启
  - 经验/N币查询
  - 日志等级选择
  - 盲盒进度条样式选择
  - 通知美化（签到/分享/经验/N币/盲盒/补签卡/连续签到）
***********************************************/

/* ===================== 环境检测 ===================== */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* ===================== 持久化读写 ===================== */
function readPS(key) {
  try { if(HAS_PERSIST) return $persistentStore.read(key); return null; } 
  catch(e){ return null; }
}
function writePS(val,key){
  try { if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } 
  catch(e){ return false; }
}

/* ===================== 通知 ===================== */
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }

/* ===================== 时间戳 ===================== */
function nowStr(){ return new Date().toLocaleString(); }

/* ===================== BoxJS 配置键 ===================== */
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
const KEY_PROGRESS = "ninebot.progressStyle";

/* ===================== API 端点 ===================== */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* ===================== 网络请求重试 ===================== */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once = () => {
      attempts++;
      const opts = {url,headers,timeout};
      if(method==="POST") opts.body = body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg = String(err && (err.error||err.message||err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){
            logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(once,RETRY_DELAY);
            return;
          }else{ reject(err); return; }
        }
        try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb);
      else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body="{}"){ return requestWithRetry({method:"POST",url,headers,body}); }

/* ===================== 日志 ===================== */
function logInfo(...args){ if(cfg.debugLevel>=1) console.log(`[${nowStr()}] info`,...args); }
function logWarn(...args){ if(cfg.debugLevel>=2) console.warn(`[${nowStr()}] warn`,...args); }
function logDebug(...args){ if(cfg.debugLevel>=3) console.log(`[${nowStr()}] debug`,...args); }

/* ===================== 盲盒进度条样式 ===================== */
const PROGRESS_STYLES=[
  ["█","░"],["▓","░"],["▰","▱"],["●","○"],
  ["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]
];
function renderProgressBar(current,total,styleIndex=0,length=20){
  try{
    styleIndex = Number(styleIndex)||0;
    if(styleIndex<0||styleIndex>=PROGRESS_STYLES.length) styleIndex=0;
    const [FULL,EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0?current/total:0;
    const filled = Math.round(ratio*length);
    const empty = Math.max(0,length-filled);
    return FULL.repeat(filled)+EMPTY.repeat(empty);
  }catch(e){ return "██████████----------"; }
}

/* ===================== 辅助函数 ===================== */
function mask(s){ if(!s)return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d=new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* ===================== 抓包写入 ===================== */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));

if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";
    logInfo("抓包 URL：",capUrl);
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",base); }
    }
    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入 BoxJS");
    else logInfo("抓包数据无变化");
  }catch(e){ logWarn("抓包写入异常：",e); }
  $done({});
}

/* ===================== 读取配置 ===================== */
const argProgressStyle=(IS_ARG && $argument && $argument.barStyle!==undefined)?Number($argument.barStyle):null;
const boxProgressStyle=Number(readPS(KEY_PROGRESS)||0);
const progressStyle=(argProgressStyle!==null)?argProgressStyle:boxProgressStyle;

const cfg={
  Authorization:readPS(KEY_AUTH)||"",
  DeviceId:readPS(KEY_DEV)||"",
  userAgent:readPS(KEY_UA)||"",
  shareTaskUrl:readPS(KEY_SHARE)||"",
  debugLevel:Number(IS_ARG && $argument && $argument.debugLevel!==undefined?$argument.debugLevel:readPS(KEY_DEBUG)||1),
  notify:readPS(KEY_NOTIFY)!=="false",
  autoOpenBox:readPS(KEY_AUTOBOX)==="true",
  autoRepair:readPS(KEY_AUTOREPAIR)==="true",
  notifyFail:readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix:readPS(KEY_TITLE)||"九号签到",
  progressStyle:progressStyle
};

/* ===================== 主流程 ===================== */
(async()=>{
  try{
    logInfo("九号自动签到开始，当前配置：",cfg);

    if(!cfg.Authorization || !cfg.DeviceId){
      notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
      logWarn("终止：未读取到账号信息");
      $done();
    }

    const headers={
      "Authorization":cfg.Authorization,
      "Content-Type":"application/json;charset=UTF-8",
      "device_id":cfg.DeviceId,
      "User-Agent":cfg.userAgent,
      "platform":"h5",
      "Origin":"https://h5-bj.ninebot.com",
      "language":"zh"
    };

    /* ===== 1) 查询签到状态 ===== */
    logInfo("查询签到状态...");
    let statusResp=null;
    try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); }catch(e){ logWarn("状态请求异常：",e); }
    const statusData=statusResp?.data||{};
    const consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus=statusData?.currentSignStatus??0;
    const blindBoxStatus=statusData?.blindBoxStatus??null;

    /* ===== 2) 签到 ===== */
    let signMsg="", todayGainExp=0, todayGainNcoin=0, signResp=null;
    if(currentSignStatus===0){
      logInfo("今日未签到，执行签到...");
      try{ signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId})); }catch(e){ logWarn("签到异常：",e); }
      if(signResp){
        if(signResp.code===0||signResp.code===1){
          const nCoin=Number(signResp.data?.nCoin??0);
          const score=Number(signResp.data?.score??0);
          todayGainExp+=score; todayGainNcoin+=0;
          signMsg=`今日签到：成功\n+${score} 经验（签到奖励）`;
        }else if(signResp.code===540004 || /已签到/.test(signResp.msg)){
          signMsg="今日签到：已签到";
        }else{
          signMsg=`签到失败：${signResp.msg??JSON.stringify(signResp)}`;
          if(!cfg.notifyFail) signMsg="";
        }
      }else{ signMsg="签到请求无响应"; if(!cfg.notifyFail) signMsg=""; }
    }else{ signMsg="今日签到：已签到"; }

    /* ===== 3) 分享任务 ===== */
    let shareTaskLine="";
    if(cfg.shareTaskUrl){
      try{
        let shareResp=await httpPost(cfg.shareTaskUrl,headers,JSON.stringify({page:1,size:20}));
        const listArr=Array.isArray(shareResp?.data?.list)?shareResp.data.list:[];
        const today=todayKey();
        const todayArr=listArr.filter(it=>toDateKeyFromSec(it?.occurrenceTime??0)===today);
        todayArr.forEach(it=>todayGainNcoin+=Number(it.count??0));
        if(todayGainNcoin>0) shareTaskLine=`今日分享奖励：+${todayGainNcoin} N币（分享任务奖励）`;
      }catch(e){ logWarn("分享任务异常：",e); }
    }

    /* ===== 4) 查询经验信息 ===== */
    let upgradeLine="", creditData={};
    try{
      const cr=await httpGet(END.creditInfo,headers);
      creditData=cr?.data||{};
      const credit=Number(creditData.credit??0);
      const level=creditData.level??null;
      let need=0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length>=2) need=creditData.credit_range[1]-credit;
      upgradeLine=`等级：LV.${level||0}\n当前经验：${credit}\n距离升级：${need} 经验`;
    }catch(e){ logWarn("经验查询异常：",e); }

    /* ===== 5) 查询 N币余额 ===== */
    let balLine="";
    try{
      const bal=await httpGet(END.balance,headers);
      if(bal?.code===0) balLine=`当前 N币：${bal.data?.balance??0}`;
    }catch(e){ logWarn("余额查询异常：",e); }

    /* ===== 6) 盲盒查询 ===== */
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList,headers);
      const notOpened=box?.data?.notOpenedBoxes??[];
      notOpened.forEach(b=>{ const target=Number(b.awardDays); const left=Number(b.leftDaysToOpen); const opened=Math.max(0,target-left); blindInfo.push({target,left,opened}); });
    }catch(e){ logWarn("盲盒查询异常：",e); }

    /* ===== 7) 自动开启盲盒 ===== */
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        if(Number(b.left)===0 && Number(b.target)===7){
          try{ const openR=await httpPost(END_OPEN.openSeven,headers,JSON.stringify({})); if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启"); }catch(e){ logWarn("开箱异常：",e); }
        }
      }
    }

    /* ===== 8) 美化通知生成 ===== */
    let notifyLines=[];
    if(signMsg) notifyLines.push(`🎉 ${signMsg}`);
    if(shareTaskLine) notifyLines.push(`🎯 ${shareTaskLine}`);
    if(upgradeLine) { notifyLines.push("\n📊 账户状态"); notifyLines.push(upgradeLine); }
    if(balLine) notifyLines.push(balLine);
    notifyLines.push(`- 补签卡：${signCards} 张`);
    notifyLines.push(`- 连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      notifyLines.push("\n🎁 盲盒进度");
      blindInfo.forEach(info=>{
        const width = info.target===7?18:(info.target===666?30:22);
        const bar=renderProgressBar(info.opened,info.target,cfg.progressStyle,width);
        notifyLines.push(`${info.target} 天盲盒：`);
        notifyLines.push(`[${bar}] ${info.opened}/${info.target} 天`);
      });
    }

    if(todayGainExp || todayGainNcoin){
      notifyLines.push("\n📌 今日获得：");
      if(todayGainExp) notifyLines.push(`- 积分：${todayGainExp}（签到奖励）`);
      if(todayGainNcoin) notifyLines.push(`- N币：${todayGainNcoin}（分享任务奖励）`);
    }

    const title=`${cfg.titlePrefix} · 今日签到结果`;
    const body=notifyLines.join("\n");
    if(cfg.notify && body){ notify(title,"",body); logInfo("发送通知：",body.replace(/\n/g," | ")); }
    else logInfo("通知已禁用或无内容，跳过发送。");

  }catch(e){ logWarn("主流程异常：",e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ logInfo("九号自动签到结束"); $done(); }
})();