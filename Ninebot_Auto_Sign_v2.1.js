/*
📱 九号智能电动车 · 自动签到（超级加强版 v2.1）
👤 作者：QinyRui
📆 更新：2025/11/17
⚠ 特别说明：
  - 保持你原来的抓包写入逻辑（不改写、不破坏）
  - 自动识别并缓存 schema（ninebot.schema）
  - 自动开启盲盒（POST /portal/api/blind-box/open）
  - 支持 BoxJS/Surge/Loon/QuantumultX 环境
  - 通知由 BoxJS keys 控制（ninebot.notify）
*/

const STORAGE = {
  auth: "ninebot.authorization",
  device: "ninebot.deviceId",
  ua: "ninebot.userAgent",
  debug: "ninebot.debug",
  notify: "ninebot.notify",
  autoOpen: "ninebot.autoOpenBox",
  autoRepair: "ninebot.autoRepair",
  prefix: "ninebot.titlePrefix",
  schema: "ninebot.schema" // 缓存成功的 schema
};

const ENDPOINTS = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  blindList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindOpen: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/open",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"
};

// ---------------------------
// 保持原抓包写入逻辑（如果这是一个抓包请求）
if (typeof $request !== "undefined" && $request.headers) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    // 只写入有值的字段，且不改变逻辑
    if (auth && read(STORAGE.auth) !== auth) write(auth, STORAGE.auth);
    if (dev && read(STORAGE.device) !== dev) write(dev, STORAGE.device);
    if (ua && read(STORAGE.ua) !== ua) write(ua, STORAGE.ua);
  } catch (e) {
    console.log("抓包写入异常：", e);
  }
  $done({});
}
// ---------------------------

// 兼容多平台 Env
const $ = Env("九号智能电动车 v2.1");

