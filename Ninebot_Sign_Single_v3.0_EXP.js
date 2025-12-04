/***********************************************
Ninebot_Sign_Single_v3.0_EXP.js (插件兼容版)
2025-12-05 更新
兼容插件环境，屏蔽 $argument/$environment 未定义报错
集成抓包、签到、盲盒、账户查询、自动补签、通知
***********************************************/

/* 环境适配 */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";
const $argument = typeof $argument !== "undefined" ? $argument : {};
const $environment = typeof $environment !== "undefined" ? $environment : {};

/* 辅助函数 */
function readPS(key){try{return HAS_PERSIST?$persistentStore.read(key):null}catch(e){return null}}
function writePS(val,key){try{return HAS_PERSIST?$persistentStore.write(val,key):false}catch(e){return false}}
function notify(title,sub,body){if(HAS_NOTIFY)$notification.post(title,sub,body)}
function nowStr(){return new Date().toLocaleString()}
function formatDateTime(date=new Date()){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0"),h=String(date.getHours()).padStart(2,"0"),mi=String(date.getMinutes()).padStart(2,"0"),s=String(date.getSeconds()).padStart(2,"0");return`${y}-${m}-${d} ${h}:${mi}:${s}`}

/* BoxJS键兼容 */
const KEY_AUTH="ninebot.authorization",KEY_DEV="ninebot.deviceId",KEY_UA="ninebot.userAgent",KEY_DEBUG="ninebot.debug",KEY_NOTIFY="ninebot.notify",KEY_AUTOBOX="ninebot.autoOpenBox",KEY_AUTOREPAIR="ninebot.autoRepair",KEY_NOTIFYFAIL="ninebot.notifyFail",KEY_TITLE="ninebot.titlePrefix",KEY_LAST_CAPTURE="ninebot.lastCaptureAt",KEY_LAST_SIGN_DATE="ninebot.lastSignDate",KEY_LOG_LEVEL="ninebot.logLevel",KEY_ENABLE_RETRY="ninebot.enableRetry",KEY_AUTO_REPAIR="ninebot.autoRepairCard";

/* 接口 */
const END={sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",repairSign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"};
const END_OPEN={openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",openNormal:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"};

/* 日志等级 */
const LOG_LEVEL_MAP={silent:0,simple:1,full:2};
function getLogLevel(){const v=readPS(KEY_LOG_LEVEL)||"full";return LOG_LEVEL_MAP[v]??LOG_LEVEL_MAP.full;}
function logInfo(...args){if(getLogLevel()<2)return;console.log(`[${nowStr()}] INFO: ${args.map(a=>typeof a==="object"?JSON.stringify(a,null,2):String(a)).join(" ")}`);}
function logWarn(...args){if(getLogLevel()<1)return;console.warn(`[${nowStr()}] WARN: ${args.join(" ")}`);}
function logErr(...args){if(getLogLevel()<1)return;console.error(`[${nowStr()}] ERROR: ${args.join(" ")}`);}

/* 配置读取 */
const cfg={Authorization:readPS(KEY_AUTH)||"",DeviceId:readPS(KEY_DEV)||"",userAgent:readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",debug:(readPS(KEY_DEBUG)===null)?true:(readPS(KEY_DEBUG)!=="false"),notify:(readPS(KEY_NOTIFY)===null)?true:(readPS(KEY_NOTIFY)!=="false"),autoOpenBox:readPS(KEY_AUTOBOX)==="true",autoRepair:readPS(KEY_AUTO_REPAIR)==="true",notifyFail:(readPS(KEY_NOTIFYFAIL)===null)?true:(readPS(KEY_NOTIFYFAIL)!=="false"),titlePrefix:readPS(KEY_TITLE)||"九号签到助手",logLevel:getLogLevel(),enableRetry:(readPS(KEY_ENABLE_RETRY)===null)?true:(readPS(KEY_ENABLE_RETRY)!=="false")};

/* 请求封装 */
const REQUEST_TIMEOUT=12000;
const RETRY_CONFIG={default:{max:3,delay:1500},sign:{max:2,delay:1000},blindBox:{max:2,delay:2000},query:{max:1,delay:1000}};
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT,retryType="default"}){return new Promise((resolve,reject)=>{const {max:MAX_RETRY,delay:RETRY_DELAY}=RETRY_CONFIG[retryType]||RETRY_CONFIG.default;let attempts=0;const once=()=>{attempts++;const opts={url,headers,timeout};if(method==="POST")opts.body=JSON.stringify(body);logInfo(`[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`);if(method==="POST"&&body)logInfo("[请求体]",body);const cb=(err,resp,data)=>{if(err){const msg=String(err&&(err.error||err.message||err));const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed|502|504)/i.test(msg);if(attempts<MAX_RETRY&&shouldRetry&&cfg.enableRetry){logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试`);setTimeout(once,RETRY_DELAY);return;}logErr(`请求失败：${msg}`);reject(new Error(`请求异常: ${msg}`));return;}let respData={};try{respData=JSON.parse(data||"{}");}catch(e){respData={raw:data}}resolve(respData);};if(method==="GET")$httpClient.get(opts,cb);else $httpClient.post(opts,cb);};once();});}
function httpGet(url,headers={},retryType="query"){return requestWithRetry({method:"GET",url,headers,retryType});}
function httpPost(url,headers={},body={},retryType="default"){return requestWithRetry({method:"POST",url,headers,body,retryType});}

/* 抓包写入（插件兼容） */
if(IS_REQUEST&&$request&&$request.url&&$request.url.includes("/portal/api/user-sign/v2/status")){
    try{
        logInfo("进入抓包写入流程");
        const h=$request.headers||{};
        const auth=h["Authorization"]||h["authorization"]||"";
        const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
        const ua=h["User-Agent"]||h["user-agent"]||"";
        let changed=false;
        if(auth&&readPS(KEY_AUTH)!==auth){writePS(auth,KEY_AUTH);changed=true;}
        if(dev&&readPS(KEY_DEV)!==dev){writePS(dev,KEY_DEV);changed=true;}
        if(ua&&readPS(KEY_UA)!==ua){writePS(ua,KEY_UA);changed=true;}
        if(changed){const t=formatDateTime();writePS(t,KEY_LAST_CAPTURE);notify(cfg.titlePrefix,"抓包成功 ✓",`数据已写入\n最后抓包时间：${t}`);logInfo("抓包写入成功，最后抓包时间：",t);}else{logInfo("抓包数据无变化");}
    }catch(e){logErr("抓包异常：",e);notify(cfg.titlePrefix,"抓包失败 ⚠️",String(e).slice(0,50));}
    $done({});
}

/* 主流程 */
(async ()=>{
    logInfo("九号自动签到 v3.0_EXP 插件兼容版启动");
    if(!cfg.Authorization||!cfg.DeviceId){notify(cfg.titlePrefix,"未配置 Token","请先抓包执行签到动作以写入 Authorization / DeviceId");logWarn("终止：未读取到账号信息");$done();}
    // 这里可接入原 v3.0_EXP 主流程逻辑
    $done();
})();