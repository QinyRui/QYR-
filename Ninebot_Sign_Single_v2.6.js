/*
  Ninebot_Sign_Single_v2.6.js
  说明：
    - 通知样式：标题带 🛵，内容美化（①/•/📦/🧪）【你选的：🛵 + 盲盒方式 B】
    - 抓包写入去重（只通知一次）
    - 自动签到、自动盲盒领取（经验 / N币）、自动补签（可选）、内测申请（可选）
    - 获取余额、连续签到、补签卡、近几条经验变动（credit list）
    - Loon UI 通过 $argument 传参（enable_debug、enable_notify、enable_openbox、enable_supplement、enable_internal_test、notify_title、cron_time、enable_capture）
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// persistent keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_LAST_WRITE = "ninebot_last_write_ts";

// read/write helpers
const read = k => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
  } catch (e) { console.log("[Ninebot] read err", e); }
  return null;
};
const write = (v, k) => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
  } catch (e) { console.log("[Ninebot] write err", e); }
};

// unified notify
const doNotify = (title, sub, body) => {
  try {
    if (typeof $notification !== "undefined") return $notification.post(title, sub, body);
  } catch (e) { /* ignore */ }
  try { console.log("[Notify]", title, sub, body); } catch (_) {}
};

// HTTP helpers
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
    });
  });
}
function httpPost(url, headers = {}, body = "{}") {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
    });
  });
}

