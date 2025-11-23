/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui
📆 版本日期: 2025-11-23 12:00:00
 功能：
  - 自动签到、补签、盲盒领取
  - 控制台日志 + 通知
  - BoxJS 配置读取
  - 时间戳 + 日志等级输出
  - 删除内测资格检测
*/

const isReq: boolean = typeof $request !== "undefined" && $request.url && $request.url.includes("user-sign/v2/status");
const read = (k: string): string | null => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v: string, k: string): boolean => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title: string, sub: string, body: string): void => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH: string = "ninebot.authorization";
const KEY_DEV: string = "ninebot.deviceId";
const KEY_UA: string = "ninebot.userAgent";
const KEY_DEBUG: string = "ninebot.debug";
const KEY_NOTIFY: string = "ninebot.notify";
const KEY_AUTOBOX: string = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR: string = "ninebot.autoRepair";
const KEY_NOTIFYFAIL: string = "ninebot.notifyFail";
const KEY_TITLE: string = "ninebot.titlePrefix";

// ---------- 抓包写入 ----------
if (isReq) {
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
      console.info(`[${new Date().toLocaleString()}] 抓包写入成功`, {auth, dev, ua});
    } else {
      console.info(`[${new Date().toLocaleString()}] 抓包未发生变化`);
    }
  } catch (e: unknown) {
    console.error(`[${new Date().toLocaleString()}] 抓包写入异常：`, e);
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
  notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
  console.warn(`[${new Date().toLocaleString()}] 终止：未读取到账号信息`);
  $done();
}

// ---------- HTTP helpers ----------
interface HttpResponse {
  code?: number;
  msg?: string;
  data?: any;
  raw?: string;
}

interface HttpRequestOptions {
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function httpPost({ url, headers, body = "{}" }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err: unknown, resp: unknown, data: string) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); }
        catch { resolve({ raw: data }); }
      }
    });
  });
}

function httpGet({ url, headers }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err: unknown, resp: unknown, data: string) => {
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

const END: Record<string, string> = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
};

// ---------- 辅助函数 ----------
function safeStr(v: unknown): string {
  try { return JSON.stringify(v); }
  catch { return String(v); }
}

function log(level: "info" | "warn" | "error", ...args: any[]): void {
  const time = new Date().toLocaleString();
  const processedArgs = args.map(arg => typeof arg === 'object' && arg !== null ? safeStr(arg) : arg);
  console[level](`[${time}] ${level}`, ...processedArgs);
}

function logStart(msg: string): void { console.log(`[${new Date().toLocaleString()}] ======== ${msg} ========`); }


// ---------- 主流程 ----------
!(async (): Promise<void> => {
  logStart("九号自动签到开始");
  let notifyBody: string = "";

  try {
    // 1) 签到
    log("info", "开始签到请求");
    const sign: HttpResponse = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("info", "签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 今日签到成功\n🎁 已得 N币: ${sign.data?.nCoin || sign.data?.score || 0}`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else {
      notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;
      if(!cfg.notifyFail) notifyBody = "";
    }

    // 2) 状态
    const st: HttpResponse = await httpGet({ url: END.status, headers });
    log("info", "状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      const days: number = data.consecutiveDays || data.continuousDays || 0;
      const cards: number = data.signCardsNum || data.remedyCard || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 3) 余额
    const bal: HttpResponse = await httpGet({ url: END.balance, headers });
    log("info", "余额返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    const box: HttpResponse = await httpGet({ url: END.blindBoxList, headers });
    log("info", "盲盒返回：", box);
    const notOpened: any[] = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach((b: any) => {
        const days: number | string = b.awardDays || b.boxDays || b.days || "?";
        const left: number | string = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if (cfg.autoOpenBox) {
        const ready: any[] = notOpened.filter((b: any) => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 今日盲盒奖励：`;
          for (const b of ready) {
            try {
              const r: HttpResponse = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
              log("info", "盲盒领取返回：", r);
              if (r && r.code === 0) notifyBody += `\n- ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
            } catch (e: unknown) { log("error", "盲盒领取异常：", e); }
          }
        }
      }
    }

    // 5) 自动补签
    if (cfg.autoRepair) {
      try {
        if (st && st.code === 0) {
          const cards: number = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days: number = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            log("info", "触发自动补签");
            const rep: HttpResponse = await httpPost({ url: END.repair, headers, body: "{}" });
            log("info", "补签返回：", rep);
            if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
            else notifyBody += `\n🔧 自动补签失败：${rep && rep.msg ? rep.msg : "未知"}`;
          }
        }
      } catch (e: unknown) { log("error", "自动补签异常：", e); }
    }

    // ✅ 最终通知
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

  } catch (e: unknown) {
    log("error", "主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  logStart("九号自动签到结束");
  $done();
})();