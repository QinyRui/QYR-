/*
📱 九号智能电动车 · 单号自动签到（v2.8）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新日期：2025/11/21 16:05:00
Telegram 群：https://t.me/JiuHaoAPP
支持系统：iOS / iPadOS / macOS
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

const cfg = {
    debug: read("ninebot.debug") === "false" ? false : true,
    notify: read("ninebot.notify") === "false" ? false : true,
    autoOpenBox: read("ninebot.autoOpenBox") === "true",
    autoRepair: read("ninebot.autoRepair") === "true",
    autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
    titlePrefix: read("ninebot.titlePrefix") || "九号签到",
    enable_capture: read("ninebot.enable_capture") === "true"
};

// ---------- 抓包写入 ----------
if (isReq && cfg.enable_capture) {
    try {
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";

        const lastWriteTime = read("ninebot_last_write") || 0;
        const now = Date.now();
        if ((auth && dev && ua) && now - lastWriteTime > 60000) { // 1 分钟内不重复写
            write(auth, "ninebot.authorization");
            write(dev, "ninebot.deviceId");
            write(ua, "ninebot.userAgent");
            write(now, "ninebot_last_write");
            console.log("[Ninebot] ✅ 抓包写入成功");
            if(cfg.notify) notify(cfg.titlePrefix, "抓包写入成功", "Authorization / DeviceId / User-Agent 已写入");
        }
    } catch (e) {
        console.log("[Ninebot] 抓包写入异常：", e);
    }
    $done({});
}

// ---------- HTTP helper ----------
function httpPost({url, headers, body="{}"}) {
    return new Promise((resolve, reject)=>{
        $httpClient.post({url, headers, body}, (err, resp, data)=>{
            if(err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({raw:data}); }
            }
        });
    });
}

function httpGet({url, headers}) {
    return new Promise((resolve, reject)=>{
        $httpClient.get({url, headers}, (err, resp, data)=>{
            if(err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({raw:data}); }
            }
        });
    });
}

// ---------- 主流程 ----------
!(async()=>{
    let notifyBody = "";
    console.log("[Ninebot] 开始执行九号签到脚本...");

    const Authorization = read("ninebot.authorization") || "";
    const DeviceId = read("ninebot.deviceId") || "";
    const UserAgent = read("ninebot.userAgent") || "";

    if(!Authorization || !DeviceId){
        notify(cfg.titlePrefix, "❌ 未配置 Token", "请先抓包写入 Authorization / DeviceId / User-Agent");
        $done();
    }

    const headers = {
        "Authorization": Authorization,
        "device_id": DeviceId,
        "User-Agent": UserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
        "Content-Type": "application/json",
        "platform":"h5",
        "Origin":"https://h5-bj.ninebot.com",
        "language":"zh"
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

    try{
        console.log("[Ninebot] 正在获取签到状态...");
        const st = await httpGet({url:END.status, headers});
        const consecutiveDays = st.data?.consecutiveDays || 0;
        console.log(`[Ninebot] 连续签到: ${consecutiveDays} 天`);
        
        console.log("[Ninebot] 正在执行签到...");
        const sign = await httpPost({url:END.sign, headers, body:JSON.stringify({deviceId:DeviceId})});
        console.log(`[Ninebot] 签到结果: ${sign.msg || "未知"}`);
        
        // --- 组合通知内容 ---
        notifyBody += `🗓️ 连续签到: ${consecutiveDays} 天\n`;
        notifyBody += `✅ 签到结果: ${sign.msg || "未知"}\n`;

        const bal = await httpGet({url:END.balance, headers});
        console.log(`[Ninebot] N币余额: ${bal.data?.balance || 0}`);
        notifyBody += `💰 N币余额: ${bal.data?.balance || 0}\n`;

        const box = await httpGet({url:END.blindBoxList, headers});
        notifyBody += `🎁 盲盒任务:\n`;
        if ((box.data?.notOpenedBoxes || []).length === 0) {
            notifyBody += `   - 暂无盲盒可开\n`;
        } else {
            for(const b of box.data.notOpenedBoxes){
                notifyBody += `   - ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天\n`;
                // 自动开启
                if(cfg.autoOpenBox && (b.leftDaysToOpen === 0)){
                    const r = await httpPost({url:END.blindBoxReceive, headers, body:JSON.stringify({})});
                    const rewardText = `${r.data?.rewardType===1?"经验":"N币"} +${r.data?.rewardValue || 0}`;
                    notifyBody += `   - ✨ 领取成功: ${rewardText}\n`;
                    console.log(`[Ninebot] ${b.awardDays}天盲盒领取结果:`, rewardText);
                }
            }
        }
        
        // --- 日志输出与系统通知 ---
        console.log("----------\n[Ninebot] 📢 通知内容预览:\n" + notifyBody + "\n----------");
        if(cfg.notify) notify(cfg.titlePrefix, "签到完成", notifyBody);
        console.log("[Ninebot] 脚本执行完成.");

    }catch(e){
        console.log("[Ninebot] 脚本主流程发生异常:", e);
        if(cfg.notify) notify(cfg.titlePrefix, "❌ 脚本异常", String(e));
    }

    $done();
})();