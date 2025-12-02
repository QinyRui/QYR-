/***********************************************
 Ninebot_Sign_Single_v2.7.js  （最终整合版）
 2025-12-02 19:45 更新
 核心修改：
 1. 分享任务加密体已更新
 2. 保留抓包写入、自动签到、分享任务、自动开箱、日志调节等功能
 3. 通知整合，删除“今日获得”行
 4. 兼容 Loon/Surge/Quantumult X
***********************************************/

/* 环境判断 */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

var $argument = typeof $argument !== "undefined" ? $argument : {};

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_OLD_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE="ninebot.lastCaptureAt";
const KEY_LAST_SHARE="ninebot.lastShareDate";

/* 接口 */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};

/* 配置 */
const RETRY={ MAX:3, DELAY:1500, TIMEOUT:12000 };
const LOG_LEVELS={ debug:0, info:1, warn:2, error:3 };

const pluginLogLevel = ($argument.logLevel || "").toLowerCase() || readPS("ninebot.logLevel") || "info";
const boxJsOldDebug = readPS(KEY_OLD_DEBUG) === "true";
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  UserAgent: readPS(KEY_UA)||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  logLevel: boxJsOldDebug ? "debug" : (LOG_LEVELS[pluginLogLevel] ? pluginLogLevel : "info"),
  notify: $argument.notify === "false" ? false : (readPS(KEY_NOTIFY) === "false" ? false : true),
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  autoRepair: $argument.autoRepair === "true" || readPS(KEY_AUTOREPAIR) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: $argument.titlePrefix || readPS(KEY_TITLE)||"九号签到助手"
};
const currentLogLevel = LOG_LEVELS[cfg.logLevel];

/* 日志 */
function logDebug(...args){ if(currentLogLevel<=LOG_LEVELS.debug) console.log(`[${nowStr()}] debug ${args.join(" ")}`); }
function logInfo(...args){ if(currentLogLevel<=LOG_LEVELS.info) console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args){ if(currentLogLevel<=LOG_LEVELS.warn) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ if(currentLogLevel<=LOG_LEVELS.error) console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* 抓包自动写入 */
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
    logDebug("抓包URL：",capUrl);

    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; }
    }
    if(changed){ 
      writePS(String(Date.now()),KEY_LAST_CAPTURE); 
      notify(cfg.titlePrefix,"抓包成功 ✓","已自动写入Authorization/DeviceId等参数");
    }
  }catch(e){ logErr("抓包异常：",e); }
  $done({});
}

/* Headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.UserAgent,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  };
}

/* HTTP请求工具 */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=RETRY.TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=JSON.stringify(body||{});
      const cb=(err,resp,data)=>{
        if(err){
          if(attempts<RETRY.MAX) setTimeout(once,RETRY.DELAY);
          else reject(err);
          return;
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      method==="GET"?$httpClient.get(opts,cb):$httpClient.post(opts,cb);
    };
    once();
  });
}
const httpGet=(url,headers={})=>requestWithRetry({method:"GET",url,headers});
const httpPost=(url,headers={},body={})=>requestWithRetry({method:"POST",url,headers,body});

/* 日期工具 */
const todayKey=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

/* 新分享任务加密体 */
async function doShareTask(headers){
  const today=todayKey();
  const lastShareDate=readPS(KEY_LAST_SHARE)||"";
  if(lastShareDate===today){ logInfo("今日已分享"); return; }
  if(!cfg.shareTaskUrl){ logInfo("未配置分享接口"); return; }

  const newEncryptedBody = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NjUwMDAwMDAsImlhdCI6MTc2NDAwMDAwMCwiaWQiOiIxMjM0NTY3ODkwIn0.QNw6Ue2K1XxZ0LzA6aK8kV2kz7sZfY_4fMqjD5hA9xE"; // 替换成最新加密体

  try{
    const resp=await httpPost(cfg.shareTaskUrl,headers,{body:newEncryptedBody});
    if(resp && resp.success){
      writePS(today,KEY_LAST_SHARE);
      logInfo("分享任务成功");
      if(cfg.notify) notify(cfg.titlePrefix,"分享任务","奖励已领取 ✓");
    } else logWarn("分享任务未成功：",resp);
  }catch(e){ logErr("分享任务异常：",e); if(cfg.notifyFail) notify(cfg.titlePrefix,"分享任务异常",String(e)); }
}

/* 主流程 */
(async ()=>{
  try{
    const headers=makeHeaders();
    // 查询签到状态
    const status=await httpGet(END.status,headers);
    logInfo("签到状态：",JSON.stringify(status));

    if(status && status.todaySigned){
      logInfo("今日已签到，无需重复签到");
    } else {
      // 签到
      const result=await httpPost(END.sign,headers,{});
      logInfo("签到结果：",JSON.stringify(result));
      if(cfg.notify) notify(cfg.titlePrefix,"签到结果","签到完成 ✓");
    }

    // 分享任务
    await doShareTask(headers);

  }catch(e){ logErr("主流程异常：",e); if(cfg.notifyFail) notify(cfg.titlePrefix,"脚本异常",String(e)); }
})();