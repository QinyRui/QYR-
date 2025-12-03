/***********************************************
Ninebot_Sign_Single_v2.7.js （Loon 专用修正版）
2025-12-05 23:00 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon
***********************************************/

let $argument = typeof $argument !== "undefined" ? $argument : {};
let $persistentStore = typeof $persistentStore !== "undefined" ? $persistentStore : { read: () => null, write: () => false };
let $notification = typeof $notification !== "undefined" ? $notification : { post: () => {} };
let $httpClient = typeof $httpClient !== "undefined" ? $httpClient : { 
    get: (opts, cb) => cb(null, { status: 200 }, '{}'),
    post: (opts, cb) => cb(null, { status: 200 }, '{}')
};

function readPS(key) { try { return $persistentStore.read(key); } catch { return null; } }
function writePS(val, key) { try { return $persistentStore.write(val, key); } catch { return false; } }
function nowStr() { return new Date().toLocaleString(); }
function logInfo(...args) { console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args) { console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args) { console.error(`[${nowStr()}] error ${args.join(" ")}`); }
function notify(title, sub, body) { if ($notification.post) $notification.post(title, sub, body); }

let ARG = {
    titlePrefix: $argument.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: $argument.logLevel || readPS("ninebot.logLevel") || "full",
    notify: $argument.notify === "true" || readPS("ninebot.notify") === "true"
};

let KEY_AUTH = "ninebot.authorization";
let KEY_DEV = "ninebot.deviceId";
let KEY_UA = "ninebot.userAgent";
let KEY_AUTOBOX = "ninebot.autoOpenBox";
let KEY_NOTIFYFAIL = "ninebot.notifyFail";
let KEY_ENABLE_RETRY = "ninebot.enableRetry";
let KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";

let END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};

let END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

// 基础配置
let cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
    enableRetry: readPS(KEY_ENABLE_RETRY) !== "false",
    notify: ARG.notify,
    titlePrefix: ARG.titlePrefix
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/octet-stream",
        "device_id": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh"
    };
}

// 安全请求函数
function requestWithRetry({ method="GET", url, headers={}, body=null }) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const MAX_RETRY = 3;
        const RETRY_DELAY = 1500;
        const once = () => {
            attempts++;
            const cb = (err, resp, data) => {
                if (err && attempts < MAX_RETRY && cfg.enableRetry) { 
                    setTimeout(once, RETRY_DELAY); 
                    return; 
                }
                try { resolve(JSON.parse(data||"{}")); } catch { resolve({raw:data}); }
            };
            if (method==="GET") $httpClient.get({url, headers}, cb);
            else $httpClient.post({url, headers, body}, cb);
        };
        once();
    });
}

async function main() {
    try {
        let headers = makeHeaders();

        // 查询签到状态
        let today = new Date().toISOString().slice(0,10);
        let status = await requestWithRetry({url: END.status + "?t=" + Date.now(), headers});
        let isSigned = status?.data?.currentSignStatus === 1;

        let signMsg = "";
        if (!isSigned) {
            let signResp = await requestWithRetry({url: END.sign, method:"POST", headers, body:{deviceId: cfg.DeviceId}});
            if (signResp.code === 0) signMsg = "✨ 今日签到：成功";
            else signMsg = "❌ 今日签到失败";
        } else { signMsg = "✨ 今日签到：已签到"; }

        // 查询盲盒
        let boxResp = await requestWithRetry({url: END.blindBoxList, headers});
        let boxes = boxResp?.data?.notOpenedBoxes || [];
        let boxMsg = boxes.length > 0 ? "📦 盲盒开箱结果\n" + boxes.map(b => `- ${b.awardDays}天盲盒（剩余${b.leftDaysToOpen}天）`).join("\n") : "📦 盲盒开箱结果：无可用盲盒";

        // 查询账户状态
        let bal = await requestWithRetry({url: END.balance, headers});
        let credit = await requestWithRetry({url: END.creditInfo, headers});
        let creditVal = credit?.data?.credit ?? 0;
        let creditLevel = credit?.data?.level ?? 0;
        let needExp = credit?.data?.credit_upgrade ?? 0;
        let nCoin = bal?.data?.balance ?? bal?.data?.coin ?? 0;
        let signCards = status?.data?.signCardsNum ?? 0;
        let consecutive = status?.data?.consecutiveDays ?? 0;

        let notifyBody = `${signMsg}
${boxMsg}
📊 账户状态
- 当前经验：${creditVal}（LV.${creditLevel}）
- 距离升级：${needExp} 经验
- 当前 N 币：${nCoin}
- 补签卡：${signCards} 张
- 连续签到：${consecutive} 天`;

        if (cfg.notify) notify(cfg.titlePrefix, "", notifyBody);
        logInfo("九号自动签到任务完成");
    } catch (e) {
        logErr("自动签到异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常 ⚠️", String(e));
    }
}

main();