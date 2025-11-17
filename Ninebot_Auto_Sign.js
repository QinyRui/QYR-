/*
📱 九号智能电动车 · 全功能签到（单号版）
👤 作者：QinyRui
📆 版本：2.1（2025/11/17）
✈️ Telegram：https://t.me/JiuHaoAPP

说明：
- 自动抓包写入：ninebot.authorization / ninebot.deviceId / ninebot.userAgent
- 自动检测：运行前检查变量是否存在，若缺失会先尝试回退读取 JIUHAO_ACCOUNT（兼容旧抓包脚本）
- 内置在线更新检查：会去仓库 raw 拉取最新脚本头部版本号并提示更新
*/

const RAW_JS_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Auto_Sign.js";
const LOCAL_VERSION = "2.1";

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (t, s, b) => { if (typeof $notification !== "undefined") $notification.post(t, s, b); };
const log = (...args) => { try { console.log("[Ninebot]", ...args); } catch (e) {} };

// Keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const LEGACY_KEY = "JIUHAO_ACCOUNT"; // 兼容旧存储：JSON 包含 authorization/deviceId/userAgent
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_TITLE = "ninebot.titlePrefix";

// -------------------- 抓包写入 --------------------
if (isReq) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev) { write(dev, KEY_DEV); changed = true; }
    if (ua) { write(ua, KEY_UA); changed = true; }

    if (changed) notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
  } catch (e) {
    log("抓包写入异常：", e);
  }
  $done({});
}

// -------------------- 辅助函数 --------------------
function httpGetRaw(url) {
  return new Promise((res, rej) => {
    $httpClient.get(url, (err, resp, data) => {
      if (err) rej(err); else res({ resp, data });
    });
  });
}

function httpGetJson(url, headers = {}) {
  return new Promise((res, rej) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) rej(err);
      else {
        try { res(JSON.parse(data || "{}")); } catch (e) { res({ raw: data }); }
      }
    });
  });
}
function httpPostJson(url, headers = {}, body = "{}") {
  return new Promise((res, rej) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) rej(err);
      else {
        try { res(JSON.parse(data || "{}")); } catch (e) { res({ raw: data }); }
      }
    });
  });
}

// 比较版本 v1.2 vs v1.10 — 数字逐段比较
function isRemoteNewer(remote, local) {
  try {
    const a = (remote+"").replace(/^v/i,"").split(".").map(n=>parseInt(n)||0);
    const b = (local+"").replace(/^v/i,"").split(".").map(n=>parseInt(n)||0);
    const len = Math.max(a.length,b.length);
    for (let i=0;i<len;i++){
      const ai = a[i]||0, bi = b[i]||0;
      if (ai>bi) return true;
      if (ai<bi) return false;
    }
    return false;
  } catch(e){ return false; }
}

// -------------------- 变量检测（优先级：BoxJS keys > legacy JSON） --------------------
async function checkVars() {
  const result = { auth: null, dev: null, ua: null, ok: false, source: null };

  const auth = read(KEY_AUTH);
  const dev = read(KEY_DEV);
  const ua = read(KEY_UA);

  if (auth && dev) {
    result.auth = auth; result.dev = dev; result.ua = ua || "";
    result.ok = true; result.source = "boxjs";
    return result;
  }

  // 回退：尝试 legacy JSON 存储（适配旧版抓包脚本）
  try {
    const legacy = read(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed.authorization && parsed.deviceId) {
        // 将回退值写入新 key
        write(parsed.authorization, KEY_AUTH);
        write(parsed.deviceId, KEY_DEV);
        if (parsed.userAgent) write(parsed.userAgent, KEY_UA);
        result.auth = parsed.authorization; result.dev = parsed.deviceId; result.ua = parsed.userAgent || "";
        result.ok = true; result.source = "legacy";
        return result;
      }
    }
  } catch (e) {
    log("legacy parse error", e);
  }

  // 仍无数据
  result.ok = false;
  return result;
}

