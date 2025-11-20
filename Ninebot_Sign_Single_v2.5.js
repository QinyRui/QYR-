/*
Ninebot_Sign_Single_v2.5.js
九号智能电动车 · 单账号自动签到（v2.5）
作者：❥﹒﹏非我不可 & QinyRui
说明：完全不依赖 BoxJS / $argument，使用 $persistentStore 存取配置
*/

const isRequest = typeof $request !== "undefined" && $request.headers;

// --------- helper: 存取（统一 key） ---------
const K = {
  AUTH: "ninebot.Authorization",
  DEV: "ninebot.DeviceId",
  UA: "ninebot.UserAgent",
  DEBUG: "ninebot.enable_debug",
  NOTIFY: "ninebot.enable_notify",
  OPENBOX: "ninebot.enable_openbox",
  SUPPLEMENT: "ninebot.enable_supplement",
  INTERNAL_TEST: "ninebot.enable_internal_test",
  TITLE: "ninebot.notify_title",
  NOTIFY_FAIL: "ninebot.notify_fail"
};

const read = (k) => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (t, s, b) => { if (typeof $notification !== "undefined") $notification.post(t, s, b); };
const log = (...a) => { if (read(K.DEBUG) !== "false") console.log("[Ninebot]", ...a); };

// --------- 1) 抓包写入（请求触发） ---------
if (isRequest) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["Device-Id"] || h["DeviceId"] || h["deviceid"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    // 仅在 enable_capture 开启时（由插件 UI 的 enable_capture 控制 http-request 的 enable），http-request 才会调用本脚本并走到这里
    let changed = false;
    if (auth && read(K.AUTH) !== auth) { write(auth, K.AUTH); changed = true; }
    if (dev && read(K.DEV) !== dev) { write(dev, K.DEV); changed = true; }
    if (ua && read(K.UA) !== ua) { write(ua, K.UA); changed = true; }

    if (changed) {
      const title = read(K.TITLE) || "九号签到助手";
      notify(title, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入插件存储");
      log("抓包写入：", { auth: auth && auth.slice(0,60), dev, ua: ua && ua.slice(0,80) });
    }
  } catch (e) {
    log("抓包写入异常：", e);
  }
  $done({});
}

// --------- 2) 运行签到（cron 或 手动触发） ---------
(async () => {
  // 读取配置（全部从持久化读取）
  const AUTH = read(K.AUTH) || "";
  const DEV = read(K.DEV) || "";
  const UA = read(K.UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6";
  const DEBUG = read(K.DEBUG) !== "false";
  const ENABLE_NOTIFY = read(K.NOTIFY) !== "false";
  const ENABLE_OPENBOX = read(K.OPENBOX) === "true";
  const ENABLE_SUPPLEMENT = read(K.SUPPLEMENT) === "true";
  const ENABLE_INTERNAL_TEST = read(K.INTERNAL_TEST) === "true";
  const TITLE = read(K.TITLE) || "九号签到助手";

  // debug 控制
  if (!DEBUG) {
    // nothing
  } else {
    log("启动签到脚本，读取到配置：", { hasAuth: !!AUTH, hasDev: !!DEV, UA: UA && UA.slice(0,60) });
  }

  if (!AUTH || !DEV) {
    if (ENABLE_NOTIFY) notify(TITLE, "未配置 Token", "请先抓包或在插件 UI 使用“保存 UI 到存储”按钮写入 Authorization 与 DeviceId");
    log("未配置 Token，退出。");
    $done();
  }

  const headers = {
    "Authorization": AUTH,
    "Content-Type": "application/json",
    "device_id": DEV,
    "User-Agent": UA,
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

  function httpPost({ url, headers, body = "{}" }) {
    return new Promise((resolve, reject) => {
      $httpClient.post({ url, headers, body }, (err, resp, data) => {
        if (err) { reject(err); return; }
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      });
    });
  }
  function httpGet({ url, headers }) {
    return new Promise((resolve, reject) => {
      $httpClient.get({ url, headers }, (err, resp, data) => {
        if (err) { reject(err); return; }
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      });
    });
  }

  try {
    let notifyBody = "";

    // 1) 签到
    log("请求 /sign ...");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: DEV }) });
    log("/sign 返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${(sign && (sign.msg || JSON.stringify(sign))) || "未知"}`;

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    log("/status 返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      notifyBody += `\n🗓 连续签到：${data.consecutiveDays || data.continuousDays || 0} 天\n🎫 补签卡：${data.signCardsNum || data.remedyCard || 0} 张`;
    } else {
      log("status 获取失败：", st);
    }

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    log("/balance 返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    const box = await httpGet({ url: END.blindBoxList, headers });
    log("/blind-box/list 返回：", box);
    const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      if (ENABLE_OPENBOX) {
        const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        for (const b of ready) {
          try {
            const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
            log("盲盒领取返回：", r);
            if (r && r.code === 0) notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
            else notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
          } catch (e) { log("盲盒领取异常：", e); notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒异常`; }
        }
      }
    } else {
      log("无盲盒任务或返回格式非预期");
    }

    // 5) 自动补签（仅当 enable_supplement 写入为 "true"）
    if (read(K.SUPPLEMENT) === "true") {
      try {
        if (st && st.code === 0) {
          const cards = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            log("触发自动补签");
            const rep = await httpPost({ url: END.repair, headers, body: "{}" });
            log("repair 返回：", rep);
            if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
            else notifyBody += `\n🔧 自动补签失败：${rep && rep.msg ? rep.msg : "未知"}`;
          }
        }
      } catch (e) { log("自动补签异常：", e); }
    }

    // 6) 内测检测与申请（可选）
    if (read(K.INTERNAL_TEST) === "true") {
      try {
        const beta = await httpGet({ url: END.betaStatus, headers });
        log("betaStatus 返回：", beta);
        if (beta?.data?.qualified) {
          notifyBody += `\n🚀 已获得内测资格`;
        } else {
          notifyBody += `\n⚠️ 未获得内测资格`;
          // 尝试申请
          try {
            const applyResp = await httpPost({ url: END.betaApply, headers, body: JSON.stringify({ deviceId: DEV }) });
            log("beta apply 返回：", applyResp);
            if (applyResp?.success) notifyBody += ` → 自动申请成功 🎉`;
            else notifyBody += ` → 自动申请失败`;
          } catch (e) { log("内测申请异常：", e); notifyBody += ` → 自动申请异常`; }
        }
      } catch (e) { log("内测检测异常：", e); }
    }

    // 最终通知
    if (ENABLE_NOTIFY) notify(TITLE, "签到结果", notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    if (read(K.NOTIFY_FAIL) !== "false") notify(read(K.TITLE) || "九号签到助手", "脚本异常", String(e));
  }

  $done();
})();