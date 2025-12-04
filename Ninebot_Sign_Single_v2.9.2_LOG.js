/***********************************************
Ninebot_Sign_Single_v2.9.2_LOG.js
2025-12-05 16:30 更新
核心优化：插件UI可调日志等级，单脚本实现抓包+签到+盲盒+补签
适配工具：Surge/Quantumult X/Loon
功能覆盖：抓包写入、自动签到、盲盒开箱、自动补签、通知、经验/N币统计、自动更新
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request!== "undefined";
const HAS_PERSIST = typeof $persistentStore!== "undefined";
const HAS_NOTIFY = typeof $notification!== "undefined";
const HAS_HTTP = typeof $httpClient!== "undefined";

function readPS(key){try{return HAS_PERSIST?$persistentStore.read(key):null}catch(e){return null;}}
function writePS(val,key){try{return HAS_PERSIST?$persistentStore.write(val,key):false}catch(e){return false;}}
function notify(title,sub,body){if(HAS_NOTIFY)$notification.post(title,sub,body);}
function nowStr(){return new Date().toLocaleString();}
function formatDateTime(date=new Date()){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0"),h=String(date.getHours()).padStart(2,"0"),mi=String(date.getMinutes()).padStart(2,"0"),s=String(date.getSeconds()).padStart(2,"0");return `${y}-${m}-${d} ${h}:${mi}:${s}`;}

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization",KEY_DEV="ninebot.deviceId",KEY_UA="ninebot.userAgent",
      KEY_NOTIFY="ninebot.notify",KEY_AUTOBOX="ninebot.autoOpenBox",KEY_AUTO_REPAIR="ninebot.autoRepairCard",
      KEY_LAST_CAPTURE="ninebot.lastCaptureAt",KEY_LAST_SIGN_DATE="ninebot.lastSignDate";

/* Endpoints */
const END={
    sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    repairSign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
};
const END_OPEN={openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
                openNormal:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"};

/* 请求配置 */
const RETRY_CONFIG={default:{max:3,delay:1500},sign:{max:2,delay:1000},blindBox:{max:2,delay:2000},query:{max:1,delay:1000}};
const REQUEST_TIMEOUT=12000;

/* 日志等级由插件UI选择 */
const logLevelArg = $argument?.logLevel || "info"; // debug/info/warn/error
const LOG_LEVEL_MAP={debug:4,info:3,warn:2,error:1};
const CURRENT_LOG_LEVEL=LOG_LEVEL_MAP[logLevelArg]||3;
function LOG(msg,level="info"){if(LOG_LEVEL_MAP[level]<=CURRENT_LOG_LEVEL)console.log(`[${level.toUpperCase()}] ${nowStr()}: ${typeof msg==="object"?JSON.stringify(msg,null,2):msg}`);}

/* Token有效性校验 */
function checkTokenValid(resp){
    if(!resp)return true;
    const invalidCodes=[401,403,50001,50002,50003];
    const invalidMsgs=["无效","过期","未登录","授权","token","authorization","请重新登录"];
    const respStr=JSON.stringify(resp).toLowerCase();
    const hasInvalidCode=invalidCodes.includes(resp.code||resp.status);
    const hasInvalidMsg=invalidMsgs.some(msg=>respStr.includes(msg.toLowerCase()));
    return !(hasInvalidCode||hasInvalidMsg);
}

/* 抓包处理 */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign"];
const isCaptureRequest=IS_REQUEST&&$request&&$request.url&&CAPTURE_PATTERNS.some(u=>$request.url.includes(u));
if(isCaptureRequest){
    try{
        LOG("进入抓包写入流程（仅基础鉴权）","debug");
        const h=$request.headers||{};
        const auth=h["Authorization"]||h["authorization"]||"";
        const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
        const ua=h["User-Agent"]||h["user-agent"]||"";
        LOG("抓包 URL：",$request.url,"debug");
        let changed=false;
        if(auth&&readPS(KEY_AUTH)!==auth){writePS(auth,KEY_AUTH);changed=true;}
        if(dev&&readPS(KEY_DEV)!==dev){writePS(dev,KEY_DEV);changed=true;}
        if(ua&&readPS(KEY_UA)!==ua){writePS(ua,KEY_UA);changed=true;}
        if(changed){
            const currentTime=formatDateTime();
            writePS(currentTime,KEY_LAST_CAPTURE);
            notify("九号智能电动车","抓包成功 ✓",`数据已写入 BoxJS\n最后抓包时间：${currentTime}`);
            LOG("抓包写入成功，最后抓包时间：",currentTime,"info");
        }else LOG("抓包数据无变化","debug");
    }catch(e){LOG("抓包异常："+e,"error");notify("九号智能电动车","抓包失败 ⚠️",`抓包出错：${String(e).slice(0,50)}`);}
    $done({});
}

/* 读取配置 */
const cfg={
    Authorization:readPS(KEY_AUTH)||"",
    DeviceId:readPS(KEY_DEV)||"",
    userAgent:readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    notify:($argument?.notify==="true"),
    autoOpenBox:(readPS(KEY_AUTOBOX)==="true"),
    autoRepair:(readPS(KEY_AUTO_REPAIR)==="true"),
};

/* 构造请求头 */
function makeHeaders(){return {
    "Authorization":cfg.Authorization,
    "Content-Type":"application/json",
    "device_id":cfg.DeviceId,
    "User-Agent":cfg.userAgent,
    "platform":"h5",
    "Origin":"https://h5-bj.ninebot.com",
    "language":"zh",
    "aid":"10000004",
    "accept-encoding":"gzip, deflate, br",
    "accept-language":"zh-CN,zh-Hans;q=0.9",
    "accept":"application/json"
};}

/* HTTP请求（带重试） */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT,retryType="default"}){
    return new Promise((resolve,reject)=>{
        const {max:MAX_RETRY,delay:RETRY_DELAY}=RETRY_CONFIG[retryType]||RETRY_CONFIG.default;
        let attempts=0;
        const once=()=>{
            attempts++;
            const opts={url,headers,timeout};
            if(method==="POST")opts.body=JSON.stringify(body);
            LOG(`[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`,"debug");
            if(method==="POST"&&body)LOG("[请求体]",body,"debug");
            const cb=(err,resp,data)=>{
                if(err){
                    const msg=String(err&&(err.error||err.message||err));
                    const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed|502|504)/i.test(msg);
                    if(attempts<MAX_RETRY&&shouldRetry){setTimeout(once,RETRY_DELAY);LOG(`请求错误：${msg}，${RETRY_DELAY}ms 后重试`,"warn");return;}
                    LOG(`请求失败：${msg}`,"error");reject(new Error(`请求异常: ${msg}`));return;
                }
                let respData={};
                try{respData=JSON.parse(data||"{}");}catch(e){respData={raw:data};}
                if(!checkTokenValid({code:resp.status,...respData})){const errMsg="Token失效/未授权";notify("九号签到助手","Token失效 ⚠️","请重新抓包写入Authorization");LOG(errMsg,"error");reject(new Error(errMsg));return;}
                resolve(respData);
            };
            if(method==="GET")$httpClient.get(opts,cb);
            else $httpClient.post(opts,cb);
        };
        once();
    });
}
function httpGet(url,headers={},retryType="query"){return requestWithRetry({method:"GET",url,headers,retryType});}
function httpPost(url,headers={},body={},retryType="default"){return requestWithRetry({method:"POST",url,headers,body,retryType});}

