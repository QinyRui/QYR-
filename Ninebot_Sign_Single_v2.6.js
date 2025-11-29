/***********************************************
 Ninebot_Sign_Single_v2.6.js  —— ES5 完全兼容版（最终整合版）
 2025-11-30 完整整合版
 功能：抓包写入、自动签到、分享任务领取、盲盒开箱、经验/N币查询、通知美化
***********************************************/

// ---------- 环境检测 ----------
var IS_REQUEST = (typeof $request !== "undefined");
var HAS_PERSIST = (typeof $persistentStore !== "undefined");
var HAS_NOTIFY = (typeof $notification !== "undefined");
var HAS_HTTP = (typeof $httpClient !== "undefined");

// ---------- 安全读取 $argument ----------
if (typeof $argument === "undefined" || !$argument) {
  try { $argument = {}; } catch (e) { $argument = {}; }
} else {
  try {
    if (typeof $argument === "string") $argument = JSON.parse($argument);
  } catch (e) { if (typeof $argument !== "object") $argument = {}; }
}

// ---------- BoxJS helpers ----------
function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; }catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; }catch(e){ return false; } }
function notify(title,sub,body){ try{ if(HAS_NOTIFY) $notification.post(title,sub,body); }catch(e){} }
function nowStr(){ return new Date().toLocaleString(); }

// ---------- BoxJS keys ----------
var KEY_AUTH = "ninebot.authorization";
var KEY_DEV = "ninebot.deviceId";
var KEY_UA = "ninebot.userAgent";
var KEY_DEBUG = "ninebot.debugLevel";
var KEY_NOTIFY = "ninebot.notify";         // 控制抓包通知
var KEY_AUTOBOX = "ninebot.autoOpenBox";
var KEY_AUTOREPAIR = "ninebot.autoRepair";
var KEY_NOTIFYFAIL = "ninebot.notifyFail";
var KEY_TITLE = "ninebot.titlePrefix";      // ✅ 修复报错
var KEY_SHARE = "ninebot.shareTaskUrl";
var KEY_PROGRESS = "ninebot.progressStyle";

// ---------- Endpoints ----------
var END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
var END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

// ---------- Network retry ----------
var MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function requestWithRetry(options){
  return new Promise(function(resolve,reject){
    var attempts=0;
    function once(){
      attempts++;
      var opts={ url:options.url, headers:options.headers||{}, timeout:REQUEST_TIMEOUT };
      if(options.method==="POST") opts.body=(options.body===null?"{}":options.body);
      var cb=function(err,resp,data){
        if(err){
          var msg=String(err&&(err.error||err.message||err));
          var shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){ setTimeout(once,RETRY_DELAY); return; } else { reject(err); return; }
        }
        try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); }
      };
      if(options.method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    }
    once();
  });
}
function httpGet(url,headers){ return requestWithRetry({method:"GET",url:url,headers:headers||{}}); }
function httpPost(url,headers,body){ return requestWithRetry({method:"POST",url:url,headers:headers||{},body:body||"{}"}); }

// ---------- Logging ----------
function safeNum(v,def){ var n=Number(v); return isNaN(n)?def:n; }
var argDebugLevel=safeNum($argument.debugLevel,null);
var savedDebug=readPS(KEY_DEBUG);
var debugLevel=1;
if(argDebugLevel!==null) debugLevel=argDebugLevel;
else if(savedDebug!==null) debugLevel=safeNum(savedDebug,1);
function logInfo(){ if(debugLevel>=1){ try{ console.log("["+nowStr()+"] info "+Array.prototype.slice.call(arguments).join(" ")); }catch(e){} } }
function logWarn(){ if(debugLevel>=2){ try{ console.warn("["+nowStr()+"] warn "+Array.prototype.slice.call(arguments).join(" ")); }catch(e){} } }
function logDebug(){ if(debugLevel>=3){ try{ console.log("["+nowStr()+"] debug "+Array.prototype.slice.call(arguments).join(" ")); }catch(e){} } }
function logErr(){ try{ console.error("["+nowStr()+"] error "+Array.prototype.slice.call(arguments).join(" ")); }catch(e){} }

// ---------- Progress bar ----------
var PROGRESS_STYLES=[["█","░"],["▓","░"],["▰","▱"],["●","○"],["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]];
var argBarStyle=safeNum($argument.barStyle,null);
var savedBar=readPS(KEY_PROGRESS);
var progressStyle=0;
if(argBarStyle!==null) progressStyle=argBarStyle;
else if(savedBar!==null) progressStyle=safeNum(savedBar,0);
function renderProgressBar(current,total,styleIndex,length){
  try{
    styleIndex=safeNum(styleIndex,0);
    if(styleIndex<0||styleIndex>=PROGRESS_STYLES.length) styleIndex=0;
    length=safeNum(length,20);
    var pair=PROGRESS_STYLES[styleIndex],FULL=pair[0],EMPTY=pair[1];
    var ratio=(total>0)?current/total:0;
    var filled=Math.round(ratio*length); if(filled<0) filled=0; if(filled>length) filled=length;
    var s="",i;
    for(i=0;i<filled;i++) s+=FULL; for(i=0;i<(length-filled);i++) s+=EMPTY;
    return s;
  }catch(e){ return "██████████----------"; }
}

// ---------- Utilities ----------
function mask(s){ if(!s)return""; if(s.length>8)return s.slice(0,6)+"..."+s.slice(-4); return s; }
function toDateKeyFromSec(sec){ try{ var d=new Date(Number(sec)*1000); return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2); }catch(e){ return ""; } }
function todayKey(){ var d=new Date(); return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2); }

