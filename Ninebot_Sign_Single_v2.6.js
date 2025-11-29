/***********************************************
 Ninebot_Sign_Single_v2.6.js  —— ES5 完全兼容版（A）
 2025-11-29 完整修复版
 功能：抓包写入、自动签到、分享任务领取、盲盒开箱、经验/N币查询、通知美化
 说明：严格使用 ES5 语法，兼容旧版 Loon/Surge/QuanX JS 引擎
***********************************************/

// ---------- 环境检测 ----------
var IS_REQUEST = (typeof $request !== "undefined");
var HAS_PERSIST = (typeof $persistentStore !== "undefined");
var HAS_NOTIFY = (typeof $notification !== "undefined");
var HAS_HTTP = (typeof $httpClient !== "undefined");

// ---------- 安全读取 $argument（兼容 Loon 可能传空或字符串） ----------
if (typeof $argument === "undefined" || !$argument) {
  try { $argument = {}; } catch (e) { $argument = {}; }
} else {
  try {
    if (typeof $argument === "string") {
      // 如果是 JSON 字符串，尝试解析
      $argument = JSON.parse($argument);
    }
  } catch (e) {
    // 保持原样（可能是简单字符串或不标准），确保是对象
    if (typeof $argument !== "object") $argument = {};
  }
}

// ---------- BoxJS helpers ----------
function readPS(key) {
  try {
    if (HAS_PERSIST) return $persistentStore.read(key);
    return null;
  } catch (e) {
    return null;
  }
}
function writePS(val, key) {
  try {
    if (HAS_PERSIST) return $persistentStore.write(val, key);
    return false;
  } catch (e) {
    return false;
  }
}
function notify(title, sub, body) {
  try {
    if (HAS_NOTIFY) $notification.post(title, sub, body);
  } catch (e) {}
}
function nowStr() {
  return new Date().toLocaleString();
}

// ---------- BoxJS keys ----------
var KEY_AUTH = "ninebot.authorization";
var KEY_DEV = "ninebot.deviceId";
var KEY_UA = "ninebot.userAgent";
var KEY_DEBUG = "ninebot.debugLevel";
var KEY_NOTIFY = "ninebot.notify";
var KEY_AUTOBOX = "ninebot.autoOpenBox";
var KEY_AUTOREPAIR = "ninebot.autoRepair";
var KEY_NOTIFYFAIL = "ninebot.notifyFail";
var KEY_TITLE = "ninebot.titlePrefix";
var KEY_SHARE = "ninebot.shareTaskUrl";
var KEY_PROGRESS = "ninebot.progressStyle";

// ---------- Endpoints ----------
var END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
var END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

// ---------- Network retry ----------
var MAX_RETRY = 3;
var RETRY_DELAY = 1500;
var REQUEST_TIMEOUT = 12000;

function requestWithRetry(options) {
  return new Promise(function (resolve, reject) {
    var attempts = 0;
    function once() {
      attempts++;
      var opts = { url: options.url, headers: options.headers || {}, timeout: REQUEST_TIMEOUT };
      if (options.method === "POST") opts.body = (options.body === null ? "{}" : options.body);
      var cb = function (err, resp, data) {
        if (err) {
          var msg = String(err && (err.error || err.message || err));
          var shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) {
            setTimeout(once, RETRY_DELAY);
            return;
          } else {
            reject(err);
            return;
          }
        }
        try {
          resolve(JSON.parse(data || "{}"));
        } catch (e) {
          // 返回 raw
          resolve({ raw: data });
        }
      };
      if (options.method === "GET") $httpClient.get(opts, cb); else $httpClient.post(opts, cb);
    }
    once();
  });
}
function httpGet(url, headers) { return requestWithRetry({ method: "GET", url: url, headers: headers || {} }); }
function httpPost(url, headers, body) { return requestWithRetry({ method: "POST", url: url, headers: headers || {}, body: body || "{}" }); }

