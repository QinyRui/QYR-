/*
📱 九号智能电动车 自动签到脚本（调试增强版）
👤 作者：❥﹒﹏非我不可（优化 by ChatGPT）
📆 调试版：2025/11/14
🔧 适用：Loon / Surge / QuanX / Stash / Shadowrocket
*/

const $ = new Env("Ninebot Auto Sign (Debug)");

const AUTH_KEY = "Ninebot_Authorization";
const DEVICE_KEY = "Ninebot_DeviceId";

const authorization = $.getdata(AUTH_KEY);
const deviceId = $.getdata(DEVICE_KEY);

// 调试输出 —— 无论是否为空都打印
console.log("🔹 Authorization:", authorization || "❌ 未获取到");
console.log("🔹 DeviceId:", deviceId || "❌ 未获取到");

if (!authorization || !deviceId) {
  console.log("\n❗ 未获取到 Authorization / DeviceId");
  console.log("👉 请前往九号 App 任意页面（任务中心/签到页）并重新抓包");
  console.log("👉 或在 BoxJS 手动填写 Token\n");
  $.msg(
    "九号签到 - Token 未配置",
    "",
    "❗ 未检测到 Authorization 或 DeviceId\n请重新抓包或在 BoxJS 中填写"
  );
  $.done();
  return;
}

console.log("🚀 开始执行九号签到...");

const headers = {
  "Authorization": authorization,
  "DeviceId": deviceId,
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
  "Content-Type": "application/json"
};

async function run() {
  try {
    // 请求签到
    console.log("🔹 请求 /sign 接口...");
    const signResp = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign");
    console.log("📄 /sign 接口返回 JSON:", signResp);

    // 请求签到状态
    console.log("🔹 请求 /status 接口...");
    const statusResp = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");
    console.log("📄 /status 接口返回 JSON:", statusResp);

    // 查询 N 币余额
    console.log("🔹 请求 /balance 接口...");
    const balanceResp = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/account/balance");
    console.log("📄 /balance 接口返回 JSON:", balanceResp);

    // 查询盲盒状态
    console.log("🔹 请求 /blind-box/list 接口...");
    const boxResp = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list");
    console.log("📄 /blind-box/list 接口返回 JSON:", boxResp);

    console.log("✅ 九号签到完成");

    // 通知
    $.msg(
      "九号签到完成",
      "",
      `✔ 今日签到状态: ${statusResp?.data?.currentSignStatus}\n` +
      `📅 连续签到: ${statusResp?.data?.consecutiveDays} 天\n` +
      `💰 当前余额: ${balanceResp?.data?.balance || 0} N币`
    );

  } catch (e) {
    console.log("❌ 运行错误:", e);
    $.msg("九号签到 - 错误", "", String(e));
  }

  $.done();
}

function httpGet(url) {
  return new Promise(resolve => {
    $.get({ url, headers }, (err, resp, data) => {
      if (err) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function httpPost(url) {
  return new Promise(resolve => {
    $.post({ url, headers, body: "{}" }, (err, resp, data) => {
      if (err) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

run();


/*** Env（兼容多平台） ***/
function Env(t, e) {
  class s {
    constructor(t) { this.env = t }
    send(t, e = "GET") {
      t = "string" == typeof t ? { url: t } : t;
      let s = this.get;
      return "POST" === e && (s = this.post), new Promise((e, r) => {
        s.call(this, t, (t, s, i) => {
          t ? r(t) : e(s)
        })
      })
    }
    get(t) { this.env.get(t) }
    post(t) { this.env.post(t) }
  }
  return new class {
    constructor(t, e) {
      this.name = t, this.data = null, this.logs = [], this.isMute = !1,
        this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(),
        Object.assign(this, e), this.log("", `🔧 ${this.name} 初始化完成`)
    }
    getdata(t) {
      return this.isSurge() || this.isLoon()
        ? $persistentStore.read(t)
        : this.isQuanX()
          ? $prefs.valueForKey(t)
          : this.data && this.data[t] || null
    }
    msg(t = this.name, e = "", s = "") {
      if (this.isSurge() || this.isLoon()) $notification.post(t, e, s);
      else if (this.isQuanX()) $notify(t, e, s)
    }
    get(t, e = (() => { })) {
      if (this.isSurge() || this.isLoon()) $httpClient.get(t, e);
      else if (this.isQuanX()) t.method = "GET", $task.fetch(t).then(t => e(null, t, t.body))
    }
    post(t, e = (() => { })) {
      if (this.isSurge() || this.isLoon()) $httpClient.post(t, e);
      else if (this.isQuanX()) t.method = "POST", $task.fetch(t).then(t => e(null, t, t.body))
    }
    isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon }
    isLoon() { return "undefined" != typeof $loon }
    isQuanX() { return "undefined" != typeof $task }
    log(...t) { this.logs.push(...t), console.log(t.join(this.logSeparator)) }
    done(t = {}) { console.log("------ Script done -------"); }
  }(t, e)
}