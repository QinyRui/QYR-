/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · 插件参数整合版）
 2025-11-29 修复版
 功能：抓包写入、自动签到、分享任务领取、盲盒进度条、经验/N币查询、通知美化
 支持：
 1. 插件日志等级 debugLevel
 2. 插件盲盒进度条 barStyle
***********************************************/

/* 环境检测 */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* 辅助函数 */
function readPS(key){ try { return HAS_PERSIST ? $persistentStore.read(key) : null; } catch(e){ return null; } }
function writePS(val,key){ try { return HAS_PERSIST ? $persistentStore.write(val,key) : false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_SHARE = "ninebot.shareTaskUrl";
const KEY_PROGRESS = "ninebot.progressStyle";

/* 进度条样式（8种） */
const PROGRESS_STYLES = [
  ["█","░"], // 1 标准方块
  ["▓","░"], // 2 细线
  ["▰","▱"], // 3 分段条
  ["●","○"], // 4 粗条
  ["➤","·"], // 5 Emoji
  ["▮","▯"], // 6 圆角
  ["■","□"], // 7 边框
  ["⣿","⣀"]  // 8 双层
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

/* 日志函数：支持等级控制 */
function logInfo(...args){ if(cfg.debugLevel>=1) console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args){ if(cfg.debugLevel>=2) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logDebug(...args){ if(cfg.debugLevel>=3) console.log(`[${nowStr()}] debug ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* 网络请求封装，支持重试 */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once = ()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err&&(err.error||err.message||err));
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){
            logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(once,RETRY_DELAY);
            return;
          }else{ reject(err); return; }
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

/* 辅助 */
function mask(s){ return s&&s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s||""; }
function toDateKeyFromSec(sec){ const d=new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* 抓包写入处理 */
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
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",base); }
    }
    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入 BoxJS");
  }catch(e){ logErr("抓包写入异常：",e); }
  $done({});
}

/* 读取配置：插件参数优先，BoxJS回退 */
const argDebugLevel = IS_ARG && $argument && $argument.debugLevel!==undefined ? Number($argument.debugLevel) : null;
const argBarStyle = IS_ARG && $argument && $argument.barStyle!==undefined ? Number($argument.barStyle) : null;
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debugLevel: argDebugLevel!==null?argDebugLevel:Number(readPS(KEY_DEBUG)||1),
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: argBarStyle!==null?argBarStyle:Number(readPS(KEY_PROGRESS)||0)
};

logInfo("九号自动签到开始", cfg);

if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并执行签到/分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

/* 主流程 */
(async ()=>{
  try{
    const headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json;charset=UTF-8",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform":"h5",
      "Origin":"https://h5-bj.ninebot.com",
      "language":"zh"
    };

    // 查询签到状态
    logInfo("查询签到状态...");
    let statusResp=null;
    try{ statusResp=await httpGet(`https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status?t=${Date.now()}`,headers); }
    catch(e){ logWarn("状态请求异常：",String(e)); }
    const statusData=statusResp?.data||{};
    const consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus=statusData?.currentSignStatus??0;
    const blindBoxStatus=statusData?.blindBoxStatus??null;

    // 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0, signResp=null;
    if(currentSignStatus===0){
      logInfo("今日未签到，执行签到...");
      try{ signResp=await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",headers,JSON.stringify({deviceId:cfg.DeviceId})); }
      catch(e){ logWarn("签到请求异常：",String(e)); }
      if(signResp){
        if(signResp.code===0||signResp.code===1){
          const nCoin=0; // 签到只给经验
          const score=Number(signResp.data?.score??0);
          todayGainExp+=score;
          signMsg=`🎉 今日签到：成功\n+${score} 经验（签到奖励）`;
        }else if(signResp.code===540004||/已签到/.test(signResp.msg)){ signMsg="🎉 今日签到：已签到"; }
        else{ signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
      } else{ signMsg="❌ 签到请求无响应或解析失败"; if(!cfg.notifyFail) signMsg=""; }
    } else signMsg="🎉 今日签到：已签到";

    // 分享任务 -> N币
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      try{
        let shareResp=null;
        try{ shareResp=await httpGet(cfg.shareTaskUrl,headers); } catch(e){ logWarn("分享任务 GET 异常：",String(e)); }
        const listArr=Array.isArray(shareResp?.data?.list)?shareResp.data.list:[];
        if(listArr.length>0){
          const today=todayKey();
          const todayArr=listArr.filter(it=>toDateKeyFromSec(it.occurrenceTime)===today);
          todayArr.forEach(it=>{ shareGain+=Number(it.count??0); });
          if(shareGain>0) shareTaskLine=`- 今日分享奖励：+${shareGain} N币`;
          todayGainNcoin+=shareGain;
        }
      }catch(e){ logWarn("分享任务处理异常：",String(e)); }
    }

    // 查询经验 / 等级
    let upgradeLine="", creditData={};
    try{
      const cr=await httpGet("https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",headers);
      creditData=cr?.data||{};
      const credit=Number(creditData.credit??0);
      const level=creditData.level??null;
      let need=0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range&&Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2) need=creditData.credit_range[1]-credit;
      upgradeLine=`等级：${level?`LV.${level}`:"-"}\n当前经验：${credit}\n距离升级：${need} 经验`;
    }catch(e){ logWarn("经验查询异常：",String(e)); }

    // 余额
    let balLine="";
    try{ const bal=await httpGet("https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",headers); if(bal?.code===0) balLine=`当前 N币：${bal.data?.balance??0}`; }catch(e){ logWarn("余额查询异常：",String(e)); }

    // 盲盒列表
    let blindInfo=[];
    try{
      const box=await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{
        const target=Number(b.awardDays);
        const left=Number(b.leftDaysToOpen);
        const opened=Math.max(0,target-left);
        blindInfo.push({target,left,opened});
      });
    }catch(e){ logWarn("盲盒查询异常：",String(e)); }

    // 自动开启盲盒
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        if(b.left===0 && b.target===7){
          try{
            const openR=await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",headers,JSON.stringify({}));
            if(openR?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启并领取奖励");
          }catch(e){ logWarn("7天盲盒开箱异常：",String(e)); }
        }
      }
    }

    // 组织通知（美化）
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
      notifyLines.push("📦 盲盒进度");
      blindInfo.forEach(info=>{
        const width=info.target===7?18:(info.target===666?30:22);
        const bar=renderProgressBar(info.opened,info.target,cfg.progressStyle,width);
        notifyLines.push(`${info.target}天盲盒：`);
        notifyLines.push(`[${bar}] ${info.opened}/${info.target}天`);
      });
    }

    if(todayGainExp||todayGainNcoin){
      notifyLines.push("");
      notifyLines.push(`🎯 今日获得：`);
      if(todayGainExp) notifyLines.push(`- 积分 ${todayGainExp}`);
      if(todayGainNcoin) notifyLines.push(`- N币 ${todayGainNcoin}（分享任务奖励）`);
    }

    const title=`${cfg.titlePrefix} · 今日签到结果`;
    const body=notifyLines.join("\n");
    if(cfg.notify && body) { notify(title,"",body); logInfo("发送通知：",body.replace(/\n/g," | ")); }
    else logInfo("通知已禁用或无内容，跳过发送。");

  }catch(e){ logErr("主流程未捕获异常：",e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ logInfo("九号自动签到结束"); $done(); }
})();