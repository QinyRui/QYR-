/*
  Ninebot_Sign_Single_v2.6.js
  功能：
   - 抓包自动写入 Authorization / DeviceId / User-Agent（去重、只通知一次）
   - 自动签到 + 自动盲盒领取（经验/N币识别）
   - 自动补签（可选）
   - 自动申请内测（可选）
   - 查询余额 / 连续签到 / 补签卡
   - 查询最近积分变动（credit list）
   - 控制台日志美化 & 通知美化
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// persistent keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_LAST_WRITE = "ninebot_last_write_ts";

// read/write helpers (BoxJS / Loon persistentStore)
const read = (k) => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(k); // fallback
  } catch (e) { console.log("[Ninebot] read err", e); }
  return null;
};
const write = (v, k) => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
  } catch (e) { console.log("[Ninebot] write err", e); }
};

// unified notify for environments
const doNotify = (title, sub, body) => {
  if (typeof $notification !== "undefined") return $notification.post(title, sub, body);
  try { console.log("[Notify]", title, sub, body); } catch (_) {}
};

// HTTP helpers using $httpClient (Loon/Surge)
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

// format helpers
const safeStr = v => {
  try { return JSON.stringify(v); } catch { return String(v); }
};
const fmtDate = ts => {
  try {
    const d = new Date(Number(ts) * 1000);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
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

// --------------- 抓包写入（去重，只通知一次） ---------------
if (isReq) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"] || "";
    const dev = headers["DeviceId"] || headers["deviceid"] || headers["device_id"] || "";
    const ua = headers["User-Agent"] || headers["user-agent"] || "";

    // only write when we have at least auth + dev
    if (auth && dev) {
      const lastWrite = Number(read(KEY_LAST_WRITE) || 0);
      const now = Date.now();
      const prevAuth = read(KEY_AUTH) || "";
      const prevDev = read(KEY_DEV) || "";
      const prevUa = read(KEY_UA) || "";

      // write if changed or not written recently (1 minute threshold)
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
      console.log("[Ninebot] 抓包请求，但未包含 Authorization 或 DeviceId，跳过写入");
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常：", e);
  }
  $done({});
}

// --------------- 读取配置（支持 $argument 来自 Loon UI） ---------------
const arg = (typeof $argument === "undefined") ? {} : $argument;
const cfg = {
  debug: (arg.enable_debug === "true") || (read("ninebot.debug") !== "false"), // default true unless set false
  notify: (arg.enable_notify === "true") || (read("ninebot.notify") !== "false"),
  autoOpenBox: (arg.enable_openbox === "true") || (read("ninebot.autoOpenBox") === "true"),
  autoRepair: (arg.enable_supplement === "true") || (read("ninebot.autoRepair") === "true"),
  autoApplyBeta: (arg.enable_internal_test === "true") || (read("ninebot.autoApplyBeta") === "true"),
  titlePrefix: arg.notify_title || read("ninebot.titlePrefix") || "九号签到",
  cron_time: arg.cron_time || read("ninebot.cronTime") || "1 0 * * *"
};

function clog(...args) { if (cfg.debug) console.log("[Ninebot]", ...args); }

// --------------- 读取保存的 token/header ---------------
const AUTH = read(KEY_AUTH) || "";   // Authorization
const DEVICEID = read(KEY_DEV) || ""; // DeviceId
const UA = read(KEY_UA) || "";

if (!AUTH || !DEVICEID) {
  // no token --> notify and finish
  console.log("[Ninebot] 未检测到 Authorization/DeviceId，请先开启抓包写入");
  if (cfg.notify) doNotify(cfg.titlePrefix, "未配置 Token", "请开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
  $done();
}

// base headers for all requests
const baseHeaders = {
  "Authorization": AUTH,
  "Content-Type": "application/json",
  "device_id": DEVICEID,
  "User-Agent": UA || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};

// endpoints
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

// --------------- 核心调用封装 ---------------
async function getStatus() {
  return await httpGet(END.status, baseHeaders).catch(e => ({ error: e }));
}
async function doSign() {
  return await httpPost(END.sign, baseHeaders, JSON.stringify({ deviceId: DEVICEID })).catch(e => ({ error: e }));
}
async function getBalance() {
  return await httpGet(END.balance, baseHeaders).catch(e => ({ error: e }));
}
async function getBlindBox() {
  return await httpGet(END.blindBoxList, baseHeaders).catch(e => ({ error: e }));
}
async function openBox(awardDays) {
  // Some endpoints accept empty body; others might accept awardDays — we'll try awardDays first, fallback empty {}
  try {
    let res = await httpPost(END.blindBoxReceive, baseHeaders, JSON.stringify({ awardDays }));
    if (res && (res.code === 0 || res.key === "response.success")) return res;
    // fallback
    res = await httpPost(END.blindBoxReceive, baseHeaders, "{}");
    return res;
  } catch (e) { return { error: e }; }
}
async function doRepair() {
  return await httpPost(END.repair, baseHeaders, "{}").catch(e => ({ error: e }));
}
async function checkBeta() {
  return await httpGet(END.betaStatus, baseHeaders).catch(e => ({ error: e }));
}
async function applyBeta() {
  return await httpPost(END.betaApply, baseHeaders, JSON.stringify({ deviceId: DEVICEID })).catch(e => ({ error: e }));
}
async function getCreditList() {
  const body = JSON.stringify({ lang: "zh", language: "zh", limit: 10, type: 1, last_id: "" });
  return await httpPost(END.creditList, baseHeaders, body).catch(e => ({ error: e }));
}

// --------------- 主流程 ---------------
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
      // Some success responses include data.nCoin or data.score
      const ncoin = sign.data?.nCoin ?? sign.data?.score ?? 0;
      signStatusText = `签到成功 (+${ncoin} N币)`;
    } else if (sign?.code === 540004 || (sign?.key && sign.key.includes("already"))) {
      signStatusText = "已签到，不能重复签到";
    } else if (sign?.msg) {
      signStatusText = sign.msg;
    } else if (sign?.error) {
      signStatusText = `异常：${safeStr(sign.error)}`;
    }

    clog("📄 签到结果:", signStatusText);
    notifyLines.push("① 九号签到结果：");
    notifyLines.push(`• 签到状态：${signStatusText}`);

    // 3) 连续签到 / 补签卡
    notifyLines.push(`• 连续签到：${consecutiveDays} 天`);
    notifyLines.push(`• 补签卡：${signCards} 张`);

    // 4) 余额
    const bal = await getBalance();
    clog("📄 余额返回:", bal);
    let balanceText = "未知";
    if (bal?.code === 0) balanceText = `${bal.data?.balance ?? 0}`;
    else if (bal?.data?.balance !== undefined) balanceText = `${bal.data.balance}`;
    notifyLines.push(`• N币余额：${balanceText}`);

    // 5) 盲盒列表
    const box = await getBlindBox();
    clog("📄 盲盒任务列表结果:", box);
    const notOpened = box?.data?.notOpenedBoxes || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyLines.push("• 盲盒任务：");
      for (const b of notOpened) {
        const days = b.awardDays ?? b.boxDays ?? b.days ?? "?";
        const left = b.leftDaysToOpen ?? b.diffDays ?? "?";
        notifyLines.push(`   🔹 ${days}天盲盒，还需 ${left} 天`);

        // 自动开启盲盒（only when left === 0 and cfg.autoOpenBox true）
        if (cfg.autoOpenBox && Number(left) === 0) {
          clog(`🎯 尝试自动开启 ${days}天盲盒...`);
          const got = await openBox(days);
          clog(`🎯 ${days}天盲盒领取返回:`, got);
          if (got?.code === 0 || got?.key === "response.success") {
            const rewardText = formatReward(got.data);
            notifyLines.push(`   → 已领取：${rewardText}`);
            clog(`🎉 ${days}天盲盒获得：${rewardText}`);
          } else {
            const errMsg = got?.msg || got?.error || safeStr(got);
            notifyLines.push(`   → 领取失败：${errMsg}`);
            clog(`❌ ${days}天盲盒领取失败:`, errMsg);
          }
        }
      }
    } else {
      notifyLines.push("• 盲盒任务：无");
    }

    // 6) 自动补签（若设置且需要）
    try {
      if (cfg.autoRepair) {
        // only attempt if signCards > 0 and consecutiveDays === 0 (your previous criteria)
        if (Number(signCards) > 0 && Number(consecutiveDays) === 0) {
          clog("🔧 触发自动补签...");
          const rep = await doRepair();
          clog("🔧 补签返回：", rep);
          if (rep?.code === 0) notifyLines.push("• 自动补签：成功");
          else notifyLines.push(`• 自动补签：失败 (${rep?.msg || safeStr(rep)})`);
        } else {
          clog("🔧 自动补签条件不满足（补签卡/连续天数）");
        }
      }
    } catch (e) { clog("🔧 自动补签异常：", e); }

    // 7) 内测检测与自动申请
    try {
      if (cfg.autoApplyBeta) {
        clog("🔎 检查内测状态...");
        const beta = await checkBeta();
        clog("🔎 内测状态返回：", beta);
        if (beta?.data?.qualified) {
          notifyLines.push("• 内测状态：已获得内测资格");
        } else {
          notifyLines.push("• 内测状态：未获得内测资格（尝试自动申请）");
          const apply = await applyBeta();
          clog("🔎 内测申请返回：", apply);
          if (apply?.success === true) notifyLines.push("   → 自动申请成功 🎉");
          else notifyLines.push(`   → 自动申请失败：${apply?.msg || safeStr(apply)}`);
        }
      }
    } catch (e) { clog("🔎 内测申请异常：", e); }

    // 8) 获取积分/经验明细（credit list）并展示最近几条
    try {
      const credits = await getCreditList();
      clog("📑 积分明细返回：", credits);
      if (credits?.data?.list && Array.isArray(credits.data.list) && credits.data.list.length > 0) {
        const recent = credits.data.list.slice(0, 5);
        notifyLines.push("• 最近经验变动：");
        recent.forEach(c => {
          const when = c.create_date ? fmtDate(c.create_date) : "";
          notifyLines.push(`   - ${c.change_msg || "变动"}：+${c.credit} (${when})`);
        });
      }
    } catch (e) { clog("📑 获取积分明细异常:", e); }

    // final notification
    clog("✅ 脚本执行完成.");
    if (cfg.notify) {
      const title = cfg.titlePrefix || "九号签到";
      const content = notifyLines.join("\n");
      doNotify(title, "", content);
    }

  } catch (e) {
    clog("❗ 主流程异常：", e);
    if (cfg.notify) doNotify(cfg.titlePrefix, "脚本异常", safeStr(e));
  }

  $done();
})();