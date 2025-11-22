/*
📱 九号智能电动车 · 自动签到（单号版 v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - cityCode 自动修复（解决 Params error）
  - 内测资格检测 + 自动申请
  - 抓包自动写入
  - 控制台增强日志（时间戳 + 多级别）
  - BoxJS 配置兼容
*/

// ========== 环境 ==========
const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ========== BoxJS Keys ==========
const KEY = {
  AUTH: "ninebot.authorization",
  DEV: "ninebot.deviceId",
  UA: "ninebot.userAgent",
  DEBUG: "ninebot.debug",
  NOTIFY: "ninebot.notify",
  AUTOBOX: "ninebot.autoOpenBox",
  AUTOREPAIR: "ninebot.autoRepair",
  AUTOAPPLY: "ninebot.autoApplyBeta",
  NOTIFYFAIL: "ninebot.notifyFail",
  TITLE: "ninebot.titlePrefix"
};

// ========== 抓包自动写入 ==========
if (isReq) {
  try {
    const h = $request.headers || {};
    const a = h["Authorization"] || h["authorization"];
    const d = h["DeviceId"] || h["deviceid"] || h["device_id"];
    const u = h["User-Agent"] || h["user-agent"];

    let changed = false;
    if (a && read(KEY.AUTH) !== a) { write(a, KEY.AUTH); changed = true; }
    if (d && read(KEY.DEV) !== d) { write(d, KEY.DEV); changed = true; }
    if (u && read(KEY.UA) !== u) { write(u, KEY.UA); changed = true; }

    if (changed) notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
  } catch (e) { }
  $done({});
}

// ========== 配置读取 ==========
const cfg = {
  Authorization: read(KEY.AUTH) || "",
  DeviceId: read(KEY.DEV) || "",
  UA: read(KEY.UA) || "",
  debug: read(KEY.DEBUG) !== "false",
  notify: read(KEY.NOTIFY) !== "false",
  autoOpenBox: read(KEY.AUTOBOX) === "true",
  autoRepair: read(KEY.AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY.AUTOAPPLY) === "true",
  notifyFail: read(KEY.NOTIFYFAIL) !== "false",
  titlePrefix: read(KEY.TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包写入 Authorization 与 DeviceId");
  $done();
}

// ========== 日志增强 ==========
function ts() {
  const d = new Date();
  return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}]`;
}
function log(...a) { console.log(ts(), ...a); }
function INFO(...a) { console.info(ts(), "ℹ️", ...a); }
function WARN(...a) { console.warn(ts(), "⚠️", ...a); }
function ERROR(...a) { console.error(ts(), "❌", ...a); }
function J(obj, title = "") { console.log(ts(), title, JSON.stringify(obj, null, 2)); }
function line(t = "") { console.log("\n========== " + t + " ==========\n"); }

// ========== HTTP ==========
function httpPost({ url, headers, body }) {
  return new Promise((res, rej) => {
    $httpClient.post({ url, headers, body }, (err, _resp, data) => {
      if (err) return rej(err);
      try { res(JSON.parse(data || "{}")); }
      catch { res({ raw: data }); }
    });
  });
}
function httpGet({ url, headers }) {
  return new Promise((res, rej) => {
    $httpClient.get({ url, headers }, (err, _resp, data) => {
      if (err) return rej(err);
      try { res(JSON.parse(data || "{}")); }
      catch { res({ raw: data }); }
    });
  });
}

// ========== API ==========
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  list: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  recv: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  userInfo: "https://cn-cbu-gateway.ninebot.com/app-api/user/v1/info",
  beta: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

const headers = {
  Authorization: cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.UA,
  platform: "h5",
  Origin: "https://h5-bj.ninebot.com",
  language: "zh"
};

// ========== 主流程 ==========
!(async () => {
  let out = "";
  line("开始执行");

  try {
    // -------- 0) 获取用户信息（为了 cityCode） --------
    line("获取用户信息");
    const info = await httpGet({ url: END.userInfo, headers });
    J(info, "用户信息");

    let cityCode =
      info?.data?.cityCode ||
      info?.data?.city_code ||
      "000000"; // 兜底，官方允许

    INFO("使用 cityCode =", cityCode);

    // -------- 1) 签到 --------
    line("签到请求");

    const signBody = { cityCode };
    J(signBody, "签到 Body");

    const sign = await httpPost({
      url: END.sign,
      headers,
      body: JSON.stringify(signBody)
    });

    J(sign, "签到返回");

    if (sign?.code === 0) {
      out += `🎉 签到成功 +${sign.data?.nCoin || sign.data?.score || 0} N币\n`;
    } else if (sign?.code === 540004) {
      out += `⚠️ 今日已签到\n`;
    } else {
      out += `❌ 签到失败：${sign?.msg || JSON.stringify(sign)}`;
      if (!cfg.notifyFail) out = "";
    }

    // -------- 2) 状态 --------
    line("签到状态");
    const st = await httpGet({ url: END.status, headers });
    J(st, "状态返回");

    if (st?.code === 0) {
      out += `🗓 连续：${st.data?.consecutiveDays || 0} 天\n`;
      out += `🎫 补签卡：${st.data?.signCardsNum || 0} 张\n`;
    }

    // -------- 3) 余额 --------
    line("查询余额");
    const bal = await httpGet({ url: END.balance, headers });
    J(bal, "余额返回");

    if (bal?.code === 0)
      out += `💰 余额：${bal.data?.balance || 0} N币\n`;

    // -------- 4) 盲盒 --------
    line("盲盒任务");
    const box = await httpGet({ url: END.list, headers });
    J(box, "盲盒列表");

    const arr = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(arr) && arr.length > 0) {
      out += `📦 盲盒：\n`;
      arr.forEach(b => {
        out += `- ${b.boxDays || b.days} 天盲盒，还需 ${b.leftDaysToOpen || 0} 天\n`;
      });

      if (cfg.autoOpenBox) {
        for (const b of arr) {
          if ((b.leftDaysToOpen === 0 || b.diffDays === 0) && b.status === 2) {
            const r = await httpPost({ url: END.recv, headers, body: "{}" });
            J(r, "盲盒领取返回");
            out += r?.code === 0
              ? `🎁 ${b.days}天盲盒领取成功\n`
              : `❌ ${b.days}天盲盒领取失败\n`;
          }
        }
      }
    }

    // -------- 5) 自动补签 --------
    if (cfg.autoRepair && st?.data?.signCardsNum > 0 && st?.data?.consecutiveDays === 0) {
      line("自动补签");
      const rep = await httpPost({ url: END.repair, headers, body: "{}" });
      J(rep, "补签返回");

      out += rep?.code === 0 ? "🔧 自动补签成功\n" : "❌ 自动补签失败\n";
    }

    // -------- 6) 内测资格 --------
    line("内测资格检查");
    const beta = await httpGet({ url: END.beta, headers });
    J(beta, "内测状态");

    if (beta?.data?.qualified) {
      out += "🚀 已获得内测资格\n";
    } else {
      out += "⚠️ 未获得内测资格\n";
      if (cfg.autoApplyBeta) {
        const ap = await httpPost({
          url: END.betaApply,
          headers,
          body: JSON.stringify({ deviceId: cfg.DeviceId })
        });
        J(ap, "内测申请返回");
        out += ap?.success ? "✨ 自动申请成功\n" : "❌ 自动申请失败\n";
      }
    }

    // -------- 通知 --------
    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", out);

  } catch (e) {
    ERROR("主流程异常", e);
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();