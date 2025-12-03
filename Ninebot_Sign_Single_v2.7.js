/***********************************************
Ninebot_Sign_Single_v2.7.js （插件关联日志/标题版）
2025-12-05 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

const IS_LOON = typeof $argument !== "undefined";
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 读取 BoxJS 配置
const ARG = {
    titlePrefix: IS_LOON ? ($argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手") : readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: IS_LOON ? ($argument?.logLevel || readPS("ninebot.logLevel") || "full") : readPS("ninebot.logLevel") || "full",
    notify: IS_LOON ? ($argument?.notify === "true") : (readPS("ninebot.notify") === "true")
};

// 日志等级映射
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
function getLogLevel() { return LOG_LEVEL_MAP[ARG.logLevel] ?? 2; }

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { 
    if (HAS_NOTIFY) $notification.post(title, sub, body);
}

// 时间格式化
function nowStr() { return new Date().toLocaleString(); }

// 日志函数
const cfg = { logLevel: getLogLevel() };
function logInfo(...args) { if (cfg.logLevel >= 2) console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args) { if (cfg.logLevel >= 1) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args) { if (cfg.logLevel >= 0) console.error(`[${nowStr()}] error ${args.join(" ")}`); }

// BoxJS Key
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";

// 接口
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;

// 检查 token 是否有效
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return !(hasInvalidCode || hasInvalidMsg);
}

// 抓包写入 BoxJS
if (IS_REQUEST && $request?.url?.includes("/portal/api/user-sign/v2/status")) {
    try {
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        let changed = false;
        if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
        if (changed) {
            writePS(new Date().toISOString().slice(0,19).replace('T',' '), KEY_LAST_CAPTURE);
            notify(ARG.titlePrefix, "抓包成功 ✓", "数据已写入 BoxJS");
        }
    } catch(e) { logErr("抓包异常：", e); notify(ARG.titlePrefix, "抓包失败 ⚠️", String(e).slice(0,50)); }
    $done({});
}

// Headers 构造
function makeHeaders() {
    return {
        "Authorization": readPS(KEY_AUTH) || "",
        "Content-Type": "application/octet-stream;tt-data=a",
        "device_id": readPS(KEY_DEV) || "",
        "User-Agent": readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "aid": "10000004"
    };
}

// 请求封装
function requestWithRetry({ method="GET", url, headers={}, body=null }) {
    return new Promise((resolve,reject)=>{
        let attempts=0;
        const once=()=>{
            attempts++;
            const opts={url,headers,timeout:REQUEST_TIMEOUT};
            if(method==="POST") opts.body=body;
            const cb=(err,resp,data)=>{
                if(err){
                    const msg=String(err.error||err.message||err);
                    if(attempts<MAX_RETRY && /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg) && readPS(KEY_ENABLE_RETRY)!=="false"){
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once,RETRY_DELAY); return;
                    }
                    reject(err); return;
                }
                try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({ raw:data }); }
            };
            if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
        };
        once();
    });
}
const httpGet=url=>requestWithRetry({method:"GET",url});
const httpPost=(url,headers,body)=>requestWithRetry({method:"POST",url,headers,body});

// 日期处理
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

// 主流程
(async()=>{
    try{
        const headers=makeHeaders();
        const today=todayKey();
        const lastSignDate=readPS("ninebot.lastSignDate")||"";
        const isTodaySigned=lastSignDate===today;
        let signMsg="";
        if(!isTodaySigned){
            logInfo("今日未签到，执行签到...");
            try{
                const resp=await httpPost(END.sign,headers,{deviceId:readPS(KEY_DEV)});
                if(resp.code===0) { writePS(today,"ninebot.lastSignDate"); signMsg="✨ 今日签到：成功"; }
                else { signMsg="✨ 今日签到：已签到"; writePS(today,"ninebot.lastSignDate"); }
            } catch(e){ logWarn("签到异常：",String(e)); signMsg="❌ 签到异常"; }
        } else { signMsg="✨ 今日签到：已签到"; }

        // 查询盲盒
        let boxMsg="";
        try{
            const boxList=await httpGet(END.blindBoxList,headers);
            const notOpened=boxList?.data?.notOpenedBoxes||[];
            boxMsg=notOpened.length>0 ? `📦 可开盲盒 ${notOpened.length} 个` : "📦 无可开盲盒";
        } catch(e){ logWarn("盲盒查询异常：",String(e)); boxMsg="📦 盲盒查询异常"; }

        // 账户状态
        let balLine="", creditLine="";
        try{ const bal=await httpGet(END.balance,headers); balLine=`- 当前 N 币：${bal.data?.balance||0}`; } catch(e){ logWarn("余额查询异常",e); }
        try{ const cr=await httpGet(END.creditInfo,headers); const c=cr?.data||{}; creditLine=`- 当前经验：${c.credit||0}${c.level?`（LV.${c.level}）`:''}`; } catch(e){ logWarn("经验查询异常",e); }

        if(ARG.notify){
            notify(ARG.titlePrefix,"",`${signMsg}\n${boxMsg}\n📊 账户状态\n${creditLine}\n${balLine}`);
        }
        logInfo("九号自动签到任务完成（v2.7 插件关联版）");
    } catch(e){ logErr("主流程异常：",e); if(ARG.notify) notify(ARG.titlePrefix,"任务异常 ⚠️",String(e)); }
})();