// 主流程
!(async () => {
  const auth = $.getdata(STORAGE.auth);
  const deviceId = $.getdata(STORAGE.device);
  const userAgent = $.getdata(STORAGE.ua) || "NinebotApp/6.6.0";
  const debug = $.getdata(STORAGE.debug) === "true";
  const notifyOn = $.getdata(STORAGE.notify) !== "false";
  const autoOpen = $.getdata(STORAGE.autoOpen) !== "false";
  const autoRepair = $.getdata(STORAGE.autoRepair) === "true";
  const title = $.getdata(STORAGE.prefix) || "九号智能电动车";

  if (!auth || !deviceId) {
    if (notifyOn) $.msg(title, "", "⚠️ 未配置 Authorization 或 DeviceId，请先抓包写入");
    return $.done();
  }

  const headers = {
    Authorization: auth,
    device_id: deviceId,
    "User-Agent": userAgent,
    "Content-Type": "application/json",
    platform: "h5",
    Origin: "https://h5-bj.ninebot.com",
    language: "zh"
  };

  // 1) 签到 — 自动识别 schema（尝试缓存）
  let schema = $.getdata(STORAGE.schema) || "service";
  log(`开始签到：尝试使用 schema=${schema}`);

  let signRes = await postJson(ENDPOINTS.sign, headers, { schema, activityCode: "dailySign" });

  // 若返回 Params error 则尝试 fallback 并保存成功 schema
  if (isParamsError(signRes)) {
    const fallback = schema === "service" ? "scooter" : "service";
    log(`Params error，尝试 fallback schema=${fallback}`);
    signRes = await postJson(ENDPOINTS.sign, headers, { schema: fallback, activityCode: "dailySign" });
    if (!isParamsError(signRes)) {
      schema = fallback;
      $.setdata(schema, STORAGE.schema);
      log(`保存成功 schema=${schema}`);
    }
  } else {
    // 若首次请求成功则保存
    if (!isParamsError(signRes)) {
      $.setdata(schema, STORAGE.schema);
      log(`签到成功，缓存 schema=${schema}`);
    }
  }

  // 处理签到结果文本
  let notifyBody = "";
  if (signRes && (signRes.code === 0 || /成功/.test(signRes.msg) || /success/i.test(signRes.msg) || signRes.data)) {
    // 九号偶尔把 code 规范不同，用宽松判断
    const gain = signRes.data?.nCoin ?? signRes.data?.score ?? (signRes.data && signRes.data.rewardValue) ?? 0;
    notifyBody += `🎉 签到成功\n🎁 +${gain} N币`;
  } else if (signRes && /已签到|today/i.test(signRes.msg || "")) {
    notifyBody += `⚠️ 今日已签到`;
  } else {
    notifyBody += `❌ 签到失败：${signRes?.msg || JSON.stringify(signRes)}`;
  }

  // 2) 状态
  const st = await getJson(ENDPOINTS.status, headers);
  if (st && st.code === 0 && st.data) {
    const days = st.data.consecutiveDays ?? st.data.continuousDays ?? st.data.continuous ?? 0;
    const cards = st.data.signCardsNum ?? st.data.remedyCard ?? st.data.repairCard ?? 0;
    notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;

    // 自动补签（谨慎）
    if (autoRepair && cards > 0 && (days === 0 || days < 1)) {
      try {
        const rep = await postJson(ENDPOINTS.repair, headers, { schema, type: "repair" });
        if (rep && rep.code === 0) notifyBody += `\n🔧 自动补签成功`;
        else notifyBody += `\n🔧 自动补签失败：${rep?.msg || JSON.stringify(rep)}`;
      } catch (e) {
        notifyBody += `\n🔧 自动补签异常`;
        log("补签异常：", e);
      }
    }
  } else {
    notifyBody += `\n🗓 状态获取失败`;
  }

  // 3) 余额
  const bal = await getJson(ENDPOINTS.balance, headers);
  if (bal && bal.code === 0 && bal.data) {
    const balanceVal = bal.data.balance ?? bal.data.amount ?? bal.data;
    notifyBody += `\n💰 N币余额：${balanceVal}`;
  } else {
    notifyBody += `\n💰 N币获取失败`;
  }

  // 4) 盲盒（列表 + 自动开启）
  const box = await getJson(ENDPOINTS.blindList, headers);
  if (box && (Array.isArray(box.data?.notOpenedBoxes) || Array.isArray(box.data))) {
    const list = Array.isArray(box.data.notOpenedBoxes) ? box.data.notOpenedBoxes : box.data;
    if (list.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      list.forEach(b => {
        const days = b.awardDays ?? b.boxDays ?? b.days ?? b.taskDays ?? "?";
        const left = b.leftDaysToOpen ?? b.diffDays ?? b.leftDays ?? b.remainDays ?? "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });

      // 自动开启：调用 /blind-box/open
      if (autoOpen) {
        const ready = list.filter(b => {
          const left = b.leftDaysToOpen ?? b.diffDays ?? b.leftDays ?? b.remainDays ?? 999;
          return left === 0;
        });

        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          for (const b of ready) {
            // 尝试多种可能的 blind id 字段名
            const blindId = b.blindBoxId ?? b.id ?? b.boxId ?? b.awardId;
            if (!blindId) {
              notifyBody += `\n❌ 无法识别盲盒 id`;
              continue;
            }
            try {
              const openRes = await postJson(ENDPOINTS.blindOpen, headers, { blindBoxId: blindId });
              if (openRes && openRes.code === 0) {
                const reward = openRes.data?.rewardValue ?? openRes.data?.score ?? JSON.stringify(openRes.data) ?? "获得奖励";
                notifyBody += `\n🎁 ${b.awardDays ?? b.boxDays ?? b.taskDays}天盲盒获得：${reward}`;
              } else {
                notifyBody += `\n❌ ${b.awardDays ?? b.boxDays ?? b.taskDays}天盲盒领取失败：${openRes?.msg || JSON.stringify(openRes)}`;
              }
            } catch (e) {
              notifyBody += `\n❌ ${b.awardDays ?? b.boxDays ?? b.taskDays}天盲盒开启异常`;
              log("盲盒开启异常：", e);
            }
          }
        }
      }
    } else {
      notifyBody += `\n📦 无盲盒任务`;
    }
  } else {
    notifyBody += `\n📦 盲盒获取失败`;
  }

  // 发送通知
  if (notifyOn) $.msg(title, "签到结果", notifyBody);
  log("最终通知内容：\n" + notifyBody);

})().catch(e => {
  console.log("主流程异常：", e);
  const notifyOn = $.getdata(STORAGE.notify) !== "false";
  const title = $.getdata(STORAGE.title) || "九号智能电动车";
  if (notifyOn) $.msg(title, "脚本异常", String(e));
}).finally(() => $.done());

// ---------------------------
// 辅助函数
// ---------------------------
function isParamsError(obj) {
  if (!obj) return true;
  const m = (obj.msg || "").toLowerCase();
  return /param|params|参数/.test(m) || obj.code === 400 || obj.code === 1001;
}

function log(...args) {
  if ($.getdata(STORAGE.debug) === "true") console.log(...args);
}

// 简单封装请求（兼容多平台）
function getJson(url, headers) {
  return new Promise(resolve => {
    if (typeof $httpClient !== "undefined") {
      $httpClient.get({ url, headers }, (err, resp, body) => {
        try { resolve(JSON.parse(body || "{}")); } catch { resolve({ raw: body }); }
      });
    } else if (typeof $task !== "undefined") {
      $task.fetch({ url, method: "GET", headers }).then(r => {
        try { resolve(r.body.json()); } catch { resolve({ raw: r.body }); }
      }).catch(() => resolve(null));
    } else resolve(null);
  });
}

function postJson(url, headers, body) {
  return new Promise(resolve => {
    const opts = { url, headers, body: JSON.stringify(body) };
    if (typeof $httpClient !== "undefined") {
      $httpClient.post(opts, (err, resp, bodyStr) => {
        try { resolve(JSON.parse(bodyStr || "{}")); } catch { resolve({ raw: bodyStr }); }
      });
    } else if (typeof $task !== "undefined") {
      $task.fetch({ url, method: "POST", headers, body: JSON.stringify(body) }).then(r => {
        try { resolve(r.body.json()); } catch { resolve({ raw: r.body }); }
      }).catch(() => resolve(null));
    } else resolve(null);
  });
}

// ---------------------------
// 简易 Env 兼容层（保留原写入/读取方式）
function Env(name) {
  return {
    name,
    getdata(key) {
      try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
        return null;
      } catch (e) { return null; }
    },
    setdata(val, key) {
      try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key);
      } catch (e) { return false; }
    },
    msg(title, sub, body) {
      try { if (typeof $notification !== "undefined") $notification.post(title, sub, body); }
      catch (e) { console.log("通知失败：", e); }
    },
    done: function(v) { try { if (typeof $done !== "undefined") $done(v); } catch(e){} }
  };
}