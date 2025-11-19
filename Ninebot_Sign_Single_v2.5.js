/*
📱 九号智能电动车 · 单账号自动签到 v2.5
👤 作者：❥﹒﹏非我不可 & QinyRui
💬 完全不依赖 BoxJS / $argument
*/

const isReq = typeof $request !== "undefined" && $request.headers;

const read = k => $persistentStore.read(k);
const write = (v, k) => $persistentStore.write(v, k);
const notify = (title, sub, body) => { if ($notification) $notification.post(title, sub, body); };
const log = (...args) => console.log("[Ninebot]", ...args);

const KEY_AUTH = "ninebot.Authorization";
const KEY_DEV = "ninebot.DeviceId";
const KEY_UA = "ninebot.UserAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_OPENBOX = "ninebot.autoOpenBox";
const KEY_SUPPLEMENT = "ninebot.autoRepair";
const KEY_BETA = "ninebot.autoApplyBeta";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";

// ---------- 抓包写入 ----------
if (isReq) {
    try {
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";

        let changed = false;
        if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
        if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
        if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

        if (changed) {
            notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入插件存储");
            log("抓包写入成功:", {auth, dev, ua});
        }
    } catch (e) { log("抓包写入异常：", e); }
    $done({});
}

// ---------- 读取配置 ----------
const cfg = {
    Authorization: read(KEY_AUTH) || "",
    DeviceId: read(KEY_DEV) || "",
    UserAgent: read(KEY_UA) || "",
    debug: read(KEY_DEBUG) === "false" ? false : true,
    notify: read(KEY_NOTIFY) === "false" ? false : true,
    autoOpenBox: read(KEY_OPENBOX) === "true",
    autoRepair: read(KEY_SUPPLEMENT) === "true",
    autoApplyBeta: read(KEY_BETA) === "true",
    notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
    titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包或在插件 UI 填写 Authorization 与 DeviceId");
    $done();
}

// ---------- HTTP Helpers ----------
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

// ---------- Endpoints ----------
const headers = {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.UserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile",
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
!(async () => {
    let notifyBody = "";

    try {
        // 1) 签到
        log("开始签到请求");
        const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
        log("签到返回：", sign);
        if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || 0} N币`;
        else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
        else {
            notifyBody += `❌ 签到失败：${(sign && (sign.msg || JSON.stringify(sign))) || "未知"}`;
            if(!cfg.notifyFail) notifyBody = "";
        }

        // 2) 状态
        const st = await httpGet({ url: END.status, headers });
        log("状态返回：", st);
        if (st && st.code === 0) {
            const data = st.data || {};
            const days = data.consecutiveDays || 0;
            const cards = data.signCardsNum || 0;
            notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
        }

        // 3) 余额
        const bal = await httpGet({ url: END.balance, headers });
        log("余额返回：", bal);
        if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

        // 4) 盲盒
        const box = await httpGet({ url: END.blindBoxList, headers });
        log("盲盒返回：", box);
        const notOpened = box?.data?.notOpenedBoxes || [];
        if (Array.isArray(notOpened) && notOpened.length > 0) {
            notifyBody += `\n\n📦 盲盒任务：`;
            notOpened.forEach(b => {
                const days = b.awardDays || b.boxDays || "?";
                const left = b.leftDaysToOpen || b.diffDays || "?";
                notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
            });

            if (cfg.autoOpenBox) {
                const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
                for (const b of ready) {
                    try {
                        const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
                        log("盲盒领取返回：", r);
                        if (r && r.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || 0}`;
                        else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
                    } catch (e) { log("盲盒领取异常：", e); }
                }
            }
        }

        // 5) 自动补签
        if (cfg.autoRepair) {
            try {
                if (st && st.code === 0) {
                    const cards = st.data?.signCardsNum || 0;
                    const days = st.data?.consecutiveDays || 0;
                    if (cards > 0 && days === 0) {
                        log("触发自动补签");
                        const rep = await httpPost({ url: END.repair, headers, body: "{}" });
                        log("补签返回：", rep);
                        if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
                        else notifyBody += `\n🔧 自动补签失败：${rep?.msg || "未知"}`;
                    }
                }
            } catch (e) { log("自动补签异常：", e); }
        }

        // 6) 内测资格检测 & 自动申请
        try {
            const beta = await httpGet({ url: END.betaStatus, headers });
            log("内测状态：", beta);
            if (beta?.data?.qualified) notifyBody += `\n🚀 已获得内测资格`;
            else if (cfg.autoApplyBeta) notifyBody += `\n⚠️ 未获得内测资格 → 自动申请失败`;
        } catch (e) { log("内测检测异常：", e); }

        if (cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

    } catch (e) {
        log("主流程异常：", e);
        if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
    }

    $done();
})();