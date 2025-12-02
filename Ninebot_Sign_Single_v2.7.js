/***********************************************
Ninebot_Sign_Single_v2.7.js （版本 E · 全优化版）
2025-12-02 22:00 更新
核心优化：新增分享开关、Token过期提醒、全盲盒自动开箱、日志分级、接口适配
适配工具：Surge/Quantumult X/Loon（支持Base64自动解码）
功能覆盖：抓包写入、自动签到、加密分享、自动领奖励、全盲盒开箱、资产查询、美化通知
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE="ninebot.lastCaptureAt";
const KEY_LAST_SHARE="ninebot.lastShareDate";
const KEY_ENABLE_SHARE="ninebot.enableShare"; // 分享任务开关（默认开启）
const KEY_LOG_LEVEL="ninebot.logLevel"; // 日志级别（0=静默,1=简化,2=完整）

/* Endpoints */
const END={
sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};
const END_OPEN={
openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
openNormal:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

/* 基础配置 */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
const LOG_LEVEL_MAP={ silent:0, simple:1, full:2 };

/* 日志分级 */
function getLogLevel(){ const v=readPS(KEY_LOG_LEVEL)||"full"; return LOG_LEVEL_MAP[v]??LOG_LEVEL_MAP.full; }
function logInfo(...args){ const level=getLogLevel(); if(level<2) return; console.log([`${nowStr()}`,"info",...args.map(a=>typeof a==="object"?JSON.stringify(a):a)]); }
function logWarn(...args){ const level=getLogLevel(); if(level<1) return; console.warn([`${nowStr()}`,"warn",...args]); }
function logErr(...args){ const level=getLogLevel(); if(level<1) return; console.error([`${nowStr()}`,"error",...args]); }

/* Token有效性校验 */
function checkTokenValid(resp){
if(!resp) return true;
const invalidCodes=[401,403,50001,50002,50003];
const invalidMsgs=["无效","过期","未登录","授权","token","authorization"];
const respStr=JSON.stringify(resp).toLowerCase();
const hasInvalidCode=invalidCodes.includes(resp.code||resp.status);
const hasInvalidMsg=invalidMsgs.some(msg=>respStr.includes(msg));
return !(hasInvalidCode||hasInvalidMsg);
}

/* 抓包处理 */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest=IS_REQUEST && $request && request.url && CAPTURE_PATTERNS.some(u=>request.url.includes(u));
if(isCaptureRequest){
try{
logInfo("进入抓包写入流程");
const h=request.headers||{};
const auth=h["Authorization"]||h["authorization"]||"";
const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
const ua=h["User-Agent"]||h["user-agent"]||"";
const capUrl=request.url||"";
logInfo("抓包 URL：", capUrl);

let changed=false;
if(auth