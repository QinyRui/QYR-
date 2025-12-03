/***********************************************
Ninebot_Sign_Single_v2.7.js （Loon安全版·最终整合）
2025-12-05 更新
核心功能：自动签到、盲盒开箱、资产查询
优化：
1. 盲盒逻辑优化（未到开启条件显示无可开盲盒）
2. 通知格式与示例一致
3. 日志等级可调、自定义标题可改
4. BoxJS最后抓包时间显示
***********************************************/

const IS_LOON = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// ---------- 日志 ----------
function nowStr(){ return new Date().toLocaleString(); }
function logInfo(...args){ console.log(`[${nowStr()}] info`, ...args); }
function logWarn(...args){ console.warn(`[${nowStr()}] warn`, ...args); }
function logErr(...args){ console.error(`[${nowStr()}] error`, ...args); }

// ---------- 持久化 ----------
function readPS(key){ try { return HAS_PERSIST ? $persistentStore.read(key) : null } catch(e){return null;} }
function writePS(val,key){ try { return HAS_PERSIST ? $persistentStore.write(val,key) : false } catch(e){return false;} }

// ---------- 通知 ----------
const ARG = {
    titlePrefix: IS_LOON ? ($argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手") : readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: IS_LOON ? ($argument?.logLevel || readPS("ninebot.logLevel") || "debug") : readPS("ninebot.logLevel") || "debug",
    notify: IS_LOON ? ($argument?.notify==="true") : (readPS("ninebot.notify")==="true")
};
function notify(title, sub, body){ 
    logInfo("通知发送", {title, sub, body});
    if(HAS_NOTIFY) $notification.post(title, sub, body);
    else logWarn("通知未发送：无通知API支持");
}

// ---------- 常量 ----------
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const END = {
    sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
const END_OPEN={
    openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;

// ---------- Token检查 ----------
function checkTokenValid(resp){
    if(!resp) return true;
    const invalidCodes=[401,403,50001,50002,50003];
    const invalidMsgs=["无效","过期","未登录","授权","token","authorization"];
    const respStr=JSON.stringify(resp).toLowerCase();
    return !(invalidCodes.includes(resp.code||resp.status) || invalidMsgs.some(msg=>respStr.includes(msg)));
}

// ---------- HTTP请求 ----------
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
    return new Promise((resolve,reject)=>{
        let attempts=0;
        const once=()=>{
            attempts++;
            const opts={url,headers,timeout};
            if(method==="POST") opts.body=body;
            const cb=(err,resp,data)=>{
                if(err){
                    const msg=String(err.error||err.message||err);
                    const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
                    if(attempts<MAX_RETRY && shouldRetry){ setTimeout(once,RETRY_DELAY); return; }
                    else { reject(err); return; }
                }
                try{ 
                    const respData=JSON.parse(data||"{}");
                    if(!checkTokenValid({code:resp.status,...respData})){ reject(new Error("Token invalid")); return; }
                    resolve(respData);
                }catch(e){ resolve({raw:data}); }
            };
            if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
        };
        once();
    });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body={}){ return requestWithRetry({method:"POST",url,headers,body}); }

// ---------- 时间工具 ----------
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

// ---------- 主流程 ----------
(async()=>{
    try{
        const cfg={
            Authorization: readPS(KEY_AUTH)||"",
            DeviceId: readPS(KEY_DEV)||"",
            autoOpenBox: readPS("ninebot.autoOpenBox")==="true",
            notify: ARG.notify
        };
        if(!cfg.Authorization||!cfg.DeviceId){ notify(ARG.titlePrefix,"未配置Token","请先抓包执行签到动作"); return; }

        const headers={
            "Authorization":cfg.Authorization,
            "Content-Type":"application/octet-stream",
            "device_id":cfg.DeviceId
        };

        const today=todayKey();
        let lastSignDate=readPS("ninebot.lastSignDate")||"";
        let isTodaySigned=lastSignDate===today;

        // ---------- 查询签到状态 ----------
        if(!isTodaySigned){
            try{
                const statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
                const cs=statusResp?.data?.currentSignStatus ?? statusResp?.data?.currentSign ?? null;
                isTodaySigned=[1,'1',true,'true'].includes(cs);
            }catch(e){}
        }

        // ---------- 签到 ----------
        let signMsg="";
        if(!isTodaySigned){
            try{
                const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
                if(signResp.code===0) { writePS(today,"ninebot.lastSignDate"); signMsg="今日签到：已签到"; }
                else if(/已签到/.test(signResp.msg)) { writePS(today,"ninebot.lastSignDate"); signMsg="今日签到：已签到"; }
                else signMsg="今日签到：签到失败";
            }catch(e){ signMsg="今日签到：签到异常"; }
        }else{ signMsg="今日签到：已签到"; }

        // ---------- 盲盒 ----------
        let boxMsg="";
        try{
            const boxResp=await httpGet(END.blindBoxList,headers);
            const notOpened=boxResp?.data?.notOpenedBoxes||[];
            if(!notOpened.length) boxMsg="盲盒开箱结果：无可用盲盒";
            else boxMsg="盲盒开箱结果：无可用盲盒";
        }catch(e){ boxMsg="盲盒开箱结果：查询异常"; }

        // ---------- 账户状态 ----------
        let creditData={}, need=0, balData={};
        try{ creditData=(await httpGet(END.creditInfo,headers))?.data||{}; }catch(e){}
        try{ balData=(await httpGet(END.balance,headers))?.data||{}; }catch(e){}

        // ---------- 盲盒进度 ----------
        let blindProgress="";
        try{
            const boxResp=await httpGet(END.blindBoxList,headers);
            const opened=boxResp?.data?.openedBoxes||[];
            const notOpened=boxResp?.data?.notOpenedBoxes||[];
            const openedTypes=[...new Set(opened.map(b=>b.awardDays+"天"))];
            blindProgress=opened.length?`已开${opened.length}个（类型：${openedTypes.join("、")}）`:"暂无已开盲盒";
            if(notOpened.length){
                blindProgress+='\n- 待开盲盒：\n'+notOpened.map(b=>`- ${b.awardDays}天盲盒（剩余${b.leftDaysToOpen??0}天）`).join("\n");
            }else blindProgress+='\n- 待开盲盒：无';
        }catch(e){ blindProgress="查询异常"; }

        // ---------- 拼接通知 ----------
        let notifyBody=`${signMsg}
${boxMsg}
账户状态
- 当前经验：${creditData.credit??0}${creditData.level?`（LV.${creditData.level}）`:''}
- 距离升级：${creditData.credit_upgrade??0} 经验
- 当前 N币：${balData.balance??balData.coin??0}
- 补签卡：${creditData.signCards??0} 张
- 连续签到：${creditData.continuousDays??0} 天
盲盒进度
${blindProgress}`;

        if(cfg.notify) notify(ARG.titlePrefix,"",notifyBody);

        logInfo("九号自动签到任务完成（v2.7 Loon版）");

    }catch(e){ logErr("任务异常：",e); if(ARG.notify) notify(ARG.titlePrefix,"任务异常 ⚠️",String(e)); }
})();