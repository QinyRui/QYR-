/*
📱 九号智能电动车 · 全功能签到（单号版 v2.6）
👤 作者：QinyRui
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 配置读取
  - 插件 Argument 优先于 BoxJS（修复）
  - 日志收集并在 debug 模式下以通知形式输出（解决 CRON 下 console 被吞的问题）
*/

const isReq = typeof $request !== "undefined" && $request.url && $request.url.includes("user-sign/v2/status");
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

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

// ---------- 收集日志（同时打印） ----------
let logLines = [];
function time() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}
function pushLog(level, ...args) {
  // 构造文本
  const text = args.map(a => {
    try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(' ');
  const line = `[${time()}] ${level} ${text}`;
  // 控制台打印（尽最大努力）
  try {
    if (level === "info") console.info(line);
    else if (level === "warn") console.warn(line);
    else if (level === "error") console.error(line);
    else console.log(line);
  } catch (e) {
    // 忽略控制台异常
  }
  // 收集到数组
  logLines.push(line);
}
function logStart(msg) {
  const line = `[${time()}] ======== ${msg} ========`;
  try { console.log(line); } catch (e) {}
  logLines.push(line);
}
function safeStr(v) { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

// ---------- 读取 plugin Argument（优先） & BoxJS（其次） ----------
const arg = (typeof $argument !== "undefined" && $argument) ? $argument : {};

// helper to normalize boolean-like strings
function toBool(v, def=false) {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return def;
}

/**
 * readSetting(argKey, boxKey, defaultVal)
 * Priority:
 *  1. plugin argument (if present in $argument)
 *  2. BoxJS persistent store (read(boxKey))
 *  3. defaultVal
 */
function readSetting(argKey, boxKey, defaultVal) {
  // 1) plugin argument
  if (arg && Object.prototype.hasOwnProperty.call(arg, argKey)) {
    // return raw value (but coerce booleans when defaultVal boolean)
    const a = arg[argKey];
    if (typeof defaultVal === "boolean") return toBool(a, defaultVal);
    return a !== undefined && a !== null ? a : defaultVal;
  }
  // 2) BoxJS
  try {
    const boxVal = read(boxKey);
    if (boxVal !== null && boxVal !== undefined && boxVal !== "") {
      if (typeof defaultVal === "boolean") return toBool(boxVal, defaultVal);
      return boxVal;
    }
  } catch (e) {
    // ignore
  }
  // 3) default
  return defaultVal;
}

// ---------- 抓包写入（只在指定接口触发） ----------
if (isReq) {
  try {
    logStart("进入抓包写入流程");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed) {
      pushLog("info", "抓包成功，Authorization / DeviceId / User-Agent 已写入 BoxJS");
      // 用 BoxJS 的通知设置决定是否通知（但 plugin argument 优先）
      const notifySetting = readSetting("notify", KEY_NOTIFY, true);
      if (notifySetting) notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
    } else {
      pushLog("info", "抓包字段未变化，无需写入");
    }
  } catch (e) {
    pushLog("error", "抓包写入异常：", safeStr(e));
  }
  // 抓包处理完毕立即结束（HTTP-REQUEST 脚本）
  // 在抓包路由中不触发签到主流程
  $done({});
}

// ---------- 通过 readSetting 读取所有 config（插件优先） ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: readSetting("debug", KEY_DEBUG, true), // plugin arg 'debug'
  notify: readSetting("notify", KEY_NOTIFY, true),
  autoOpenBox: readSetting("autoOpenBox", KEY_AUTOBOX, false),
  autoRepair: readSetting("autoRepair", KEY_AUTOREPAIR, true),
  autoApplyBeta: readSetting("autoApplyBeta", KEY_AUTOAPPLYBETA, false),
  notifyFail: readSetting("notifyFail", KEY_NOTIFYFAIL, true),
  titlePrefix: (function(){
    const v = readSetting("titlePrefix", KEY_TITLE, "九号签到");
    return (typeof v === "string") ? v : String(v);
  })()
};

// 如果缺少核心数据，直接退出（并记录日志）
if (!cfg.Authorization || !cfg.DeviceId) {
  pushLog("warn", "终止：未读取到账号信息（Authorization 或 DeviceId 为空）");
  if (cfg.notify) notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
  // 若 debug 模式，则把 logLines 以通知形式发出，便于诊断
  if (cfg.debug && cfg.notify) {
    const body = logLines.join("\n").slice(0, 4000);
    notify(cfg.titlePrefix + " · 日志", "未读取到账号信息", body);
  }
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) {
        reject(err);
      } else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) {
        reject(err);
      } else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- Endpoints & headers ----------
