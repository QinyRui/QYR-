/*
Ninebot_Sign_Single_v2.6.js
最终增强版
- 自动重试
- 签到前查询状态
- 今日积分/经验统计
- 今日 N币余额
- 自动完成每日分享任务
- 盲盒进度条（7天/666天，放通知最底部）
- 文件名保持：Ninebot_Sign_Single_v2.6.js
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500; 
const REQUEST_TIMEOUT = 12000; 

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
const KEY_TITLE = "ninebot.titlePrefix";

// Endpoints
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  credits: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/credit/list?appVersion=609103606",
  shareTask: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/list?appVersion=609103606"
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
    const cfg = {
      Authorization: read(KEY_AUTH) || "",
      DeviceId: read(KEY_DEV) || "",
      userAgent: read(KEY_UA) || "",
      debug: read(KEY_DEBUG) !== "false",
      notify: read(KEY_NOTIFY) !== "false",
      autoOpenBox: read(KEY_AUTOBOX) === "true",
      autoRepair: read(KEY_AUTOREPAIR) === "true",
      notifyFail: read(KEY_NOTIFYFAIL) !== "false",
      titlePrefix: read(KEY_TITLE) || "九号签到"
    };

    logStart("九号自动签到开始");
    log("info", "当前配置：", cfg);

    if (!cfg.Authorization || !cfg.DeviceId) {
      notify(cfg.titlePrefix, "未配置 Token", "请先抓包写入 Authorization / DeviceId / User-Agent");
      log("warn", "终止：未读取到账号信息");
      $done();
    }

    const headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1) 查询签到状态
    log("info", "查询签到状态...");
    let st = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    const consecutiveDays = st?.data?.consecutiveDays ?? 0;
    const signCards = st?.data?.signCardsNum ?? 0;

    // 2) 签到
    log("info", "发送签到请求...");
    let signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
    let todayGainNcoin = Number(signResp?.data?.nCoin ?? 0);
    let todayGainExp = Number(signResp?.data?.score ?? 0);
    let signMsg = (signResp.code === 0 || signResp.code === 1) ? `🎉 今日签到成功\n🎁 N币: ${todayGainNcoin}` : `⚠️ 今日已签到`;

    // 3) 自动完成每日分享任务
    let shareMsg = "";
    try {
      const tasks = await httpGet(END.shareTask, headers);
      const shareTask = tasks?.data?.find(t => t.title === "每日分享");
      if (shareTask && shareTask.rewardStatus !== 3) {
        const r = await httpPost(shareTask.url, headers, "{}");
        shareMsg = `📌 今日分享任务：\n- 已完成，获得 1 N币`;
        todayGainNcoin += 1;
      } else if (shareTask && shareTask.rewardStatus === 3) {
        shareMsg = `📌 今日分享任务：\n- 已完成，获得 1 N币`;
      }
    } catch(e){ log("warn","分享任务异常：",e); }

    // 4) 查询 N币余额
    let balMsg = "";
    try {
      const bal = await httpGet(END.balance, headers);
      balMsg = `💰 N币余额：${bal?.data?.balance ?? 0}`;
    } catch(e){ log("warn","余额查询异常：",e); }

    // 5) 查询盲盒列表
    let blindMsg = "";
    let blindProgressInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes || [];
      notOpened.forEach(b => {
        const target = Number(b.awardDays);
        const left = Number(b.leftDaysToOpen);
        const opened = target - left;
        blindProgressInfo.push({ target, left, opened });
      });
      if (notOpened.length) blindMsg = "📦 盲盒任务（进度条在下方）";
    } catch(e){ log("warn","盲盒查询异常：",e); }

    // 6) 构建通知
    let notifyBody = `${signMsg}\n🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;
    if (shareMsg) notifyBody += `\n${shareMsg}`;
    if (todayGainNcoin) notifyBody += `\n🎯 今日获得 N币（含分享）：${todayGainNcoin}`;
    if (todayGainExp) notifyBody += `\n🎯 今日获得经验/积分：${todayGainExp}`;
    if (balMsg) notifyBody += `\n${balMsg}`;
    if (blindMsg) notifyBody += `\n${blindMsg}`;
    if (blindProgressInfo.length) {
      blindProgressInfo.forEach(info => {
        const width = (info.target === 7 ? 5 : (info.target === 666 ? 12 : 12));
        const bar = progressBarSimple(info.opened, info.target, width);
        notifyBody += `\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });
    }

    // 7) 发送通知
    if (cfg.notify && notifyBody.trim()) {
      notify(cfg.titlePrefix, "签到结果", notifyBody);
      log("info", "通知发送成功");
    }

  } catch (e) {
    log("error", "主流程异常：", e);
    notify("九号签到", "脚本异常", String(e));
  } finally {
    logStart("九号自动签到结束");
    $done();
  }
})();