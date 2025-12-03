/***********************************************
Ninebot_Sign_Single_v2.7.js （Loon 专用最终修复版）
2025-12-05 16:00 更新
核心功能：自动签到、盲盒开箱、资产查询
环境：Loon
***********************************************/

// Loon 环境检测与默认值
const $argument = $argument || {};
const $persistentStore = $persistentStore || { read: () => null, write: () => false };
const $notification = $notification || { post: () => {} };
const $httpClient = $httpClient || { 
    get: (opts, cb) => cb(null, { status: 200 }, '{}'),
    post: (opts, cb) => cb(null, { status: 200 }, '{}')
};

// 日志函数
function nowStr() { return new Date().toLocaleString(); }
function logInfo(...args) { console.log(`[${nowStr()}] info`, ...args); }
function logWarn(...args) { console.warn(`[${nowStr()}] warn`, ...args); }
function logErr(...args) { console.error(`[${nowStr()}] error`, ...args); }

// BoxJS 参数读取
function readPS(key) { try { return $persistentStore.read(key); } catch (e) { return null; } }
function writePS(val, key) { try { return $persistentStore.write(val, key); } catch (e) { return false; } }

const ARG = {
    titlePrefix: $argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: $argument?.logLevel || readPS("ninebot.logLevel") || "full",
    notify: $argument?.notify === "true" || readPS("ninebot.notify") === "true"
};

// 通知
function notify(title, sub, body) { 
    logInfo("通知参数：", { title, sub, body });
    $notification.post(title, sub, body);
}

// 请求封装（支持重试）
const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;
function requestWithRetry({ method="GET", url, headers={}, body=null }) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const once = () => {
            attempts++;
            const opts = { url, headers, timeout: REQUEST_TIMEOUT };
            if (method === "POST") opts.body = body;
            const cb = (err, resp, data) => {
                if (err) {
                    if (attempts < MAX_RETRY) {
                        logWarn(`请求错误：${err}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    } else reject(err);
                    return;
                }
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
            };
            method === "GET" ? $httpClient.get(opts, cb) : $httpClient.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers={}) { return requestWithRetry({ method:"GET", url, headers }); }
function httpPost(url, headers={}, body={}) { return requestWithRetry({ method:"POST", url, headers, body }); }

// 配置 Key
const KEY_AUTH="ninebot.authorization", KEY_DEV="ninebot.deviceId", KEY_AUTOBOX="ninebot.autoOpenBox", KEY_NOTIFYFAIL="ninebot.notifyFail";
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

// 主配置
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    notify: ARG.notify,
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    notifyFail: readPS(KEY_NOTIFYFAIL) !== "false"
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(ARG.titlePrefix, "未配置 Token", "请先抓包执行签到动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

// 生成请求头
function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/octet-stream;tt-data=a",
        "device_id": cfg.DeviceId,
        "User-Agent": "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com"
    };
}

// 打开所有可开盲盒
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) return [];
    try {
        const boxResp = await httpGet(END.blindBoxList, headers);
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const results = [];
        for (const box of notOpened) {
            const url = box.awardDays === 7 ? END_OPEN.openSeven : END_OPEN.openNormal;
            try {
                const resp = await httpPost(url, headers, { deviceId: cfg.DeviceId, boxId: box.id, timestamp: Date.now(), sign: "dummy" });
                results.push(resp?.data?.awardName ? `✅ ${box.awardDays}天盲盒：${resp.data.awardName}` : `❌ ${box.awardDays}天盲盒：失败`);
            } catch(e){ results.push(`❌ ${box.awardDays}天盲盒：${String(e)}`); }
        }
        return results;
    } catch(e){ return ["❌ 盲盒查询异常：" + String(e)]; }
}

// 主流程
(async () => {
    const headers = makeHeaders();
    let signMsg = "✨ 今日签到：已签到";
    let boxMsg = "", creditData={}, bal={}, blindProgress="", need=0, signCards=0, consecutiveDays=0;

    try {
        const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
        const sData = statusResp?.data || {};
        consecutiveDays = sData?.consecutiveDays || sData?.continuousDays || 0;
        signCards = sData?.signCardsNum || sData?.remedyCard || 0;

        const boxResults = await openAllAvailableBoxes(headers);
        boxMsg = boxResults.length>0 ? `📦 盲盒开箱结果\n${boxResults.join("\n")}` : "📦 盲盒开箱结果：无可用盲盒";

        const cr = await httpGet(END.creditInfo, headers);
        creditData = cr?.data || {};
        const credit = Number(creditData.credit||0);
        const level = creditData.level || "";
        if(creditData.credit_upgrade){ const m=String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m && m[1]) need=Number(m[1]); }

        const balResp = await httpGet(END.balance, headers);
        if(balResp?.code===0) bal=balResp.data;

        const boxList = await httpGet(END.blindBoxList, headers);
        const notOpened = boxList?.data?.notOpenedBoxes || [];
        const opened = boxList?.data?.openedBoxes || [];
        const openedTypes=[...new Set(opened.map(b=>b.awardDays+"天"))];
        const openedDesc = opened.length>0?`已开${opened.length}个（类型：${openedTypes.join("、")}）`:"暂无已开盲盒";
        const waitingBoxes = notOpened.map(b=>`- ${b.awardDays}天盲盒（剩余${b.leftDaysToOpen??0}天）`).join("\n");
        blindProgress = openedDesc + (waitingBoxes?`\n- 待开盲盒：\n${waitingBoxes}`:"\n- 待开盲盒：无");

        if(cfg.notify){
            const body = `${signMsg}
${boxMsg}
📊 账户状态
- 当前经验：${credit}${level?`（LV.${level}）`:''}
- 距离升级：${need} 经验
- 当前 N 币：${bal?.balance??bal?.coin??0}
- 补签卡：${signCards} 张
- 连续签到：${consecutiveDays} 天
• 盲盒进度
${blindProgress}`;
            notify(ARG.titlePrefix,"",body);
        }

        logInfo("九号自动签到任务完成（v2.7 Loon 专用）");
    } catch(e){
        logErr("自动签到异常：",e);
        if(cfg.notifyFail) notify(ARG.titlePrefix,"任务异常 ⚠️",String(e));
    }
})();