// -------------------- 在线更新检查 --------------------
async function checkUpdate() {
  try {
    const raw = await httpGetRaw(RAW_JS_URL);
    const data = raw.data || "";
    // 尝试匹配 版本注释： 版本：2.1 或 版本：v2.1 或 @version 2.1
    const m = data.match(/版本[:：]?\s*v?([\d.]+)/i) || data.match(/@version[:=]?\s*v?([\d.]+)/i);
    if (m && m[1]) {
      const remoteVer = m[1];
      if (isRemoteNewer(remoteVer, LOCAL_VERSION)) {
        notify("九号智能电动车", "检测到更新", `仓库脚本版本 ${remoteVer} 高于本地 ${LOCAL_VERSION}\n点击查看：${RAW_JS_URL}`);
      } else {
        log("已是最新版本", LOCAL_VERSION);
      }
    }
  } catch (e) {
    log("检查更新失败：", e);
  }
}

// -------------------- 主流程（含检测与更新） --------------------
!(async () => {
  // 先在线检测更新（异步，不阻塞主流程）
  checkUpdate().catch(e=>log("update check err",e));

  // 检查变量
  const vars = await checkVars();
  if (!vars.ok) {
    // 精简提示给用户如何抓包（尽量一行内说明）
    const guide = "缺少 Authorization/DeviceId。请在 Loon/Surge 已开启 MITM 后打开九号 App → 我的 → 触发任意页面（签到/个人信息/任务），等待抓包通知写入。";
    notify("九号智能电动车", "缺少授权信息", guide);
    log("变量缺失，停止执行：", vars);
    $done();
    return;
  }

  const headers = {
    "Authorization": vars.auth,
    "Content-Type": "application/json",
    "device_id": vars.dev,
    "User-Agent": vars.ua || (read(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"),
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  };

  // 读取运行配置
  const debug = read(KEY_DEBUG) === "true";
  const notifySwitch = read(KEY_NOTIFY) !== "false";
  const autoOpen = read(KEY_AUTOBOX) === "true";
  const autoRepair = read(KEY_AUTOREPAIR) === "true";
  const title = read(KEY_TITLE) || "九号智能电动车";

  if (debug) log("headers:", headers);

  // endpoints
  const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  // small wrappers
  const post = (url, body="{}") => httpPostJson(url, headers, body);
  const get = (url) => httpGetJson(url, headers);

  let bodyText = "";

  try {
    // 签到
    const signRes = await post(END.sign, "{}");
    if (debug) log("signRes:", signRes);
    if (signRes && signRes.code === 0) bodyText += `🎉 签到成功 +${signRes.data?.nCoin || signRes.data?.score || 0} N币`;
    else if (signRes && signRes.code === 540004) bodyText += `⚠️ 今日已签到`;
    else bodyText += `❌ 签到失败：${(signRes && (signRes.msg || JSON.stringify(signRes))) || "未知"}`;

    // 状态
    const st = await get(END.status);
    if (debug) log("status:", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      const days = data.consecutiveDays || data.continuousDays || 0;
      const cards = data.signCardsNum || data.remedyCard || 0;
      bodyText += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    } else {
      bodyText += `\n🗓 状态获取失败`;
    }

    // 余额
    const bal = await get(END.balance);
    if (debug) log("balance:", bal);
    if (bal && bal.code === 0) bodyText += `\n💰 N币余额：${bal.data?.balance || 0}`;
    else bodyText += `\n💰 N币获取失败`;

    // 盲盒
    const box = await get(END.blindBoxList);
    if (debug) log("blindBoxList:", box);
    const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      bodyText += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen || b.diffDays || "?";
        bodyText += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      // 自动开启与领取
      if (autoOpen) {
        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        if (ready.length > 0) {
          bodyText += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            try {
              const r = await post(END.blindBoxReceive, "{}");
              if (debug) log("blind receive:", r);
              if (r && r.code === 0) bodyText += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
              else bodyText += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
            } catch (e) {
              if (debug) log("blind err:", e);
              bodyText += `\n❌ ${b.awardDays}天盲盒领取异常`;
            }
          }
        }
      }
    } else {
      bodyText += `\n📦 无盲盒任务`;
    }

    // 自动补签（谨慎）
    if (autoRepair) {
      try {
        if (st && st.code === 0) {
          const cards = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            const rep = await post(END.repair, "{}");
            if (debug) log("repair:", rep);
            if (rep && rep.code === 0) bodyText += `\n🔧 自动补签成功`;
            else bodyText += `\n🔧 自动补签失败：${rep && rep.msg ? rep.msg : "未知"}`;
          }
        }
      } catch (e) {
        if (debug) log("repair err:", e);
      }
    }

    if (notifySwitch) notify(title, "签到结果", bodyText);

  } catch (e) {
    log("Main exception:", e);
    if (notifySwitch) notify(title, "脚本异常", String(e));
  }

  $done();
})();/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/16
📦 版本：v1.1
📱 适配：iOS 系统
✈️ 群 telegram = https://t.me/JiuHaoAPP
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null;
const persistentWrite = (v, k) => typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : null;
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

