/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 C · 最终整合版）
 2025-11-30 10:49 更新版（积分/N币统计修复 + 通知显示）
 功能：抓包写入、自动签到、分享任务重放/领取、盲盒开箱、经验/N币查询、通知美化
 说明：优先读取 $argument.progressStyle -> 回退到 BoxJS ninebot.progressStyle
***********************************************/

/* ENV wrapper (keeps compatibility with Loon/QuanX/Surge) */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) {
  try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } 
  catch (e) { return null; }
}
function writePS(val, key) {
  try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } 
  catch (e) { return false; }
}
function notify(title, sub, body) { if (HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }

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
const KEY_PROGRESS = "ninebot.progressStyle";

/* Endpoints */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry network helper */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const once = () => {
      attempts++;
      const opts = { url, headers, timeout };
      if (method === "POST") opts.body = body === null ? "{}" : body;
      const cb = (err, resp, data) => {
        if (err) {
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) {
            console.warn(`[${nowStr()}] warn 请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(once, RETRY_DELAY);
            return;
          } else {
            reject(err);
            return;
          }
        }
        try { resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if (method === "GET") $httpClient.get(opts, cb);
      else $httpClient.post(opts, cb);
    };
    once();
  });
}
function httpGet(url, headers={}) { return requestWithRetry({method:"GET", url, headers}); }
function httpPost(url, headers={}, body="{}") { return requestWithRetry({method:"POST", url, headers, body}); }

/* Logging */
function logInfo(...args) { const dbg = readPS(KEY_DEBUG); if (dbg === "false") return; console.log(`[${nowStr()}] info ${args.map(a => typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* Progress bar styles (8) */
const PROGRESS_STYLES = [
  ["█","░"], ["▓","░"], ["▰","▱"], ["●","○"], ["■","□"], ["➤","·"], ["▮","▯"], ["⣿","⣀"]
];
function renderProgressBar(current, total, styleIndex=0, length=20){
  try {
    styleIndex = Number(styleIndex) || 0;
    if (styleIndex < 0 || styleIndex > PROGRESS_STYLES.length-1) styleIndex = 0;
    const [FULL, EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0 ? current/total : 0;
    const filled = Math.round(ratio * length);
    const empty = Math.max(0, length - filled);
    return FULL.repeat(filled) + EMPTY.repeat(empty);
  } catch (e) { return "██████████----------"; }
}

/* Capture handling */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
  try {
    logInfo("进入抓包写入流程（增强版）");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";
    const capUrl = $request.url || "";
    logInfo("抓包 URL：", capUrl);
    logInfo("抓包 Header（部分隐藏）", { Authorization: auth ? (auth.slice(0,6)+"..."+auth.slice(-4)) : "", DeviceId: dev ? (dev.slice(0,6)+"..."+dev.slice(-4)) : "", UA: ua ? "[present]" : "[missing]" });

    let changed = false;
    if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
    if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
    if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
    if (capUrl.includes("/service/2/app_log/")) {
      const base = capUrl.split("?")[0];
      if (readPS(KEY_SHARE) !== base) { writePS(base, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", base); }
    }
    if (changed) { notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS"); logInfo("抓包写入成功"); }
    else logInfo("抓包数据无变化");
  } catch (e) { logErr("抓包写入异常：", e); }
  $done({});
}

/* Read config */
const argProgressStyle = (IS_ARG && $argument && $argument.progressStyle !== undefined) ? Number($argument.progressStyle) : null;
const boxProgressStyle = Number(readPS(KEY_PROGRESS) || readPS("progressStyle") || 0);
const progressStyle = (argProgressStyle !== null) ? argProgressStyle : boxProgressStyle;

const cfg = {
  Authorization: readPS(KEY_AUTH) || "",
  DeviceId: readPS(KEY_DEV) || "",
  userAgent: readPS(KEY_UA) || "",
  shareTaskUrl: readPS(KEY_SHARE) || "",
  debug: readPS(KEY_DEBUG) !== "false",
  notify: readPS(KEY_NOTIFY) !== "false",
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  autoRepair: readPS(KEY_AUTOREPAIR) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: readPS(KEY_TITLE) || "九号签到",
  progressStyle: progressStyle
};

logInfo("九号自动签到开始");
logInfo("当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle });

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 APP 执行签到/分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

/* Helpers */
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromTs(ts){ 
  if(!ts) return null;
  ts = Number(ts);
  if(ts.toString().length > 10) ts = Math.floor(ts/1000);
  const d = new Date(ts*1000); 
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; 
}
function todayKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* Compose headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type": "application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  };
}

/* Main flow */
(async () => {
  try {
    const headers = makeHeaders();

    // 1) 查询签到状态
    logInfo("查询签到状态...");
    let statusResp = null;
    try { statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }
    catch(e){ logWarn("状态请求异常：", String(e)); }
    const statusData = statusResp?.data || {};
    const consecutiveDays = statusData?.consecutiveDays ?? statusData?.continuousDays ?? 0;
    const signCards = statusData?.signCardsNum ?? statusData?.remedyCard ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null;
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;
    logInfo("签到状态返回：", statusResp);

    // 2) 签到
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
    if (currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null) {
      logInfo("今日未签到，尝试执行签到...");
      try { 
        const signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId })); 
        logInfo("签到接口返回：", signResp);
        if(signResp.code===0 || signResp.code===1){
          const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin; todayGainExp += score;
          signMsg = `✨ 今日签到：成功\n🎁 签到奖励：+${score} 经验、+${nCoin} N 币`;
        } else if (signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `✨ 今日签到：已签到（接口）`;
        } else { signMsg = `❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
      } catch(e){ logWarn("签到请求异常：", String(e)); }
    } else {
      signMsg = `✨ 今日签到：已签到`;
      logInfo("检测到今日已签到，跳过签到接口");
    }

    // 3) 查询积分/ N币收入
    try {
      // 积分
      const creditResp = await httpPost(END.creditLst, headers, JSON.stringify({page:1,size:100}));
      const today = todayKey();
      const creditList = Array.isArray(creditResp?.data?.list) ? creditResp.data.list : [];
      for(const it of creditList){
        const t = Number(it?.create_date || 0);
        if(toDateKeyFromTs(t)===today){
          todayGainExp += Number(it.credit || 0);
        }
      }
      // N币
      const nCoinResp = await httpPost(END.nCoinRecord, headers, JSON.stringify({page:1,size:100}));
      const nCoinList = Array.isArray(nCoinResp?.data?.list) ? nCoinResp.data.list : [];
      for(const it of nCoinList){
        const t = Number(it?.create_time || it?.createDate || 0);
        if(toDateKeyFromTs(t)===today){
          todayGainNcoin += Number(it.amount || it.coin || 0);
        }
      }
      logInfo(`今日积分/ N币统计完成：`, todayGainExp, todayGainNcoin);
    } catch(e){ logWarn("积分/N币统计异常：", String(e)); }

    // 4) 查询经验信息
    let upgradeLine = "", creditData = {};
    try {
      const cr = await httpGet(END.creditInfo, headers);
      creditData = cr?.data || {};
      const credit = Number(creditData.credit ?? 0);
      const level = creditData.level ?? null;
      let need = 0;
      if (creditData.credit_upgrade) {
        const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
        if (m && m[1]) need = Number(m[1]);
      } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
        need = creditData.credit_range[1] - credit;
      }
      upgradeLine = `- 当前经验：${credit}${level?`（LV.${level}）`:''}\n- 距离升级：${need} 经验`;
      logInfo("经验信息：", creditData);
    } catch (e) { logWarn("经验信息查询异常：", String(e)); }

    // 5) 余额查询
    let balLine = "";
    try {
      const bal = await httpGet(END.balance, headers);
      if (bal?.code === 0) balLine = `- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
      logInfo("余额查询：", bal);
    } catch (e) { logWarn("余额查询异常：", String(e)); }

    // 6) 盲盒列表
    let blindInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if (Array.isArray(notOpened) && notOpened.length>0) {
        notOpened.forEach(b => {
          const target = Number(b.awardDays);
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindInfo.push({ target, left, opened });
        });
      }
      logInfo("盲盒列表：", blindInfo);
    } catch (e) { logWarn("盲盒查询异常：", String(e)); }

    // 7) 自动开启盲盒
    if (cfg.autoOpenBox && blindInfo.length>0) {
      for (const b of blindInfo) {
        try {
          if (Number(b.left) === 0 && Number(b.target) === 7) {
            logInfo("检测到7天盲盒可开，尝试开箱...");
            try {
              const openR = await httpPost(END_OPEN.openSeven, headers, JSON.stringify({}));
              logInfo("开箱返回：", openR);
              if (openR?.code === 0) notify(cfg.titlePrefix, "盲盒开启", "7天盲盒已自动开启并领取奖励");
            } catch (e) { logWarn("7天开箱异常：", String(e)); }
          }
        } catch (e) { logWarn("盲盒处理异常：", String(e)); }
      }
    }

    // 8) 通知
    if(cfg.notify){
      let barLines = blindInfo.map(b => {
        return `${b.target} 天盲盒：\n[${renderProgressBar(b.opened,b.target,cfg.progressStyle)}] ${b.opened} / ${b.target} 天`;
      }).join("\n| ");
      let notifyBody = `${signMsg}\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${barLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      notify(cfg.titlePrefix, "", notifyBody);
      logInfo("发送通知：", notifyBody);
    }

    logInfo("九号自动签到完成，通知已发送。");
  } catch (e) { logErr("自动签到主流程异常：", e); }
})();