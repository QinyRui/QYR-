/***********************************************
Ninebot_Sign_Single_v2.9.js （功能增强版）
2025-12-05 更新
核心优化：
1. 移除通知中冗余的双重验证说明文本
2. 新增盲盒到期提醒（到期前1天自动通知）
3. 新增连续签到里程碑提醒（50/100/200/300/500/1000天）
4. 优化分享任务：用短Base64编码替换超长编码（缩减80%+）
5. 保留原有所有优化功能（抓包/防重复/签名适配等）
适配工具：Surge/Quantumult X/Loon（支持Base64自动解码）
功能覆盖：抓包写入、自动签到、加密分享、自动领奖励、全盲盒开箱、资产查询、美化通知
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { if (HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }

/* 格式化时间为 YYYY-MM-DD HH:mm:ss（用于BoxJS显示） */
function formatDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/* BoxJS keys */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_SHARE = "ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LAST_SHARE = "ninebot.lastShareDate";
const KEY_ENABLE_SHARE = "ninebot.enableShare";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_SHARE_REWARD = "ninebot.shareRewardUrl";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_MILESTONE_NOTIFIED = "ninebot.milestoneNotified"; // 记录已通知的里程碑

/* Endpoints */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    shareReceiveReward: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};
const END_OPEN = {
    openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box",
    openNormal: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-blind-box"
};

/* 基础配置 */
const MAX_RETRY = 3, RETRY_DELAY = 1500, REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
const SIGN_MILESTONES = [50, 100, 200, 300, 500, 1000]; // 连续签到里程碑
const BOX_REMIND_DAY = 1; // 盲盒到期前1天提醒

/* 日志分级 */
function getLogLevel() {
    const v = readPS(KEY_LOG_LEVEL) || "full";
    return LOG_LEVEL_MAP[v] ?? LOG_LEVEL_MAP.full;
}
function logInfo(...args) {
    const level = getLogLevel();
    if (level < 2) return;
    console.log(`[${nowStr()}] info ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}`);
}
function logWarn(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.warn(`[${nowStr()}] warn ${args.join(" ")}`);
}
function logErr(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.error(`[${nowStr()}] error ${args.join(" ")}`);
}

/* Token有效性校验 */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return !(hasInvalidCode || hasInvalidMsg);
}

/* 抓包处理 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/", "/receive-share-reward"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包写入流程");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        const capUrl = $request.url || "";
        logInfo("抓包 URL：", capUrl);

        let changed = false;
        if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
        if (capUrl.includes("/service/2/app_log/")) {
            const base = capUrl.split("?")[0];
            if (readPS(KEY_SHARE) !== base) { writePS(base, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", base); }
        }
        if (capUrl.includes("/receive-share-reward")) {
            if (readPS(KEY_SHARE_REWARD) !== capUrl) {
                writePS(capUrl, KEY_SHARE_REWARD);
                changed = true;
                logInfo("捕获分享奖励接口写入：", capUrl);
            }
        }
        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, KEY_LAST_CAPTURE);
            notify("九号智能电动车", "抓包成功 ✓", `数据已写入 BoxJS（含分享接口+奖励接口）\n最后抓包时间：${currentTime}`);
            logInfo("抓包写入成功，最后抓包时间：", currentTime);
        }
        else logInfo("抓包数据无变化");
    } catch (e) { logErr("抓包异常：", e); }
    $done({});
}

/* 读取配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    shareTaskUrl: readPS(KEY_SHARE) || "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    shareRewardUrl: readPS(KEY_SHARE_REWARD) || END.shareReceiveReward,
    debug: (readPS(KEY_DEBUG) === null || readPS(KEY_DEBUG) === undefined) ? true : (readPS(KEY_DEBUG) !== "false"),
    notify: (readPS(KEY_NOTIFY) === null || readPS(KEY_NOTIFY) === undefined) ? true : (readPS(KEY_NOTIFY) !== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTOREPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null || readPS(KEY_NOTIFYFAIL) === undefined) ? true : (readPS(KEY_NOTIFYFAIL) !== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    enableShare: (readPS(KEY_ENABLE_SHARE) === null || readPS(KEY_ENABLE_SHARE) === undefined) ? true : (readPS(KEY_ENABLE_SHARE) !== "false"),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null || readPS(KEY_ENABLE_RETRY) === undefined) ? true : (readPS(KEY_ENABLE_RETRY) !== "false"),
    logLevel: getLogLevel()
};

logInfo("九号自动签到+分享任务开始（v2.9功能增强版）");
logInfo("当前配置：", {
    notify: cfg.notify,
    autoOpenBox: cfg.autoOpenBox,
    enableShare: cfg.enableShare,
    enableRetry: cfg.enableRetry,
    logLevel: cfg.logLevel,
    lastCaptureAt: readPS(KEY_LAST_CAPTURE) || "未抓包",
    lastSignDate: readPS(KEY_LAST_SIGN_DATE) || "未签到"
});

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包执行签到/分享动作以写入 Authorization / DeviceId");
    logWarn("终止：未读取到账号信息");
    $done();
}

/* 构造请求头 */
function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/octet-stream;tt-data=a",
        "device_id": cfg.DeviceId,
        "User-Agent": "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "aid": "10000004",
        "Cookie": "install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
        "accept-encoding": "gzip, deflate, br",
        "priority": "u=3",
        "accept-language": "zh-CN,zh-Hans;q=0.9",
        "accept": "application/json"
    };
}

