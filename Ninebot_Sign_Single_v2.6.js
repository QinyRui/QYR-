/***********************************************
 九号智能电动车自动签到脚本（含分享奖励）
 脚本版本：v2.6
 更新时间：2025-11-29
 功能：
  - 抓包自动写入 Authorization / DeviceId / User-Agent / 分享任务 URL
  - 自动签到，自动领取盲盒奖励
  - 支持分享任务 N币统计
  - 通知美化（今日签到、经验、N币、补签卡、盲盒进度）
  - 插件参数优先：通知开关、日志等级、盲盒进度条样式、抓包开关、自定义标题
 ***********************************************/

/* -------------------- 环境判断 -------------------- */
const IS_REQUEST = typeof $request !== "undefined";   // 是否抓包请求
const IS_ARG = typeof $argument !== "undefined";      // 是否通过插件传入参数
const HAS_PERSIST = typeof $persistentStore !== "undefined"; // 是否支持持久存储
const HAS_NOTIFY = typeof $notification !== "undefined";     // 是否支持通知
const HAS_HTTP = typeof $httpClient !== "undefined";         // 是否支持 HTTP 请求

/* -------------------- 持久化存储助手 -------------------- */
function readPS(key) { try { return HAS_PERSIST ? $persistentStore.read(key) : null; } catch(e){return null;} }
function writePS(val,key){ try { return HAS_PERSIST ? $persistentStore.write(val,key) : false; } catch(e){return false;} }

/* -------------------- 通知助手 -------------------- */
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* -------------------- BoxJS / 插件 key -------------------- */
const KEY_AUTH = "ninebot.authorization";      // 授权
const KEY_DEV = "ninebot.deviceId";           // 设备 ID
const KEY_UA = "ninebot.userAgent";           // UA
const KEY_DEBUG = "ninebot.debug";            // 调试日志开关
const KEY_NOTIFY = "ninebot.notify";          // 通知开关
const KEY_AUTOBOX = "ninebot.autoOpenBox";    // 自动开盲盒
const KEY_AUTOREPAIR = "ninebot.autoRepair";  // 自动补签（暂未实现）
const KEY_NOTIFYFAIL = "ninebot.notifyFail";  // 签到失败通知
const KEY_TITLE = "ninebot.titlePrefix";      // 自定义通知标题
const KEY_SHARE = "ninebot.shareTaskUrl";     // 分享任务 URL
const KEY_PROGRESS = "ninebot.progressStyle"; // 盲盒进度条样式

/* -------------------- 接口地址 -------------------- */
const END = {
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",                  // 签到
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",              // 签到状态
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",// 盲盒列表
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", // N币余额
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",                      // 经验/等级
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"              // 任务奖励
};
const END_OPEN = { openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" }; // 7天盲盒开箱

/* -------------------- 网络请求重试 -------------------- */
const MAX_RETRY = 3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body = body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err && (err.error||err.message||err));
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
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

/* -------------------- 日志 -------------------- */
function logInfo(...args){ if(cfg.debug) console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ if(cfg.debug) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ if(cfg.debug) console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* -------------------- 盲盒进度条样式 -------------------- */
const PROGRESS_STYLES=[
  ["█","░"],["▓","░"],["▰","▱"],["●","○"],["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]
];
function renderProgressBar(current,total,styleIndex=0,length=20){
  try{
    styleIndex = Number(styleIndex)||0;
    if(styleIndex<0||styleIndex>=PROGRESS_STYLES.length) styleIndex=0;
    const [FULL,EMPTY]=PROGRESS_STYLES[styleIndex];
    const ratio=total>0?current/total:0;
    const filled=Math.round(ratio*length);
    const empty=Math.max(0,length-filled);
    return FULL.repeat(filled)+EMPTY.repeat(empty);
  }catch(e){ return "██████████----------"; }
}

/* -------------------- 抓包写入 -------------------- */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
if(IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u))){
  try{
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){ const base=capUrl.split("?")[0]; if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; } }
    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / 分享任务 URL 已写入 BoxJS");
  }catch(e){ logErr("抓包写入异常：",e); }
  $done({});
}

/* -------------------- 插件参数优先配置 -------------------- */
const argNotify = IS_ARG && $argument.notify!==undefined?($argument.notify==="true"):null;
const argBarStyle = IS_ARG && $argument.barStyle!==undefined?Number($argument.barStyle)-1:null;
const argTitle = IS_ARG && $argument.titlePrefix? $argument.titlePrefix : null;
const argDebug = IS_ARG && $argument.debug!==undefined?($argument.debug==="true"):null;

const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  notify: argNotify!==null?argNotify:(readPS(KEY_NOTIFY)!=="false"),
  debug: argDebug!==null?argDebug:(readPS(KEY_DEBUG)!=="false"),
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: argTitle||(readPS(KEY_TITLE)||"九号签到"),
  progressStyle: argBarStyle!==null?argBarStyle:Number(readPS(KEY_PROGRESS)||0)
};

/* -------------------- 验证账号 -------------------- */
if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）"); $done();
}

