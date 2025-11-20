/*
  九号智能电动车 · 单号自动签到 v2.6
  功能：自动签到 / 自动盲盒 / 自动补签 / 内测申请 / 抓包写入 / 全步骤日志打印
  作者：QinyRui & ❥﹒﹏非我不可
  说明：把脚本放到 Loon 的 script-path 或者 GitHub raw 链接订阅即可
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// 兼容读取 Loon 参数（$argument）和常规 args
let pluginArgs = {};
try {
  if (typeof $argument !== "undefined" && $argument) {
    // Loon 提供 $argument 字符串（格式：key1=value1&key2=value2）
    // 尝试解析成对象
    pluginArgs = Object.fromEntries(($argument || "").split("&").map(p => {
      const kv = p.split("=");
      return [kv[0], kv.slice(1).join("=")];
    }).filter(x => x[0]));
  } else if (typeof args !== "undefined" && args) {
    pluginArgs = args;
  }
} catch (e) {
  console.log("[Ninebot] 解析 plugin args 异常:", e);
  pluginArgs = {};
}

// 兼容 persistent 存取（BoxJS / Loon 支持）
const read = k => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
  } catch (e) {}
  return null;
};
const write = (v, k) => {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
  } catch (e) {}
};

// 通知（BoxJS / Loon）
const notify = (title, sub, body) => {
  try { if (typeof $notification !== "undefined") $notification.post(title, sub, body); }
  catch (e) { console.log("[Ninebot] notify 异常:", e); }
};

// 安全 stringify
const s = v => {
  try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }
  catch (e) { return String(v); }
};

// 读取配置（优先采用 pluginArgs，再 fallback 到 persistentStore）
const cfg = {
  // UI 控件（from pluginArgs or BoxJS keys）
  debug: (pluginArgs.enable_debug === "true") || (read("ninebot.debug") !== "false"),
  notify: (pluginArgs.enable_notify === "false") ? false : (read("ninebot.notify") !== "false"),
  autoOpenBox: (pluginArgs.enable_blindbox === "false") ? false : (read("ninebot.autoOpenBox") === "true"),
  autoRepair: (pluginArgs.enable_supplement === "false") ? false : (read("ninebot.autoRepair") === "true"),
  autoApplyBeta: (pluginArgs.enable_internal === "true") || (read("ninebot.autoApplyBeta") === "true"),
  titlePrefix: pluginArgs.notify_title || read("ninebot.titlePrefix") || "九号签到",
  enable_capture: (pluginArgs.enable_capture === "true") || (read("ninebot.enable_capture") === "true"),
  cron_time: pluginArgs.cron_time || read("ninebot.cron_time") || "10 8 * * *"
};

// Keys for tokens (BoxJS storage)
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";

// 抓包写入（由 http-request 触发，且受 enable_capture 控制）
if (isReq && cfg.enable_capture) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"] || "";
    const dev = headers["DeviceId"] || headers["deviceid"] || headers["device_id"] || "";
    const ua = headers["User-Agent"] || headers["user-agent"] || "";

    let changed = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed) {
      console.log("[Ninebot] 抓包写入成功:", s({ Authorization: auth ? "REDACTED" : "", DeviceId: dev, "User-Agent": ua }));
      if (cfg.notify) notify(cfg.titlePrefix, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
    } else {
      console.log("[Ninebot] 抓包触发，但无变化");
    }
  } catch (e) {
    console.log("[Ninebot] 抓包写入异常:", e);
  }
  $done({});
}

// 下面为定时/主动执行部分 ------------------------------------------------

// 读取实际 Token 信息（从 BoxJS persistent）
cfg.Authorization = read(KEY_AUTH) || "";
cfg.DeviceId = read(KEY_DEV) || "";
cfg.userAgent = read(KEY_UA) || "";

// 强制在控制台输出（不受 debug 开关隐藏）——保证能看到日志
function logAlways(...args) {
  try { console.log("[Ninebot]", ...args.map(x => (typeof x === "object" ? s(x) : x))); }
  catch (e) { console.log("[Ninebot] logAlways 异常:", e); }
}

// Helper: safe http client
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    try {
      $httpClient.get({ url, headers }, (err, resp, data) => {
        if (err) { reject(err); return; }
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      });
    } catch (e) { reject(e); }
  });
}
function httpPost(url, headers = {}, body = "{}") {
  return new Promise((resolve, reject) => {
    try {
      $httpClient.post({ url, headers, body }, (err, resp, data) => {
        if (err) { reject(err); return; }
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      });
    } catch (e) { reject(e); }
  });
}

// Endpoints
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

// common headers
const headers = {
  "Authorization": cfg.Authorization,
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Ninebot/1.0",
  "Content-Type": "application/json",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh",
  "Accept-Encoding": "gzip, deflate, br"
};

// 主流程
(async function main() {
  logAlways("开始执行九号签到脚本...");

  if (!cfg.Authorization || !cfg.DeviceId) {
    logAlways("未配置 Authorization 或 DeviceId，无法继续执行。请使用抓包开启自动写入或在 BoxJS 手动填入。");
    if (cfg.notify) notify(cfg.titlePrefix, "未配置 Token", "请开启抓包并写入 Authorization / DeviceId / User-Agent");
    $done();
    return;
  }

  let notifyBody = "";

  try {
    // 1) 状态
    logAlways("获取签到状态...");
    let st;
    try {
      st = await httpGet(END.status, headers);
      logAlways("状态返回：", s(st));
    } catch (e) {
      logAlways("状态请求异常：", e);
      st = {};
    }
    const days = (st && st.data && (st.data.consecutiveDays || st.data.continuousDays)) || 0;
    logAlways("当前连续签到天数:", days);

    // 2) 签到
    logAlways("开始签到...");
    let signResp;
    try {
      signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      logAlways("签到返回：", s(signResp));
    } catch (e) {
      logAlways("签到请求异常：", e);
      signResp = { error: String(e) };
    }

    if (signResp && signResp.code === 0) {
      notifyBody += `🎉 签到成功\n🎁 +${(signResp.data && (signResp.data.nCoin || signResp.data.score)) || 0} N币`;
    } else if (signResp && signResp.code === 540004) {
      notifyBody += `⚠️ 已签到, 不能重复签到`;
    } else {
      notifyBody += `❌ 签到失败: ${signResp && (signResp.msg || signResp.error || s(signResp))}`;
    }

    // 3) 余额
    logAlways("查询 N 币余额...");
    try {
      const bal = await httpGet(END.balance, headers);
      logAlways("余额返回：", s(bal));
      notifyBody += `\n💰 N币余额：${(bal && bal.data && bal.data.balance) || 0}`;
    } catch (e) {
      logAlways("余额请求异常：", e);
    }

    // 4) 盲盒列表
    logAlways("获取盲盒任务列表...");
    let box;
    try {
      box = await httpGet(END.blindBoxList, headers);
      logAlways("盲盒列表返回：", s(box));
    } catch (e) {
      logAlways("盲盒请求异常：", e);
      box = {};
    }

    const notOpened = (box && box.data && (box.data.notOpenedBoxes || box.data)) || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const daysBox = b.awardDays || b.boxDays || b.days || "?";
        const left = (typeof b.leftDaysToOpen !== "undefined") ? b.leftDaysToOpen : (typeof b.diffDays !== "undefined" ? b.diffDays : "?");
        notifyBody += `\n- ${daysBox}天盲盒，还需 ${left} 天`;
      });

      // 自动开启盲盒（根据开关）
      if (cfg.autoOpenBox) {
        logAlways("自动盲盒开关已开启，尝试开启已到期盲盒...");
        let openedCount = 0;
        for (const b of notOpened) {
          const left = b.leftDaysToOpen ?? b.diffDays ?? 9999;
          const status = b.rewardStatus ?? b.status ?? 0;
          // 判断可领取：left == 0 OR status indicates ready (2)
          if ((left === 0 || status === 2) ) {
            try {
              logAlways(`尝试领取 ${b.awardDays || b.boxDays || b.days} 天盲盒...`);
              // 尝试以通用方式调用领取接口
              const recv = await httpPost(END.blindBoxReceive, headers, JSON.stringify({ awardDays: b.awardDays || b.boxDays || b.days }));
              logAlways("盲盒领取返回：", s(recv));
              if (recv && (recv.code === 0 || recv.success)) {
                openedCount++;
                notifyBody += `\n🎁 ${b.awardDays || b.boxDays || b.days}天盲盒获得：${(recv.data && (recv.data.rewardValue || recv.data.score)) || s(recv.data)}`;
              } else {
                notifyBody += `\n❌ ${b.awardDays || b.boxDays || b.days}天盲盒领取失败：${s(recv)}`;
              }
            } catch (e) {
              logAlways("盲盒领取异常：", e);
              notifyBody += `\n❌ ${b.awardDays || b.boxDays || b.days}天盲盒领取异常`;
            }
          }
        }
        if (openedCount === 0) logAlways("没有检测到可自动开启的盲盒。");
      }
    } else {
      logAlways("无未开启盲盒或盲盒数据格式非预期。");
    }

    // 5) 自动补签
    if (cfg.autoRepair) {
      try {
        const cards = st && st.data && (st.data.signCardsNum || st.data.remedyCard) || 0;
        logAlways("补签卡数量：", cards);
        // 如果连续签到天数为0（或其他逻辑）并且有补签卡则尝试补签
        if (cards > 0 && (days === 0)) {
          logAlways("触发自动补签...");
          const rep = await httpPost(END.repair, headers, "{}");
          logAlways("补签返回：", s(rep));
          if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
          else notifyBody += `\n🔧 自动补签失败：${s(rep)}`;
        } else {
          logAlways("自动补签未触发（补签卡不足或不满足条件）。");
        }
      } catch (e) {
        logAlways("自动补签异常：", e);
      }
    }

    // 6) 内测检测与申请
    try {
      logAlways("检测内测资格...");
      const beta = await httpGet(END.betaStatus, headers);
      logAlways("内测状态返回：", s(beta));
      if (beta && beta.data && beta.data.qualified) {
        notifyBody += `\n🚀 已获得内测资格`;
      } else {
        notifyBody += `\n⚠️ 未获得内测资格`;
        if (cfg.autoApplyBeta) {
          try {
            logAlways("尝试自动申请内测...");
            const applyResp = await httpPost(END.betaApply, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
            logAlways("内测申请返回：", s(applyResp));
            if (applyResp && (applyResp.success || applyResp.code === 0)) notifyBody += ` → 自动申请成功 🎉`;
            else notifyBody += ` → 自动申请失败 ❌`;
          } catch (e) {
            logAlways("内测自动申请异常：", e);
            notifyBody += ` → 自动申请异常 ❌`;
          }
        }
      }
    } catch (e) {
      logAlways("内测检测异常：", e);
    }

    // 最终日志与通知
    logAlways("脚本执行完成.");
    if (cfg.notify) {
      // 只发简洁通知；详细内容仍输出至控制台
      notify(cfg.titlePrefix, "签到结果", notifyBody || "执行完毕，详情请查看控制台日志。");
    }

  } catch (eMain) {
    logAlways("主流程异常：", eMain);
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", s(eMain));
  }

  $done();
})();