// ---------- Read config ----------
var cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debugLevel: debugLevel,
  notify: (readPS(KEY_NOTIFY)==="false")?false:true,   // ✅ 控制抓包通知
  autoOpenBox: (readPS(KEY_AUTOBOX)==="true"),
  autoRepair: (readPS(KEY_AUTOREPAIR)==="true"),
  notifyFail: (readPS(KEY_NOTIFYFAIL)==="false")?false:true,
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: progressStyle
};
logInfo("当前配置：", JSON.stringify({ notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle }));

// ---------- Basic check ----------
if(!cfg.Authorization||!cfg.DeviceId){
  if(cfg.notify) notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并在九号 App 中执行签到或分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

// ---------- Capture handling ----------
var CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
var isCaptureRequest = IS_REQUEST && $request && $request.url && (function(){ for(var i=0;i<CAPTURE_PATTERNS.length;i++) if($request.url.indexOf(CAPTURE_PATTERNS[i])!==-1) return true; return false; }());
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    var h=$request.headers||{};
    var auth=h["Authorization"]||h["authorization"]||"";
    var dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    var ua=h["User-Agent"]||h["user-agent"]||"";
    var capUrl=$request.url||"";
    logInfo("抓包捕获 URL：",capUrl);
    logInfo("抓包 Header（部分隐藏）：",JSON.stringify({Authorization:mask(auth),DeviceId:mask(dev),UA:ua?"[present]":"[missing]"}));
    var changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.indexOf("/service/2/app_log/")!==-1){ var baseShare=capUrl.split("?")[0]; if(readPS(KEY_SHARE)!==baseShare){ writePS(baseShare,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",baseShare); } }
    if(cfg.notify && changed){ notify(cfg.titlePrefix,"抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS"); logInfo("抓包写入成功"); }
    else logInfo("抓包数据无变化或通知被关闭");
  }catch(e){ logErr("抓包写入异常：",String(e)); }
  $done();
}

// ---------- Main flow ----------
(async function(){
  try{
    var headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json;charset=UTF-8",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform":"h5",
      "Origin":"https://h5-bj.ninebot.com",
      "language":"zh"
    };

    // 1) status
    logInfo("查询签到状态...");
    var st=null;
    try{ st=await httpGet(END.status+"?t="+Date.now(),headers); }catch(e){ logWarn("状态请求异常：",String(e)); st={}; }
    var statusData=st&&st.data?st.data:{};
    var consecutiveDays=(typeof statusData.consecutiveDays!=="undefined")?statusData.consecutiveDays:((typeof statusData.continuousDays!=="undefined")?statusData.continuousDays:0);
    var signCards=(typeof statusData.signCardsNum!=="undefined")?statusData.signCardsNum:((typeof statusData.remedyCard!=="undefined")?statusData.remedyCard:0);
    var currentSignStatus=(typeof statusData.currentSignStatus!=="undefined")?statusData.currentSignStatus:null;
    var blindBoxStatus=(typeof statusData.blindBoxStatus!=="undefined")?statusData.blindBoxStatus:null;
    logInfo("签到状态：",JSON.stringify({consecutiveDays:consecutiveDays,signCards:signCards,currentSignStatus:currentSignStatus,blindBoxStatus:blindBoxStatus}));

    // 2) 自动签到
    var signMsg="",todayGainExp=0,todayGainNcoin=0,signResp=null;
    if(currentSignStatus===0||currentSignStatus===null||typeof currentSignStatus==="undefined"){
      logInfo("今日未签到，尝试签到...");
      try{ signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId})); }catch(e){ logWarn("签到请求异常：",String(e)); signResp=null; }
      if(signResp){
        if(signResp.code===0||signResp.code===1){
          var score=safeNum((signResp.data&&signResp.data.score)?signResp.data.score:0,0);
          var nCoin=safeNum((signResp.data&&(signResp.data.nCoin||signResp.data.coin))?(signResp.data.nCoin||signResp.data.coin):0,0);
          todayGainExp+=score; todayGainNcoin+=nCoin;
          signMsg="🎉 今日签到：成功\n+"+score+" 经验（签到奖励）";
          logInfo("签到成功：",signResp);
        }else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))){
          signMsg="🎉 今日签到：已签到"; logInfo("签到接口反馈：已签到");
        }else{
          signMsg="❌ 签到失败："+(signResp.msg?signResp.msg:JSON.stringify(signResp));
          logWarn("签到失败：",signResp);
          if(!cfg.notifyFail) signMsg="";
        }
      }else{ signMsg="❌ 签到请求异常（网络/超时）"; if(!cfg.notifyFail) signMsg=""; }
    }else{ signMsg="🎉 今日签到：已签到"; logInfo("今日已签到，跳过签到接口调用"); }

    // 3) 分享任务
    var shareTaskLine="";
    try{
      if(cfg.shareTaskUrl){
        logInfo("尝试查询分享任务接口：",cfg.shareTaskUrl);
        var shareResp=null;
        try{ shareResp=await httpGet(cfg.shareTaskUrl,headers); }catch(e){ logWarn("分享 GET 异常：",String(e)); try{ shareResp=await httpPost(cfg.shareTaskUrl,headers,JSON.stringify({page:1,size:20})); }catch(e2){ logWarn("分享 POST 也失败：",String(e2)); shareResp=null; } }
        logDebug("分享任务原始数据：",JSON.stringify(shareResp));
        var listArr=[]; if(shareResp&&shareResp.data){
          if(Object.prototype.toString.call(shareResp.data.list)==="[object Array]") listArr=shareResp.data.list;
          else if(Object.prototype.toString.call(shareResp.data)==="[object Array]") listArr=shareResp.data;
        }
        if(listArr.length>0){
          var today=todayKey(),i,item; for(i=0;i<listArr.length;i++){ item=listArr[i];
            try{ var occ=item.occurrenceTime||item.time||item.ts||item.create_date||0; if(!occ) continue; var dkey=toDateKeyFromSec(Number(occ)); if(dkey===today){ todayGainNcoin+=safeNum(item.count||item.credit||item.score,0); } }catch(e){ continue; }
          }
          if(todayGainNcoin>0) shareTaskLine="🎁 今日分享奖励：+"+todayGainNcoin+" N币（分享任务）";
        }else logInfo("分享任务接口返回无列表或格式不支持：",JSON.stringify(shareResp));
      }else logInfo("未配置 shareTaskUrl，跳过分享任务处理");
    }catch(e){ logWarn("分享任务处理异常：",String(e)); }

    // 4) 经验 / 升级
    var upgradeLine="";
    try{
      var creditInfo=await httpGet(END.creditInfo,headers).catch(function(e){ logWarn("经验接口异常：",String(e)); return null; });
      if(creditInfo&&creditInfo.data){
        var data=creditInfo.data;
        var credit=safeNum(data.credit,0),level=(data.level!==undefined)?data.level:null,need=0;
        if(data.credit_upgrade){ try{ var m=String(data.credit_upgrade).match(/还需\s*([0-9]+)/); if(m&&m[1]) need=safeNum(m[1],0); }catch(e){} }
        else if(data.credit_range&&Object.prototype.toString.call(data.credit_range)==="[object Array]"&&data.credit_range.length>=2) need=safeNum((data.credit_range[1]-credit),0);
        upgradeLine="等级："+(level?("LV."+level):"-")+"\n- 当前经验："+credit+"\n- 距离升级："+need+" 经验";
        logInfo("经验信息：",JSON.stringify(data));
      }else logWarn("积分/经验接口返回异常或空");
    }catch(e){ logWarn("经验信息查询异常：",String(e)); }

    // 5) 余额
    var balLine="";
    try{
      var bal=await httpGet(END.balance,headers).catch(function(e){ logWarn("余额接口异常：",String(e)); return null; });
      if(bal&&bal.code===0) balLine="- 当前 N 币："+((bal.data&&(typeof bal.data.balance!=="undefined"))?bal.data.balance:(bal.data&&bal.data.coin?bal.data.coin:0));
      logInfo("余额查询：",JSON.stringify(bal));
    }catch(e){ logWarn("余额查询异常：",String(e)); }

    // 6) 盲盒
    var blindMsg="",blindProgress=[];
    try{
      var box=await httpGet(END.blindBoxList,headers).catch(function(e){ logWarn("盲盒接口异常：",String(e)); return null; });
      if(box&&box.data){
        blindProgress=box.data;
        blindProgress.forEach(function(b){ b.progressBar=renderProgressBar(b.currentDay,b.totalDay,cfg.progressStyle,20); });
        blindMsg=blindProgress.map(function(b){ return b.name+":"+b.progressBar+" "+b.currentDay+"/"+b.totalDay+" 天 (还需 "+(b.totalDay-b.currentDay)+" 天)"; }).join("\n");
      }
    }catch(e){ logWarn("盲盒查询异常：",String(e)); }

    // ---------- 发送通知 ----------
    var notifyBody=[signMsg,shareTaskLine,upgradeLine,balLine,blindMsg].filter(Boolean).join("\n");
    if(cfg.notify) notify(cfg.titlePrefix,signMsg,notifyBody);

    logInfo("九号自动签到结束");
  }catch(e){ logErr("执行异常：",String(e)); }
})();