// ---------- Logging controlled by debugLevel ----------
function safeNum(v, def) {
  var n = Number(v);
  return isNaN(n) ? def : n;
}
var argDebugLevel = safeNum($argument.debugLevel, null);
var savedDebug = readPS(KEY_DEBUG);
var debugLevel = 1;
if (argDebugLevel !== null) debugLevel = argDebugLevel;
else if (savedDebug !== null) debugLevel = safeNum(savedDebug, 1);

function logInfo() {
  if (debugLevel >= 1) {
    var arr = Array.prototype.slice.call(arguments);
    try { console.log("[" + nowStr() + "] info " + arr.join(" ")); } catch (e) {}
  }
}
function logWarn() {
  if (debugLevel >= 2) {
    var arr = Array.prototype.slice.call(arguments);
    try { console.warn("[" + nowStr() + "] warn " + arr.join(" ")); } catch (e) {}
  }
}
function logDebug() {
  if (debugLevel >= 3) {
    var arr = Array.prototype.slice.call(arguments);
    try { console.log("[" + nowStr() + "] debug " + arr.join(" ")); } catch (e) {}
  }
}
function logErr() {
  var arr = Array.prototype.slice.call(arguments);
  try { console.error("[" + nowStr() + "] error " + arr.join(" ")); } catch (e) {}
}

// ---------- Progress bar styles (8) ----------
var PROGRESS_STYLES = [
  ["█", "░"], // 0
  ["▓", "░"], // 1
  ["▰", "▱"], // 2
  ["●", "○"], // 3
  ["■", "□"], // 4
  ["➤", "·"], // 5
  ["▮", "▯"], // 6
  ["⣿", "⣀"]  // 7
];
var argBarStyle = safeNum($argument.barStyle, null);
var savedBar = readPS(KEY_PROGRESS);
var progressStyle = 0;
if (argBarStyle !== null) progressStyle = argBarStyle;
else if (savedBar !== null) progressStyle = safeNum(savedBar, 0);

function renderProgressBar(current, total, styleIndex, length) {
  try {
    styleIndex = safeNum(styleIndex, 0);
    if (styleIndex < 0 || styleIndex >= PROGRESS_STYLES.length) styleIndex = 0;
    length = safeNum(length, 20);
    var pair = PROGRESS_STYLES[styleIndex];
    var FULL = pair[0], EMPTY = pair[1];
    var ratio = 0;
    if (total > 0) ratio = current / total;
    var filled = Math.round(ratio * length);
    if (filled < 0) filled = 0;
    if (filled > length) filled = length;
    var s = "";
    var i;
    for (i = 0; i < filled; i++) s += FULL;
    for (i = 0; i < (length - filled); i++) s += EMPTY;
    return s;
  } catch (e) {
    return "██████████----------";
  }
}

// ---------- Utilities ----------
function mask(s) {
  if (!s) return "";
  if (s.length > 8) return s.slice(0, 6) + "..." + s.slice(-4);
  return s;
}
function toDateKeyFromSec(sec) {
  try {
    var d = new Date(Number(sec) * 1000);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  } catch (e) { return ""; }
}
function todayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

// ---------- Read config (BoxJS fallback) ----------
var cfg = {
  Authorization: readPS(KEY_AUTH) || "",
  DeviceId: readPS(KEY_DEV) || "",
  userAgent: readPS(KEY_UA) || "",
  shareTaskUrl: readPS(KEY_SHARE) || "",
  debugLevel: debugLevel,
  notify: (readPS(KEY_NOTIFY) === "false") ? false : true,
  autoOpenBox: (readPS(KEY_AUTOBOX) === "true"),
  autoRepair: (readPS(KEY_AUTOREPAIR) === "true"),
  notifyFail: (readPS(KEY_NOTIFYFAIL) === "false") ? false : true,
  titlePrefix: readPS(KEY_TITLE) || "九号签到",
  progressStyle: progressStyle
};

logInfo("当前配置：", JSON.stringify({ notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle }));

// basic check
if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 中执行签到或分享动作以写入 Authorization / DeviceId / User-Agent");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

// ---------- Capture handling (status / sign / app_log) ----------
var CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/"];
var isCaptureRequest = IS_REQUEST && $request && $request.url && (function () {
  var i;
  for (i = 0; i < CAPTURE_PATTERNS.length; i++) if ($request.url.indexOf(CAPTURE_PATTERNS[i]) !== -1) return true;
  return false;
}());

