/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
💡 改动：
  - 控制台完整日志打印
  - 抓包开关 + 自动写入 Authorization / DeviceId / User-Agent
  - 保留 Loon 插件 UI 开关
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// ---------- BoxJS / Loon 存储读取 ----------
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- UI 配置 ----------
const cfg = {
    Authorization: read("ninebot.authorization") || "",
    DeviceId: read("ninebot.deviceId") || "",
    userAgent: read("ninebot.userAgent") || "",
    debug: read("ninebot.debug") === "false" ? false : true,
    notify: read("ninebot.notify") === "false" ? false : true,
    autoOpenBox: read("ninebot.autoOpenBox") === "true",
    autoRepair: read("ninebot.autoRepair") === "true",
    autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
    titlePrefix: read("ninebot.titlePrefix") || "九号签到"
};

// ---------- 抓包写入 ----------
if (isReq && read("ninebot.enable_capture") === "true") {
    try {
        const h = $request.headers;
        let changed = false;

        ["Authorization", "DeviceId", "User-Agent"].forEach(key => {
            const val = h[key] || h[key.toLowerCase()] || "";
            if (val && read(`ninebot.${key}`) !== val) { write(val, `ninebot.${key}`); changed = true; }
        });

        if (changed) {
            notify(cfg.titlePrefix, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入");
            console.log("[Ninebot] 抓包写入成功:", JSON.stringify({
                Authorization: read("ninebot.Authorization"),
                DeviceId: read("ninebot.DeviceId"),
                UserAgent: read("ninebot.UserAgent")
            }));
        }
    } catch (e) {
        console.log("[Ninebot] 抓包异常:", e);
    }
    $done({});
}

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请开启抓包写入 Authorization 与 DeviceId");
    console.log("[Ninebot] 未配置 Authorization 或 DeviceId，退出脚本");
    $done();
}

// ---------- HTTP 辅助 ----------
function httpPost({ url, headers, body = "{}" }) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } 
                catch { resolve({ raw: data }); }
            }
        });
    });
}
function httpGet({ url, headers }) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } 
                catch { resolve({ raw: data }); }
            }
        });
    });
}

// ---------- 接口 ----------
const headers = {
    "Authorization": cfg.Authorization,
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent,
    "Content-Type": "application/json",
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
(async () => {
    console.log("[Ninebot] 开始执行九号签到脚本...");

    let notifyBody = "";

    try {
        // 1. 获取状态
        console.log("[Ninebot] 获取签到状态...");
        const st = await httpGet({ url: END.status, headers });
        console.log("[Ninebot] 状态返回：", JSON.stringify(st));

        const days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
        console.log("[Ninebot] 当前连续签到天数:", days);

        // 2. 签到
        console.log("[Ninebot] 开始签到...");
        const signResp = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
        console.log("[Ninebot] 签到返回：", JSON.stringify(signResp));

        if (signResp?.code === 0) notifyBody += `🎉 签到成功`;
        else if (signResp?.code === 540004) notifyBody += `⚠️ 已签到,不能重复签到`;
        else notifyBody += `❌ 签到失败: ${signResp?.msg || JSON.stringify(signResp)}`;

        // 3. 获取余额
        console.log("[Ninebot] 获取 N币余额...");
        const bal = await httpGet({ url: END.balance, headers });
        console.log("[Ninebot] 余额返回：", JSON.stringify(bal));
        notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

        // 4. 获取盲盒列表
        console.log("[Ninebot] 获取盲盒任务列表...");
        const box = await httpGet({ url: END.blindBoxList, headers });
        console.log("[Ninebot] 盲盒列表返回：", JSON.stringify(box));
        const notOpened = box?.data?.notOpenedBoxes || [];
        if (notOpened.length) {
            notifyBody += `\n📦 盲盒任务：`;
            notOpened.forEach(b => {
                notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;
            });
        }

        console.log("[Ninebot] 脚本执行完成.");

        if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);

    } catch (e) {
        console.log("[Ninebot] 脚本异常：", e);
        if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
    }

    $done();
})();