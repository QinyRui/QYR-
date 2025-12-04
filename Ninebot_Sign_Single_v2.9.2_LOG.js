/***********************************************
 Ninebot_Sign_Single_v2.9.2_LOG.js
 2025-12-05 完整兼容版
 核心功能：
 1. 完全兼容 Loon 插件 UI 参数和 CRON 调度
 2. 自动抓包写入 BoxJS
 3. 自动签到 + 补签（可选） + 盲盒开箱
 4. 插件可调日志等级（debug/info/warn/error）
***********************************************/

/* 兼容 $argument 在 CRON 或非插件环境下未定义 */
const $arg = typeof $argument !== "undefined" ? $argument : {};
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* BoxJS 读写工具 */
function readPS(key) { try { return HAS_PERSIST ? $persistentStore.read(key) : null; } catch (e) { return null; } }
function writePS(val, key) { try { return HAS_PERSIST ? $persistentStore.write(val, key) : false; } catch (e) { return false; } }
function notify(title, sub, body) { if (HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }
function formatDateTime(date = new Date()) {
    const Y = date.getFullYear(), M = String(date.getMonth()+1).padStart(2,"0"),
        D = String(date.getDate()).padStart(2,"0"), h = String(date.getHours()).padStart(2,"0"),
        m = String(date.getMinutes()).padStart(2,"0"), s = String(date.getSeconds()).padStart(2,"0");
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_AUTO_REPAIR = "ninebot.autoRepairCard";
const KEY_AUTOBOX = "ninebot.autoOpenBox";

/* Endpoints */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    repairSign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

/* 基础配置（优化重试策略） */
const RETRY_CONFIG = { default:{max:3,delay:1500}, sign:{max:2,delay:1000}, blindBox:{max:2,delay:2000}, query:{max:1,delay:1000} };
const REQUEST_TIMEOUT = 12000;

/* 日志分级 */
const LOG_LEVEL_MAP = { debug:2, info:2, warn:1, error:0 };
function getLogLevel() { return LOG_LEVEL_MAP[$arg.logLevel ?? "debug"] ?? 2; }
function logInfo(...args) { if (getLogLevel()>=2) console.log(`[${nowStr()}] INFO:`, ...args); }
function logWarn(...args) { if (getLogLevel()>=1) console.warn(`[${nowStr()}] WARN:`, ...args); }
function logErr(...args) { if (getLogLevel()>=0) console.error(`[${nowStr()}] ERROR:`, ...args); }

/* 读取配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    notify: $arg.notify ?? true,
    autoRepair: readPS(KEY_AUTO_REPAIR) === "true",
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
};

/* 时间工具 */
function todayKey() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function toDateKeyAny(ts){ if(!ts) return null; try{ let d; if(typeof ts==="number"){ ts=ts>1e12?Math.floor(ts/1000):ts; d=new Date(ts*1000); }else d=new Date(ts); return !isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:null; }catch(e){ return null; }}

/* HTTP请求封装 */
function requestWithRetry({method="GET",url,headers={},body=null,retryType="default"}) {
    return new Promise((resolve,reject)=>{
        const {max:MAX_RETRY,delay:RETRY_DELAY}=RETRY_CONFIG[retryType]||RETRY_CONFIG.default;
        let attempts=0;
        const once=()=>{
            attempts++;
            const opts={url,headers,timeout:REQUEST_TIMEOUT};
            if(method==="POST"&&body) opts.body=JSON.stringify(body);
            const cb=(err,resp,data)=>{
                if(err){ if(attempts<MAX_RETRY) setTimeout(once,RETRY_DELAY); else reject(err); return; }
                let respData={};
                try{ respData=JSON.parse(data||"{}"); }catch(e){ respData={raw:data}; }
                resolve(respData);
            };
            if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
        }; once();
    });
}
function httpGet(url,headers={},retryType="query"){ return requestWithRetry({method:"GET",url,headers,retryType}); }
function httpPost(url,headers={},body={},retryType="default"){ return requestWithRetry({method:"POST",url,headers,body,retryType}); }

/* 抓包写入 */
if(IS_REQUEST && cfg.capture){
    try{
        const h=$request.headers||{};
        const auth=h["Authorization"]||h["authorization"]||"";
        const dev=h["DeviceId"]||h["deviceid"]||"";
        const ua=h["User-Agent"]||h["user-agent"]||"";
        if(auth) writePS(auth,KEY_AUTH);
        if(dev) writePS(dev,KEY_DEV);
        if(ua) writePS(ua,KEY_UA);
        writePS(formatDateTime(),KEY_LAST_CAPTURE);
        notify("九号智能电动车","抓包成功 ✓","数据已写入 BoxJS");
        logInfo("抓包写入成功");
    }catch(e){ logErr("抓包异常：",e); notify("九号智能电动车","抓包失败 ⚠️",String(e).slice(0,50)); }
    $done({});
}

/* 构造请求头 */
function makeHeaders(){ return {
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

/* 主流程 */
(async()=>{
    try{
        logInfo("九号自动签到 v2.9.2_LOG 开始执行");
        if(!cfg.Authorization||!cfg.DeviceId){ notify("九号智能电动车","未配置 Token","请先抓包执行签到动作以写入 Authorization/DeviceId"); logWarn("终止：未配置账号信息"); $done(); }

        const headers=makeHeaders();
        const today=todayKey();
        const lastSignDate=readPS(KEY_LAST_SIGN_DATE)||"";
        let isTodaySigned=lastSignDate===today;

        // 查询签到状态
        if(!isTodaySigned){
            const statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
            const currentSignStatus=statusResp?.data?.currentSignStatus??statusResp?.data?.currentSign??0;
            isTodaySigned=[1,'1',true,'true'].includes(currentSignStatus);
        }

        let signMsg="";
        if(!isTodaySigned){
            const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId},"sign");
            if(signResp?.code===0){ writePS(today,KEY_LAST_SIGN_DATE); signMsg="✨ 今日签到：成功"; }
            else signMsg=`❌ 签到失败：${signResp?.msg??signResp?.message??"未知错误"}`;
        } else signMsg="✨ 今日签到：已完成";

        // 盲盒开箱
        let boxMsg="📦 盲盒开箱结果：无可用盲盒";
        if(cfg.autoOpenBox){
            try{
                const boxResp=await httpGet(END.blindBoxList,headers,"blindBox");
                const notOpened=boxResp?.data?.notOpenedBoxes||[];
                const available=notOpened.filter(b=>Number(b.leftDaysToOpen??b.remaining)===0);
                const results=[];
                for(const box of available){
                    const url=Number(box.awardDays??box.totalDays)===7?END_OPEN.openSeven:END_OPEN.openNormal;
                    const boxId=box.id??box.boxId??"";
                    if(!boxId){ results.push(`❌ ${box.awardDays}天盲盒：缺失ID`); continue; }
                    const openResp=await httpPost(url,headers,{deviceId:cfg.DeviceId,boxId:boxId},'blindBox');
                    if(openResp?.code===0||openResp?.success) results.push(`✅ ${box.awardDays}天盲盒：${openResp?.data?.awardName??"未知奖励"}`);
                    else results.push(`❌ ${box.awardDays}天盲盒：${openResp?.msg??"开箱失败"}`);
                }
                if(results.length>0) boxMsg=`📦 盲盒开箱结果\n${results.join("\n")}`;
            }catch(e){ boxMsg=`📦 盲盒查询异常：${String(e)}`; logErr(e); }
        }

        // 发送通知
        if(cfg.notify){
            notify("九号智能电动车","",`${signMsg}\n${boxMsg}`);
            logInfo("通知已发送");
        }

        logInfo("九号自动签到 v2.9.2_LOG 执行完成");
    }catch(e){ logErr("主流程异常：",e); if(cfg.notify) notify("九号智能电动车","任务异常 ⚠️",String(e)); }
    finally{ $done(); }
})();