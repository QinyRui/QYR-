/***********************************************
Ninebot_Sign_Single_v2.7.js （最终修复版）
2025-12-05 16:01 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

const IS_LOON = typeof $argument !== "undefined";
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 诊断代码：环境检测
logInfo("环境检测：", { IS_LOON, HAS_PERSIST, HAS_NOTIFY, HAS_HTTP });

// 参数处理（优先使用 BoxJS 配置）
const ARG = {
    titlePrefix: IS_LOON ? ($argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手") : readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: IS_LOON ? ($argument?.logLevel || readPS("ninebot.logLevel") || "full") : readPS("ninebot.logLevel") || "full",
    notify: IS_LOON ? ($argument?.notify === "true") : (readPS("ninebot.notify") === "true")
};

// 日志等级
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
function getLogLevel() { return LOG_LEVEL_MAP[ARG.logLevel] ?? 2; }

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { 
    logInfo("通知参数：", { title, sub, body });
    if (HAS_NOTIFY) $notification.post(title, sub, body);
}

function nowStr() { return new Date().toLocaleString(); }
function logInfo(...args) { if (getLogLevel() >= 2) console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args) { if (getLogLevel() >= 1) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args) { console.error(`[${nowStr()}] error ${args.join(" ")}`); }

const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";

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
if (IS_REQUEST && $request && $request.url.includes("/portal/api/user-sign/v2/status")) {
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
            const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
            writePS(currentTime, "ninebot.lastCaptureAt");
            notify(ARG.titlePrefix, "抓包成功 ✓", `数据已写入 BoxJS\n最后抓包时间：${currentTime}`);
        }
    } catch (e) { logErr("抓包异常：", e); notify(ARG.titlePrefix, "抓包失败 ⚠️", String(e).slice(0,50)); }
    $done({});
}

// 主体配置
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    notify: ARG.notify,
    autoOpenBox: readPS("ninebot.autoOpenBox") === "true"
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(ARG.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/octet-stream;tt-data=a",
        "device_id": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com"
    };
}

function requestWithRetry({ method="GET", url, headers={}, body=null }) {
    return new Promise((resolve,reject)=>{
        let attempts = 0;
        const once = ()=>{
            attempts++;
            const opts = { url, headers, timeout: REQUEST_TIMEOUT };
            if (method==="POST") opts.body = body;
            const cb = (err, resp, data)=>{
                if (err) {
                    if (attempts<MAX_RETRY && cfg.enableRetry) setTimeout(once, RETRY_DELAY);
                    else reject(err);
                    return;
                }
                try { resolve(JSON.parse(data || "{}")); } catch(e){ resolve({raw:data}); }
            };
            if (method==="GET") $httpClient.get(opts, cb); else $httpClient.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url, headers={}, body={}){ return requestWithRetry({method:"POST",url,headers,body}); }

function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

async function openAllAvailableBoxes(headers){
    if(!cfg.autoOpenBox){ logInfo("自动开箱关闭"); return []; }
    try{
        const boxResp = await httpGet(END.blindBoxList, headers);
        const notOpened = boxResp?.data?.notOpenedBoxes||[];
        const available = notOpened.filter(b=>Number(b.leftDaysToOpen??b.remaining)===0);
        const results=[];
        for(const box of available){
            const type = Number(box.awardDays??box.totalDays)===7?"seven":"normal";
            const url = type==="seven"?END_OPEN.openSeven:END_OPEN.openNormal;
            const boxId = box.id??box.boxId??"";
            try{
                const resp = await httpPost(url, headers,{deviceId:cfg.DeviceId,boxId,timestamp:Date.now(),sign:"dummy"});
                if(resp?.code===0||resp?.success===true) results.push(`✅ ${box.awardDays}天盲盒：${resp.data?.awardName??"未知奖励"}`);
                else results.push(`❌ ${box.awardDays}天盲盒：${resp.msg??"开箱失败"}`);
            }catch(e){ results.push(`❌ ${box.awardDays}天盲盒：${String(e)}`);}
        }
        return results;
    }catch(e){ logErr("盲盒异常",e); return ["❌ 盲盒功能异常"]; }
}

(async()=>{
    try{
        const headers = makeHeaders();
        const today = todayKey();
        const lastSign = readPS("ninebot.lastSignDate")||"";
        let isTodaySigned = lastSign===today;

        // 查询签到状态
        if(!isTodaySigned){
            try{
                const status = await httpGet(`${END.status}?t=${Date.now()}`,headers);
                const cs = status?.data?.currentSignStatus??status?.data?.currentSign;
                isTodaySigned = [1,"1",true,"true"].includes(cs);
            }catch(e){ logWarn("查询签到状态异常",e);}
        }

        let consecutiveDays=0, signCards=0;
        try{
            const st = await httpGet(`${END.status}?t=${Date.now()}`,headers);
            consecutiveDays = st?.data?.consecutiveDays??st?.data?.continuousDays??0;
            signCards = st?.data?.signCardsNum??st?.data?.remedyCard??0;
        }catch(e){ logWarn("读取连续签到/补签卡异常",e);}

        let signMsg="";
        if(!isTodaySigned){
            try{
                const signResp = await httpPost(END.sign, headers, {deviceId: cfg.DeviceId});
                if(signResp.code===0){ writePS(today,"ninebot.lastSignDate"); signMsg="今日签到：已签到";}
                else if(/已签到/.test(signResp.msg)) { writePS(today,"ninebot.lastSignDate"); signMsg="今日签到：已签到";}
                else { signMsg=`签到失败：${signResp.msg||JSON.stringify(signResp)}`;}
            }catch(e){ signMsg=`签到异常：${String(e)}`;}
        }else signMsg="今日签到：已签到";

        const boxResults = await openAllAvailableBoxes(headers);
        const boxMsg = boxResults.length>0?`盲盒开箱结果\n${boxResults.join("\n")}`:"盲盒开箱结果：无可用盲盒";

        // 查询经验/等级/升级差
        let creditData={}, need=0;
        try{
            const cr = await httpGet(END.creditInfo, headers);
            creditData=cr?.data||{};
            const credit = Number(creditData.credit??0);
            const level = creditData.level??null;
            if(creditData.credit_upgrade){
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                if(m&&m[1]) need=Number(m[1]);
            }else if(creditData.credit_range && creditData.credit_range.length>=2){ need=creditData.credit_range[1]-credit; }
        }catch(e){ logWarn("经验查询异常",e); }

        let balLine="", bal={};
        try{ bal = await httpGet(END.balance,headers); if(bal?.code===0) balLine=`${bal.data?.balance??bal.data?.coin??0}`; }catch(e){ logWarn("余额查询异常",e); }

        // 查询盲盒进度
        let blindProgress="";
        try{
            const boxResp = await httpGet(END.blindBoxList,headers);
            const notOpened = boxResp?.data?.notOpenedBoxes||[];
            const opened = boxResp?.data?.openedBoxes||[];
            const openedTypes = [...new Set(opened.map(b=>b.awardDays+"天"))];
            const openedDesc = opened.length>0?`已开${opened.length}个（类型：${openedTypes.join("、")}）`:"暂无已开盲盒";
            const waitingBoxes = notOpened.map(b=>`- ${b.awardDays}天盲盒（剩余${Number(b.leftDaysToOpen??0)}天）`).join("\n");
            blindProgress = openedDesc + (waitingBoxes?`\n- 待开盲盒：\n${waitingBoxes}`:"\n- 待开盲盒：无");
        }catch(e){ blindProgress="查询异常"; logWarn("盲盒进度异常",e); }

        if(cfg.notify){
            const notifyBody = `${signMsg}
${boxMsg}
账户状态
- 当前经验：${creditData.credit??0}${creditData.level?`（LV.${creditData.level}）`:''}
- 距离升级：${need??0} 经验
- 当前N币：${bal.data?.balance??bal.data?.coin??0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
• 盲盒进度
${blindProgress}`;
            notify(ARG.titlePrefix,"",notifyBody);
        }

        logInfo("九号自动签到任务完成（v2.7 最终修复版）");
    }catch(e){ logErr("自动签到主流程异常：",e); if(cfg.notify) notify(ARG.titlePrefix,"任务异常 ⚠️",String(e)); }
})();