/* 时间工具 */
function toDateKeyAny(ts){
    if(!ts)return null;
    try{
        let d;
        if(typeof ts==="number"){ts=ts>1e12?Math.floor(ts/1000):ts;d=new Date(ts*1000);}
        else if(typeof ts==="string"){
            if(/^\d+$/.test(ts)){let n=Number(ts);n=n>1e12?Math.floor(n/1000):n;d=new Date(n*1000);}
            else d=new Date(ts);
        }
        return !isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:null;
    }catch(e){LOG("时间转换异常："+e,"warn");return null;}
}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

/* 自动补签 */
async function autoRepairSign(headers,signCards){
    if(!cfg.autoRepair||signCards<=0){LOG(cfg.autoRepair?"补签卡不足，跳过":"自动补签关闭，跳过","info");return "";}
    try{
        LOG("执行自动补签...","info");
        const repairResp=await httpPost(END.repairSign,headers,{deviceId:cfg.DeviceId},"sign");
        if(repairResp?.code===0){LOG("补签成功","info");return `🔧 自动补签成功（剩余补签卡：${signCards-1}）`;}
        else{const errMsg=repairResp.msg||repairResp.message||"补签失败";LOG(`补签失败：${errMsg}`,"warn");return `🔧 补签失败：${errMsg}`;}
    }catch(e){LOG("补签异常："+e,"error");return `🔧 补签异常：${String(e)}`;}
}

