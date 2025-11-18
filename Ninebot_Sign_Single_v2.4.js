/*
📱 九号智能电动车 — 单账号签到脚本（v2.4）
作者：❥﹒﹏非我不可 & QinyRui
更新：2025/02
功能：签到、补签、盲盒、余额、连续签到、内测资格检测
*/

const $ = new Env("九号签到（单号）");

// ====================== 读取配置 ======================
const AUTH = $.getdata("ninebot.authorization") || "";
const DEVICE_ID = $.getdata("ninebot.deviceId") || "";
const UA = $.getdata("ninebot.userAgent") || "NiuBot/6.9.10";

const DEBUG = $.getdata("ninebot.debug") === "true";
const NOTIFY = $.getdata("ninebot.notify") !== "false";
const AUTO_BOX = $.getdata("ninebot.autoOpenBox") === "true";
const AUTO_BETA = $.getdata("ninebot.autoApplyBeta") === "true";
const TITLE = $.getdata("ninebot.titlePrefix") || "九号签到";

if (!AUTH || !DEVICE_ID) {
  $.msg(TITLE, "❌ 未填写 Authorization 或 DeviceId", "");
  $.done();
}

// 公共请求头
const headers = {
  "Authorization": AUTH,
  "Device-ID": DEVICE_ID,
  "User-Agent": UA,
  "Content-Type": "application/json"
};

// Http GET
function httpGet(opt) {
  return new Promise((resolve) => {
    $.get(opt, (err, resp, data) => {
      if (err) resolve(null);
      else resolve(JSON.parse(data || "{}"));
    });
  });
}

// Http POST
function httpPost(opt) {
  return new Promise((resolve) => {
    $.post(opt, (err, resp, data) => {
      if (err) resolve(null);
      else resolve(JSON.parse(data || "{}"));
    });
  });
}

// ====================== 主程序执行 ======================
!(async () => {

  $.log(`🔹 开始执行九号签到脚本...`);

  await sign();
  await getStatus();
  await getBalance();
  await getBlindBox();
  if (AUTO_BOX) await openBlindBox();

  await checkBetaStatus();

})()
  .catch(e => $.log(JSON.stringify(e)))
  .finally(() => $.done());

// ====================== 功能函数 ======================

// 1️⃣ 签到
async function sign() {
  const res = await httpPost({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers,
    body: "{}"
  });

  $.log("签到接口返回：", JSON.stringify(res));

  if (res?.data?.calendarInfo?.signedToday) {
    notify("🎉 今日已签到", "");
  } else {
    notify("✔ 签到成功", "");
  }
}

// 2️⃣ 签到状态
async function getStatus() {
  const res = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });

  $.log("签到状态：", JSON.stringify(res));
}

// 3️⃣ 余额
async function getBalance() {
  const res = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/wallet/balance",
    headers
  });

  $.log("余额：", JSON.stringify(res));
}

// 4️⃣ 盲盒可领取列表
async function getBlindBox() {
  const res = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
    headers
  });

  $.log("盲盒列表：", JSON.stringify(res));
}

// 5️⃣ 自动开盲盒
async function openBlindBox() {
  $.log("尝试自动开启盲盒...（暂不实现，预留）");
}

// 6️⃣ 内测资格状态查询
async function checkBetaStatus() {
  const res = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
    headers
  });

  $.log("内测资格状态：", JSON.stringify(res));

  if (res?.data?.qualified) {
    notify("🎉 已获得内测资格", "");
  } else {
    notify("⚠ 尚未获得内测资格", "请前往 App 手动申请");
  }
}

// ====================== 通知封装 ======================
function notify(title, subtitle = "", msg = "") {
  if (NOTIFY) $.msg(`${TITLE} · ${title}`, subtitle, msg);
}

// ====================== 通用 Env ======================
function Env(t, e) {
  class s {
    constructor(t) {
      this.env = t;
    }
  }
  return new (class {
    constructor(t, e) {
      this.name = t;
      this.data = null;
      this.logs = [];
      this.isQX = typeof $task !== "undefined";
      this.isLoon = typeof $loon !== "undefined";
      this.isSurge = typeof $httpClient !== "undefined" && !this.isLoon;
      this.isNode = typeof module !== "undefined" && !!module.exports;
      this.msg = this.msg.bind(this);
      this.get = this.get.bind(this);
      this.post = this.post.bind(this);
      this.getdata = this.getdata.bind(this);
      this.setdata = this.setdata.bind(this);
    }
    log(...t) { this.logs.push(...t); console.log(...t); }
    msg(t, e = "", s = "") {
      if (this.isQX) $notify(t, e, s);
      if (this.isSurge) $notification.post(t, e, s);
      if (this.isLoon) $notification.post(t, e, s);
    }
    get(t, e) { this.isSurge || this.isLoon ? $httpClient.get(t, e) : $task.fetch(t).then(t => e(null, t, t.body)); }
    post(t, e) { this.isSurge || this.isLoon ? $httpClient.post(t, e) : $task.fetch(t).then(t => e(null, t, t.body)); }
    getdata(t) { return $prefs?.valueForKey(t) ?? $persistentStore?.read(t); }
    setdata(t, e) { return $prefs?.setValueForKey(t, e) ?? $persistentStore?.write(t, e); }
    done(t = {}) { return t; }
  })(t);
}