/***********************************************
Ninebot_Sign_Single_v2.7.js （版本 E · 全优化版）
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

logInfo("九号自动签到+分享任务开始（v2.7全优化版）");
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
logWarn(请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY}));
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
logWarn(服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY}));
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

/* 时间工具函数（保持原有逻辑） /
function toDateKeyAny(ts){
if(!ts) return null;
if(typeof ts==="number"){
if(ts>1e12) ts=Math.floor(ts/1000);
const d=new Date(ts1000);
return ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")};
}
if(typeof ts==="string"){
if(/^\d+/.test(ts)){
let n=Number(ts);
if(n>1e12) n=Math.floor(n/1000);
const d=new Date(n*1000);
return `{d.getFullYear()}-{String(d.getMonth()+1).padStart(2,"0")}-{String(d.getDate()).padStart(2,"0")}; } else{ const d=new Date(ts); if(!isNaN(d)) return {d.getFullYear()}-{String(d.getMonth()+1).padStart(2,"0")}-{String(d.getDate()).padStart(2,"0")}`;
}
}
return null;
}
function todayKey(){ const d=new Date(); return `{d.getFullYear()}-{String(d.getMonth()+1).padStart(2,"0")}-{String(d.getDate()).padStart(2,"0")}`; }

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

const ENCRYPTED_BODY="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";

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
logInfo("尝试自动领取分享奖励（请确保接口已替换为真实地址）...");
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
let receiveMsg="";
if(receiveResp.code===0||receiveResp.success===true||(receiveResp.msg&&receiveResp.msg.includes("成功"))||(receiveResp.message&&receiveResp.message.includes("成功"))){
receiveMsg="✅ 奖励已领取";
} else if((receiveResp.msg&&receiveResp.msg.includes("已领取"))||(receiveResp.message&&receiveResp.message.includes("已领取"))){
receiveMsg="ℹ️ 奖励已领取";
} else {
receiveMsg="⚠️ 领取接口可能未替换（请抓包真实接口）";
}
}catch(e){
logWarn("自动领取奖励异常：", String(e));
}

await new Promise(resolve => setTimeout(resolve, 2000));
let shareExp=0, shareNcoin=0;

// 积分统计
const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
const todayCreditList=creditList.filter(it=>toDateKeyAny(it.create_date??it.createTime)===today);
logInfo("今日积分记录（全部）：", todayCreditList);
for(const it of creditList){
const k=toDateKeyAny(it.create_date??it.createTime);
const type=it.type??it.creditType??"未知类型";
if(k===today&&(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")||type.includes("share_task"))){
shareExp+=Number(it.credit??it.amount??it.value??0);
logInfo("匹配到分享积分奖励：", it.credit??it.amount??it.value??0, "类型：", type);
}
}

// N币统计
const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
const todayNcoinList=nCoinList.filter(it=>toDateKeyAny(it.create_time??it.createDate)===today);
logInfo("今日N币记录（全部）：", todayNcoinList);
for(const it of nCoinList){
const k=toDateKeyAny(it.create_time??it.createDate);
const type=it.type??it.operateType??"未知类型";
if(k===today&&(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")||type.includes("share_task"))){
shareNcoin+=Number(it.amount??it.coin??it.value??it.nCoin??0);
logInfo("匹配到分享N币奖励：", it.amount??it.coin??it.value??it.nCoin??0, "类型：", type);
}
}

return {
success: true,
msg: ✅ 分享任务：成功\n🎯 领取状态：已尝试自动领取\n🎁 分享奖励：+${shareExp} 经验、+${shareNcoin} N 币,
exp: shareExp,
ncoin: shareNcoin
};
} else{
const errMsg=shareResp.msg||shareResp.message||"接口返回异常";
logWarn("分享任务失败：", errMsg);
return { success:false, msg:❌ 分享失败：${errMsg}, exp:0, ncoin:0 };
}
}catch(e){
const errMsg=String(e);
logErr("分享任务请求异常：", errMsg);
return { success:false, msg:cfg.notifyFail?❌ 分享异常：${errMsg}:"", exp:0, ncoin:0 };
}
}

/* 盲盒开箱逻辑优化（支持所有可开盲盒） */
async function openAllAvailableBoxes(headers){
if(!cfg.autoOpenBox){
logInfo("自动开箱已关闭（BoxJS配置），跳过");
return [];
}

logInfo("查询可开启盲盒...");
try{
const boxResp=await httpGet(END.blindBoxList,headers);
const notOpened=boxResp?.data?.notOpenedBoxes||[];
const availableBoxes=notOpened.filter(b=>Number(b.leftDaysToOpen??b.remaining)===0);
logInfo("可开启盲盒：", availableBoxes);

const openResults=[];
for(const box of availableBoxes){
const boxType=Number(box.awardDays??box.totalDays)===7?"seven":"normal";
const openUrl=boxType==="seven"?END_OPEN.openSeven:END_OPEN.openNormal;
const boxId=box.id??box.boxId??"";

logInfo(开启${box.awardDays??box.totalDays}天盲盒（类型：${boxType}，ID：${boxId}）);
try{
const openResp=await httpPost(openUrl,headers,{
deviceId: cfg.DeviceId,
boxId: boxId // 普通盲盒可能需要传入boxId，抓包确认
});
if(openResp?.code===0||openResp?.success===true){
const reward=openResp.data?.awardName??"未知奖励";
openResults.push(✅ ${box.awardDays}天盲盒：${reward});
logInfo(盲盒开启成功，奖励：${reward});
} else{
const errMsg=openResp.msg||openResp.message||"开箱失败";
openResults.push(❌ ${box.awardDays}天盲盒：${errMsg});
logWarn(盲盒开启失败：${errMsg});
}
}catch(e){
const errMsg=String(e);
openResults.push(❌ ${box.awardDays}天盲盒：${errMsg});
logErr(盲盒开启异常：${errMsg});
}
await new Promise(resolve => setTimeout(resolve, 1000)); // 避免请求过快
}
return openResults;
}catch(e){
logErr("盲盒查询/开启异常：", String(e));
return ["❌ 盲盒功能异常："+String(e)];
}
}

