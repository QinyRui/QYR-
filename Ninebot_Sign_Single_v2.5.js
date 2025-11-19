/*
📱 九号智能电动车 · Loon 插件主体（完全版）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 适配：Loon 插件 UI（不用 BoxJS）
*/

const isReq = typeof $request !== "undefined";

const KEY_AUTH = "NINEBOT_AUTH";
const KEY_DEV  = "NINEBOT_DEVICEID";
const KEY_UA   = "NINEBOT_UA";

const KEY_DEBUG = "NINEBOT_DEBUG";
const KEY_NOTIFY = "NINEBOT_NOTIFY";
const KEY_AUTOBOX = "NINEBOT_AUTOBOX";
const KEY_AUTOREPAIR = "NINEBOT_AUTOREPAIR";
const KEY_AUTOBETA = "NINEBOT_AUTOBETA";
const KEY_TITLE = "NINEBOT_TITLE";

const read  = k => $persistentStore.read(k) || "";
const write = (v,k) => $persistentStore.write(String(v),k);

const notify = (t,s,b)=>{ if(read(KEY_NOTIFY)!=="false") $notification.post(t,s,b); };
const log = (...x)=>{ if(read(KEY_DEBUG)!=="false") console.log("[Ninebot]",...x); };

/* =========================================
   ① 抓包写入模块
========================================= */
if (isReq) {
    try {
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev  = h["DeviceId"] || h["deviceid"] || "";
        const ua   = h["User-Agent"] || h["user-agent"] || "";

        let updated = false;

        if (auth) { write(auth, KEY_AUTH); updated = true; }
        if (dev)  { write(dev,  KEY_DEV);  updated = true; }
        if (ua)   { write(ua,   KEY_UA);   updated = true; }

        if (updated) {
            notify("九号签到助手","抓包成功","Authorization / DeviceId / User-Agent 已写入");
            log("抓包写入成功", {auth, dev, ua});
        }
    } catch(e){
        log("抓包写入异常：", e);
    }

    $done({});
    return;
}

/* =========================================
   ② 读取 Loon 插件 UI 项
========================================= */
const cfg = {
    Authorization: read(KEY_AUTH),
    DeviceId:      read(KEY_DEV),
    UA:            read(KEY_UA),

    debug:         read(KEY_DEBUG) !== "false",
    autoBox:       read(KEY_AUTOBOX) === "true",
    autoRepair:    read(KEY_AUTOREPAIR) === "true",
    autoBeta:      read(KEY_AUTOBETA) === "true",

    title:         read(KEY_TITLE) || "九号签到助手",
};

/* 没有 Token 时 */
if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.title,"未绑定账号","请先抓包写入 Authorization 与 DeviceId");
    $done();
    return;
}

/* =========================================
   HTTP 方法
========================================= */
function post(url, body={}) {
    return new Promise(res=>{
        $httpClient.post({
            url,
            headers,
            body: JSON.stringify(body)
        },(e,r,d)=>{
            if(e) return res({error:e});
            try { res(JSON.parse(d)); }
            catch { res({raw:d}); }
        });
    });
}

function get(url) {
    return new Promise(res=>{
        $httpClient.get({
            url,
            headers
        },(e,r,d)=>{
            if(e) return res({error:e});
            try { res(JSON.parse(d)); }
            catch { res({raw:d}); }
        });
    });
}

/* =========================================
   九号 API 参数
========================================= */
const headers = {
    "Authorization": cfg.Authorization,
    "DeviceId": cfg.DeviceId,
    "User-Agent": cfg.UA || "Mozilla/5.0 Ninebot iOS",
    "Content-Type": "application/json"
};

const API = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance",
    blindList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindOpen: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
    betaApply:  "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

/* =========================================
   主执行流程
========================================= */
(async()=>{
    let out = "";

    log("开始执行签到流程");

    // ① 签到
    let sign = await post(API.sign,{deviceId:cfg.DeviceId});
    log("签到返回:", sign);

    if(sign.code===0){
        out+=`🎉 签到成功，获得 ${sign.data?.nCoin || 0} N币\n`;
    } else if(sign.code===540004){
        out+=`⚠️ 今日已签到\n`;
    } else {
        out+=`❌ 签到失败：${sign.msg || JSON.stringify(sign)}\n`;
    }

    // ② 状态
    let st = await get(API.status);
    log("状态返回:", st);

    let days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
    let cards = st.data?.signCardsNum || st.data?.remedyCard || 0;

    out+=`连续签到：${days} 天\n补签卡：${cards} 张\n`;

    // ③ N币余额
    let bal = await get(API.balance);
    log("余额返回:", bal);
    out+=`N币余额：${bal.data?.balance || 0}\n`;

    // ④ 盲盒
    let box = await get(API.blindList);
    const list = box.data?.notOpenedBoxes || [];

    if(list.length>0){
        out+=`\n📦 盲盒任务：\n`;
        list.forEach(b=>{
            out+=`- ${b.boxDays} 天盲盒，还需 ${b.leftDaysToOpen} 天\n`;
        });

        // 自动开启
        if(cfg.autoBox){
            out+=`\n自动开启盲盒：\n`;
            for(let b of list){
                if(b.leftDaysToOpen===0){
                    let r = await post(API.blindOpen);
                    log("盲盒开启：",r);
                    out+=`🎁 ${b.boxDays} 天盲盒 → ${r.data?.rewardValue || '未知'}\n`;
                }
            }
        }
    }

    // ⑤ 自动补签
    if(cfg.autoRepair && cards>0 && days===0){
        let r = await post(API.repair);
        out+=`\n🔧 自动补签：${r.code===0?'成功':'失败'}\n`;
    }

    // ⑥ 内测
    if(cfg.autoBeta){
        let s = await get(API.betaStatus);
        if(!s.data?.qualified){
            let a = await post(API.betaApply,{deviceId:cfg.DeviceId});
            out+=`\n🚀 内测申请：${a.success ? '成功' : '失败'}\n`;
        } else {
            out+=`\n🚀 已获得内测资格\n`;
        }
    }

    notify(cfg.title,"签到完成",out);
    log("最终输出：", out);

    $done();
})();