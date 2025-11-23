/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 配置读取
*/

const isReq = typeof $request !== "undefined" && $request.url;
const read = (k: string): string | null => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v: string, k: string): boolean => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title: string, sub: string, body: string): void => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";

// ---------- 抓包写入（指定接口） ----------
if (isReq && $request.url.startsWith("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status")) {
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
            notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
            console.log(`[${new Date().toLocaleString()}] 抓包写入成功`, {auth, dev, ua});
        } else {
            console.log(`[${new Date().toLocaleString()}] 抓包写入未发生变化`);
        }
    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] 抓包写入异常`, e);
    }
    $done({});
}

// ---------- 读取配置 ----------
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
    console.log(`[${new Date().toLocaleString()}] 终止：未读取到账号信息`);
    $done();
}

// ---------- HTTP helpers ----------
interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    data: string;
}

function httpPost({ url, headers, body = "{}" }: { url: string; headers: Record<string, string>; body?: string }): Promise<any> {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err: Error | null, resp: HttpResponse, data: string) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } 
                catch { resolve({ raw: data }); }
            }
        });
    });
}
function httpGet({ url, headers }: { url: string; headers: Record<string, string> }): Promise<any> {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err: Error | null, resp: HttpResponse, data: string) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); }
                catch { resolve({ raw: data }); }
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

const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 日志函数 ----------
function log(level: string, ...args: unknown[]): void {
    const ts = `[${new Date().toLocaleString()}]`;
    const messageParts = args.map(arg => typeof arg === 'object' ? safeStr(arg) : String(arg));
    const fullMessage = messageParts.join(' ');

    // 特殊处理开始/结束消息，以匹配用户提供的日志示例，不显示级别
    if (fullMessage.includes("======== 九号自动签到开始 ========") || fullMessage.includes("======== 九号自动签到结束 ========")) {
        console.log(`${ts} ${fullMessage}`);
    } else {
        // 对于其他消息，显示级别
        switch (level) {
            case "info": console.info(`${ts} ${level} ${fullMessage}`); break;
            case "warn": console.warn(`${ts} ${level} ${fullMessage}`); break;
            case "error": console.error(`${ts} ${level} ${fullMessage}`); break;
            case "debug": console.debug(`${ts} ${level} ${fullMessage}`); break;
            default: console.log(`${ts} ${level} ${fullMessage}`); // 默认级别
        }
    }
}

function safeStr(v: unknown): string {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

// ---------- 主流程 ----------
!(async () => {
    let notifyBody = "";
    log("info","======== 九号自动签到开始 ========"); // 此处调用会根据log函数内部逻辑不显示"info"

    try {
        // 签到
        log("info","开始签到请求");
        const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
        log("info","签到返回：", safeStr(sign));
        if(sign?.code===0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin||sign.data?.score||0} N币`;
        else if(sign?.code===540004) notifyBody += "⚠️ 今日已签到";
        else {
            notifyBody += `❌ 签到失败：${sign?.msg||safeStr(sign)}`;
            if(!cfg.notifyFail) notifyBody="";
        }

        // 状态
        const st = await httpGet({ url: END.status, headers });
        log("info","状态返回：", safeStr(st));
        if(st?.code===0){
            const data = st.data||{};
            notifyBody += `\n🗓 连续签到：${data.consecutiveDays||0} 天\n🎫 补签卡：${data.signCardsNum||0} 张`;
        }

        // 余额
        const bal = await httpGet({ url: END.balance, headers });
        log("info","余额返回：", safeStr(bal));
        if(bal?.code===0) notifyBody += `\n💰 N币余额：${bal.data?.balance||0}`;

        // 盲盒
        const box = await httpGet({ url: END.blindBoxList, headers });
        log("info","盲盒返回：", safeStr(box));
        const notOpened = box?.data?.notOpenedBoxes||[];
        if(notOpened.length>0){
            notifyBody += `\n\n📦 盲盒任务：`;
            notOpened.forEach((b: any)=>{
                const days=b.awardDays||"?";
                const left=b.leftDaysToOpen||"?";
                notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
            });
            if(cfg.autoOpenBox){
                const ready = notOpened.filter((b: any)=>b.leftDaysToOpen===0 && (b.rewardStatus===2));
                if(ready.length>0){
                    notifyBody += `\n\n🎉 自动开启盲盒：`;
                    for(const b of ready){
                        try{
                            const r = await httpPost({ url: END.blindBoxReceive, headers, body:"{}"});
                            log("info","盲盒领取返回：", safeStr(r));
                            if(r?.code===0) notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${r.data?.rewardValue||r.data?.score||"未知"}`;
                            else notifyBody += `\n❌ ${b.awardDays}天盲盒领取失败`;
                        }catch(e){ log("error","盲盒领取异常：", e); notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`; }
                    }
                }
            }
        }

        // 自动补签
        if(cfg.autoRepair){
            try{
                const cards = st.data?.signCardsNum||0;
                const days = st.data?.consecutiveDays||0;
                if(cards>0 && days===0){
                    log("info","触发自动补签");
                    const rep = await httpPost({url:END.repair, headers, body:"{}"});
                    log("info","补签返回：", safeStr(rep));
                    if(rep?.code===0) notifyBody += `\n🔧 自动补签成功`;
                    else notifyBody += `\n🔧 自动补签失败：${rep?.msg||"未知"}`;
                } else {
                    log("info", "未触发自动补签"); // 保持与用户提供的日志示例一致
                }
            }catch(e){ log("error","自动补签异常：", e); }
        }

        // 内测资格
        try{
            const beta = await httpGet({url:END.betaStatus, headers});
            log("info","内测状态：", safeStr(beta));
            if(beta?.data?.qualified) notifyBody += `\n🚀 已获得内测资格`;
            else{
                notifyBody += `\n⚠️ 未获得内测资格`;
                if(cfg.autoApplyBeta){
                    try{
                        const applyResp = await httpPost({url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({deviceId:cfg.DeviceId})});
                        log("info","内测申请返回：", safeStr(applyResp));
                        if(applyResp?.success) notifyBody += " → 自动申请成功 🎉";
                        else notifyBody += " → 自动申请失败 ❌";
                    }catch(e){ log("error","内测自动申请异常：", e); notifyBody += " → 自动申请异常 ❌"; }
                }
            }
        }catch(e){ log("error","内测检测异常：", e); }

        if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);
    }catch(e){
        log("error","主流程异常：", e);
        if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
    }

    log("info","======== 九号自动签到结束 ========"); // 此处调用会根据log函数内部逻辑不显示"info"
    $done();
})();