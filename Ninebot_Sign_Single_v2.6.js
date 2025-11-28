/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · 日志等级+盲盒样式可选）
 2025-11-30 修复版
 功能：
 - 自动签到/分享任务领取
 - 盲盒开箱
 - 经验/N币查询
 - 通知美化
 - 日志等级可选
 - 盲盒进度条样式可选
***********************************************/

/* ENV wrapper (兼容 Loon/QuanX/Surge) */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* 读取/写入 BoxJS */
function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }

/* 通知封装 */
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }

/* 获取当前时间字符串 */
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.logLevel"; // 日志等级
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_SHARE = "ninebot.shareTaskUrl";
const KEY_PROGRESS = "ninebot.progressStyle"; // 盲盒样式

/* 日志等级控制 */
const LOG_LEVEL = (IS_ARG && $argument && $argument.logLevel)
                  ? $argument.logLevel
                  : (readPS(KEY_DEBUG) || "info");
function logInfo(...args){ if(["info","debug"].includes(LOG_LEVEL)) console.log(`[${nowStr()}] info`, ...args); }
function logWarn(...args){ if(["warn","debug"].includes(LOG_LEVEL)) console.warn(`[${nowStr()}] warn`, ...args); }
function logErr(...args){ if(["error","warn","info","debug"].includes(LOG_LEVEL)) console.error(`[${nowStr()}] error`, ...args); }