/* -------------------- 日期 / 辅助 -------------------- */
function mask(s){if(!s) return "";return s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s;}
function toDateKeyFromSec(sec){const d=new Date(Number(sec)*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function makeHeaders(){ return {"Authorization":cfg.Authorization,"Content-Type":"application/json;charset=UTF-8","device_id":cfg.DeviceId,"User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6","platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"}; }

/* -------------------- 主流程 -------------------- */
(async()=>{
  try{
    const headers = makeHeaders();
    logInfo("九号自动签到开始");

    // 查询签到状态
    let statusResp = await httpGet(`${END.status}?t=${Date.now()}`,headers).catch(e=>{logWarn("状态请求异常：",String(e)); return {};});
    const statusData = statusResp?.data||{};
    const consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
    const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
    const currentSignStatus=statusData?.currentSignStatus??0;

    // 执行签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0, signResp=null;
    if(currentSignStatus===0){
      signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId})).catch(e=>{logWarn("签到请求异常：",String(e)); return {};});
      if(signResp?.code===0 || signResp?.code===1){
        const score=Number(signResp.data?.score??0);
        todayGainExp+=score;
        signMsg=`🎉 今日签到：成功\n+${score} 经验（签到奖励）`;
      } else signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`;
    } else signMsg=`🎉 今日签到：成功`;

    // 分享任务统计 N币
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      let shareResp=null;
      shareResp=await httpGet(cfg.shareTaskUrl,headers).catch(e=>logWarn("分享查询失败",String(e)));
      const listArr = Array.isArray(shareResp?.data?.list)?shareResp.data.list:[];
      const today=todayKey();
      const todayArr = listArr.filter(it=>toDateKeyFromSec(it?.occurrenceTime||0)===today);
      todayArr.forEach(it=>{ shareGain+=Number(it.count??0); });
      if(shareGain>0) shareTaskLine=`- N币奖励（分享任务）：+${shareGain}`;
      todayGainNcoin+=shareGain;
    }

    // 查询经验 / 等级
    let upgradeLine="", creditData={};
    try{
      const cr=await httpGet(END.creditInfo,headers);
      creditData=cr?.data||{};
      const credit=Number(creditData.credit??0);
      const level=creditData.level??"-";
      let need=0;
      if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m&&m[1]) need=Number(m[1]); }
      else if(creditData.credit_range && Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2) need=creditData.credit_range[1]-credit;
      upgradeLine=`等级：LV.${level}\n当前经验：${credit}\n距离升级：${need} 经验`;
    }catch(e){ logWarn("经验查询异常",String(e)); }

    // 查询余额
    let balLine="";
    try{
      const bal=await httpGet(END.balance,headers);
      if(bal?.code===0) balLine=`当前 N币：${bal.data?.balance??0}`;
    }catch(e){ logWarn("余额查询异常",String(e)); }

    // 查询盲盒列表
    let blindInfo=[];
    try{
      const box = await httpGet(END.blindBoxList,headers);
      const notOpened = box?.data?.notOpenedBoxes??[];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{ const target=Number(b.awardDays), left=Number(b.leftDaysToOpen), opened=Math.max(0,target-left); blindInfo.push({target,left,opened}); });
      }
    }catch(e){ logWarn("盲盒查询异常",String(e)); }

    // 自动开启盲盒（7天盲盒）
    if(cfg.autoOpenBox && blindInfo.length>0){
      for(const b of blindInfo){
        try{ if(Number(b.left)===0 && Number(b.target)===7){ await httpPost(END_OPEN.openSeven,headers,JSON.stringify({})); notify(cfg.titlePrefix,"盲盒开启","7天盲盒已自动开启"); } }
        catch(e){ logWarn("盲盒开箱异常",String(e)); }
      }
    }

    // 组织通知内容
    let notifyLines=[];
    if(signMsg) notifyLines.push(signMsg);
    if(shareTaskLine) notifyLines.push(shareTaskLine);
    if(upgradeLine) { notifyLines.push("\n📊 账户状态"); notifyLines.push(upgradeLine); }
    if(balLine) notifyLines.push(balLine);
    notifyLines.push(`补签卡：${signCards} 张`);
    notifyLines.push(`连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      notifyLines.push("\n📦 盲盒进度");
      blindInfo.forEach(info=>{
        const width = info.target===7?18:(info.target===666?30:22);
        const bar = renderProgressBar(info.opened,info.target,cfg.progressStyle,width);
        notifyLines.push(`${info.target} 天盲盒：`);
        notifyLines.push(`[${bar}] ${info.opened} / ${info.target} 天`);
      });
    }

    if(todayGainExp || todayGainNcoin) notifyLines.push(`\n🎯 今日获得：\n- 积分 ${todayGainExp}\n- N币 ${todayGainNcoin}（分享任务奖励）`);

    const title = `${cfg.titlePrefix} · 今日签到结果`;
    const body = notifyLines.join("\n");
    if(cfg.notify && body) { notify(title,"",body); logInfo("发送通知：",body.replace(/\n/g," | ")); }
    else logInfo("通知已禁用或无内容，跳过发送。");

  }catch(e){ logErr("主流程异常：",e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ logInfo("九号自动签到结束"); $done(); }
})();