/*
📱 九号智能电动车 · 单号自动签到（Loon 插件 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 自动写入 Authorization / DeviceId / User-Agent
*/

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

const cfg = {
    debug: read("ninebot.debug") !== "false",
    notify: read("ninebot.notify") !== "false",
    autoOpenBox: read("ninebot.autoOpenBox") === "true",
    autoRepair: read("ninebot.autoRepair") === "true",
    autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
    titlePrefix: read("ninebot.titlePrefix") || "九号签到",
    Authorization: read("ninebot.authorization") || "",
    DeviceId: read("ninebot.deviceId") || "",
    UserAgent: read("ninebot.userAgent") || "",
};

// --------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
            }
        });
    });
}
function httpGet({ url, headers }) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
            }
        });
    });
}

// --------- 打印日志函数 ----------
function logPrint(...args) {
    console.log("[Ninebot]", ...args);
}

// --------- API endpoints ----------
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

// --------- 主流程 ----------
!(async () => {
    logPrint("开始执行九号签到脚本...");

    if (!cfg.Authorization || !cfg.DeviceId) {
        logPrint("未配置 Authorization 或 DeviceId，无法继续执行！");
        if(cfg.notify) notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并写入 Authorization / DeviceId / User-Agent");
        $done();
    }

    try {
        // 1) 获取签到状态
        logPrint("获取签到状态...");
        const st = await httpGet({ url: END.status, headers });
        const days = st?.data?.consecutiveDays || 0;
        logPrint(`当前连续签到天数: ${days}`);

        // 2) 签到
        logPrint("开始签到...");
        const signResp = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
        logPrint("签到结果:", signResp?.msg || JSON.stringify(signResp));

        // 3) 获取盲盒
        logPrint("获取盲盒任务列表...");
        const box = await httpGet({ url: END.blindBoxList, headers });
        logPrint("盲盒任务列表结果:", JSON.stringify(box));

        // 4) 自动开启盲盒
        if(cfg.autoOpenBox && Array.isArray(box?.data?.notOpenedBoxes)){
            for(const b of box.data.notOpenedBoxes){
                if(b.leftDaysToOpen === 0){
                    logPrint(`自动开启盲盒: ${b.awardDays}天`);
                    const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
                    logPrint("盲盒领取返回:", JSON.stringify(r));
                }
            }
        }

        // 5) 自动补签
        if(cfg.autoRepair){
            const cards = st?.data?.signCardsNum || 0;
            if(cards > 0 && days === 0){
                logPrint("触发自动补签...");
                const rep = await httpPost({ url: END.repair, headers, body: "{}" });
                logPrint("补签返回:", JSON.stringify(rep));
            }
        }

        // 6) 内测检测 + 自动申请
        try{
            const beta = await httpGet({ url: END.betaStatus, headers });
            logPrint("内测状态返回:", JSON.stringify(beta));
            if(beta?.data?.qualified){
                logPrint("已获得内测资格");
            }else if(cfg.autoApplyBeta){
                logPrint("未获得内测资格，尝试自动申请...");
                const applyResp = await httpPost({
                    url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
                    headers,
                    body: JSON.stringify({ deviceId: cfg.DeviceId })
                });
                logPrint("内测申请返回:", JSON.stringify(applyResp));
            }
        }catch(e){ logPrint("内测异常:", e); }

        logPrint("脚本执行完成.");

        if(cfg.notify) notify(cfg.titlePrefix, "签到完成", `连续签到: ${days} 天`);

    } catch(e){
        logPrint("主流程异常:", e);
        if(cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
    }

    $done();
})();