/* 盲盒进度条样式（8种） */
const PROGRESS_STYLES = [
  ["█","░"], // 样式1
  ["▓","░"], // 样式2
  ["▰","▱"], // 样式3
  ["●","○"], // 样式4
  ["■","□"], // 样式5
  ["➤","·"], // 样式6
  ["▮","▯"], // 样式7
  ["⣿","⣀"]  // 样式8
];
function renderProgressBar(current,total,styleIndex=0,length=20){
  try{
    styleIndex = Number(styleIndex)||0;
    if(styleIndex<0||styleIndex>PROGRESS_STYLES.length-1) styleIndex=0;
    const [FULL,EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0 ? current/total : 0;
    const filled = Math.round(ratio*length);
    const empty = Math.max(0,length-filled);
    return FULL.repeat(filled)+EMPTY.repeat(empty);
  }catch(e){
    return "██████████----------";
  }
}

/* Endpoints */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry helper */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once = ()=>{
      attempts++;
      const opts = {url,headers,timeout};
      if(method==="POST") opts.body = body===null?"{}":body;
      const cb = (err,resp,data)=>{
        if(err){
          const msg=String(err && (err.error||err.message||err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){
            logWarn("请求错误：",msg,`重试 ${attempts}/${MAX_RETRY}`);
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

/* Read config from plugin args or BoxJS */
const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debug: readPS(KEY_DEBUG)!=="false",
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: (IS_ARG && $argument && $argument.barStyle!==undefined)
                  ? Number($argument.barStyle)
                  : Number(readPS(KEY_PROGRESS)||0),
  logLevel: LOG_LEVEL
};

logInfo("九号自动签到开始，当前配置：", cfg);

/* 检查 Token */
if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包并在九号 APP 执行签到/分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("未读取到账号信息（Authorization/DeviceId）");
  $done();
}

/* Helpers */
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d=new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* Compose headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
    "platform":"h5",
    "Origin":"https://h5-bj.ninebot.com",
    "language":"zh"
  };
}

/* 主流程 */
(async()=>{
  try{
    const headers = makeHeaders();

    // 1) 查询签到状态
    logInfo("查询签到状态...");
    let statusResp = null;
    try{ statusResp = await httpGet(`${END.status}?t=${Date.now()}`,headers); }
    catch(e){ logWarn("状态请求异常：",String(e)); }
    const statusData = statusResp?.data||{};
    const consecutiveDays = statusData?.consecutiveDays ?? statusData?.continuousDays ?? 0;
    const signCards = statusData?.signCardsNum ?? statusData?.remedyCard ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? 0;
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    // 2) 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0, signResp=null;
    if(currentSignStatus===0){
      logInfo("今日未签到，执行签到...");
      try{ signResp = await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId})); }
      catch(e){ logWarn("签到请求异常：",String(e)); }
      if(signResp && (signResp.code===0||signResp.code===1)){
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainExp += score;
        todayGainNcoin += 0;
        signMsg = `🎉 今日签到：成功\n+${score} 经验（签到奖励）`;
      }else if(signResp?.msg && /已签到/.test(signResp.msg)){
        signMsg = `🎉 今日签到：已签到`;
      }else{
        signMsg = `❌ 签到失败：${signResp?.msg||JSON.stringify(signResp)}`;
        if(!cfg.notifyFail) signMsg="";
      }
    }else{
      signMsg = `🎉 今日签到：已签到`;
    }

    // 3) 分享任务（N币）
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      try{
        logInfo("查询分享任务接口：",cfg.shareTaskUrl);
        let shareResp = null;
        try{ shareResp = await httpGet(cfg.shareTaskUrl,headers); }catch(e){ logWarn("分享任务请求失败",String(e)); }
        const listArr = Array.isArray(shareResp?.data?.list)?shareResp.data.list:[];
        if(listArr.length>0){
          const today = todayKey();
          const todayArr = listArr.filter(it=>{
            try{
              const t = Number(it?.occurrenceTime||0);
              return toDateKeyFromSec(t)===today;
            }catch(e){return false;}
          });
          todayArr.forEach(it=>{ shareGain += Number(it.count ?? 0); });
          if(shareGain>0) shareTaskLine = `+${shareGain} N币（分享任务奖励）`;
          todayGainNcoin += shareGain;
        }
      }catch(e){ logWarn("分享任务处理异常：",String(e)); }
    }

    // 4) 查询经验/N币
    let upgradeLine="", balLine="";
    try{
      const cr = await httpGet(END.creditInfo,headers);
      const creditData = cr?.data||{};
      const credit = Number(creditData.credit ?? 0);
      const level = creditData.level ?? null;
      let need = 0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length>=2){ need=creditData.credit_range[1]-credit; }
      upgradeLine = `等级：LV.${level}\n当前经验：${credit}\n距离升级：${need} 经验`;
    }catch(e){ logWarn("经验信息查询异常：",String(e)); }

    try{
      const bal = await httpGet(END.balance,headers);
      if(bal?.code===0) balLine = `当前 N币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
    }catch(e){ logWarn("余额查询异常：",String(e)); }

    // 5) 盲盒
    let blindInfo=[];
    try{
      const box = await httpGet(END.blindBoxList,headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays);
          const left=Number(b.leftDaysToOpen);
          const opened=Math.max(0,target-left);
          blindInfo.push({target,left,opened});
        });
      }
    }catch(e){ logWarn("盲盒查询异常：",String(e)); }

    // 6) 自动开启7天盲盒
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        try{
          if(Number(b.left)===0 && Number(b.target)===7){
            const openR = await httpPost(END_OPEN.openSeven,headers,JSON.stringify({}));
            logInfo("7天盲盒开箱返回：",openR);
            if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启并领取奖励");
          }
        }catch(e){ logWarn("盲盒自动开启异常：",String(e)); }
      }
    }

    // 7) 通知内容
    let notifyLines=[];
    if(signMsg) notifyLines.push(signMsg);
    if(shareTaskLine) notifyLines.push(shareTaskLine);
    if(upgradeLine){ notifyLines.push(""); notifyLines.push("📊 账户状态"); notifyLines.push(upgradeLine); }
    if(balLine) notifyLines.push(balLine);
    notifyLines.push(`补签卡：${signCards} 张`);
    notifyLines.push(`连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      notifyLines.push("");
      notifyLines.push("🎁 盲盒进度");
      blindInfo.forEach(info=>{
        const width = info.target===7?18:(info.target===666?30:22);
        const bar = renderProgressBar(info.opened,info.target,cfg.progressStyle,width);
        notifyLines.push(`${info.target}天盲盒：`);
        notifyLines.push(`[${bar}] ${info.opened}/${info.target} 天`);
      });
    }

    if(todayGainExp || todayGainNcoin){
      notifyLines.push("");
      notifyLines.push(`🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`);
    }

    const title = `${cfg.titlePrefix} · 今日签到结果`;
    const body = notifyLines.join("\n");

    if(cfg.notify && body){ notify(title,"",body); logInfo("发送通知：",body.replace(/\n/g," | ")); }
    else logInfo("通知已禁用或无内容");

  }catch(e){
    logErr("主流程未捕获异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }finally{
    logInfo("九号自动签到结束");
    $done();
  }
})();