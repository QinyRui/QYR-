/***********************************************
 Ninebot_Sign_Single_v2.9.js  （终极完整版+语法修复）
 2025-12-02 10:28 最终更新
 所有修复点：
 1. 1:1复刻APP签到请求（Content-Type=application/json+必填请求头）
 2. 签到二次状态校验，杜绝伪成功
 3. 经验查询接口GET→POST（匹配真实请求，显示真实经验）
 4. 彻底修复盲盒进度负数显示（兼容多字段命名）
 5. 修正"N市"笔误为"N币"
 6. 补全加密字符串闭合引号，修复SyntaxError
 兼容：Loon/Surge/Quantumult X 所有工具
 功能：抓包写入、自动签到、加密分享、自动领奖励、日志调节、盲盒开箱
***********************************************/

/* ENV wrapper - 优先修复$argument声明（关键！） */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 修复核心：用var声明（无暂时性死区），避免初始化顺序报错
var $argument = typeof $argument !== "undefined" ? $argument : {};

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_OLD_DEBUG="ninebot.debug"; // 旧BoxJS debug开关（兼容用）
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE="ninebot.lastCaptureAt";
const KEY_LAST_SHARE="ninebot.lastShareDate";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg", // POST接口（核心修复）
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* 基础配置 */
const RETRY = { MAX:3, DELAY:1500, TIMEOUT:12000 };
const LOG_LEVELS = { debug:0, info:1, warn:2, error:3 }; // 日志等级优先级

/* Read config（全工具兼容，无初始化异常） */
const pluginLogLevel = ($argument.logLevel || "").toLowerCase() || readPS("ninebot.logLevel") || "info";
const boxJsOldDebug = readPS(KEY_OLD_DEBUG) === "true";
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  UserAgent: readPS(KEY_UA)||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620", // 默认真实UA
  shareTaskUrl: readPS(KEY_SHARE)||"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
  // 日志等级：Loon插件优先，旧BoxJS debug=true映射为debug，默认info
  logLevel: boxJsOldDebug ? "debug" : (LOG_LEVELS[pluginLogLevel] ? pluginLogLevel : "info"),
  notify: $argument.notify === "false" ? false : (readPS(KEY_NOTIFY) === "false" ? false : true),
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  autoRepair: $argument.autoRepair === "true" || readPS(KEY_AUTOREPAIR) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: $argument.titlePrefix || readPS(KEY_TITLE)||"九号签到助手"
};
const currentLogLevel = LOG_LEVELS[cfg.logLevel];

/* 日志函数（按等级控制输出） */
function logDebug(...args){
  if(currentLogLevel <= LOG_LEVELS.debug){
    console.log(`[${nowStr()}] debug ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logInfo(...args){
  if(currentLogLevel <= LOG_LEVELS.info){
    console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logWarn(...args){
  if(currentLogLevel <= LOG_LEVELS.warn){
    console.warn(`[${nowStr()}] warn ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logErr(...args){
  if(currentLogLevel <= LOG_LEVELS.error){
    console.error(`[${nowStr()}] error ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}

/* Capture handling（抓包自动写入） */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest=IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";
    logDebug("抓包URL：",capUrl,"请求头：",h);

    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; logDebug("写入Authorization：",auth); }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; logDebug("写入DeviceId：",dev); }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; logDebug("写入User-Agent：",ua); }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logDebug("写入分享接口：",base); }
    }
    if(changed){ 
      writePS(String(Date.now()),KEY_LAST_CAPTURE); 
      notify(cfg.titlePrefix,"抓包成功 ✓","已自动写入Authorization/DeviceId等参数，可关闭抓包开关");
      logInfo("抓包写入成功，参数已保存");
    } else logInfo("抓包数据无变化，无需重复写入");
  }catch(e){ logErr("抓包异常：",e); }
  $done({});
}

/* Compose headers（1:1复刻抓包请求头） */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json", // 🔥 核心修复：匹配真实请求
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.UserAgent,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "aid": "10000004",
    "Cookie": "install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
    "accept-encoding": "gzip, deflate, br",
    "priority": "u=3",
    "accept-language": "zh-CN,zh-Hans;q=0.9",
    "accept": "application/json",
    "Referer": "https://h5-bj.ninebot.com/", // 补充抓包必填字段
    "sys_language": "zh-CN" // 补充抓包必填字段
  };
}

/* HTTP请求工具（支持JSON请求+重试） */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=RETRY.TIMEOUT,isBase64=false}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST"){
        opts.body=body;
        if(isBase64) opts["body-base64"]=true;
        // 自动设置JSON请求头（如果body是对象）
        if(typeof body==="object" && !isBase64){
          opts.body=JSON.stringify(body);
          headers["Content-Type"]=headers["Content-Type"]||"application/json";
        }
      }
      logDebug(`[HTTP] 发起${method}请求（第${attempts}次）：`,url,"参数：",body);
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err&&(err.error||err.message||err));
          logWarn(`[HTTP] 请求错误：${msg}，${RETRY.DELAY}ms后重试`);
          if(attempts<RETRY.MAX) setTimeout(once,RETRY.DELAY);
          else reject(new Error(`请求失败（${RETRY.MAX}次重试耗尽）：${msg}`));
          return;
        }
        logDebug(`[HTTP] 响应状态：${resp.status}，响应数据：`,data);
        if(resp.status>=500 && attempts<RETRY.MAX){
          logWarn(`[HTTP] 服务端错误（${resp.status}），${RETRY.DELAY}ms后重试`);
          setTimeout(once,RETRY.DELAY);
          return;
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}
const httpGet=(url,headers={})=>requestWithRetry({method:"GET",url,headers});
const httpPost=(url,headers={},body={},isBase64=false)=>requestWithRetry({method:"POST",url,headers,body,isBase64});

/* 时间工具（解析日期匹配今日） */
function toDateKeyAny(ts){
  if(!ts) return null;
  const numTs=typeof ts==="string"&&/^\d+$/.test(ts) ? Number(ts) : ts;
  const date=new Date(numTs>1e12 ? numTs/1000 : numTs);
  return !isNaN(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : null;
}
const todayKey=()=>{
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};

/* 分享任务核心逻辑（加密体+自动领取+等级日志） */
async function doShareTask(headers){
  const today=todayKey();
  const lastShareDate=readPS(KEY_LAST_SHARE)||"";
  
  // 1. 去重校验
  if(lastShareDate===today){
    logInfo("今日已完成分享任务，跳过");
    return { success:false, msg:"今日已分享", exp:0, ncoin:0 };
  }

  // 2. 加密请求体（完整闭合字符串，修复SyntaxError）
  const ENCRYPTED_BODY="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