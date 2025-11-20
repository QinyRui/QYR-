/*
📱 九号智能电动车 · 单号自动签到（v2.6）
更新日期：2025/11/20/16/30/00
👤 作者：QinyRui & ❥﹒﹏非我不可
Telegram 群：https://t.me/JiuHaoAPP
适配系统：iOS / iPadOS / macOS
*/

const isReq = typeof $request !== "undefined" && $request.headers;

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };
const log = (...args) => console.log("[Ninebot]", ...args);
const safeStr = v => { try { return JSON.stringify(v); } catch { return String(v); } };

// ---------- BoxJS keys / Loon开关对应 ----------
const cfg = {
    debug: read("ninebot.debug") === "false" ? false : true,
    notify: read("ninebot.notify") === "false" ? false : true,
    autoOpenBox: read("ninebot.autoOpenBox") === "true",
    autoRepair: read("ninebot.autoRepair") === "true",
    autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
    notifyFail: read("ninebot.notifyFail") === "false" ? false : true,
    titlePrefix: read("ninebot.titlePrefix") || "九号签到"
};

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
            }
        });
    });
}

function httpGet({ url, headers }) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
            }
        });
    });
}

// ---------- Endpoints ----------
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
    log("开始执行九号签到脚本...");

    try {
        const headers = {
            "Authorization": read("ninebot.authorization") || "",
            "device_id": read("ninebot.deviceId") || "",
            "User-Agent": read("ninebot.userAgent") || "Ninebot/3606 CFNetwork/3860.200.71 Darwin/25.1.0",
            "Content-Type": "application/json",
            "platform": "h5",
            "Origin": "https://h5-bj.ninebot.com",
            "language": "zh"
        };

        // 1) 获取状态
        log("获取当前签到状态...");
        const st = await httpGet({ url: END.status, headers });
        log("当前签到状态返回：", st);

        const consecutiveDays = st?.data?.consecutiveDays || 0;
        const signCards = st?.data?.signCardsNum || 0;
        log(`当前连续签到天数: ${consecutiveDays}`);
        log(`当前补签卡数量: ${signCards}`);

        // 2) 签到
        log("开始签到...");
        const signResp = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: headers.device_id }) });
        log("签到结果：", signResp);
        if (signResp.code === 0) notifyBody += `签到成功 +${signResp.data?.nCoin || signResp.data?.score || 0} N币\n`;
        else if (signResp.code === 540004) notifyBody += `已签到,不能重复签到\n`;
        else notifyBody += `签到失败: ${signResp.msg || safeStr(signResp)}\n`;

        // 3) N币余额
        log("获取N币余额...");
        const bal = await httpGet({ url: END.balance, headers });
        log("N币余额返回：", bal);
        if (bal?.code === 0) notifyBody += `N币余额: ${bal.data?.balance || 0}\n`;

        // 4) 盲盒
        log("获取盲盒任务列表...");
        const boxList = await httpGet({ url: END.blindBoxList, headers });
        log("盲盒任务列表结果：", boxList);

        if (cfg.autoOpenBox && Array.isArray(boxList?.data?.notOpenedBoxes)) {
            for (const b of boxList.data.notOpenedBoxes) {
                if (b.leftDaysToOpen === 0 || b.diffDays === 0) {
                    log(`尝试领取盲盒: ${b.awardDays || b.boxDays}天`);
                    const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
                    log(`盲盒领取结果:`, r);
                }
            }
        }

        // 5) 自动补签
        if (cfg.autoRepair && signCards > 0 && consecutiveDays === 0) {
            log("触发自动补签...");
            const rep = await httpPost({ url: END.repair, headers, body: "{}" });
            log("补签返回：", rep);
        }

        // 6) 内测申请
        log("检测内测资格...");
        const beta = await httpGet({ url: END.betaStatus, headers });
        log("内测状态返回：", beta);
        if (!beta?.data?.qualified && cfg.autoApplyBeta) {
            log("尝试自动申请内测资格...");
            const applyResp = await httpPost({ url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({ deviceId: headers.device_id }) });
            log("内测申请返回：", applyResp);
        }

        log("脚本执行完成.");
        if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);

    } catch (e) {
        log("脚本异常：", e);
        if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
    }

    $done();
})();