// small helpers
const safeStr = v => { try { return JSON.stringify(v); } catch { return String(v); } };
const fmtDate = ts => {
  try {
    const d = new Date(Number(ts) * 1000);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch { return String(ts); }
};
function formatReward(data) {
  if (!data) return "";
  const v = data.rewardValue ?? data.reward_value ?? data.credit ?? 0;
  const t = data.rewardType ?? data.type ?? 0;
  if (Number(t) === 1) return `${v} 经验`;
  if (Number(t) === 2) return `${v} N币`;
  return `${v} 未知`;
}

// ---------- 抓包写入（去重，只通知一次） ----------
if (isReq) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"] || "";
    const dev = headers["DeviceId"] || headers["deviceid"] || headers["device_id"] || "";
    const ua = headers["User-Agent"] || headers["user-agent"] || "";

    if (auth && dev) {
      const lastWrite = Number(read(KEY_LAST_WRITE) || 0);
      const now = Date.now();
      const prevAuth = read(KEY_AUTH) || "";
      const prevDev = read(KEY_DEV) || "";
      const prevUa = read(KEY_UA) || "";

      if ((auth !== prevAuth || dev !== prevDev || ua !== prevUa) && (now - lastWrite > 60 * 1000)) {
        write(auth, KEY_AUTH);
        write(dev, KEY_DEV);
        write(ua, KEY_UA);
        write(String(now), KEY_LAST_WRITE);
        console.log("[Ninebot] ✅ 抓包写入成功");
        doNotify("九号智能电动车", "抓包写入成功", "Authorization / DeviceId / User-Agent 已写入（只通知一次）");
      } else {
        console.log("[Ninebot] 抓包写入：无变化或写入过于频繁，跳过通知");
      }
    } else {
      console.log("[Ninebot] 抓包请求，但未包含 Authorization/DeviceId，跳过写入");
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// ---------- 配置读取 ----------
const arg = (typeof $argument === "undefined") ? {} : $argument;
const cfg = {
  debug: (arg.enable_debug === "true") || (read("ninebot.debug") !== "false"),
  notify: (arg.enable_notify === "true") || (read("ninebot.notify") !== "false"),
  autoOpenBox: (arg.enable_openbox === "true") || (read("ninebot.autoOpenBox") === "true"),
  autoRepair: (arg.enable_supplement === "true") || (read("ninebot.autoRepair") === "true"),
  autoApplyBeta: (arg.enable_internal_test === "true") || (read("ninebot.autoApplyBeta") === "true"),
  titlePrefix: arg.notify_title || read("ninebot.titlePrefix") || "九号签到助手",
  cron_time: arg.cron_time || read("ninebot.cronTime") || "1 0 * * *"
};

function clog(...args) { if (cfg.debug) console.log("[Ninebot]", ...args); }

// ---------- 读取 Token/Header ----------
const AUTH = read(KEY_AUTH) || "";
const DEVICEID = read(KEY_DEV) || "";
const UA = read(KEY_UA) || "";

if (!AUTH || !DEVICEID) {
  console.log("[Ninebot] 未检测到 Authorization/DeviceId，请先开启抓包写入");
  if (cfg.notify) doNotify(cfg.titlePrefix, "未配置 Token", "请开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
  $done();
}

const baseHeaders = {
  "Authorization": AUTH,
  "Content-Type": "application/json",
  "device_id": DEVICEID,
  "User-Agent": UA || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};

// ---------- Endpoints ----------
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
  creditList: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst"
};

// ---------- API 简单封装 ----------
async function getStatus() { return await httpGet(END.status, baseHeaders).catch(e => ({ error: e })); }
async function doSign() { return await httpPost(END.sign, baseHeaders, JSON.stringify({ deviceId: DEVICEID })).catch(e => ({ error: e })); }
async function getBalance() { return await httpGet(END.balance, baseHeaders).catch(e => ({ error: e })); }
async function getBlindBox() { return await httpGet(END.blindBoxList, baseHeaders).catch(e => ({ error: e })); }
async function openBox(awardDays) {
  try {
    let res = await httpPost(END.blindBoxReceive, baseHeaders, JSON.stringify({ awardDays }));
    if (res && (res.code === 0 || res.key === "response.success")) return res;
    // fallback empty body
    res = await httpPost(END.blindBoxReceive, baseHeaders, "{}");
    return res;
  } catch (e) { return { error: e }; }
}
async function doRepair() { return await httpPost(END.repair, baseHeaders, "{}").catch(e => ({ error: e })); }
async function checkBeta() { return await httpGet(END.betaStatus, baseHeaders).catch(e => ({ error: e })); }
async function applyBeta() { return await httpPost(END.betaApply, baseHeaders, JSON.stringify({ deviceId: DEVICEID })).catch(e => ({ error: e })); }
async function getCreditList() {
  const body = JSON.stringify({ lang: "zh", language: "zh", limit: 10, type: 1, last_id: "" });
  return await httpPost(END.creditList, baseHeaders, body).catch(e => ({ error: e }));
}

// ---------- 主流程 ----------
!(async () => {
  clog("🟢 开始执行九号签到脚本...");

  let notifyLines = [];
  try {
    // 1) 状态
    const st = await getStatus();
    clog("📄 当前签到状态:", st);
    const consecutiveDays = st?.data?.consecutiveDays ?? st?.data?.continuousDays ?? 0;
    const signCards = st?.data?.signCardsNum ?? st?.data?.remedyCard ?? 0;

    // 2) 签到
    clog("📄 开始签到请求...");
    const sign = await doSign();
    clog("📄 签到返回:", sign);

    let signStatusText = "未知";
    if (sign?.code === 0) {
      const ncoin = sign.data?.nCoin ?? sign.data?.score ?? 0;
      signStatusText = `签到成功 (+${ncoin} N币)`;
    } else if (sign?.code === 540004 || (sign?.key && String(sign.key).includes("already"))) {
      signStatusText = "已签到，不能重复签到";
    } else if (sign?.msg) {
      signStatusText = sign.msg;
    } else if (sign?.error) {
      signStatusText = `异常：${safeStr(sign.error)}`;
    }

    clog("📄 签到结果:", signStatusText);

    // build notify - header
    notifyLines.push("① 九号签到结果：");
    notifyLines.push(`• 签到状态：${signStatusText}`);
    notifyLines.push(`• 连续签到：${consecutiveDays}天`);
    notifyLines.push(`• 补签卡：${signCards}张`);

    // 3) 余额
    const bal = await getBalance();
    clog("📄 余额返回:", bal);
    let balanceText = "未知";
    if (bal?.code === 0) balanceText = `${bal.data?.balance ?? 0}`;
    else if (bal?.data?.balance !== undefined) balanceText = `${bal.data.balance}`;
    notifyLines.push(`• N币余额：${balanceText}`);

    // 4) 盲盒任务
    const box = await getBlindBox();
    clog("📄 盲盒任务列表结果:", box);
    const notOpened = box?.data?.notOpenedBoxes || [];
    notifyLines.push("");
    notifyLines.push("📦 盲盒任务：");
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      for (const b of notOpened) {
        const days = b.awardDays ?? b.boxDays ?? b.days ?? "?";
        const left = b.leftDaysToOpen ?? b.diffDays ?? "?";
        notifyLines.push(`• ${days}天盲盒，还需 ${left}天`);

        // 自动开户盲盒
        if (cfg.autoOpenBox && Number(left) === 0) {
          clog(`🎯 尝试自动开启 ${days}天盲盒...`);
          const got = await openBox(days);
          clog(`🎯 ${days}天盲盒领取返回:`, got);
          if (got?.code === 0 || got?.key === "response.success") {
            const rewardText = formatReward(got.data);
            notifyLines.push(`  → 已领取：${rewardText}`);
            clog(`🎉 ${days}天盲盒获得：${rewardText}`);
          } else {
            const errMsg = got?.msg || got?.error || safeStr(got);
            notifyLines.push(`  → 领取失败：${errMsg}`);
            clog(`❌ ${days}天盲盒领取失败:`, errMsg);
          }
        }
      }
    } else {
      notifyLines.push("• 无");
    }

    // 5) 自动补签
    try {
      if (cfg.autoRepair) {
        if (Number(signCards) > 0 && Number(consecutiveDays) === 0) {
          clog("🔧 触发自动补签...");
          const rep = await doRepair();
          clog("🔧 补签返回：", rep);
          if (rep?.code === 0) notifyLines.push("• 自动补签：成功");
          else notifyLines.push(`• 自动补签：失败 (${rep?.msg || safeStr(rep)})`);
        } else {
          clog("🔧 自动补签条件不满足（补签卡/连续签到天数）");
        }
      }
    } catch (e) { clog("🔧 自动补签异常：", e); }

    // 6) 内测检测与自动申请
    try {
      if (cfg.autoApplyBeta) {
        clog("🔎 检查内测状态...");
        const beta = await checkBeta();
        clog("🔎 内测状态返回：", beta);
        notifyLines.push("");
        notifyLines.push("🧪 内测状态：");
        if (beta?.data?.qualified) {
          notifyLines.push("• 已获得内测资格");
        } else {
          notifyLines.push("• 未获得内测资格（尝试自动申请）");
          const apply = await applyBeta();
          clog("🔎 内测申请返回：", apply);
          if (apply?.success === true) notifyLines.push("  → 自动申请成功 🎉");
          else {
            const err = apply?.msg || safeStr(apply);
            notifyLines.push(`  → 自动申请失败：${err}`);
          }
        }
      }
    } catch (e) { clog("🔎 内测申请异常：", e); }

    // 7) 积分明细（显示最近几条经验变动）
    try {
      const credits = await getCreditList();
      clog("📑 积分明细返回：", credits);
      if (credits?.data?.list && Array.isArray(credits.data.list) && credits.data.list.length > 0) {
        notifyLines.push("");
        notifyLines.push("📑 最近经验变动：");
        const recent = credits.data.list.slice(0, 5);
        recent.forEach(c => {
          const when = c.create_date ? fmtDate(c.create_date) : "";
          notifyLines.push(`• ${c.change_msg || "变动"}：+${c.credit} (${when})`);
        });
      }
    } catch (e) { clog("📑 获取积分明细异常:", e); }

    // final
    clog("✅ 脚本执行完成.");
    if (cfg.notify) {
      const title = `🛵 ${cfg.titlePrefix} · 今日结果`;
      const content = notifyLines.join("\n");
      doNotify(title, "", content);
    }

  } catch (e) {
    clog("❗ 主流程异常：", e);
    if (cfg.notify) doNotify(`🛵 ${cfg.titlePrefix}`, "脚本异常", safeStr(e));
  }

  $done();
})();