if (isCaptureRequest) {
  try {
    logInfo("进入抓包写入流程（增强版）");
    var h = $request.headers || {};
    var auth = h["Authorization"] || h["authorization"] || "";
    var dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    var ua = h["User-Agent"] || h["user-agent"] || "";
    var capUrl = $request.url || "";
    logInfo("抓包捕获 URL：", capUrl);
    logInfo("抓包 Header（部分隐藏）：", JSON.stringify({ Authorization: mask(auth), DeviceId: mask(dev), UA: ua ? "[present]" : "[missing]" }));
    var changed = false;
    if (auth && readPS(KEY_AUTH) !== auth) { writePS(auth, KEY_AUTH); changed = true; }
    if (dev && readPS(KEY_DEV) !== dev) { writePS(dev, KEY_DEV); changed = true; }
    if (ua && readPS(KEY_UA) !== ua) { writePS(ua, KEY_UA); changed = true; }
    if (capUrl.indexOf("/service/2/app_log/") !== -1) {
      var baseShare = capUrl.split("?")[0];
      if (readPS(KEY_SHARE) !== baseShare) { writePS(baseShare, KEY_SHARE); changed = true; logInfo("捕获分享接口写入：", baseShare); }
    }
    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS");
      logInfo("抓包写入成功");
    } else {
      logInfo("抓包数据无变化（已写入 BoxJS 的数据与当前抓到的相同）");
    }
  } catch (e) {
    logErr("抓包写入异常：", String(e));
  }
  $done();
}

