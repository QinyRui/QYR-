/*
🛵 九号智能电动车 · 自动签到（单账号）
版本：v2.6
作者：❥﹒﹏非我不可 & QinyRui
更新：2025-11-21
支持：自动签到 + 自动盲盒 + 自动补签 + 自动内测申请 + 抓包写入 + B 级美化通知
*/

const $ = new Env("九号智能电动车签到");

const STORAGE_KEY = "NINEBOT_ACCOUNT";
let account = $.getdata(STORAGE_KEY) ? JSON.parse($.getdata(STORAGE_KEY)) : {};

const NEED_HEADER = ["Authorization", "DeviceId", "User-Agent"];

// =====================================
// ① 抓包写入模块（只写一次通知）
// =====================================
if (typeof $request !== "undefined" && $request.headers) {
  let changed = false;
  NEED_HEADER.forEach(key => {
    const v = $request.headers[key] || $request.headers[key.toLowerCase()];
    if (v && account[key] !== v) {
      account[key] = v;
      changed = true;
    }
  });

  if (changed) {
    $.setdata(JSON.stringify(account), STORAGE_KEY);
    $.notify(
      "🛵 九号抓包写入成功",
      "",
      `已自动写入以下信息：\n- Authorization\n- DeviceId\n- User-Agent\n\n现在可以关闭抓包`
    );
  }

  $.done({});
}

// =====================================
// ② 主逻辑 · 自动签到
// =====================================
!(async () => {
  if (!account.Authorization || !account["DeviceId"]) {
    $.notify("九号签到 · 配置缺失", "", "未找到 Authorization / DeviceId，请先打开九号 APP 抓包写入。");
    return $.done();
  }

  const headers = {
    Authorization: account.Authorization,
    DeviceId: account["DeviceId"],
    "User-Agent": account["User-Agent"] || "ningbo"
  };

  // ==============================
  // 签到
  // ==============================
  const signRes = await request("POST", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", headers);

  let signStatus = signRes?.msg || signRes?.data?.signMessage || "未知";
  let continueDays = signRes?.data?.continuityDays || 0;
  let repairCard = signRes?.data?.makeUpCardCount || 0;

  // ==============================
  // 余额
  // ==============================
  const balanceRes = await request("GET", "https://cn-cbu-gateway.ninebot.com/portal/api/user/balance", headers);
  const coin = balanceRes?.data?.nbalance || 0;

  // ==============================
  // 盲盒任务
  // ==============================
  const boxRes = await request("GET", "https://cn-cbu-gateway.ninebot.com/portal/api/sign/blind-box/list", headers);
  const blindBoxList = (boxRes?.data || []).map(box => ({
    name: `${box.boxDay}天盲盒`,
    leftDays: box.leftDays
  }));

  // ==============================
  // 内测资格 + 自动申请
  // ==============================
  const betaRes = await request("GET", "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/status", headers);
  let internalTest = betaRes?.data?.betaStatus || "未知";

  let internalApplyError = null;

  if (internalTest !== "SUCCESS") {
    const applyRes = await request(
      "POST",
      "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
      headers
    );
    if (applyRes?.status !== 200 && applyRes?.code !== 0) {
      internalApplyError = JSON.stringify(applyRes, null, 2);
    }
  }

  // ==============================
  // B 级美化通知
  // ==============================
  sendPrettyNotify({
    signStatus,
    continueDays,
    repairCard,
    coin,
    blindBoxList,
    internalTest,
    internalApplyError
  });

  $.done();
})();

// =====================================
// HTTP 封装
// =====================================
function request(method, url, headers, body = null) {
  return new Promise(resolve => {
    $.send(
      {
        url,
        method,
        headers,
        body
      },
      (err, resp, data) => {
        if (err) return resolve({ error: err });
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ parse_error: e, raw: data });
        }
      }
    );
  });
}

// ==========================================
// 🛵 B 风格美化通知模块（最终版）
// ==========================================
function sendPrettyNotify(result) {
  const {
    signStatus,
    continueDays,
    repairCard,
    coin,
    blindBoxList,
    internalTest,
    internalApplyError
  } = result;

  const blindBoxText = blindBoxList
    .map(box => `• 🎁 ${box.name}：还需 **${box.leftDays} 天**`)
    .join("\n");

  let internalText = `• 📌 当前状态：**${internalTest}**`;
  if (internalApplyError) {
    internalText += `\n• ❌ 自动申请失败：\n\`\`\`\n${internalApplyError}\n\`\`\``;
  }

  const notifyBody = `
🛵 **九号 · 今日结果**

**① 签到状态**  
• 📅 今日签到：**${signStatus}**  
• 🔁 连续签到：**${continueDays} 天**  
• 🎟️ 补签卡：**${repairCard} 张**  
• 💰 N 币余额：**${coin}**

---

**② 盲盒任务**  
${blindBoxText}

---

**③ 内测资格状态**  
${internalText}
`;

  $.notify("🛵 九号 · 今日结果", "", notifyBody);
}

// =====================================
// Env 环境
// =====================================
function Env(t) {
  return new class {
    constructor(name) {
      this.name = name;
    }
    getdata(key) {
      return $persistentStore.read(key);
    }
    setdata(val, key) {
      return $persistentStore.write(val, key);
    }
    notify(title, sub, body) {
      $notification.post(title, sub, body);
    }
    send(opts, cb) {
      if (opts.method === "POST") $httpClient.post(opts, cb);
      else $httpClient.get(opts, cb);
    }
    done(value = {}) {
      $done(value);
    }
  }(t);
}