const headers = {
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
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 主流程 ----------
!(async () => {
  logStart("九号自动签到开始");
  let notifyBody = "";

  try {
    // 1) 签到
    pushLog("info", "开始签到请求");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
    pushLog("info", "签到返回：", safeStr(sign));
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else {
      notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;
      if (!cfg.notifyFail) notifyBody = "";
    }

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    pushLog("info", "状态返回：", safeStr(st));
    if (st && st.code === 0) {
      const data = st.data || {};
      const days = data.consecutiveDays || data.continuousDays || 0;
      const cards = data.signCardsNum || data.remedyCard || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    pushLog("info", "余额返回：", safeStr(bal));
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    const box = await httpGet({ url: END.blindBoxList, headers });
    pushLog("info", "盲盒返回：", safeStr(box));
    const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if (cfg.autoOpenBox) {
        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            try {
              const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
              pushLog("info", "盲盒领取返回：", safeStr(r));
              if (r && r.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
              else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
            } catch (e) { pushLog("error", "盲盒领取异常：", safeStr(e)); notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`; }
          }
        }
      }
    }

    // 5) 自动补签
    if (cfg.autoRepair) {
      try {
        if (st && st.code === 0) {
          const cards = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            pushLog("info", "触发自动补签");
            const rep = await httpPost({ url: END.repair, headers, body: "{}" });
            pushLog("info", "补签返回：", safeStr(rep));
            if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
            else notifyBody += `\n🔧 自动补签失败：${rep && rep.msg ? rep.msg : "未知"}`;
          }
        }
      } catch (e) { pushLog("error", "自动补签异常：", safeStr(e)); }
    }

    // 6) 内测资格检测 & 自动申请
    try {
      const beta = await httpGet({ url: END.betaStatus, headers });
      pushLog("info", "内测状态：", safeStr(beta));

      if (beta?.data?.qualified) {
        notifyBody += "\n🚀 已获得内测资格";
      } else {
        notifyBody += "\n⚠️ 未获得内测资格";
        if (cfg.autoApplyBeta) {
          try {
            const applyResp = await httpPost({
              url: END.betaApply,
              headers,
              body: JSON.stringify({ deviceId: cfg.DeviceId })
            });
            pushLog("info", "内测申请返回：", safeStr(applyResp));
            if (applyResp?.success) notifyBody += " → 自动申请成功 🎉";
            else notifyBody += " → 自动申请失败 ❌";
          } catch (e) { pushLog("error", "内测自动申请异常：", safeStr(e)); notifyBody += " → 自动申请异常 ❌"; }
        }
      }
    } catch (e) { pushLog("error", "内测检测异常：", safeStr(e)); }

    // ✅ 最终通知（签到结果）
    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);

  } catch (e) {
    pushLog("error", "主流程异常：", safeStr(e));
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", safeStr(e));
  }

  logStart("九号自动签到结束");

  // 如果 debug 开启并且允许通知，则把收集到的日志整体通过通知发出，方便 CRON 下查看
  try {
    if (cfg.debug && cfg.notify) {
      const MAX_LEN = 4000;
      const body = logLines.join("\n").slice(0, MAX_LEN);
      notify(cfg.titlePrefix + " · 日志", "执行详情", body);
    }
  } catch (e) {
    // ignore
  }

  $done();
})();