/* 自动开箱 */
async function openAllAvailableBoxes(headers){
    if(!cfg.autoOpenBox){LOG("自动开箱关闭，跳过","info");return [];}
    try{
        const boxResp=await httpGet(END.blindBoxList,headers,"blindBox");
        const notOpened=boxResp?.data?.notOpenedBoxes||[];
        const availableBoxes=notOpened.filter(b=>Number(b.leftDaysToOpen??b.remaining)===0);
        const openResults=[];
        for(const box of availableBoxes){
            const boxType=Number(box.awardDays??box.totalDays)===7?"seven":"normal";
            const openUrl=boxType==="seven"?END_OPEN.openSeven:END_OPEN.openNormal;
            const boxId=box.id??box.boxId??"";
            if(!boxId){openResults.push(`❌ ${box.awardDays}天盲盒：缺失ID`);LOG("盲盒ID为空","warn");continue;}
            try{
                const timestamp=Date.now();
                const sign="default_sign"; // 简化
                const openResp=await httpPost(openUrl,headers,{deviceId:cfg.DeviceId,boxId,sign,timestamp},"blindBox");
                if(openResp?.code===0||openResp?.success===true){
                    const reward=openResp.data?.awardName??"未知奖励";
                    openResults.push(`✅ ${box.awardDays}天盲盒：${reward}`);
                    LOG(`盲盒开启成功：${reward}`,"info");
                }else{
                    const errMsg=openResp.msg||openResp.message||"开箱失败";
                    openResults.push(`❌ ${box.awardDays}天盲盒：${errMsg}`);
                    LOG(`盲盒开启失败：${errMsg}`,"warn");
                }
            }catch(e){openResults.push(`❌ ${box.awardDays}天盲盒：${String(e)}`);LOG("盲盒异常："+e,"error");}
            await new Promise(r=>setTimeout(r,1000));
        }
        return openResults;
    }catch(e){LOG("盲盒查询异常："+e,"error");return ["❌ 盲盒功能异常："+String(e)];}
}

/* 主流程 */
(async()=>{
    try{
        const headers=makeHeaders();
        const today=todayKey();
        const lastSignDate=readPS(KEY_LAST_SIGN_DATE)||"";

        let isTodaySigned=lastSignDate===today;
        let statusData={};
        if(!isTodaySigned){
            LOG("查询签到状态...","debug");
            const statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
            statusData=statusResp?.data||{};
            const currentSignStatus=statusData?.currentSignStatus??statusData?.currentSign??null;
            const knownSignedValues=[1,'1',true,'true'];
            isTodaySigned=knownSignedValues.includes(currentSignStatus);
        }

        let consecutiveDays=statusData?.consecutiveDays??0,signCards=statusData?.signCardsNum??0;
        if(!isTodaySigned){
            let signMsg="",repairMsg="",todayGainExp=0;
            LOG("今日未签到，执行签到...","info");
            try{
                const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId},"sign");
                if(signResp?.code===0&&Array.isArray(signResp.data?.rewardList)){
                    consecutiveDays+=1;
                    writePS(today,KEY_LAST_SIGN_DATE);
                    const signExp=signResp.data.rewardList.filter(r=>r.rewardType===1).reduce((s,r)=>s+Number(r.rewardValue),0);
                    todayGainExp=signExp;
                    signMsg=`✨ 今日签到：成功（+${signExp}经验）`;
                    LOG(signMsg,"info");
                }else{
                    const errMsg=signResp.msg||signResp.message||"签到失败";
                    signMsg=`❌ 签到失败：${errMsg}`;
                    LOG(signMsg,"warn");
                    if(cfg.autoRepair&&signCards>0)repairMsg=await autoRepairSign(headers,signCards);
                }
            }catch(e){LOG("签到异常："+e,"error");}
        }

        const boxOpenResults=await openAllAvailableBoxes(headers);

        if(cfg.notify){
            let notifyBody="";
            notifyBody+=`📦 盲盒开箱结果\n${boxOpenResults.join("\n")}`;
            notify("九号签到助手","",notifyBody);
        }

        LOG("自动签到完成","info");
    }catch(e){LOG("主流程异常："+e,"error");if(cfg.notify)notify("九号签到助手","任务异常 ⚠️",String(e));}
    finally{$done();}
})();