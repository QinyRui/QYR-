/*
📱 九号智能电动车 · 单账号自动签到（v2.5）
👤 作者：❥﹒﹏非我不可 & QinyRui
📆 功能：
  - 抓包自动写入 Authorization / DeviceId / User-Agent
  - 手动签到 / CRON 自动签到
  - 自动盲盒 / 补签 / 内测申请
  - 调试日志 + 通知
*/

const $ = {
  read: key => $persistentStore?.read(key),
  write: (val, key) => $persistentStore?.write(val, key),
  notify: (title, sub, body) => $notification?.post(title, sub, body),
  log: (...args) => console.log("[Ninebot]", ...args),
  debug: (...args) => {
    if (cfg.enable_debug === "true") console.log("[Ninebot][DEBUG]", ...args);
  },
  // 获取参数
  getArguments: () => {
    const args = $argument ? $argument : {};  // 确保在 Loon 中正确获取参数
    return args;
  }
};

// ---------- 获取 Loon UI 配置参数 ----------
const cfg = $.getArguments();

// 处理参数并设置默认值
cfg.Authorization = cfg.Authorization || $.read("ninebot.Authorization") || "";
cfg.DeviceId = cfg.DeviceId || $.read("ninebot.DeviceId") || "";
cfg.UserAgent = cfg.UserAgent || $.read("ninebot.UserAgent") || "";
cfg.notify_title = cfg.notify_title || "九号签到助手";
cfg.enable_notify = cfg.enable_notify === "true";
cfg.enable_debug = cfg.enable_debug === "true";
cfg.enable_openbox = cfg.enable_openbox === "true";
cfg.enable_supplement = cfg.enable_supplement === "true";
cfg.enable_internal_test = cfg.enable_internal_test === "true";
cfg.enable_capture = cfg.enable_capture === "true";

// ---------- 抓包写入 ----------
if (typeof $request !== "undefined" && cfg.enable_capture) {
  const h = $request.headers || {};
  const auth = h["Authorization"] || h["authorization"];
  const dev = h["DeviceId"] || h["deviceid"] || h["device_id"];
  const ua = h["User-Agent"] || h["user-agent"];

  let changed = false;
  if (auth && auth !== cfg.Authorization) { $.write(auth, "ninebot.Authorization"); changed = true; }
  if (dev && dev !== cfg.DeviceId) { $.write(dev, "ninebot.DeviceId"); changed = true; }
  if (ua && ua !== cfg.UserAgent) { $.write(ua, "ninebot.UserAgent"); changed = true; }

  if (changed && cfg.enable_notify) {
    $.notify(cfg.notify_title, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入");
    $.debug("抓包写入成功:", { auth, dev, ua });
  }
  $done({});
}

// ---------- 校验必要配置 ----------
if (!cfg.Authorization || !cfg.DeviceId) {
  if (cfg.enable_notify) {
    $.notify(cfg.notify_title, "未配置 Token", "请先抓包或在 UI 填写 Authorization 与 DeviceId");
  }
  $done();
}

// ---------- HTTP 辅助 ----------
async function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

async function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- 接口与请求头 ----------
const headers = {
  Authorization: cfg.Authorization,
  "Content-Type": "application/json",
  device_id: cfg.DeviceId,
  "User-Agent": cfg.UserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  platform: "h5",
  Origin: "https://h5-bj.ninebot.com",
  language: "zh"
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

// ---------- 日志 & 辅助 ----------
function safeStr(v){ try { return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    // 签到
    $.debug("开始签到请求...");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
    $.debug("签到返回：", sign);
    if (sign?.code === 0) notifyBody += `🎉 签到成功 +${sign.data?.nCoin || 0} N币`;
    else if (sign?.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${sign?.msg || safeStr(sign)}`;

    // 状态
    const st = await httpGet({ url: END.status, headers });
    $.debug("状态返回：", st);
    if (st?.code === 0) {
      const data = st.data || {};
      const days = data.consecutiveDays || data.continuousDays || 0;
      const cards = data.signCardsNum || data.remedyCard || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    }

    // 余额
    const bal = await httpGet({ url: END.balance, headers });
    $.debug("余额返回：", bal);
    if (bal?.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 盲盒
    if (cfg.enable_openbox) {
      const box = await httpGet({ url: END.blindBoxList, headers });
      $.debug("盲盒返回：", box);
      const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
      if (Array.isArray(notOpened) && notOpened.length > 0) {
        notifyBody += `\n\n📦 盲盒任务：`;
        notOpened.forEach(b => {
          const days = b.awardDays || b.boxDays || b.days || "?";
          const left = b.leftDaysToOpen || b.diffDays || "?";
          notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
        });

        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        for (const b of ready) {
          try {
            const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
            $.debug("盲盒领取返回：", r);
            if (r?.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || "未知"}`;
            else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
          } catch (e) { $.debug("盲盒领取异常：", e); notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒异常`; }
        }
      }
    }

    // 自动补签
    if (cfg.enable_supplement && st?.code === 0) {
      const cards = st.data?.signCardsNum || 0;
      const days = st.data?.consecutiveDays || 0;
      if (cards > 0 && days === 0) {
        try {
          const rep = await httpPost({ url: END.repair, headers, body: "{}" });
          notifyBody += rep?.code === 0 ? `\n🔧 自动补签成功` : `\n🔧 自动补签失败`;
          $.debug("补签返回：", rep);
        } catch (e) { $.debug("自动补签异常：", e); notifyBody += "\n🔧 自动补签异常"; }
      }
    }

    // 内测申请
    if (cfg.enable_internal_test) {
      try {
        const beta = await httpGet({ url: END.betaStatus, headers });
        $.debug("内测状态：", beta);
        if (!beta?.data?.qualified) {
          const apply = await httpPost({ url: END.betaApply, headers, body: JSON.stringify({ deviceId: cfg.DeviceId }) });
          notifyBody += apply?.success ? `\n🚀 自动申请内测成功 🎉` : `\n⚠️ 自动申请内测失败`;
          $.debug("内测申请返回：", apply);
        } else {
          notifyBody += "\n🚀 已获得内测资格";
        }
      } catch (e) { $.debug("内测异常：", e); notifyBody += "\n⚠️ 内测检测异常"; }
    }

    // 最终通知
    if (cfg.enable_notify) $.notify(cfg.notify_title, "签到结果", notifyBody);

  } catch (e) {
    $.debug("主流程异常：", e);
    if (cfg.enable_notify) $.notify(cfg.notify_title, "脚本异常", safeStr(e));
  }

  $done();
})();