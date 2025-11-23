/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 配置读取
*/

// Global variables for Scripting environment
declare const $request: { url: string; headers: Record<string, string> } | undefined;
declare const $persistentStore: { read: (key: string) => string | null; write: (value: string, key: string) => boolean } | undefined;
declare const $notification: { post: (title: string, sub: string, body: string) => void } | undefined;
declare const $httpClient: {
    post: (options: { url: string; headers: Record<string, string>; body: string }, callback: (error: Error | null, response: unknown, data: string) => void) => void;
    get: (options: { url: string; headers: Record<string, string> }, callback: (error: Error | null, response: unknown, data: string) => void) => void;
} | undefined;
declare const $done: (result?: unknown) => void;

const isReq: boolean = typeof $request !== "undefined" && !!$request.url;

/**
 * Reads a value from persistent store.
 * @param k The key to read.
 * @returns The value associated with the key, or null if not found.
 */
const read = (k: string): string | null => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);

/**
 * Writes a value to persistent store.
 * @param v The value to write.
 * @param k The key to associate the value with.
 * @returns True if write was successful, false otherwise.
 */
const write = (v: string, k: string): boolean => {
    if (typeof $persistentStore !== "undefined") {
        return $persistentStore.write(v, k);
    }
    return false;
};

/**
 * Posts a system notification.
 * @param title The title of the notification.
 * @param sub The subtitle of the notification.
 * @param body The body of the notification.
 */
const notify = (title: string, sub: string, body: string): void => {
    if (typeof $notification !== "undefined") {
        $notification.post(title, sub, body);
    }
};

// ---------- BoxJS keys ----------
const KEY_AUTH: string = "ninebot.authorization";
const KEY_DEV: string = "ninebot.deviceId";
const KEY_UA: string = "ninebot.userAgent";
const KEY_DEBUG: string = "ninebot.debug";
const KEY_NOTIFY: string = "ninebot.notify";
const KEY_AUTOBOX: string = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR: string = "ninebot.autoRepair";
const KEY_AUTOAPPLYBETA: string = "ninebot.autoApplyBeta";
const KEY_NOTIFYFAIL: string = "ninebot.notifyFail";
const KEY_TITLE: string = "ninebot.titlePrefix";

// ---------- 日志函数 ----------
/**
 * Safely stringifies an unknown value to JSON, or converts it to a string if stringification fails.
 * @param v The value to stringify.
 * @returns A JSON string or a regular string representation of the value.
 */
function safeStr(v: unknown): string {
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
}

/**
 * Logs messages to the console with a timestamp and optional level prefix.
 * Special handling for start/end messages to omit the level prefix.
 * @param level The log level ("info", "warn", "error", "debug", "log").
 * @param args Multiple arguments to log. Objects will be stringified.
 */
function log(level: "info" | "warn" | "error" | "debug" | "log", ...args: unknown[]): void {
    const ts: string = `[${new Date().toLocaleString()}]`;
    const messageParts: string[] = args.map((arg: unknown) => {
        if (typeof arg === 'object' && arg !== null) {
            return safeStr(arg);
        }
        return String(arg);
    });
    const fullMessage: string = messageParts.join(' ');

    // Special handling for start/end messages to match user's previous request (no level prefix)
    if (fullMessage.includes("======== 九号自动签到开始 ========") || fullMessage.includes("======== 九号自动签到结束 ========")) {
        console.log(`${ts} ${fullMessage}`);
    } else {
        // For other messages, include the level prefix
        switch (level) {
            case "info": console.info(`${ts} ${level} ${fullMessage}`); break;
            case "warn": console.warn(`${ts} ${level} ${fullMessage}`); break;
            case "error": console.error(`${ts} ${level} ${fullMessage}`); break;
            case "debug": console.debug(`${ts} ${level} ${fullMessage}`); break;
            case "log":
            default: console.log(`${ts} ${level} ${fullMessage}`); break;
        }
    }
}

