/*
📱 九号智能电动车 · 全功能签到（单号版 · 修复版）
👤 作者：QinyRui（Enhanced by ChatGPT）
📆 版本：2.3（2025/11/18）
🧰 功能：
  - 自动签到
  - 查询状态、余额
  - 盲盒任务 + 自动开启（可关闭）
  - 自动补签（可关闭）
  - 完整日志输出（可 BoxJS 控制）
  - 抓包自动写入 Authorization / DeviceId / User-Agent
  - BoxJS 配置支持（自定义标题）
*/

// ------------------------------------------------------
// 基础函数
// ------------------------------------------------------
const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (cfg.notify) $notification.post(title, sub, body); };

function log(...args){ if (cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{return JSON.stringify(v)}catch{return String(v)} }

// ------------------------------------------------------
// BoxJS Keys
// ------------------------------------------------------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_TITLE = "ninebot.titlePrefix";

// ------------------------------------------------------
// 抓包写入
// ------------------------------------------------------
if (isReq) {
  try {
    const h = $request.headers;

    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["device_id"] || h["DeviceId"] || h["deviceId"] || h["deviceid"] || "";
    const ua  = h["User-Agent"] || h["user-agent"] || h["User-agent"] || "";

    let changed = false;

    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      console.log("[Ninebot] 抓包：", {auth, dev, ua});
    }
  } catch (e) {
    console.log("[Ninebot] 抓包异常：", e);
  }
  $done({});
}

// ------------------------------------------------------
// 读取配置
// ------------------------------------------------------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "true",
  notify: read(KEY_NOTIFY) !== "false",
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  titlePrefix: read(KEY_TITLE) || "九号智能电动车"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包，在九号 App 内任意操作以写入必要参数。");
  $done();
}

// ------------------------------------------------------
// HTTP 请求封装
// ------------------------------------------------------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }) }
    });
  });
}

function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }) }
    });
  });
}

// ------------------------------------------------------
// API - Headers & Endpoints
// ------------------------------------------------------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Ninebot/6.9.4 (iOS)",
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
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance"
};

// ------------------------------------------------------
// 主流程
// ------------------------------------------------------
!(async () => {
  let text = "";

  try {
    // -------------------------------
    // 1) 签到
    // -------------------------------
    log("执行签到");
    const sign = await httpPost({
      url: END.sign,
      headers,
      body: JSON.stringify({ deviceId: cfg.DeviceId })
    });

    log("签到返回：", sign);

    if (sign.code === 0) {
      text += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    } else if (sign.code === 540004) {
      text += "⚠️ 今日已签到";
    } else {
      text += `❌ 签到失败：${sign.msg || safeStr(sign)}`;
    }

    // -------------------------------
    // 2) 状态
    // -------------------------------
    const st = await httpGet({ url: END.status, headers });
    log("状态返回：", st);

    if (st.code === 0) {
      const d = st.data;
      const days = d.consecutiveDays || d.continuousDays || 0;
      const cards = d.signCardsNum || d.remedyCard || 0;
      const isTodaySign = d.isTodaySign ?? (sign.code === 540004);

      text += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    } else {
      text += `\n🗓 状态获取失败`;
    }

    // -------------------------------
    // 3) 余额
    // -------------------------------
    const bal = await httpGet({ url: END.balance, headers });
    log("余额返回：", bal);

    if (bal.code === 0) {
      text += `\n💰 N币余额：${bal.data?.balance || 0}`;
    } else {
      text += "\n💰 N币获取失败";
    }

    // -------------------------------
    // 4) 盲盒任务
    // -------------------------------
    const box = await httpGet({ url: END.blindBoxList, headers });
    log("盲盒返回：", box);

    const list = box?.data?.notOpenedBoxes || box?.data || [];

    if (Array.isArray(list) && list.length > 0) {
      text += `\n\n📦 盲盒任务：`;

      for (const b of list) {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen ?? b.diffDays ?? "?";

        text += `\n- ${days}天盲盒，还需 ${left} 天`;
      }

      // 自动领取准备好的盲盒
      if (cfg.autoOpenBox) {
        const ready = list.filter(b =>
          (b.leftDaysToOpen === 0 || b.diffDays === 0) &&
          (b.rewardStatus === 1)
        );

        if (ready.length > 0) {
          text += `\n\n🎉 自动开启盲盒：`;

          for (const b of ready) {
            try {
              const r = await httpPost({
                url: END.blindBoxReceive,
                headers,
                body: JSON.stringify({ boxId: b.boxId })
              });

              log("盲盒领取返回：", r);

              if (r.code === 0) {
                text += `\n🎁 ${b.awardDays || b.boxDays}天盲盒：+${r.data?.rewardValue || r.data?.score || "?"}`;
              } else {
                text += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败：${r.msg}`;
              }

            } catch (e) {
              log("盲盒领取异常：", e);
              text += `\n❌ ${b.awardDays}天盲盒领取异常`;
            }
          }
        }
      }

    } else {
      text += `\n📦 无盲盒任务`;
    }

    // -------------------------------
    // 5) 自动补签
    // -------------------------------
    if (cfg.autoRepair && st.code === 0) {
      const d = st.data;
      const cards = d.signCardsNum || d.remedyCard || 0;
      const isTodaySign = d.isTodaySign ?? (sign.code === 540004);

      if (!isTodaySign && cards > 0) {
        log("自动补签触发");
        const rep = await httpPost({ url: END.repair, headers, body: "{}" });

        log("补签返回：", rep);

        if (rep.code === 0) text += `\n🔧 自动补签成功`;
        else text += `\n🔧 自动补签失败：${rep.msg || "未知"}`;
      }
    }

    // ------------------------------------------------------
    // 最终通知
    // ------------------------------------------------------
    notify(cfg.titlePrefix, "签到结果", text);

  } catch (e) {
    log("主流程异常：", e);
    notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();