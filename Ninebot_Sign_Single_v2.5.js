/*
📱 九号智能电动车 · 单账号全功能签到 v2.5
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - 完全脱离 BoxJS，UI 输入框读取账号信息
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const readUI = k => (typeof $prefs !== "undefined" ? $prefs.valueForKey(k) : "");
const writeUI = (v, k) => { if(typeof $prefs !== "undefined") $prefs.setValueForKey(v, k); };
const notify = (title, sub, body) => { if(typeof $notification !== "undefined") $notification.post(title, sub, body); };

const cfgKeys = {
  Authorization: "Authorization",
  DeviceId: "DeviceId",
  UserAgent: "UserAgent",
  enable_debug: "enable_debug",
  enable_notify: "enable_notify",
  enable_openbox: "enable_openbox",
  enable_supplement: "enable_supplement",
  enable_internal_test: "enable_internal_test",
  notify_title: "notify_title",
  cron_time: "cron_time"
};

// ---------- 抓包写入 ----------
if(isReq){
    try{
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        let changed = false;

        if(auth && readUI(cfgKeys.Authorization) !== auth){ writeUI(auth, cfgKeys.Authorization); changed = true; }
        if(dev && readUI(cfgKeys.DeviceId) !== dev){ writeUI(dev, cfgKeys.DeviceId); changed = true; }
        if(ua && readUI(cfgKeys.UserAgent) !== ua){ writeUI(ua, cfgKeys.UserAgent); changed = true; }

        if(changed){
            notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent 已写入 UI");
            console.log("[Ninebot] 抓包写入成功:", {auth, dev, ua});
        }
    }catch(e){
        console.log("[Ninebot] 抓包写入异常：", e);
    }
    $done({});
}

// ---------- 读取配置 ----------
const cfg = {
    Authorization: readUI(cfgKeys.Authorization),
    DeviceId: readUI(cfgKeys.DeviceId),
    UserAgent: readUI(cfgKeys.UserAgent),
    debug: readUI(cfgKeys.enable_debug) === "true",
    notify: readUI(cfgKeys.enable_notify) === "true",
    autoOpenBox: readUI(cfgKeys.enable_openbox) === "true",
    autoRepair: readUI(cfgKeys.enable_supplement) === "true",
    autoApplyBeta: readUI(cfgKeys.enable_internal_test) === "true",
    titlePrefix: readUI(cfgKeys.notify_title) || "九号签到"
};

if(!cfg.Authorization || !cfg.DeviceId){
    notify(cfg.titlePrefix,"未绑定账号","请先抓包或在 UI 填写 Authorization 与 DeviceId");
    $done();
}

// ---------- HTTP helpers ----------
function httpPost({url, headers, body="{}"}){
    return new Promise((resolve,reject)=>{
        $httpClient.post({url, headers, body}, (err, resp, data)=>{
            if(err) reject(err);
            else{
                try{ resolve(JSON.parse(data||"{}")); }
                catch(e){ resolve({ raw: data }); }
            }
        });
    });
}
function httpGet({url, headers}){
    return new Promise((resolve,reject)=>{
        $httpClient.get({url, headers}, (err, resp, data)=>{
            if(err) reject(err);
            else{
                try{ resolve(JSON.parse(data||"{}")); }
                catch(e){ resolve({ raw: data }); }
            }
        });
    });
}

// ---------- API Endpoints ----------
const headers = {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.UserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
};

const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 主流程 ----------
!(async ()=>{
    let notifyBody="";

    try{
        // 1) 签到
        if(cfg.debug) console.log("[Ninebot] 开始签到请求");
        const sign = await httpPost({url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId})});
        if(cfg.debug) console.log("[Ninebot] 签到返回：", sign);
        if(sign && sign.code===0) notifyBody+=`🎉 签到成功\n🎁 +${sign.data?.nCoin||sign.data?.score||0} N币`;
        else if(sign && sign.code===540004) notifyBody+=`⚠️ 今日已签到`;
        else notifyBody+=`❌ 签到失败：${(sign && (sign.msg||JSON.stringify(sign)))||"未知"}`;

        // 2) 状态
        const st = await httpGet({url: END.status, headers});
        if(cfg.debug) console.log("[Ninebot] 状态返回：", st);
        if(st && st.code===0){
            const data = st.data||{};
            const days = data.consecutiveDays||data.continuousDays||0;
            const cards = data.signCardsNum||data.remedyCard||0;
            notifyBody+=`\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
        }

        // 3) 余额
        const bal = await httpGet({url: END.balance, headers});
        if(cfg.debug) console.log("[Ninebot] 余额返回：", bal);
        if(bal && bal.code===0) notifyBody+=`\n💰 N币余额：${bal.data?.balance||0}`;

        // 4) 盲盒
        const box = await httpGet({url: END.blindBoxList, headers});
        if(cfg.debug) console.log("[Ninebot] 盲盒返回：", box);
        const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
        if(Array.isArray(notOpened) && notOpened.length>0){
            notifyBody+=`\n\n📦 盲盒任务：`;
            notOpened.forEach(b=>{
                const days = b.awardDays||b.boxDays||b.days||"?";
                const left = b.leftDaysToOpen||b.diffDays||"?";
                notifyBody+=`\n- ${days}天盲盒，还需 ${left} 天`;
            });
            if(cfg.autoOpenBox){
                const ready = notOpened.filter(b=> (b.leftDaysToOpen===0||b.diffDays===0) && (b.rewardStatus===2||b.status===2));
                if(ready.length>0){
                    notifyBody+=`\n\n🎉 自动开启盲盒：`;
                    for(const b of ready){
                        try{
                            const r = await httpPost({url: END.blindBoxReceive, headers, body:"{}"});
                            if(cfg.debug) console.log("[Ninebot] 盲盒领取返回：", r);
                            if(r && r.code===0) notifyBody+=`\n🎁 ${b.awardDays||b.boxDays}天盲盒获得：${r.data?.rewardValue||r.data?.score||"未知"}`;
                            else notifyBody+=`\n❌ ${b.awardDays||b.boxDays}天盲盒领取失败`;
                        }catch(e){ if(cfg.debug) console.log("[Ninebot] 盲盒领取异常：",e); notifyBody+=`\n❌ ${b.awardDays}天盲盒领取异常`; }
                    }
                }
            }
        }

        // 5) 自动补签
        if(cfg.autoRepair){
            try{
                const cards = st.data?.signCardsNum||st.data?.remedyCard||0;
                const days = st.data?.consecutiveDays||st.data?.continuousDays||0;
                if(cards>0 && days===0){
                    const rep = await httpPost({url: END.repair, headers, body:"{}"});
                    if(rep && rep.code===0) notifyBody+=`\n🔧 自动补签成功`;
                    else notifyBody+=`\n🔧 自动补签失败：${rep?.msg||"未知"}`;
                }
            }catch(e){ if(cfg.debug) console.log("[Ninebot] 自动补签异常：",e); }
        }

        // 6) 内测资格检测 & 自动申请
        try{
            const beta = await httpGet({url:END.betaStatus, headers});
            if(beta?.data?.qualified) notifyBody+="\n🚀 已获得内测资格";
            else{
                notifyBody+="\n⚠️ 未获得内测资格";
                if(cfg.autoApplyBeta){
                    try{
                        const applyResp = await httpPost({url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({deviceId: cfg.DeviceId})});
                        if(applyResp?.success) notifyBody+=" → 自动申请成功 🎉";
                        else notifyBody+=" → 自动申请失败 ❌";
                    }catch(e){ notifyBody+=" → 自动申请异常 ❌"; if(cfg.debug) console.log("[Ninebot] 内测自动申请异常：",e); }
                }
            }
        }catch(e){ if(cfg.debug) console.log("[Ninebot] 内测检测异常：", e); }

        // ✅ 通知
        if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

    }catch(e){
        if(cfg.debug) console.log("[Ninebot] 主流程异常：", e);
        if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
    }

    $done();
})();