// ---------- 抓包写入（指定接口） ----------
if (isReq && $request.url.startsWith("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status")) {
    try {
        const h: Record<string, string> = $request.headers || {};
        const auth: string = h["Authorization"] || h["authorization"] || "";
        const dev: string = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua: string = h["User-Agent"] || h["user-agent"] || "";

        let changed: boolean = false;
        if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
        if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
        if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

        if (changed) {
            notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
            log("info", "抓包写入成功", { auth, dev, ua });
        } else {
            log("warn", "抓包写入未发生变化");
        }
    } catch (e: unknown) {
        log("error", "抓包写入异常", e);
    }
    $done({});
}

// ---------- 配置类型定义 ----------
interface Config {
    Authorization: string;
    DeviceId: string;
    userAgent: string;
    debug: boolean;
    notify: boolean;
    autoOpenBox: boolean;
    autoRepair: boolean;
    autoApplyBeta: boolean;
    notifyFail: boolean;
    titlePrefix: string;
}

// ---------- 读取配置 ----------
const cfg: Config = {
    Authorization: read(KEY_AUTH) || "",
    DeviceId: read(KEY_DEV) || "",
    userAgent: read(KEY_UA) || "",
    debug: read(KEY_DEBUG) === "false" ? false : true,
    notify: read(KEY_NOTIFY) === "false" ? false : true,
    autoOpenBox: read(KEY_AUTOBOX) === "true",
    autoRepair: read(KEY_AUTOREPAIR) === "true",
    autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
    notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
    titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
    log("info", "终止：未读取到账号信息");
    $done();
}

// ---------- HTTP helpers ----------
interface HttpRequestOptions {
    url: string;
    headers: Record<string, string>;
    body?: string;
}

interface NinebotApiResponse {
    code?: number;
    msg?: string;
    success?: boolean;
    data?: unknown;
    raw?: string; // For non-JSON responses
}

function httpPost(options: HttpRequestOptions): Promise<NinebotApiResponse> {
    return new Promise((resolve, reject) => {
        if (typeof $httpClient === "undefined") {
            return reject(new Error("$httpClient is not defined"));
        }
        $httpClient.post(options, (err: Error | null, resp: unknown, data: string) => {
            if (err) {
                reject(err);
            } else {
                try {
                    resolve(JSON.parse(data || "{}"));
                } catch {
                    resolve({ raw: data });
                }
            }
        });
    });
}

function httpGet(options: HttpRequestOptions): Promise<NinebotApiResponse> {
    return new Promise((resolve, reject) => {
        if (typeof $httpClient === "undefined") {
            return reject(new Error("$httpClient is not defined"));
        }
        $httpClient.get(options, (err: Error | null, resp: unknown, data: string) => {
            if (err) {
                reject(err);
            } else {
                try {
                    resolve(JSON.parse(data || "{}"));
                } catch {
                    resolve({ raw: data });
                }
            }
        });
    });
}

// ---------- Endpoints ----------
const headers: Record<string, string> = {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
};

