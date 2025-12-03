/***********************************************
Ninebot_Sign_Single_v2.7.js （Loon 专用安全版）
2025-12-05 16:00 更新
核心功能：自动签到、盲盒开箱、账户状态查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

// 安全初始化 Loon 对象
const IS_LOON = typeof $argument !== "undefined";
const _ARG = IS_LOON ? $argument : {};
const _PERSIST = typeof $persistentStore !== "undefined" ? $persistentStore : { read: () => null, write: () => false };
const _NOTIFY = typeof $notification !== "undefined" ? $notification : { post: () => {} };
const _HTTP = typeof $httpClient !== "undefined" ? $httpClient : { get: (opts, cb) => cb(null,{status:200},'{}'), post: (opts, cb) => cb(null,{status:200},'{}') };

// 日志函数
function nowStr() { return new Date().toLocaleString(); }
function logInfo(...args) { console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args) { console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args) { console.error(`[${nowStr()}] error ${args.join(" ")}`); }
function notify(title, sub, body){ _NOTIFY.post(title, sub, body); logInfo("通知发送", title, sub, body); }

// 参数读取
function readPS(key){ return _PERSIST.read(key); }
function writePS(val,key){ return _PERSIST.write(val,key); }

const ARG = {
    titlePrefix: _ARG.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: _ARG.logLevel || readPS("ninebot.logLevel") || "debug",
    notify: (_ARG.notify==="true") || (readPS("ninebot.notify")==="true")
};

// 配置常量
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";

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

const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;

// 检查 Token 是否有效
function checkTokenValid(resp){
    if(!resp) return true;
    const invalidCodes=[401,403,50001,50002,50003];
    const invalidMsgs=["无效","过期","未登录","授权","token","authorization"];
    const respStr=JSON.stringify(resp).toLowerCase();
    const hasInvalidCode=invalidCodes.includes(resp.code||resp.status);
    const hasInvalidMsg=invalidMsgs.some(msg=>respStr.includes(msg));
    return !(hasInvalidCode||hasInvalidMsg);
}

// 请求封装 + 重试
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
    return new Promise((resolve,reject)=>{
        let attempts=0;
        const once=()=>{
            attempts++;
            const opts={url,headers,timeout};
            if(method==="POST") opts.body=body;
            const cb=(err,resp,data)=>{
                if(err){
                    const msg=String(err && (err.error||err.message||err));
                    const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
                    if(attempts<MAX_RETRY && shouldRetry && (readPS(KEY_ENABLE_RETRY)!=="false")){
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once,RETRY_DELAY);
                        return;
                    }else{reject(err);return;}
                }
                const respData=JSON.parse(data||"{}");
                if(!checkTokenValid({code:resp.status,...respData})){
                    notify(ARG.titlePrefix,"Token失效 ⚠️","Authorization已过期/无效，请重新抓包写入");
                    reject(new Error("Token invalid or expired"));
                    return;
                }
                resolve(respData);
            };
            if(method==="GET") _HTTP.get(opts,cb); else _HTTP.post(opts,cb);
        };
        once();
    });
}
function httpGet(url,headers={}){return requestWithRetry({method:"GET",url,headers});}
function httpPost(url,headers={},body={}){return requestWithRetry({method:"POST",url,headers,body});}

// 生成请求 Header
function makeHeaders(){
    return {
        "Authorization": readPS(KEY_AUTH)||"",
        "Content-Type":"application/octet-stream;tt-data=a",
        "device_id": readPS(KEY_DEV)||"",
        "User-Agent":"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
        "platform":"h5",
        "Origin":"https://h5-bj.ninebot.com",
        "language":"zh"
    };
}

// 抓包写入
if(typeof $request!=="undefined" && $request.url.includes("/portal/api/user-sign/v2/status")){
    try{
        const h=$request.headers||{};
        const auth=h["Authorization"]||h["authorization"]||"";
        const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
        if(auth) writePS(auth,KEY_AUTH);
        if(dev) writePS(dev,KEY_DEV);
        writePS(new Date().toISOString().slice(0,19).replace('T',' '),"ninebot.lastCaptureAt");
        notify(ARG.titlePrefix,"抓包成功 ✓","数据已写入 BoxJS");
    }catch(e){
        logErr("抓包异常：",e);
        notify(ARG.titlePrefix,"抓包失败 ⚠️",String(e).slice(0,50));
    }
    $done({});
}

// 自动签到 + 盲盒开箱
(async()=>{
    try{
        const headers=makeHeaders();
        // 查询签到状态
        const statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
        const currentSign=statusResp?.data?.currentSignStatus||statusResp?.data?.currentSign||0;
        const lastSign=readPS("ninebot.lastSignDate")||"";
        const todayKey=new Date().toISOString().slice(0,10);
        let signMsg="";
        if(currentSign!=1 && lastSign!==todayKey){
            try{
                const signResp=await httpPost(END.sign,headers,{deviceId:readPS(KEY_DEV)||""});
                if(signResp.code===0) {signMsg="✨ 今日签到：成功"; writePS(todayKey,"ninebot.lastSignDate");}
                else signMsg="✨ 今日签到：已签到";
            }catch(e){signMsg=`❌ 签到失败：${String(e)}`;}
        }else{signMsg="✨ 今日签到：已签到";}

        // 盲盒开箱
        let boxMsg="📦 盲盒开箱结果：无可用盲盒";
        if(readPS(KEY_AUTOBOX)==="true"){
            const boxResp=await httpGet(END.blindBoxList,headers);
            const boxes=boxResp?.data?.notOpenedBoxes||[];
            if(boxes.length>0){
                const results=[];
                for(const b of boxes){
                    const url=b.awardDays==7?END_OPEN.openSeven:END_OPEN.openNormal;
                    const openResp=await httpPost(url,headers,{deviceId:readPS(KEY_DEV)||"",boxId:b.id,timestamp:Date.now()});
                    results.push(openResp.data?.awardName?`✅ ${b.awardDays}天盲盒：${openResp.data.awardName}`:`❌ ${b.awardDays}天盲盒开箱失败`);
                }
                if(results.length>0) boxMsg="📦 盲盒开箱结果\n"+results.join("\n");
            }
        }

        // 账户状态
        let creditData={credit:0,level:0}; let need=0;
        try{ const cr=await httpGet(END.creditInfo,headers); creditData=cr?.data||{}; need=cr?.data?.credit_upgrade||0; }catch(e){}
        let bal=0; try{ const b=await httpGet(END.balance,headers); bal=b?.data?.balance||0;}catch(e){}

        // 补签卡/连续签到
        const signCards=statusResp?.data?.signCardsNum||0;
        const consecutiveDays=statusResp?.data?.consecutiveDays||0;

        // 盲盒进度
        let blindProgress="暂无盲盒记录";
        try{
            const boxList=await httpGet(END.blindBoxList,headers);
            const opened=boxList?.data?.openedBoxes||[];
            const notOpened=boxList?.data?.notOpenedBoxes||[];
            const openedTypes=[...new Set(opened.map(b=>b.awardDays+"天"))];
            const openedDesc=opened.length>0?`已开${opened.length}个（类型：${openedTypes.join("、")}）`:"暂无已开盲盒";
            const waitingBoxes=notOpened.map(b=>`- ${b.awardDays}天盲盒（剩余${b.leftDaysToOpen??0}天）`).join("\n");
            blindProgress=openedDesc+"\n- 待开盲盒：\n"+(waitingBoxes||"无");
        }catch(e){blindProgress="查询盲盒进度异常";}

        // 发送通知
        if(ARG.notify){
            const notifyBody=`${signMsg}
${boxMsg}
📊 账户状态
- 当前经验：${creditData.credit??0}${creditData.level?`（LV.${creditData.level}）`:''}
- 距离升级：${need??0} 经验
- 当前 N币：${bal}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
• 盲盒进度
${blindProgress}`;
            notify(ARG.titlePrefix,"",notifyBody);
        }

        logInfo("九号自动签到任务完成（v2.7 Loon安全版）");
    }catch(e){
        logErr("自动签到异常：",e);
        if(ARG.notify) notify(ARG.titlePrefix,"任务异常 ⚠️",String(e));
    }
})();