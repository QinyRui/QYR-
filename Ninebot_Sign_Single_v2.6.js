/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · Loon插件兼容版）
 2025-11-29 修复版
 功能：抓包写入、自动签到、分享任务领取、盲盒开箱、经验/N币查询、通知美化
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// ================= Loon 插件兼容 $argument =================
if (typeof $argument === "undefined" || !$argument) $argument = {};

// ================= BoxJS 读取 =================
function readPS(key) { try { return HAS_PERSIST ? $persistentStore.read(key) : null; } catch (e) { return null; } }
function writePS(val,key){ try { return HAS_PERSIST ? $persistentStore.write(val,key) : false; } catch(e){ return false; } }
function notify(title, sub, body){ if(HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr(){ return new Date().toLocaleString(); }

// ================= BoxJS keys =================
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

// ================= Endpoints =================
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

// ================= Network =================
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts = 0;
    const once = ()=>{
      attempts++;
      const opts = {url, headers, timeout};
      if(method==="POST") opts.body = body===null?"{}":body;
      const cb = (err,resp,data)=>{
        if(err){
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){ setTimeout(once, RETRY_DELAY); return; } 
          else { reject(err); return; }
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts, cb); else $httpClient.post(opts, cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body="{}"){ return requestWithRetry({method:"POST",url,headers,body}); }

// ================= Logging =================
const debugLevel = Number($argument.debugLevel ?? readPS(KEY_DEBUG) ?? 1); // 0=关 1=信息 2=警告 3=详细
function logInfo(...args){ if(debugLevel>=1) console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ if(debugLevel>=2) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ if(debugLevel>=3) console.error(`[${nowStr()}] error ${args.join(" ")}`); }

// ================= Progress Bar =================
const PROGRESS_STYLES = [
  ["█","░"], ["▓","░"], ["▰","▱"], ["●","○"], ["■","□"], ["➤","·"], ["▮","▯"], ["⣿","⣀"]
];
const barStyle = Number($argument.barStyle ?? readPS(KEY_PROGRESS) ?? 0);
function renderProgressBar(current,total,styleIndex=0,length=20){
  try{
    styleIndex = Number(styleIndex)||0;
    if(styleIndex<0||styleIndex>PROGRESS_STYLES.length-1) styleIndex=0;
    const [FULL,EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0 ? current/total : 0;
    const filled = Math.round(ratio*length);
    const empty = Math.max(0,length-filled);
    return FULL.repeat(filled)+EMPTY.repeat(empty);
  }catch(e){ return "██████████----------"; }
}

// ================= 配置 =================
const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debug: debugLevel>=1,
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: barStyle
};

logInfo("九号自动签到开始", cfg);

// ================= 抓包写入 =================
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));

if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
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

    if(changed) notify(cfg.titlePrefix,"抓包成功 ✓","Authorization/DeviceId/User-Agent/分享接口已写入");
    else logInfo("抓包数据无变化");
  }catch(e){ logErr("抓包写入异常：", e); }
  $done({});
}

