/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新时间：2025/11/22
Telegram 群：https://t.me/JiuHaoAPP
支持系统：iOS / iPadOS / macOS
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ==============================
// 兼容 $environment
// ==============================
const cfg = {
    debug: (typeof $environment !== "undefined" && $environment.debug === "true") || false,
    notify: (typeof $environment !== "undefined" && $environment.notify === "true") || true,
    autoOpenBox: (typeof $environment !== "undefined" && $environment.openbox === "true") || false,
    autoRepair: (typeof $environment !== "undefined" && $environment.repair === "true") || false,
    autoApplyBeta: (typeof $environment !== "undefined" && $environment.beta === "true") || false,
    titlePrefix: (typeof $environment !== "undefined" && $environment.titlePrefix) || "九号签到",
    enable_capture: (typeof $environment !== "undefined" && $environment.capture === "true") || false
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
        if ((auth && dev && ua) && now - lastWriteTime > 60000) {
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
    return new Promise(resolve=>{
        $httpClient.post({url, headers, body}, (err, resp, data)=>{
            if(err) resolve({error: err});
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({raw:data}); }
            }
        });
    });
}

function httpGet({url, headers}) {
    return new Promise(resolve=>{
        $httpClient.get({url, headers}, (err, resp, data)=>{
            if(err) resolve({error: err});
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({raw:data}); }
            }
        });
    });
}

function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

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
        "DeviceId": DeviceId,
        "User-Agent": UserAgent || "Mozilla/5.0",
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
        balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    };

    try{
        console.log("[Ninebot] 获取签到状态...");
        const stBefore = await httpGet({url:END.status, headers});
        console.log("[Ninebot] /status 原始返回：", stBefore);

        // 自动兼容字段
        const beforeDays = stBefore.data?.consecutiveDays || stBefore.data?.userSignInfo?.consecutiveDays || stBefore.data?.status?.consecutiveDays || 0;
        console.log(`[Ninebot] 连续签到: ${beforeDays} 天`);

        console.log("[Ninebot] 执行签到...");
        const signResp = await httpPost({url:END.sign, headers, body:JSON.stringify({deviceId: DeviceId})});
        console.log("[Ninebot] /sign 原始返回:", signResp);

        // 等待接口刷新
        await sleep(1500);

        const stAfter = await httpGet({url:END.status, headers});
        const afterDays = stAfter.data?.consecutiveDays || stAfter.data?.userSignInfo?.consecutiveDays || stAfter.data?.status?.consecutiveDays || beforeDays;

        const confirmed = afterDays > beforeDays;

        // 签到结果显示 msg 或 data.status
        const signMsg = signResp.msg || signResp.data?.status || JSON.stringify(signResp);

        notifyBody += `🗓️ 连续签到: ${beforeDays} → ${afterDays}\n`;
        notifyBody += `✅ 签到接口返回: ${signMsg}\n`;
        notifyBody += `🔎 最终确认: ${confirmed ? "已生效" : "未确认"}\n`;

        const bal = await httpGet({url:END.balance, headers});
        notifyBody += `💰 N币余额: ${bal.data?.balance || 0}\n`;

        const box = await httpGet({url:END.blindBoxList, headers});
        notifyBody += `🎁 盲盒任务:\n`;
        if ((box.data?.notOpenedBoxes || []).length === 0) {
            notifyBody += `   - 暂无盲盒可开\n`;
        } else {
            for(const b of box.data.notOpenedBoxes){
                notifyBody += `   - ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天\n`;
            }
        }

        if(cfg.notify) notify(cfg.titlePrefix, "签到完成", notifyBody);
        console.log("[Ninebot] 脚本执行完成.");

    }catch(e){
        console.log("[Ninebot] 脚本异常:", e);
        if(cfg.notify) notify(cfg.titlePrefix, "❌ 脚本异常", String(e));
    }

    $done();
})();