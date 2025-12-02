/***********************************************
Ninebot_Sign_Single_v2.7.js （版本 E · 全终极版）
2025-12-02 22:00 更新
功能覆盖：抓包写入、自动签到、分享任务、盲盒、资产查询、通知美化
适配工具：Surge/Quantumult X/Loon
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
const KEY_ENABLE_SHARE="ninebot.enableShare"; 
const KEY_LOG_LEVEL="ninebot.logLevel"; 

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
if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
if(capUrl.includes("/service/2/app_log/")){
const base=capUrl.split("?")[0];
if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：",base); }
}
if(changed){ writePS(String(Date.now()),KEY_LAST_CAPTURE); notify("九号智能电动车","抓包成功 ✓","数据已写入 BoxJS（含分享接口）"); logInfo("抓包写入成功"); }
else logInfo("抓包数据无变化");
}catch(e){ logErr("抓包异常：",e); }
$done({});
}

/* 时间工具函数 */
function toDateKeyAny(ts){
if(!ts) return null;
let d;
if(typeof ts==="number"){
if(ts>1e12) ts=Math.floor(ts/1000);
d=new Date(ts*1000);
}else if(typeof ts==="string"){
if(/^\d+/.test(ts)){
let n=Number(ts);
if(n>1e12) n=Math.floor(n/1000);
d=new Date(n*1000);
}else{
d=new Date(ts);
}
}else return null;
if(isNaN(d)) return null;
return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* 构造请求头 */
function makeHeaders(){
return {
"Authorization":readPS(KEY_AUTH)||"",
"Content-Type":"application/octet-stream;tt-data=a",
"device_id":readPS(KEY_DEV)||"",
"User-Agent":readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
"platform":"h5",
"Origin":"https://h5-bj.ninebot.com",
"language":"zh",
"aid":"10000004",
"Cookie":"install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
"accept-encoding":"gzip, deflate, br",
"priority":"u=3",
"accept-language":"zh-CN,zh-Hans;q=0.9",
"accept":"application/json"
};
}

/* HTTP请求 */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT,isBase64=false}){
return new Promise((resolve,reject)=>{
let attempts=0;
const once=()=>{
attempts++;
const opts={url,headers,timeout};
if(method==="POST"){ opts.body=body; if(isBase64) opts["body-base64"]=true; }
const cb=(err,resp,data)=>{
if(err){
const msg=String(err&&(err.error||err.message||err));
const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
if(attempts<MAX_RETRY && shouldRetry){ setTimeout(once,RETRY_DELAY); return; } else{ reject(err); return; }
}
let respData={};
try{ respData=JSON.parse(data||"{}"); }catch(e){ respData={raw:data}; }
if(!checkTokenValid({code:resp.status,...respData})){ reject(new Error("Token invalid or expired")); return; }
resolve(respData);
};
if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
};
once();
});
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={},isBase64=false){ return requestWithRetry({method:"POST",url,headers,body,isBase64}); }

/* 主流程 */
(async()=>{
try{
const headers=makeHeaders();
let notifyMsg="",notifyTitle=readPS(KEY_TITLE)||"九号签到";

// 1. 查询签到状态
let statusResp=null;
try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); }catch(e){ logWarn("状态请求异常：",String(e)); }
const statusData=statusResp?.data||{};
let consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
const knownSignedValues=[1,'1',true,'true'];
const isSigned=knownSignedValues.includes(currentSignStatus);

// 2. 执行签到
let signMsg="", todayGainExp=0, todayGainNcoin=0;
if(!isSigned){
try{
const signResp=await httpPost(END.sign,headers,{deviceId:readPS(KEY_DEV)||""});
if(signResp.code===0||signResp.success===true){
consecutiveDays+=1;
const rewardList=signResp.data?.rewardList;
let newExp=0,newCoin=0;
if(Array.isArray(rewardList)){
for(const r of rewardList){
const v=Number(r.rewardValue??0);
const t=Number(r.rewardType??0);
if(t===1) newExp+=v; else newCoin+=v;
}}
const nCoin=Number(signResp.data?.nCoin??signResp.data?.coin??0);
const score=Number(signResp.data?.score??signResp.data?.credit??0);
todayGainExp+=(score+newExp);
todayGainNcoin+=(nCoin+newCoin);
signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币`;
} else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))||(signResp.message&&/已签到/.test(signResp.message))){
signMsg="✨ 今日签到：已签到（接口）";
} else { signMsg=`❌ 签到失败：${signResp.msg||signResp.message||JSON.stringify(signResp)}`; }
}catch(e){ logWarn("签到异常：",String(e)); signMsg=`❌ 签到异常：${String(e)}`; }
}else signMsg="✨ 今日签到：已签到";

// 3. 分享任务
const shareEnabled=readPS(KEY_ENABLE_SHARE)!=="0";
if(shareEnabled){
try{
const lastShare=readPS(KEY_LAST_SHARE);
if(lastShare!==todayKey()){
const shareUrl=readPS(KEY_SHARE);
if(shareUrl){
const shareResp=await httpGet(shareUrl,headers);
if(shareResp?.code===0){ 
todayGainNcoin+=Number(shareResp?.data?.nCoin??0);
writePS(todayKey(),KEY_LAST_SHARE); 
signMsg+=`\n🎁 分享奖励：+${shareResp?.data?.nCoin??0} N 币`; 
}}}}catch(e){ logWarn("分享任务异常：",String(e)); }}

// 4. 盲盒自动开箱
const autoBox=readPS(KEY_AUTOBOX)!=="0";
if(autoBox){
try{
const boxList=await httpGet(END.blindBoxList,headers);
if(boxList?.data?.length){
for(const box of boxList.data){
const id=box.id,opened=box.status===1;
if(!opened){
const openUrl=box.day===7?END_OPEN.openSeven:END_OPEN.openNormal;
await httpPost(openUrl,headers,{id}); 
}}
}}catch(e){ logWarn("盲盒开箱异常：",String(e)); }}

// 5. 查询账户资产
let balanceMsg="";
try{
const bal=await httpGet(END.balance,headers);
const nCoin=bal?.data?.nCoin??0,exp=bal?.data?.score??0;
balanceMsg=`📊 账户状态\n- 当前经验：${exp}\n- 当前 N币：${nCoin}\n- 连续签到：${consecutiveDays} 天\n- 补签卡：${signCards} 张`;
}catch(e){ logWarn("资产查询异常：",String(e)); }

notifyMsg=`${signMsg}\n${balanceMsg}`;
logInfo(notifyMsg);
notify(notifyTitle,"签到结果",notifyMsg);

}catch(e){ logErr("自动签到主流程异常：",e); notify("九号签到异常","执行失败",String(e)); }
})();