// ================= Helpers =================
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4) : s; }
function toDateKeyFromSec(sec){ const d=new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function makeHeaders(){ return { "Authorization": cfg.Authorization, "Content-Type":"application/json;charset=UTF-8", "device_id":cfg.DeviceId, "User-Agent":cfg.userAgent||"Mozilla/5.0", "platform":"h5", "Origin":"https://h5-bj.ninebot.com", "language":"zh" }; }

// ================= Main =================
(async()=>{
  try{
    const headers=makeHeaders();
    logInfo("查询签到状态...");
    let statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers).catch(e=>{ logWarn("状态请求异常：", e); return {}; });
    const statusData = statusResp?.data || {};
    const consecutiveDays = statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards = statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus = statusData?.currentSignStatus??null;
    const blindBoxStatus = statusData?.blindBoxStatus??null;

    let signMsg="", todayGainExp=0, todayGainNcoin=0, signResp=null;
    if(currentSignStatus===0||currentSignStatus===undefined||currentSignStatus===null){
      logInfo("今日未签到，执行签到...");
      signResp = await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId})).catch(e=>{ logWarn("签到异常：", e); return {}; });
      if(signResp && (signResp.code===0||signResp.code===1)){
        const nCoin = Number(signResp.data?.nCoin??signResp.data?.coin??0);
        const score = Number(signResp.data?.score??0);
        todayGainNcoin+=0; //签到奖励不算 N币
        todayGainExp+=score;
        signMsg=`🎉 今日签到：成功\n+${score} 经验（签到奖励）`;
      }else if(signResp.code===540004 || (signResp.msg&&/已签到/.test(signResp.msg))){
        signMsg=`🎉 今日签到：已签到`;
      }else{
        signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`;
        if(!cfg.notifyFail) signMsg="";
      }
    }else{ signMsg=`🎉 今日签到：已签到`; }

    // 分享任务 N币
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      let shareResp=null;
      try{
        shareResp = await httpPost(cfg.shareTaskUrl,headers,JSON.stringify({page:1,size:20})).catch(()=>httpGet(cfg.shareTaskUrl,headers));
        const listArr = Array.isArray(shareResp?.data?.list)?shareResp.data.list:Array.isArray(shareResp?.data)?shareResp.data:[];
        const today = todayKey();
        const todayArr = listArr.filter(it=>toDateKeyFromSec(it?.occurrenceTime??0)===today);
        todayArr.forEach(it=>{ shareGain+=Number(it.count??0); });
        if(shareGain>0) shareTaskLine=`+${shareGain} N币（分享任务奖励）`; todayGainNcoin+=shareGain;
      }catch(e){ logWarn("分享任务异常：", e); }
    }

    // 经验信息
    let upgradeLine="", creditData={};
    try{
      const cr = await httpGet(END.creditInfo, headers);
      creditData = cr?.data||{};
      const credit = Number(creditData.credit??0);
      const level = creditData.level??null;
      let need = 0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range && Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2){ need=creditData.credit_range[1]-credit; }
      upgradeLine=`等级：LV.${level}\n当前经验：${credit}\n距离升级：${need} 经验`;
    }catch(e){ logWarn("经验异常：", e); }

    // 余额
    let balLine="";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balLine=`当前 N币：${bal.data?.balance??bal.data?.coin??0}`;
    }catch(e){ logWarn("余额异常：", e); }

    // 盲盒
    let blindInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes??[];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays);
          const left=Number(b.leftDaysToOpen);
          const opened=Math.max(0,target-left);
          blindInfo.push({target,left,opened});
        });
      }
    }catch(e){ logWarn("盲盒异常：", e); }

    // 自动开箱
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){ if(b.left===0 && b.target===7){
        try{ const openR = await httpPost(END_OPEN.openSeven, headers, "{}"); if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启"); }catch(e){ logWarn("开箱异常：", e);}
      }}
    }

    // ================= 通知 =================
    let notifyLines=[];
    if(signMsg) notifyLines.push(signMsg);
    if(shareTaskLine) notifyLines.push(shareTaskLine);
    notifyLines.push(""); notifyLines.push("📊 账户状态");
    if(upgradeLine) notifyLines.push(upgradeLine);
    if(balLine) notifyLines.push(balLine);
    notifyLines.push(`补签卡：${signCards} 张`);
    notifyLines.push(`连续签到：${consecutiveDays} 天`);
    if(blindInfo.length>0){
      notifyLines.push(""); notifyLines.push("🎁 盲盒进度");
      blindInfo.forEach(info=>{
        const width = info.target===7?18:(info.target===666?30:22);
        const bar = renderProgressBar(info.opened,info.target,cfg.progressStyle,width);
        notifyLines.push(`${info.target}天盲盒：`); notifyLines.push(`[${bar}] ${info.opened} / ${info.target} 天`);
      });
    }
    if(todayGainExp||todayGainNcoin){ notifyLines.push(""); notifyLines.push(`🎯 今日获得：\n- 积分 ${todayGainExp}\n- N币 ${todayGainNcoin}`); }

    const title = `${cfg.titlePrefix} · 今日签到结果`;
    const body = notifyLines.join("\n");
    if(cfg.notify && body) { notify(title,"",body); logInfo("发送通知：", body.replace(/\n/g," | ")); }

  }catch(e){ logErr("脚本异常：", e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ logInfo("九号自动签到结束"); $done(); }
})();