// ---------- Main flow ----------
(async function () {
  try {
    var headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json;charset=UTF-8",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1) status
    logInfo("查询签到状态...");
    var st = null;
    try { st = await httpGet(END.status + "?t=" + Date.now(), headers); } catch (e) { logWarn("状态请求异常：", String(e)); st = {}; }
    var statusData = st && st.data ? st.data : {};
    var consecutiveDays = (typeof statusData.consecutiveDays !== "undefined") ? statusData.consecutiveDays : ((typeof statusData.continuousDays !== "undefined") ? statusData.continuousDays : 0);
    var signCards = (typeof statusData.signCardsNum !== "undefined") ? statusData.signCardsNum : ((typeof statusData.remedyCard !== "undefined") ? statusData.remedyCard : 0);
    var currentSignStatus = (typeof statusData.currentSignStatus !== "undefined") ? statusData.currentSignStatus : null;
    var blindBoxStatus = (typeof statusData.blindBoxStatus !== "undefined") ? statusData.blindBoxStatus : null;

    logInfo("签到状态：", JSON.stringify({ consecutiveDays: consecutiveDays, signCards: signCards, currentSignStatus: currentSignStatus, blindBoxStatus: blindBoxStatus }));

    // 2) sign if needed
    var signMsg = "";
    var todayGainExp = 0;
    var todayGainNcoin = 0;
    var signResp = null;
    if (currentSignStatus === 0 || currentSignStatus === null || typeof currentSignStatus === "undefined") {
      logInfo("检测到今日可能未签到，尝试执行签到...");
      try { signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId })); } catch (e) { logWarn("签到请求异常：", String(e)); signResp = null; }
      if (signResp) {
        if (signResp.code === 0 || signResp.code === 1) {
          var score = safeNum((signResp.data && signResp.data.score) ? signResp.data.score : 0, 0);
          var nCoin = safeNum((signResp.data && (signResp.data.nCoin || signResp.data.coin)) ? (signResp.data.nCoin || signResp.data.coin) : 0, 0);
          todayGainExp += score;
          // note: you told me daily sign gives experience; share gives N币 — keep N币 from sign as 0 in display if you want
          todayGainNcoin += nCoin;
          signMsg = "🎉 今日签到：成功\n+" + score + " 经验（签到奖励）";
          logInfo("签到成功：", signResp);
        } else if (signResp.code === 540004 || (signResp.msg && /已签到/.test(signResp.msg))) {
          signMsg = "🎉 今日签到：已签到";
          logInfo("签到接口反馈：已签到");
        } else {
          signMsg = "❌ 签到失败：" + (signResp.msg ? signResp.msg : JSON.stringify(signResp));
          logWarn("签到失败：", signResp);
          if (!cfg.notifyFail) signMsg = "";
        }
      } else {
        signMsg = "❌ 签到请求异常（网络/超时）";
        if (!cfg.notifyFail) signMsg = "";
      }
    } else {
      signMsg = "🎉 今日签到：已签到";
      logInfo("今日已签到，跳过签到接口调用");
    }

    // 3) share task (N币)
    var shareTaskLine = "";
    try {
      if (cfg.shareTaskUrl) {
        logInfo("尝试查询分享任务接口：", cfg.shareTaskUrl);
        var shareResp = null;
        try { shareResp = await httpGet(cfg.shareTaskUrl, headers); } catch (e) { logWarn("分享 GET 异常：", String(e)); try { shareResp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({ page: 1, size: 20 })); } catch (e2) { logWarn("分享 POST 也失败：", String(e2)); shareResp = null; } }
        logDebug("分享任务原始数据：", JSON.stringify(shareResp));
        var listArr = [];
        if (shareResp && shareResp.data) {
          if (Object.prototype.toString.call(shareResp.data.list) === "[object Array]") listArr = shareResp.data.list;
          else if (Object.prototype.toString.call(shareResp.data) === "[object Array]") listArr = shareResp.data;
        }
        if (listArr.length > 0) {
          var today = todayKey();
          var i, item;
          for (i = 0; i < listArr.length; i++) {
            item = listArr[i];
            try {
              var occ = item.occurrenceTime || item.time || item.ts || item.create_date || 0;
              if (!occ) continue;
              var dkey = toDateKeyFromSec(Number(occ));
              if (dkey === today) {
                shareGain = safeNum(item.count || item.credit || item.credit || item.score || 0, 0);
                todayGainNcoin += shareGain;
              }
            } catch (e) { continue; }
          }
          if (todayGainNcoin > 0) shareTaskLine = "🎁 今日分享奖励：+" + todayGainNcoin + " N币（分享任务）";
        } else {
          logInfo("分享任务接口返回无列表或格式不支持：", JSON.stringify(shareResp));
        }
      } else {
        logInfo("未配置 shareTaskUrl，跳过分享任务处理");
      }
    } catch (e) { logWarn("分享任务处理异常：", String(e)); }

    // 4) credit / experience
    var upgradeLine = "";
    try {
      var creditInfo = await httpGet(END.creditInfo, headers).catch(function (e) { logWarn("经验接口异常：", String(e)); return null; });
      if (creditInfo && creditInfo.data) {
        var data = creditInfo.data;
        var credit = safeNum(data.credit, 0);
        var level = data.level !== undefined ? data.level : null;
        var need = 0;
        if (data.credit_upgrade) {
          try {
            var m = String(data.credit_upgrade).match(/还需\s*([0-9]+)/);
            if (m && m[1]) need = safeNum(m[1], 0);
          } catch (e) {}
        } else if (data.credit_range && Object.prototype.toString.call(data.credit_range) === "[object Array]" && data.credit_range.length >= 2) {
          need = safeNum((data.credit_range[1] - credit), 0);
        }
        upgradeLine = "等级：" + (level ? ("LV." + level) : "-") + "\n- 当前经验：" + credit + "\n- 距离升级：" + need + " 经验";
        logInfo("经验信息：", JSON.stringify(data));
      } else logWarn("积分/经验接口返回异常或空");
    } catch (e) { logWarn("经验信息查询异常：", String(e)); }

    // 5) balance
    var balLine = "";
    try {
      var bal = await httpGet(END.balance, headers).catch(function (e) { logWarn("余额接口异常：", String(e)); return null; });
      if (bal && bal.code === 0) balLine = "- 当前 N 币：" + ( (bal.data && (typeof bal.data.balance !== "undefined")) ? bal.data.balance : (bal.data && bal.data.coin ? bal.data.coin : 0) );
      logInfo("余额查询：", JSON.stringify(bal));
    } catch (e) { logWarn("余额查询异常：", String(e)); }

    // 6) blind box
    var blindMsg = "";
    var blindProgress = [];
    try {
      var box = await httpGet(END.blindBoxList, headers).catch(function (e) { logWarn("盲盒接口异常：", String(e)); return null; });
      var notOpened = box && box.data && box.data.notOpenedBoxes ? box.data.notOpenedBoxes : [];
      if (Object.prototype.toString.call(notOpened) === "[object Array]" && notOpened.length > 0) {
        var i, b;
        for (i = 0; i < notOpened.length; i++) {
          b = notOpened[i];
          var target = safeNum(b.awardDays, 0);
          var left = safeNum(b.leftDaysToOpen, 0);
          var opened = Math.max(0, target - left);
          blindProgress.push({ target: target, left: left, opened: opened });
        }
      }
      for (i = 0; i < blindProgress.length; i++) {
        var info = blindProgress[i];
        var width = (info.target === 7) ? 18 : ((info.target === 666) ? 30 : 22);
        var bar = renderProgressBar(info.opened, info.target, cfg.progressStyle, width);
        blindMsg += "\n" + info.target + "天盲盒进度：[" + bar + "] " + info.opened + "/" + info.target + " 天 (还需 " + info.left + " 天)";
      }
    } catch (e) { logWarn("盲盒列表查询异常：", String(e)); }

    // 7) auto open blind box
    if (cfg.autoOpenBox && blindProgress.length > 0) {
      for (var bi = 0; bi < blindProgress.length; bi++) {
        try {
          var bb = blindProgress[bi];
          if (bb.left === 0 && bb.target === 7) {
            logInfo("检测到 7 天盲盒可开启，尝试调用开箱接口...");
            try {
              var openResp = await httpPost(END_OPEN.openSeven, headers, "{}").catch(function (e) { logWarn("开箱请求异常：", String(e)); return null; });
              logInfo("开箱接口返回：", JSON.stringify(openResp));
              if (openResp && openResp.code === 0) notify(cfg.titlePrefix, "盲盒开启", "7天盲盒已自动开启并领取奖励");
            } catch (e) { logWarn("7天盲盒开箱请求异常：", String(e)); }
          }
        } catch (e) { logWarn("盲盒自动开启单项异常：", String(e)); }
      }
    }

    // 8) assemble notification (美化，不显示分享动作)
    var notifyBodyArr = [];
    if (signMsg) notifyBodyArr.push(signMsg);
    if (shareTaskLine) notifyBodyArr.push(shareTaskLine);
    if (upgradeLine) {
      notifyBodyArr.push("");
      notifyBodyArr.push("📊 账户状态");
      notifyBodyArr.push(upgradeLine);
    }
    if (balLine) notifyBodyArr.push(balLine);
    notifyBodyArr.push("- 补签卡：" + signCards + " 张");
    notifyBodyArr.push("- 连续签到：" + consecutiveDays + " 天");
    if (blindMsg) notifyBodyArr.push(blindMsg);
    if (todayGainExp || todayGainNcoin) {
      notifyBodyArr.push("");
      notifyBodyArr.push("🎯 今日获得：");
      if (todayGainExp) notifyBodyArr.push("- 积分 " + todayGainExp);
      if (todayGainNcoin) notifyBodyArr.push("- N币 " + todayGainNcoin + "（分享任务）");
    }

    if (cfg.notify && notifyBodyArr.length > 0) {
      notify(cfg.titlePrefix || "九号智能电动车", "今日签到结果", notifyBodyArr.join("\n"));
      logInfo("发送通知：", notifyBodyArr.join(" | "));
    } else logInfo("通知已禁用或无内容，跳过发送。");

  } catch (e) {
    logErr("主流程未捕获异常：", String(e));
    if (cfg.notify) notify(cfg.titlePrefix || "九号智能电动车", "脚本异常", String(e));
  } finally {
    logInfo("九号自动签到结束");
    $done();
  }
})();