const END: Record<string, string> = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 主流程 ----------
!(async (): Promise<void> => {
    let notifyBody: string = "";
    log("info", "======== 九号自动签到开始 ========");

    try {
        // 签到
        log("info", "开始签到请求");
        const sign: NinebotApiResponse = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
        log("info", "签到返回：", sign);
        if (sign?.code === 0) {
            const signData = sign.data as { nCoin?: number; score?: number } | undefined;
            notifyBody += `🎉 签到成功\n🎁 +${signData?.nCoin || signData?.score || 0} N币`;
        } else if (sign?.code === 540004) {
            notifyBody += "⚠️ 今日已签到";
        } else {
            notifyBody += `❌ 签到失败：${sign?.msg || safeStr(sign)}`;
            if (!cfg.notifyFail) notifyBody = "";
        }

        // 状态
        const st: NinebotApiResponse = await httpGet({ url: END.status, headers });
        log("info", "状态返回：", st);
        if (st?.code === 0) {
            const statusData = st.data as { consecutiveDays?: number; signCardsNum?: number } | undefined;
            notifyBody += `\n🗓 连续签到：${statusData?.consecutiveDays || 0} 天\n🎫 补签卡：${statusData?.signCardsNum || 0} 张`;
        }

        // 余额
        const bal: NinebotApiResponse = await httpGet({ url: END.balance, headers });
        log("info", "余额返回：", bal);
        if (bal?.code === 0) {
            const balanceData = bal.data as { balance?: number } | undefined;
            notifyBody += `\n💰 N币余额：${balanceData?.balance || 0}`;
        }

        // 盲盒
        interface BlindBox {
            awardDays: number;
            leftDaysToOpen: number;
            rewardStatus: number;
        }
        const box: NinebotApiResponse = await httpGet({ url: END.blindBoxList, headers });
        log("info", "盲盒返回：", box);
        const notOpened: BlindBox[] = (box?.data as { notOpenedBoxes?: BlindBox[] } | undefined)?.notOpenedBoxes || [];
        if (notOpened.length > 0) {
            notifyBody += `\n\n📦 盲盒任务：`;
            notOpened.forEach((b: BlindBox) => {
                const days: number | string = b.awardDays || "?";
                const left: number | string = b.leftDaysToOpen || "?";
                notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
            });
            if (cfg.autoOpenBox) {
                const ready: BlindBox[] = notOpened.filter((b: BlindBox) => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
                if (ready.length > 0) {
                    notifyBody += `\n\n🎉 自动开启盲盒：`;
                    for (const b of ready) {
                        try {
                            const r: NinebotApiResponse = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
                            log("info", "盲盒领取返回：", r);
                            if (r?.code === 0) {
                                const rewardData = r.data as { rewardValue?: string; score?: number } | undefined;
                                notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${rewardData?.rewardValue || rewardData?.score || "未知"}`;
                            } else {
                                notifyBody += `\n❌ ${b.awardDays}天盲盒领取失败`;
                            }
                        } catch (e: unknown) {
                            log("error", "盲盒领取异常：", e);
                            notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`;
                        }
                    }
                }
            }
        }

        // 自动补签
        if (cfg.autoRepair) {
            try {
                const statusData = st.data as { signCardsNum?: number; consecutiveDays?: number } | undefined;
                const cards: number = statusData?.signCardsNum || 0;
                const days: number = statusData?.consecutiveDays || 0;
                if (cards > 0 && days === 0) {
                    log("info", "触发自动补签");
                    const rep: NinebotApiResponse = await httpPost({ url: END.repair, headers, body: "{}" });
                    log("info", "补签返回：", rep);
                    if (rep?.code === 0) {
                        notifyBody += `\n🔧 自动补签成功`;
                    } else {
                        notifyBody += `\n🔧 自动补签失败：${rep?.msg || "未知"}`;
                    }
                }
            } catch (e: unknown) {
                log("error", "自动补签异常：", e);
            }
        }

        // 内测资格
        try {
            const beta: NinebotApiResponse = await httpGet({ url: END.betaStatus, headers });
            log("info", "内测状态：", beta);
            const betaData = beta.data as { qualified?: boolean } | undefined;
            if (betaData?.qualified) {
                notifyBody += `\n🚀 已获得内测资格`;
            } else {
                notifyBody += `\n⚠️ 未获得内测资格`;
                if (cfg.autoApplyBeta) {
                    try {
                        const applyResp: NinebotApiResponse = await httpPost({ url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
                        log("info", "内测申请返回：", applyResp);
                        if (applyResp?.success) {
                            notifyBody += " → 自动申请成功 🎉";
                        } else {
                            notifyBody += " → 自动申请失败 ❌";
                        }
                    } catch (e: unknown) {
                        log("error", "内测自动申请异常：", e);
                        notifyBody += " → 自动申请异常 ❌";
                    }
                }
            }
        } catch (e: unknown) {
            log("error", "内测检测异常：", e);
        }

        if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);
    } catch (e: unknown) {
        log("error", "主流程异常：", e);
        if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
    }

    log("info", "======== 九号自动签到结束 ========");
    $done();
})();