/***********************************************
 Ninebot_Sign_Single_v2.6.js —— ES5 完全兼容版（最终整合版）14:47
 功能：抓包写入、自动签到、分享任务领取、盲盒开箱、经验/N币查询、通知美化
 说明：严格使用 ES5 语法，兼容旧版 Loon/Surge/QuanX JS 引擎
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
  } catch (e) {
    if (typeof $argument !== "object") $argument = {};
  }
}

// ---------- BoxJS helpers ----------
function readPS(key){try{if(HAS_PERSIST) return $persistentStore.read(key);return null;}catch(e){return null;}}
function writePS(val,key){try{if(HAS_PERSIST) return $persistentStore.write(val,key);return false;}catch(e){return false;}}
function notify(title,sub,body){try{if(HAS_NOTIFY) $notification.post(title,sub,body);}catch(e){}}
function nowStr(){return new Date().toLocaleString();}

// ---------- BoxJS keys ----------
var KEY_AUTH="ninebot.authorization";
var KEY_DEV="ninebot.deviceId";
var KEY_UA="ninebot.userAgent";
var KEY_DEBUG="ninebot.debugLevel";
var KEY_NOTIFY="ninebot.notify"; // 抓包通知开关
var KEY_PROGRESS="ninebot.progressStyle";
var KEY_SHARE="ninebot.shareTaskUrl";
var KEY_AUTOBOX="ninebot.autoOpenBox";

// ---------- Endpoints ----------
var END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
var END_OPEN={openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box"};

// ---------- Network retry ----------
var MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function requestWithRetry(options){return new Promise(function(resolve,reject){
  var attempts=0;
  function once(){attempts++;
    var opts={url:options.url,headers:options.headers||{},timeout:REQUEST_TIMEOUT};
    if(options.method==="POST") opts.body=(options.body===null?"{}":options.body);
    var cb=function(err,resp,data){
      if(err){
        var msg=String(err&&(err.error||err.message||err));
        var shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
        if(attempts<MAX_RETRY&&shouldRetry){setTimeout(once,RETRY_DELAY);return;} else {reject(err);return;}
      }
      try{resolve(JSON.parse(data||"{}"))}catch(e){resolve({raw:data});}
    };
    if(options.method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
  }
  once();
});}
function httpGet(url,headers){return requestWithRetry({method:"GET",url:url,headers:headers||{}});}
function httpPost(url,headers,body){return requestWithRetry({method:"POST",url:url,headers:headers||{},body:body||"{}"});}

// ---------- Logging ----------
function safeNum(v,def){var n=Number(v);return isNaN(n)?def:n;}
var argDebugLevel=safeNum($argument.debugLevel,null);
var savedDebug=readPS(KEY_DEBUG);
var debugLevel=1;
if(argDebugLevel!==null) debugLevel=argDebugLevel;
else if(savedDebug!==null) debugLevel=safeNum(savedDebug,1);
function logInfo(){if(debugLevel>=1){var arr=Array.prototype.slice.call(arguments);try{console.log("["+nowStr()+"] info "+arr.join(" "));}catch(e){}}}
function logWarn(){if(debugLevel>=2){var arr=Array.prototype.slice.call(arguments);try{console.warn("["+nowStr()+"] warn "+arr.join(" "));}catch(e){}}}
function logDebug(){if(debugLevel>=3){var arr=Array.prototype.slice.call(arguments);try{console.log("["+nowStr()+"] debug "+arr.join(" "));}catch(e){}}}
function logErr(){var arr=Array.prototype.slice.call(arguments);try{console.error("["+nowStr()+"] error "+arr.join(" "));}catch(e){}}

// ---------- Progress bar ----------
var PROGRESS_STYLES=[["█","░"],["▓","░"],["▰","▱"],["●","○"],["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]];
var argBarStyle=safeNum($argument.barStyle,null);
var savedBar=readPS(KEY_PROGRESS);
var progressStyle=0;
if(argBarStyle!==null) progressStyle=argBarStyle;
else if(savedBar!==null) progressStyle=safeNum(savedBar,0);
function renderProgressBar(current,total,styleIndex,length){
  try{
    styleIndex=safeNum(styleIndex,0);if(styleIndex<0||styleIndex>=PROGRESS_STYLES.length) styleIndex=0;
    length=safeNum(length,20);
    var pair=PROGRESS_STYLES[styleIndex],FULL=pair[0],EMPTY=pair[1],ratio=0;
    if(total>0) ratio=current/total;
    var filled=Math.round(ratio*length); if(filled<0) filled=0;if(filled>length) filled=length;
    var s="";var i;for(i=0;i<filled;i++) s+=FULL; for(i=0;i<length-filled;i++) s+=EMPTY; return s;
  }catch(e){return "██████████----------";}
}

// ---------- Utilities ----------
function mask(s){if(!s)return"";if(s.length>8) return s.slice(0,6)+"..."+s.slice(-4); return s;}
function toDateKeyFromSec(sec){try{var d=new Date(Number(sec)*1000);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}catch(e){return"";}}
function todayKey(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}

// ---------- Read config ----------
var cfg={
  Authorization:readPS(KEY_AUTH)||"",
  DeviceId:readPS(KEY_DEV)||"",
  userAgent:readPS(KEY_UA)||"",
  shareTaskUrl:readPS(KEY_SHARE)||"",
  debugLevel:debugLevel,
  notify:($argument.notify==="false"||readPS(KEY_NOTIFY)==="false")?false:true, // 抓包通知
  autoOpenBox:(readPS(KEY_AUTOBOX)==="true"),
  titlePrefix:readPS(KEY_TITLE)||"九号签到",
  progressStyle:progressStyle
};
logInfo("当前配置：",JSON.stringify(cfg));

// ---------- Basic check ----------
if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并执行签到/分享动作以写入 Authorization/DeviceId/UA");
  logWarn("终止：未读取到账号信息");
  $done();
}

// ---------- Capture handling ----------
var CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
var isCaptureRequest=IS_REQUEST&&$request&&$request.url&&(function(){for(var i=0;i<CAPTURE_PATTERNS.length;i++) if($request.url.indexOf(CAPTURE_PATTERNS[i])!==-1) return true; return false; }());
if(isCaptureRequest){
  try{
    if($argument.capture==="false"){logInfo("抓包写入开关关闭，跳过抓包处理"); $done();}
    logInfo("进入抓包写入流程");
    var h=$request.headers||{},auth=h["Authorization"]||h["authorization"]||"",dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"",ua=h["User-Agent"]||h["user-agent"]||"",capUrl=$request.url||"";
    logInfo("抓包捕获 URL：",capUrl);
    logInfo("抓包 Header：",JSON.stringify({Authorization:mask(auth),DeviceId:mask(dev),UA:ua?"[present]":"[missing]"}));
    var changed=false;
    if(auth&&readPS(KEY_AUTH)!==auth){writePS(auth,KEY_AUTH);changed=true;}
    if(dev&&readPS(KEY_DEV)!==dev){writePS(dev,KEY_DEV);changed=true;}
    if(ua&&readPS(KEY_UA)!==ua){writePS(ua,KEY_UA);changed=true;}
    if(capUrl.indexOf("/service/2/app_log/")!==-1&&readPS(KEY_SHARE)!==capUrl.split("?")[0]){writePS(capUrl.split("?")[0],KEY_SHARE);changed=true;}
    if(changed&&cfg.notify) notify(cfg.titlePrefix,"抓包成功 ✓","Authorization/DeviceId/UA/shareTaskUrl 已写入 BoxJS");
    logInfo("抓包写入",changed?"成功":"无变化");
  }catch(e){logErr("抓包异常：",String(e));}
  $done();
}

// ---------- Main flow ----------
(async function(){
  try{
    var headers={
      "Authorization":cfg.Authorization,
      "Content-Type":"application/json;charset=UTF-8",
      "device_id":cfg.DeviceId,
      "User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform":"h5",
      "Origin":"https://h5-bj.ninebot.com",
      "language":"zh"
    };

    // 查询签到状态
    logInfo("查询签到状态...");
    var st=null;
    try{st=await httpGet(END.status+"?t="+Date.now(),headers);}catch(e){logWarn("状态请求异常：",String(e)); st={};}
    var statusData=st&&st.data?st.data:{};
    var consecutiveDays=statusData.consecutiveDays||statusData.continuousDays||0;
    var signCards=statusData.signCardsNum||statusData.remedyCard||0;
    var currentSignStatus=statusData.currentSignStatus||null;
    var blindBoxStatus=statusData.blindBoxStatus||null;

    logInfo("签到状态：",JSON.stringify({consecutiveDays:consecutiveDays,signCards:signCards,currentSignStatus:currentSignStatus,blindBoxStatus:blindBoxStatus}));

    // 自动签到
    var signMsg="",todayGainExp=0,todayGainNcoin=0;
    if(currentSignStatus===0||currentSignStatus===null||typeof currentSignStatus==="undefined"){
      logInfo("今日未签到，尝试签到...");
      var signResp=null;
      try{signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));}catch(e){logWarn("签到异常：",String(e)); signResp=null;}
      if(signResp){
        if(signResp.code===0||signResp.code===1){
          var score=safeNum(signResp.data&&signResp.data.score?signResp.data.score:0,0);
          var nCoin=safeNum(signResp.data&&(signResp.data.nCoin||signResp.data.coin)?(signResp.data.nCoin||signResp.data.coin):0,0);
          todayGainExp+=score; todayGainNcoin+=nCoin;
          signMsg="🎉 今日签到：成功\n+"+score+" 经验";
          logInfo("签到成功：",signResp);
        }else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))){
          signMsg="🎉 今日签到：已签到";
          logInfo("签到接口反馈：已签到");
        }else{signMsg="❌ 签到失败："+(signResp.msg||JSON.stringify(signResp)); logWarn("签到失败：",signResp);}
      }else{signMsg="❌ 签到请求异常（网络/超时）";}
    }else{signMsg="🎉 今日签到：已签到"; logInfo("今日已签到，跳过签到");}

    // assemble notification
    var notifyBody=[signMsg,"- 补签卡："+signCards+" 张","- 连续签到："+consecutiveDays+" 天"];
    if(cfg.notify&&notifyBody.length>0) notify(cfg.titlePrefix,"今日签到结果",notifyBody.join("\n"));

  }catch(e){logErr("主流程异常：",String(e)); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));}
  finally{logInfo("九号自动签到结束"); $done();}
})();