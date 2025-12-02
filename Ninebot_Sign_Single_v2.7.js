/***********************************************
Ninebot_Sign_Single_v2.7_fix.js （版本 E · 全优化版修复）
2025-12-02 更新
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

/* BoxJS keys（新增2个配置项） */
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
const KEY_ENABLE_SHARE="ninebot.enableShare"; // 新增：分享任务开关（默认开启）
const KEY_LOG_LEVEL="ninebot.logLevel"; // 新增：日志级别（0=静默,1=简化,2=完整）

/* Endpoints（优化分享领取接口占位符） */
const END={
sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward" // 【需替换】抓包真实领取接口后修改
};
const END_OPEN={
openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
openNormal:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box" // 新增：普通盲盒开箱接口（抓包确认）
};

/* 基础配置 */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
const LOG_LEVEL_MAP={ silent:0, simple:1, full:2 }; // 日志级别映射

/* 日志分级优化（按配置输出） */
function getLogLevel(){
const v=readPS(KEY_LOG_LEVEL)||"full";
return LOG_LEVEL_MAP[v]??LOG_LEVEL_MAP.full;
}
function logInfo(...args){
const level=getLogLevel();
if(level<2) return;
console.log([${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")});
}
function logWarn(...args){
const level=getLogLevel();
if(level<1) return;
console.warn([${nowStr()}] warn ${args.join(" ")});
}
function logErr(...args){
const level=getLogLevel();
if(level<1) return;
console.error([${nowStr()}] error ${args.join(" ")});
}

/* Token有效性校验（新增） */
function checkTokenValid(resp){
if(!resp) return true;
const invalidCodes=[401,403,50001,50002,50003]; // 常见Token失效状态码
const invalidMsgs=["无效","过期","未登录","授权","token","authorization"];
const respStr=JSON.stringify(resp).toLowerCase();
const hasInvalidCode=invalidCodes.includes(resp.code||resp.status);
const hasInvalidMsg=invalidMsgs.some(msg=>respStr.includes(msg));
return !(hasInvalidCode||hasInvalidMsg);
}

/* 抓包处理（保持原有逻辑） */
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

/* 读取配置（新增分享开关、日志级别） */
const cfg={
Authorization: readPS(KEY_AUTH)||"",
DeviceId: readPS(KEY_DEV)||"",
userAgent: readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
shareTaskUrl: readPS(KEY_SHARE)||"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
debug: (readPS(KEY_DEBUG)===null||readPS(KEY_DEBUG)===undefined)?true:(readPS(KEY_DEBUG)!=="false"),
notify: (readPS(KEY_NOTIFY)===null||readPS(KEY_NOTIFY)===undefined)?true:(readPS(KEY_NOTIFY)!=="false"),
autoOpenBox: readPS(KEY_AUTOBOX)==="true",
autoRepair: readPS(KEY_AUTOREPAIR)==="true",
notifyFail: (readPS(KEY_NOTIFYFAIL)===null||readPS(KEY_NOTIFYFAIL)===undefined)?true:(readPS(KEY_NOTIFYFAIL)!=="false"),
titlePrefix: readPS(KEY_TITLE)||"九号签到助手",
enableShare: (readPS(KEY_ENABLE_SHARE)===null||readPS(KEY_ENABLE_SHARE)===undefined)?true:(readPS(KEY_ENABLE_SHARE)!=="false"), // 新增
logLevel: getLogLevel() // 新增
};

logInfo("九号自动签到+分享任务开始（v2.7全优化版修复）");
logInfo("当前配置：", {
notify:cfg.notify,
autoOpenBox:cfg.autoOpenBox,
enableShare:cfg.enableShare,
logLevel:cfg.logLevel
});

if(!cfg.Authorization || !cfg.DeviceId){
notify(cfg.titlePrefix,"未配置 Token","请先抓包执行签到/分享动作以写入 Authorization / DeviceId");
logWarn("终止：未读取到账号信息");
$done();
}

/* 构造请求头（保持1:1抓包匹配） */
function makeHeaders(){
return {
"Authorization":cfg.Authorization,
"Content-Type":"application/octet-stream;tt-data=a",
"device_id":cfg.DeviceId,
"User-Agent":"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
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

/* HTTP请求（新增Token失效校验） */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT,isBase64=false}){
return new Promise((resolve,reject)=>{
let attempts=0;
const once=()=>{
attempts++;
const opts={url,headers,timeout};
if(method==="POST"){
opts.body=body;
if(isBase64) opts["body-base64"]=true;
}
const cb=(err,resp,data)=>{
if(err){
const msg=String(err&&(err.error||err.message||err));
const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
if(attempts<MAX_RETRY && shouldRetry){
logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
setTimeout(once,RETRY_DELAY);
return;
}
else{ reject(err); return; }
}
// Token失效校验
const respData=JSON.parse(data||"{}");
if(!checkTokenValid({code:resp.status, ...respData})){
notify(cfg.titlePrefix,"Token失效 ⚠️","Authorization已过期/无效，请重新抓包写入");
reject(new Error("Token invalid or expired"));
return;
}
if(resp && resp.status && resp.status>=500 && attempts<MAX_RETRY){
logWarn(`服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
setTimeout(once,RETRY_DELAY);
return;
}
try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
};
if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
};
once();
});
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={},isBase64=false){ return requestWithRetry({method:"POST",url,headers,body,isBase64}); }

/* 时间工具函数 */
function toDateKeyAny(ts){
try{
if(!ts) return null;
if(typeof ts==="number"){
if(ts>1e12) ts=Math.floor(ts/1000);
const d=new Date(ts*1000);
return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
if(typeof ts==="string"){
let n=Number(ts);
if(!isNaN(n)){
if(n>1e12) n=Math.floor(n/1000);
const d=new Date(n*1000);
return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}else{
const d=new Date(ts);
if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
}
return null;
}catch(e){ logWarn("toDateKeyAny异常：",String(e)); return null; }
}
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* 分享任务（新增开关控制） */
async function doShareTask(headers){
// 分享开关判断
if(!cfg.enableShare){
logInfo("分享任务已关闭（BoxJS配置），跳过");
return { success:false, msg:"ℹ️ 分享任务已关闭", exp:0, ncoin:0 };
}

const today=todayKey();
const lastShareDate=readPS(KEY_LAST_SHARE)||"";

if(lastShareDate===today){
logInfo("今日已完成分享任务，跳过");
return { success:false, msg:"ℹ️ 今日已分享", exp:0, ncoin:0 };
}

// 此处 ENCRYPTED_BODY 及真实接口需抓包替换
const ENCRYPTED_BODY="EjkgIAIDy8q/..."; // 省略示例内容

logInfo("开始执行分享任务（Base64加密体模式）...");
try{
const shareResp=await httpPost(
cfg.shareTaskUrl,
headers,
ENCRYPTED_BODY,
true
);
logInfo("分享接口返回：", shareResp);

if(shareResp.e===0||shareResp.success===true||shareResp.message==="success"){
writePS(today, KEY_LAST_SHARE);

// 自动领取分享奖励（提示：替换真实接口后生效）
try{
const receiveResp=await httpPost(
END.shareReceiveReward,
headers,
{
deviceId: cfg.DeviceId,
taskType: "share",
timestamp: Date.now(),
signType: "daily_share",
awardType: 1
}
);
logInfo("分享奖励领取接口返回：", receiveResp);
}catch(e){ logWarn("自动领取奖励异常：", String(e)); }

return { success: true, msg:"✅ 分享任务：成功\n🎯 领取状态：已尝试自动领取", exp:0, ncoin:0 };
}else{
const errMsg=shareResp.msg||shareResp.message||"接口返回异常";
logWarn("分享任务失败：", errMsg);
return { success:false, msg:`❌ 分享失败：${errMsg}`, exp:0, ncoin:0 };
}
}catch(e){
logErr("分享任务请求异常：",String(e));
return { success:false, msg:cfg.notifyFail?`❌ 分享异常：${String(e)}`:"", exp:0, ncoin:0 };
}
}

/* 盲盒开箱逻辑优化（支持所有可开盲盒） */
async function openAllAvailableBoxes(headers){
if(!cfg.autoOpenBox){
logInfo("自动开箱已关闭（BoxJS配置），跳过");
return [];
}
try{
const boxResp=await httpGet(END.blindBoxList,headers);
const notOpened=boxResp?.data?.notOpenedBoxes||[];
const availableBoxes=notOpened.filter(b=>Number(b.leftDaysToOpen??b.remaining)===0);
const openResults=[];
for(const box of availableBoxes){
const boxType=Number(box.awardDays??box.totalDays)===7?"seven":"normal";
const openUrl=boxType==="seven"?END_OPEN.openSeven:END_OPEN.openNormal;
const boxId=box.id??box.boxId??"";
try{
const openResp=await httpPost(openUrl,headers,{
deviceId: cfg.DeviceId,
boxId: boxId
});
if(openResp?.code===0||openResp?.success===true){
const reward=openResp.data?.awardName??"未知奖励";
openResults.push(`✅ ${box.awardDays??box.totalDays}天盲盒：${reward}`);
}else{
const errMsg=openResp.msg||openResp.message||"开箱失败";
openResults.push(`❌ ${box.awardDays??box.totalDays}天盲盒：${errMsg}`);
}
}catch(e){
openResults.push(`❌ ${box.awardDays??box.totalDays}天盲盒：${String(e)}`);
}
await new Promise(resolve=>setTimeout(resolve,1000));
}
return openResults;
}catch(e){ logErr("盲盒查询/开启异常：",String(e)); return ["❌ 盲盒功能异常："+String(e)]; }
}

/* 主流程 */
(async()=>{
try{
const headers=makeHeaders();
logInfo("查询签到状态...");
let statusResp=null;
try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); } catch(e){ logWarn("状态请求异常：",String(e)); }
const statusData=statusResp?.data||{};
let consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
const knownSignedValues=[1,'1',true,'true'];
const isSigned=knownSignedValues.includes(currentSignStatus);

let signMsg="", todayGainExp=0, todayGainNcoin=0;
if(!isSigned){
try{
const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
if(signResp.code===0||signResp.code===1||signResp.success===true){
consecutiveDays+=1;
const rewardList=signResp.data?.rewardList;
let newExp=0,newCoin=0;
if(Array.isArray(rewardList)){
for(const r of rewardList){
const v=Number(r.rewardValue??0);
const t=Number(r.rewardType??0);
if(t===1) newExp+=v; else newCoin+=v;
}
}
const nCoin=Number(signResp.data?.nCoin??signResp.data?.coin??0);
const score=Number(signResp.data?.score??signResp.data?.credit??0);
todayGainExp+=(score+newExp);
todayGainNcoin+=(nCoin+newCoin);
signMsg=`✅ 签到成功，连续签到：${consecutiveDays} 天`;
}else{
signMsg=`❌ 签到失败：${signResp.msg||signResp.message||"未知错误"}`;
}
}catch(e){ signMsg=`❌ 签到异常：${String(e)}`; logErr(signMsg); if(cfg.notifyFail) notify(cfg.titlePrefix,"签到异常",signMsg); }
}else{ signMsg=`ℹ️ 今日已签到，连续签到：${consecutiveDays} 天`; }

logInfo(signMsg);

/* 执行分享任务 */
const shareResult=await doShareTask(headers);

/* 自动开箱 */
const boxResults=await openAllAvailableBoxes(headers);

/* 通知展示 */
let notifyBody=`${signMsg}`;
if(shareResult?.msg) notifyBody+=`\n${shareResult.msg}`;
if(boxResults.length>0) notifyBody+=`\n\n📦 盲盒开箱结果\n${boxResults.join("\n")}`;

/* 删除今日获得显示，不再输出 */
if(cfg.notify) notify(cfg.titlePrefix,"签到&分享任务完成",notifyBody);
logInfo("主流程完成");
}catch(e){ logErr("主流程异常：",String(e)); if(cfg.notifyFail) notify(cfg.titlePrefix,"脚本执行异常",String(e)); }
})();