/* 签名生成工具函数 */
function generateSign(deviceId, timestamp) {
    try {
        const str = `deviceId=${deviceId}&timestamp=${timestamp}&secret=ninebot_share_2024`;
        return require("crypto").createHash("md5").update(str).digest("hex");
    } catch (e) {
        logWarn("签名生成失败，使用默认值", e);
        return "default_sign";
    }
}

/* HTTP请求 */
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, isBase64 = false }) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") {
                opts.body = body;
                if (isBase64) opts["body-base64"] = true;
            }
            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    else { reject(err); return; }
                }
                const respData = JSON.parse(data || "{}");
                if (!checkTokenValid({ code: resp.status, ...respData })) {
                    notify(cfg.titlePrefix, "Token失效 ⚠️", "Authorization已过期/无效，请重新抓包写入");
                    reject(new Error("Token invalid or expired"));
                    return;
                }
                if (resp && resp.status && resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn(`服务端 ${resp.status}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
                    setTimeout(once, RETRY_DELAY);
                    return;
                }
                try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
            };
            if (method === "GET") $httpClient.get(opts, cb); else $httpClient.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers = {}) { return requestWithRetry({ method: "GET", url, headers }); }
function httpPost(url, headers = {}, body = {}, isBase64 = false) { return requestWithRetry({ method: "POST", url, headers, body, isBase64 }); }

/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    if (typeof ts === "number") {
        if (ts > 1e12) ts = Math.floor(ts / 1000);
        const d = new Date(ts * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (typeof ts === "string") {
        if (/^\d+/.test(ts)) {
            let n = Number(ts);
            if (n > 1e12) n = Math.floor(n / 1000);
            const d = new Date(n * 1000);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        } else {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
    }
    return null;
}
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 分享任务（已优化：短Base64编码） */
async function doShareTask(headers) {
    if (!cfg.enableShare) {
        logInfo("分享任务已关闭（BoxJS配置），跳过");
        return { success: false, msg: "ℹ️ 分享任务已关闭", exp: 0, ncoin: 0 };
    }

    const today = todayKey();
    const lastShareDate = readPS(KEY_LAST_SHARE) || "";

    if (lastShareDate === today) {
        logInfo("今日已完成分享任务，跳过");
        return { success: false, msg: "ℹ️ 今日已分享", exp: 0, ncoin: 0 };
    }

    // 优化：使用短Base64编码（来自Loon回放，有效且精简）
    const ENCRYPTED_BODY = "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";

    logInfo("开始执行分享任务（使用短Base64编码）...");
    try {
        const shareResp = await httpPost(
            cfg.shareTaskUrl,
            headers,
            ENCRYPTED_BODY,
            true // 标记为Base64编码，脚本会自动解码
        );
        logInfo("分享接口返回：", shareResp);

        if (shareResp.e === 0 || shareResp.success === true || shareResp.message === "success") {
            writePS(today, KEY_LAST_SHARE);

            logInfo("尝试自动领取分享奖励（使用抓包的真实接口）...");
            try {
                const receiveResp = await httpPost(
                    cfg.shareRewardUrl, // 动态使用抓包的奖励接口
                    headers,
                    {
                        deviceId: cfg.DeviceId,
                        taskType: "share",
                        timestamp: Date.now(),
                        signType: "daily_share",
                        awardType: 1
                    }
                );
                logInfo("分享奖励领取接口返回：", receiveResp);
                let receiveMsg = "";
                if (receiveResp.code === 0 || receiveResp.success === true || (receiveResp.msg && receiveResp.msg.includes("成功")) || (receiveResp.message && receiveResp.message.includes("成功"))) {
                    receiveMsg = "✅ 奖励已领取";
                } else if ((receiveResp.msg && receiveResp.msg.includes("已领取")) || (receiveResp.message && receiveResp.message.includes("已领取"))) {
                    receiveMsg = "ℹ️ 奖励已领取";
                } else {
                    receiveMsg = "⚠️ 奖励领取失败（接口返回：" + (receiveResp.msg || receiveResp.message || "未知错误") + "）";
                }
            } catch (e) {
                logWarn("自动领取奖励异常：", String(e));
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            return {
                success: true,
                msg: `✅ 分享任务：成功\n🎯 领取状态：已尝试自动领取`,
                exp: 0,
                ncoin: 0
            };
        } else {
            const errMsg = shareResp.msg || shareResp.message || "接口返回异常";
            logWarn("分享任务失败：", errMsg);
            return { success: false, msg: `❌ 分享失败：${errMsg}`, exp: 0, ncoin: 0 };
        }
    } catch (e) {
        const errMsg = String(e);
        logErr("分享任务请求异常：", errMsg);
        return { success: false, msg: cfg.notifyFail ? `❌ 分享异常：${errMsg}` : "", exp: 0, ncoin: 0 };
    }
}

/* 盲盒到期提醒 */
async function checkBlindBoxExpire(headers) {
    logInfo("开始检查盲盒到期状态...");
    try {
        const boxList = await httpGet(END.blindBoxList, headers);
        if (!boxList || !boxList.data || !Array.isArray(boxList.data.list)) {
            logWarn("盲盒列表获取失败：", boxList);
            return "";
        }

        const now = new Date().getTime();
        const expireRemind = [];
        boxList.data.list.forEach(box => {
            if (box.expireTime) {
                const expireTime = new Date(box.expireTime).getTime();
                const diffDays = Math.ceil((expireTime - now) / (1000 * 60 * 60 * 24));
                if (diffDays <= BOX_REMIND_DAY && diffDays >= 0) {
                    expireRemind.push({
                        type: box.boxType === 1 ? "七日盲盒" : "普通盲盒",
                        days: diffDays
                    });
                }
            }
        });

        if (expireRemind.length > 0) {
            const remindMsg = expireRemind.map(item => `${item.type}（剩余${item.days}天到期）`).join("、");
            return `⚠️ 盲盒到期提醒：${remindMsg}\n请及时开箱避免失效～`;
        }
        return "";
    } catch (e) {
        logErr("盲盒到期检查异常：", e);
        return "";
    }
}

/* 连续签到里程碑提醒 */
function checkSignMilestone(continuousDays) {
    if (!continuousDays || continuousDays < 50) return "";
    const notified = readPS(KEY_MILESTONE_NOTIFIED) ? JSON.parse(readPS(KEY_MILESTONE_NOTIFIED)) : [];
    const hitMilestone = SIGN_MILESTONES.find(ms => ms === continuousDays && !notified.includes(ms));
    if (hitMilestone) {
        notified.push(hitMilestone);
        writePS(JSON.stringify(notified), KEY_MILESTONE_NOTIFIED);
        return `🏆 签到里程碑达成：连续签到${hitMilestone}天！\n坚持打卡，福利不断～`;
    }
    return "";
}

/* 自动开箱 */
async function autoOpenBox(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱功能已关闭（BoxJS配置），跳过");
        return { msg: "ℹ️ 自动开箱已关闭", rewards: [] };
    }

    logInfo("开始执行自动开箱...");
    try {
        const boxList = await httpGet(END.blindBoxList, headers);
        if (!boxList || !boxList.data || !Array.isArray(boxList.data.list)) {
            logWarn("获取盲盒列表失败：", boxList);
            return { msg: "⚠️ 自动开箱失败：获取列表异常", rewards: [] };
        }

        const normalBoxes = boxList.data.list.filter(box => box.boxType === 0 && box.status === 1);
        const sevenBoxes = boxList.data.list.filter(box => box.boxType === 1 && box.status === 1);
        const rewards = [];

        // 开七日盲盒
        if (sevenBoxes.length > 0) {
            logInfo(`发现${sevenBoxes.length}个可开七日盲盒，开始开箱...`);
            for (const box of sevenBoxes) {
                const openResp = await httpPost(END_OPEN.openSeven, headers, { boxId: box.id });
                if (openResp.code === 0 && openResp.data && openResp.data.rewardName) {
                    rewards.push(`七日盲盒：${openResp.data.rewardName}`);
                    logInfo(`七日盲盒开箱成功：${openResp.data.rewardName}`);
                } else {
                    logWarn(`七日盲盒开箱失败：`, openResp);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 开普通盲盒
        if (normalBoxes.length > 0) {
            logInfo(`发现${normalBoxes.length}个可开普通盲盒，开始开箱...`);
            for (const box of normalBoxes) {
                const openResp = await httpPost(END_OPEN.openNormal, headers, { boxId: box.id });
                if (openResp.code === 0 && openResp.data && openResp.data.rewardName) {
                    rewards.push(`普通盲盒：${openResp.data.rewardName}`);
                    logInfo(`普通盲盒开箱成功：${openResp.data.rewardName}`);
                } else {
                    logWarn(`普通盲盒开箱失败：`, openResp);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (rewards.length === 0) {
            return { msg: "ℹ️ 无可用盲盒或开箱失败", rewards: [] };
        } else {
            return { msg: `✅ 自动开箱完成（共${rewards.length}个）`, rewards };
        }
    } catch (e) {
        logErr("自动开箱异常：", e);
        return { msg: `⚠️ 自动开箱异常：${String(e)}`, rewards: [] };
    }
}

/* 资产查询 */
async function queryAssets(headers) {
    logInfo("开始查询资产信息...");
    try {
        const balanceResp = await httpGet(END.balance, headers);
        const creditInfoResp = await httpGet(END.creditInfo, headers);
        const assets = { ncoin: 0, credit: 0 };

        // 查询N币余额
        if (balanceResp.code === 0 && balanceResp.data) {
            assets.ncoin = balanceResp.data.balance || 0;
        } else {
            logWarn("N币余额查询失败：", balanceResp);
        }

        // 查询积分余额
        if (creditInfoResp.code === 0 && creditInfoResp.data) {
            assets.credit = creditInfoResp.data.totalCredit || 0;
        } else {
            logWarn("积分查询失败：", creditInfoResp);
        }

        return assets;
    } catch (e) {
        logErr("资产查询异常：", e);
        return { ncoin: 0, credit: 0 };
    }
}

/* 主函数 */
async function main() {
    const headers = makeHeaders();
    const today = todayKey();
    const lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";
    const result = {
        sign: { success: false, msg: "" },
        share: { success: false, msg: "" },
        box: { msg: "", rewards: [] },
        assets: { ncoin: 0, credit: 0 },
        milestone: "",
        boxRemind: ""
    };

    try {
        // 1. 签到状态判断
        if (lastSignDate === today) {
            result.sign.msg = "ℹ️ 今日已签到，跳过";
            logInfo(result.sign.msg);
        } else {
            logInfo("开始执行签到任务...");
            const signResp = await httpPost(END.sign, headers, {});
            logInfo("签到接口返回：", signResp);

            if (signResp.code === 0 || signResp.success === true || (signResp.msg && signResp.msg.includes("成功"))) {
                writePS(today, KEY_LAST_SIGN_DATE);
                result.sign.success = true;
                result.sign.msg = "✅ 签到成功";

                // 查询连续签到天数（用于里程碑提醒）
                const statusResp = await httpGet(END.status, headers);
                const continuousDays = statusResp.data?.continuousSignDays || 0;
                result.milestone = checkSignMilestone(continuousDays);
            } else {
                const errMsg = signResp.msg || signResp.message || "接口返回异常";
                result.sign.msg = `❌ 签到失败：${errMsg}`;
                logWarn(result.sign.msg);
            }
        }

        // 2. 分享任务
        const shareRes = await doShareTask(headers);
        result.share = shareRes;

        // 3. 自动开箱
        const boxRes = await autoOpenBox(headers);
        result.box = boxRes;

        // 4. 资产查询
        const assetsRes = await queryAssets(headers);
        result.assets = assetsRes;

        // 5. 盲盒到期提醒
        result.boxRemind = await checkBlindBoxExpire(headers);

        // 6. 组装通知内容
        const notifyTitle = `${cfg.titlePrefix} - 执行结果`;
        const notifyBody = [
            `📅 执行时间：${formatDateTime()}`,
            `📝 签到状态：${result.sign.msg}`,
            `📤 分享状态：${result.share.msg}`,
            `🎁 开箱结果：${result.box.msg}${result.box.rewards.length > 0 ? "\n   开箱奖励：" + result.box.rewards.join("、") : ""}`,
            `💰 资产余额：N币 ${result.assets.ncoin} · 积分 ${result.assets.credit}`,
            result.milestone,
            result.boxRemind
        ].filter(item => item).join("\n\n");

        // 推送通知（根据配置）
        if (cfg.notify) {
            notify(notifyTitle, "", notifyBody);
        }
        logInfo("任务执行完成，通知已推送");

    } catch (e) {
        const errMsg = String(e);
        result.sign.msg = cfg.notifyFail ? `❌ 主流程异常：${errMsg}` : "";
        logErr("主流程执行异常：", errMsg);
        if (cfg.notify && cfg.notifyFail) {
            notify(`${cfg.titlePrefix} - 执行异常`, "", `❌ 脚本执行失败：${errMsg}`);
        }
    }

    logInfo("任务执行完毕，最终结果：", result);
    $done();
}

// 启动主函数
main();