// ---------- BoxJS 配置读取 ----------
let config = {
  Authorization: persistentRead("ninebot.authorization"),
  DeviceId: persistentRead("ninebot.deviceId"),
  debug: persistentRead("ninebot.debug") === "true",
  notify: persistentRead("ninebot.notify") === "true",
  autoOpenBox: persistentRead("ninebot.autoOpenBox") === "true",
  titlePrefix: persistentRead("ninebot.titlePrefix") || "九号签到"
};

// ---------- 抓包捕获 Token ----------
if (isReq) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const devId = $request.headers["deviceId"] || $request.headers["device_id"];
  const ua = $request.headers["User-Agent"] || "";
  if (auth) persistentWrite(auth, "ninebot.authorization");
  if (devId) persistentWrite(devId, "ninebot.deviceId");
  if (ua) persistentWrite(ua, "ninebot.userAgent");
  noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
  $done({});
}

// ---------- HTTP 封装 ----------
function httpPost(req) {
  return new Promise((resolve, reject) => $httpClient.post(req, (err, resp, data) => err ? reject(err) : resolve(JSON.parse(data || "{}"))));
}
function httpGet(req) {
  return new Promise((resolve, reject) => $httpClient.get(req, (err, resp, data) => err ? reject(err) : resolve(JSON.parse(data || "{}"))));
}

// ---------- 主流程 ----------
!(async () => {
  if (!config.Authorization || !config.DeviceId) {
    if (config.notify) noti(config.titlePrefix, "未配置 Token", "请先抓包获取 Authorization 与 DeviceId");
    return $done();
  }

  const headers = {
    "Authorization": config.Authorization,
    "Content-Type": "application/json",
    "device_id": config.DeviceId,
    "User-Agent": persistentRead("ninebot.userAgent") || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"
  };

  let notifyBody = "";

  try {
    // ===== 签到 =====
    const signRes = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: JSON.stringify({ deviceId: config.DeviceId })
    });
    if (signRes.code === 0) notifyBody += `🎉 签到成功\n🎁 +${signRes.data.nCoin || 0} N币`;
    else if (signRes.code === 540004) notifyBody += "⚠️ 今日已签到";
    else notifyBody += `❌ 签到失败：${signRes.msg || JSON.stringify(signRes)}`;

    // ===== 状态 =====
    const statusRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    notifyBody += `\n🗓 连续签到：${statusRes.data?.consecutiveDays || 0} 天\n🎫 补签卡：${statusRes.data?.signCardsNum || 0} 张`;

    // ===== N币余额 =====
    const balRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    notifyBody += `\n💰 N币余额：${balRes.data?.balance || 0}`;

    // ===== 盲盒列表 =====
    const boxRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });
    const boxes = boxRes.data?.notOpenedBoxes || [];
    if (boxes.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      for (const b of boxes) {
        notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;
      }

      // ===== 自动开启盲盒 =====
      if (config.autoOpenBox) {
        const ready = boxes.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            const rewardRes = await httpPost({
              url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
              headers,
              body: "{}"
            });
            const rewardText = rewardRes.code === 0
              ? `${rewardRes.data?.rewardValue || rewardRes.data?.score || "未知奖励"}`
              : rewardRes.msg || "领取失败";
            notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${rewardText}`;
          }
        }
      }
    } else {
      notifyBody += "\n📦 无盲盒任务";
    }

    // ===== 发送通知 =====
    if (config.notify) noti(config.titlePrefix, "签到结果", notifyBody);

  } catch (err) {
    if (config.notify) noti(config.titlePrefix, "脚本异常", String(err));
  }

  $done();
})();