/* 主流程 */
(async()=>{
try{
const headers=makeHeaders();

// 1. 查询签到状态
logInfo("查询签到状态...");
let statusResp=null;
try{ statusResp=await httpGet(${END.status}?t=${Date.now()},headers); } catch(e){ logWarn("状态请求异常：",String(e)); }
const statusData=statusResp?.data||{};
let consecutiveDays=statusData?.consecutiveDays??statusData?.continuousDays??0;
const signCards=statusData?.signCardsNum??statusData?.remedyCard??0;
const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
logInfo("签到状态返回：",statusResp);

const knownSignedValues=[1,'1',true,'true'];
const isSigned=knownSignedValues.includes(currentSignStatus);

// 2. 执行签到
let signMsg="", todayGainExp=0, todayGainNcoin=0;
if(!isSigned){
logInfo("今日未签到，尝试执行签到...");
try{
const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
logInfo("签到接口返回：",signResp);
if(signResp.code===0||signResp.code===1||signResp.success===true){
consecutiveDays+=1;

// 解析奖励
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
signMsg=✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币;
} else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))||(signResp.message&&/已签到/.test(signResp.message))){
signMsg=✨ 今日签到：已签到（接口）;
} else{
const rawMsg=signResp.msg??signResp.message??JSON.stringify(signResp);
signMsg=❌ 签到失败：${rawMsg};
if(!cfg.notifyFail) signMsg="";
}
}catch(e){ logWarn("签到请求异常：",String(e)); if(cfg.notifyFail) signMsg=❌ 签到请求异常：${String(e)}; }
} else { signMsg=✨ 今日签到：已签到; logInfo("今日已签到，跳过签到接口"); }

