/*
Ninebot_Sign_Single_v2.6.js
最终版（增强 + 每日分享任务）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（签到+分享所得 N币）
- 7天 / 666天 盲盒进度条
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
- 删除内测逻辑
- 日志带时间戳与等级，开始/结束分隔
- 每日自动分享任务
- 文件名保持：Ninebot_Sign_Single_v2.6.js
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500; // ms
const REQUEST_TIMEOUT = 12000; // ms

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };
const nowStr = () => new Date().toLocaleString();

// BoxJS keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix"; // BoxJS 自定义通知名

// Endpoints
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  credits: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/credit/list?appVersion=609103606",
  creditInfo: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/credit/info?appVersion=609103606",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/list?appVersion=609103606",
  taskComplete: id => `https://cn-cbu-gateway.ninebot.com/portal/self-service/task/complete?taskId=${id}`
};

// ---------- 网络请求（带重试） ----------
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT }) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts++;
      const opt = { url, headers, timeout };
      if (method === "POST") opt.body = body === null ? "{}" : body;
      const cb = (err, resp, data) => {
        if (err) {
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) {
            console.warn(`[${nowStr()}] warn 请求失败：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(tryOnce, RETRY_DELAY);
            return;
          } else {
            reject(err);
            return;
          }
        }
        try {
          const parsed = JSON.parse(data || "{}");
          resolve(parsed);
        } catch (e) {
          resolve({ raw: data });
        }
      };
      if (method === "GET") $httpClient.get(opt, cb);
      else $httpClient.post(opt, cb);
    };
    tryOnce();
  });
}
function httpGet(url, headers) { return requestWithRetry({ method: "GET", url, headers }); }
function httpPost(url, headers, body = "{}") { return requestWithRetry({ method: "POST", url, headers, body }); }

// ---------- 日志 ----------
function log(level, ...args) {
  const t = nowStr();
  const text = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  if (level === "info") console.log(`[${t}] info ${text}`);
  else if (level === "warn") console.warn(`[${t}] warn ${text}`);
  else if (level === "error") console.error(`[${t}] error ${text}`);
  else console.log(`[${t}] ${text}`);
}
function logStart(msg) { console.log(`[${nowStr()}] ======== ${msg} ========`); }

// ---------- 抓包写入（仅匹配 status 链接） ----------
const captureOnlyStatus = isRequest && $request.url && $request.url.includes("/portal/api/user-sign/v2/status");
if (captureOnlyStatus) {
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
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info", "抓包写入成功", { auth: mask(auth), deviceId: mask(dev) });
    } else {
      log("info", "抓包数据无变化");
    }
  } catch (e) {
    log("error", "抓包异常：", e);
  }
  $done({});
}

// ---------- 读取配置（以 BoxJS 为主） ----------
const cfg = {
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

logStart("九号自动签到开始");
log("info", "当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, autoRepair: cfg.autoRepair, titlePrefix: cfg.titlePrefix });

// 基本检查
if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn", "终止：未读取到账号信息");
  $done();
}

// ---------- 工具函数 ----------
function mask(s) { if (!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) {
  const pct = total > 0 ? progress/total : 0;
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

// ---------- 主流程 ----------
(async () => {
  try {
    const headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1) 查询状态（签到前）
    log("info", "查询签到状态...");
    let st = null;
    try {
      st = await httpGet(`${END.status}?t=${Date.now()}`, headers);
      log("info", "状态返回：", st && (st.code!==undefined ? `code:${st.code}` : st));
    } catch (e) {
      log("warn", "状态请求异常：", String(e));
    }

    const consecutiveDays = st && st.code === 0 ? (st.data?.consecutiveDays ?? st.data?.continuousDays ?? 0) : null;
    const signCards = st && st.code === 0 ? (st.data?.signCardsNum ?? st.data?.remedyCard ?? 0) : null;

    // 2) 签到请求（POST）
    log("info", "发送签到请求...");
    let signResp = null;
    try {
      signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      log("info", "签到接口返回：", signResp && (signResp.code!==undefined ? `code:${signResp.code}` : signResp));
    } catch (e) {
      log("warn", "签到请求异常：", String(e));
    }

    // 解析签到结果
    let signMsg = "";
    let todayGainExp = 0; 
    let todayGainNcoin = 0;
    if (signResp) {
      if (signResp.code === 0 || signResp.code === 1) {
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin;
        todayGainExp += score;
        signMsg = `🎉 今日签到成功\n🎁 已得 N币: ${nCoin}${score ? ` / 积分: ${score}` : ""}`;
      } else if (signResp.code === 540004 || signResp.code === 10004 || (signResp.msg && /已签到/.test(signResp.msg))) {
        signMsg = `⚠️ 今日已签到`;
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        if (nCoin) todayGainNcoin += nCoin;
        if (score) todayGainExp += score;
        if (nCoin || score) signMsg += `\n🎁 本次已得 N币: ${nCoin}${score ? ` / 积分: ${score}` : ""}`;
      } else {
        signMsg = `❌ 签到失败：${signResp.msg ?? JSON.stringify(signResp)}`;
        if (!cfg.notifyFail) signMsg = "";
      }
    } else {
      signMsg = `❌ 签到请求异常（网络/超时）`;
      if (!cfg.notifyFail) signMsg = "";
    }

    // 3) 余额查询
    let balMsg = "";
    try {
      const bal = await httpGet(END.balance, headers);
      log("info", "余额返回：", bal && (bal.code!==undefined ? `code:${bal.code}` : bal));
      if (bal && bal.code === 0) balMsg = `💰 N币余额：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
    } catch (e) { log("warn", "余额查询异常：", String(e)); }

    // 4) 盲盒处理
    let blindMsg = "";
    let blindProgressInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      log("info", "盲盒列表返回：", box && (box.code!==undefined ? `code:${box.code}` : box));
      const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
      if (Array.isArray(notOpened) && notOpened.length > 0) {
        blindMsg += `\n📦 盲盒任务：`;
        notOpened.forEach(b => {
          const days = b.awardDays ?? b.boxDays ?? b.days ?? "?";
          const left = b.leftDaysToOpen ?? b.diffDays ?? "?";
          blindMsg += `\n- ${days}天盲盒，还需 ${left} 天`;
          const target = Number(days);
          const leftNum = Number(left);
          if (!isNaN(target) && !isNaN(leftNum)) {
            const opened = Math.max(0, target - leftNum);
            blindProgressInfo.push({ target, left: leftNum, opened });
          }
        });

        if (cfg.autoOpenBox) {
          const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
          if (ready.length > 0) {
            let todayBoxLines = [];
            for (const b of ready) {
              try {
                const r = await httpPost(END.blindBoxReceive, headers, "{}");
                log("info", "盲盒领取返回：", r && (r.code!==undefined ? `code:${r.code}` : r));
                if (r && r.code === 0) {
                  const rv = r.data?.rewardValue ?? r.data?.score ?? r.data?.nCoin ?? "未知";
                  todayBoxLines.push(`- ${b.awardDays}天盲盒获得：${rv}`);
                  if (r.data?.rewardType === 1) todayGainExp += Number(r.data.rewardValue || 0);
                  else if (!isNaN(Number(rv))) todayGainExp += Number(rv);
                } else {
                  todayBoxLines.push(`- ${b.awardDays}天盲盒领取失败`);
                }
              } catch (e) {
                log("error", "盲盒领取异常：", e);
                todayBoxLines.push(`- ${b.awardDays}天盲盒领取异常`);
              }
            }
            if (todayBoxLines.length) blindMsg += `\n\n🎉 今日盲盒奖励：\n${todayBoxLines.join("\n")}`;
          }
        }
      } else blindMsg += `\n📦 无未开启盲盒。`;
    } catch (e) { log("warn", "盲盒列表查询异常：", String(e)); }

    // ---------- 今日分享任务 ----------
    let shareTaskMsg = "";
    try {
      const tasks = await httpGet(END.taskList, headers);
      if (tasks && Array.isArray(tasks.data)) {
        const shareTasks = tasks.data.filter(t => t.taskCategory === 6 || (t.title || "").includes("分享"));
        for (const t of shareTasks) {
          if (t.rewardStatus !== 3) {
            try {
              const res = await httpPost(END.taskComplete(t.taskId), headers, "{}");
              log("info", "分享任务返回：", res);
              const gain = res.data?.rewardQuantity || t.rewardQuantity || 0;
              shareTaskMsg += `\n📌 今日分享任务：已完成，获得 ${gain} N币`;
              todayGainNcoin += Number(gain || 0);
            } catch (e) {
              log("warn", "分享任务执行异常：", e);
              shareTaskMsg += `\n📌 今日分享任务：执行失败`;
            }
          } else {
            shareTaskMsg += `\n📌 今日分享任务：已完成，获得 ${t.rewardQuantity} N币`;
          }
        }
      }
    } catch (e) { log("warn", "获取每日分享任务异常：", e); }

    // ---------- 积分流水 ----------
    let creditLine = "";
    try {
      const credits = await httpGet(END.credits, headers);
      if (credits && Array.isArray(credits.data?.list)) {
        const today = todayKey();
        const todayList = credits.data.list.filter(item => {
          const ts = Number(item.create_date || item.createDate || 0);
          return ts > 0 && toDateKeyFromSec(ts) === today;
        });
        let sumToday = 0;
        todayList.forEach(it => { sumToday += Number(it.credit || 0); });
        creditLine = `\n🏅 今日积分变动：+${sumToday}`;
      }
    } catch (e) { log("warn", "积分流水查询异常：", String(e)); }

    // ---------- 经验升级信息 ----------
    let upgradeLine = "";
    try {
      const info = await httpGet(END.creditInfo, headers);
      if (info && (info.code === 1 || info.code === 0)) {
        const lv = info.data?.level ?? 0;
        const exp = info.data?.experience ?? 0;
        upgradeLine = `\n⚡ 当前等级：${lv} / 经验：${exp}`;
      }
    } catch (e) { log("warn", "经验信息异常：", String(e)); }

    // ---------- 拼接通知 ----------
    let notifyBody = `${signMsg}\n${balMsg}\n${blindMsg}${shareTaskMsg}${creditLine}${upgradeLine}`;
    if (blindProgressInfo.length) {
      notifyBody += `\n\n🔋 盲盒进度：`;
      blindProgressInfo.forEach(b => {
        notifyBody += `\n- ${b.target}天盲盒进度：${progressBarSimple(b.opened, b.target, 8)} (${b.opened}/${b.target}) 还需 ${b.left} 天`;
      });
    }

    log("info", "最终通知内容：\n", notifyBody);
    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);

    logStart("九号自动签到结束");
  } catch (e) {
    log("error", "主流程异常：", e);
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
  }
})();