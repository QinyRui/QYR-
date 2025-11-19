/*
📱 九号智能电动车 · 单账号自动签到
👤 作者：❥﹒﹏非我不可 & QinyRui
📆 版本：2.5
🧰 功能：
  - 自动签到、查询状态、余额、盲盒
  - 自动补签（可关闭）
  - 自动开启 & 自动领取盲盒奖励（可关闭）
  - 内测申请（可关闭）
  - 自动抓包写入 Authorization / DeviceId / User-Agent（可关闭）
  - 完整日志输出（控制台 + 通知）
  - 支持 Loon 插件 UI 开关
*/

const isReq = typeof $request !== "undefined" && $request.headers;

// ---------- 获取插件 UI 开关 ----------
const Debug_enable = $argument?.Debug_enable ?? false;
const Notify_enable = $argument?.Notify_enable ?? true;
const AutoBox_enable = $argument?.AutoBox_enable ?? true;
const AutoRepair_enable = $argument?.AutoRepair_enable ?? true;
const InternalTest_enable = $argument?.InternalTest_enable ?? false;
const AutoWrite_enable = $argument?.AutoWrite_enable ?? true;
const NotifyTitle_text = $argument?.NotifyTitle_text || "九号签到助手";

// ---------- 持久化 ----------
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (Notify_enable && typeof $notification !== "undefined") $notification.post(title, sub, body); };
function log(...args){ if (Debug_enable) console.log("[Ninebot]", ...args); }
function safeStr(v){ try { return JSON.stringify(v); } catch { return String(v); } }

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- BoxJS 配置已移除 ----------
// 使用自动抓包写入开关控制写入
if (isReq && AutoWrite_enable) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";
    let changed = false;
    if (auth && read("ninebot.authorization") !== auth) { write(auth, "ninebot.authorization"); changed = true; }
    if (dev && read("ninebot.deviceId") !== dev) { write(dev, "ninebot.deviceId"); changed = true; }
    if (ua && read("ninebot.userAgent") !== ua) { write(ua, "ninebot.userAgent"); changed = true; }
    if (changed) notify(NotifyTitle_text, "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入插件");
    log("抓包写入成功:", { auth, dev, ua });
  } catch (e) { log("抓包写入异常：", e); }
  $done({});
}

// ---------- 读取配置 ----------
const Authorization = read("ninebot.authorization") || "";
const DeviceId = read("ninebot.deviceId") || "";
const userAgent = read("ninebot.userAgent") || "";

if (!Authorization || !DeviceId) {
  notify(NotifyTitle_text, "未配置 Token", "请先开启抓包并在九号 App 操作以写入 Authorization 与 DeviceId");
  $done();
}

// ---------- HTTP 请求头 ----------
const headers = {
  "Authorization": Authorization,
  "Content-Type": "application/json",
  "device_id": DeviceId,
  "User-Agent": userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
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
  internalTest: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
};

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";
  try {
    // 1) 签到
    if (AutoRepair_enable || AutoBox_enable || InternalTest_enable) log("开始签到流程...");
    const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: DeviceId }) });
    log("签到返回：", sign);
    if (sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || 0} N币`;
    else if (sign && sign.code === 540004) notifyBody += `⚠️ 今日已签到`;
    else notifyBody += `❌ 签到失败：${(sign && (sign.msg || safeStr(sign))) || "未知"}`;

    // 2) 状态
    const st = await httpGet({ url: END.status, headers });
    log("状态返回：", st);
    if (st && st.code === 0) {
      const data = st.data || {};
      notifyBody += `\n🗓 连续签到：${data.consecutiveDays || 0} 天\n🎫 补签卡：${data.signCardsNum || 0} 张`;
    }

    // 3) 余额
    const bal = await httpGet({ url: END.balance, headers });
    log("余额返回：", bal);
    if (bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

    // 4) 盲盒
    if (AutoBox_enable) {
      const box = await httpGet({ url: END.blindBoxList, headers });
      log("盲盒返回：", box);
      const notOpened = box?.data?.notOpenedBoxes || [];
      if (Array.isArray(notOpened) && notOpened.length > 0) {
        notifyBody += `\n\n📦 盲盒任务：`;
        for (const b of notOpened) {
          const days = b.awardDays || b.boxDays || "?";
          const left = b.leftDaysToOpen || b.diffDays || "?";
          notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
          if (left === 0) {
            try {
              const r = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
              if (r && r.code === 0) notifyBody += `\n🎁 ${days}天盲盒获得：${r.data?.rewardValue || "未知"}`;
              else notifyBody += `\n❌ ${days}天盲盒领取失败`;
            } catch (e) { log("盲盒领取异常：", e); }
          }
        }
      }
    }

    // 5) 自动补签
    if (AutoRepair_enable) {
      if (st && st.code === 0) {
        const cards = st.data?.signCardsNum || 0;
        const days = st.data?.consecutiveDays || 0;
        if (cards > 0 && days === 0) {
          const rep = await httpPost({ url: END.repair, headers, body: "{}" });
          if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
          else notifyBody += `\n🔧 自动补签失败：${rep?.msg || "未知"}`;
        }
      }
    }

    // 6) 内测申请
    if (InternalTest_enable) {
      try {
        const test = await httpGet({ url: END.internalTest, headers });
        log("内测状态：", test);
        if (test?.data?.applied) notifyBody += `\n✅ 已申请内测`;
        else notifyBody += `\n❗️ 未获得内测资格，请手动申请`;
      } catch (e) { log("内测异常：", e); notifyBody += `\n❌ 内测申请异常`; }
    }

    // ✅ 最终通知
    notify(NotifyTitle_text, "签到结果", notifyBody);

  } catch (e) {
    log("主流程异常：", e);
    notify(NotifyTitle_text, "脚本异常", String(e));
  }
  $done();
})();