// 3. 执行分享任务
let shareMsg="";
if(cfg.enableShare){
const shareResult=await doShareTask(headers);
shareMsg=shareResult.msg;
todayGainExp+=shareResult.exp;
todayGainNcoin+=shareResult.ncoin;
} else{
shareMsg="ℹ️ 分享任务已关闭（BoxJS配置）";
}

// 4. 补充统计今日奖励
try{
const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
const today=todayKey();
const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
for(const it of creditList){
const k=toDateKeyAny(it.create_date??it.createTime??it.create_date_str??it.create_time);
const type=it.type??it.creditType??"";
if(k===today && !(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取"))){
todayGainExp+=Number(it.credit??it.amount??it.value??0)||0;
}
}
const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
for(const it of nCoinList){
const k=toDateKeyAny(it.create_time??it.createDate??it.createTime??it.create_date);
const type=it.type??it.operateType??"";
if(k===today && !(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取"))){
todayGainNcoin+=Number(it.amount??it.coin??it.value??it.nCoin??0)||0;
}
}
logInfo("今日积分/N币统计完成：",todayGainExp,todayGainNcoin);
}catch(e){ logWarn("积分/N币统计异常：",String(e)); }

// 5. 查询账户信息
let upgradeLine="", creditData={};
try{
const cr=await httpGet(END.creditInfo,headers);
creditData=cr?.data||{};
const credit=Number(creditData.credit??0);
const level=creditData.level??null;
let need=0;
if(creditData.credit_upgrade){
const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
if(m&&m[1]) need=Number(m[1]);
} else if(creditData.credit_range && Array.isArray(creditData.credit_range)&&creditData.credit_range.length>=2){
need=creditData.credit_range[1]-credit;
}
upgradeLine=- 当前经验：${credit}${level?（LV.{level}）`:''}\n- 距离升级：{need} 经验`;
}catch(e){ logWarn("经验信息查询异常：",String(e)); }

// 6. 查询N币余额
let balLine="";
try{
const bal=await httpGet(END.balance,headers);
if(bal?.code===0) balLine=- 当前 N 币：${bal.data?.balance??bal.data?.coin??0};
else if(bal?.data && bal.data.balance!==undefined) balLine=- 当前 N 币：${bal.data.balance};
}catch(e){ logWarn("余额查询异常：",String(e)); }

// 7. 自动开启所有可开盲盒（优化后）
const boxOpenResults=await openAllAvailableBoxes(headers);
const boxMsg=boxOpenResults.length>0?\n📦 盲盒开箱结果\n+boxOpenResults.join("\n"):"\n📦 盲盒开箱结果：无可用盲盒";

// 8. 盲盒进度统计
let blindProgress="无";
try{
const boxResp=await httpGet(END.blindBoxList,headers);
const notOpened=boxResp?.data?.notOpenedBoxes||[];
if(Array.isArray(notOpened) && notOpened.length>0){
blindProgress=notOpened.map(b=>${b.awardDays??b.totalDays}天盲盒：${b.openedDays??b.currentDays??0}/${b.awardDays??b.totalDays}天).join("\n| ");
}
}catch(e){ logWarn("盲盒进度查询异常：",String(e)); }

// 9. 发送通知
if(cfg.notify){
let notifyBody=${signMsg}\n${shareMsg}${boxMsg}\n\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindProgress}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin};
const MAX_NOTIFY_LEN=1000;
if(notifyBody.length>MAX_NOTIFY_LEN) notifyBody=notifyBody.slice(0,MAX_NOTIFY_LEN-3)+'...';
notify(cfg.titlePrefix,"",notifyBody);
logInfo("发送通知：",notifyBody);
}

logInfo("九号自动签到+分享任务完成（v2.7全优化版）");
}catch(e){
logErr("自动签到主流程异常：",e);
if(cfg.notifyFail) notify(cfg.titlePrefix,"任务异常 ⚠️",String(e));
}
})();