/*
九号智能电动车 单账号 自动签到 v2.4
作者：❥﹒﹏非我不可 & QinyRui
支持：签到 / 状态 / 盲盒 / 内测检测
*/

const $ = new Env("Ninebot_Single");

const AUTH = $.getdata("ninebot.authorization") || "";
const DEVICE = $.getdata("ninebot.deviceId") || "";
const UA = $.getdata("ninebot.userAgent") || "Mozilla/5.0";
const DEBUG = $.getdata("ninebot.debug") === "true";
const NOTIFY = $.getdata("ninebot.notify") !== "false";
const AUTO_BOX = $.getdata("ninebot.autoOpenBox") !== "false";

const TITLE = $.getdata("ninebot.titlePrefix") || "九号签到";

const headers = {
  Authorization: AUTH,
  DeviceId: DEVICE,
  "User-Agent": UA,
  "Content-Type": "application/json"
};

function httpGet(opt) {
  return new Promise(resolve => {
    $.get(opt, (err, resp, data) => {
      if (DEBUG) $.log("GET 返回：", data);
      if (err) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function httpPost(opt) {
  return new Promise(resolve => {
    $.post(opt, (err, resp, data) => {
      if (DEBUG) $.log("POST 返回：", data);
      if (err) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

async function main() {

  $.log("开始签到流程...\n");

  // 1. 签到
  const sign = await httpPost({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers
  });

  // 2. 状态
  const status = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });

  // 3. 盲盒
  let box = {};
  if (AUTO_BOX) {
    box = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/open",
      headers
    });
  }

  // 4. 内测资格检测
  const beta = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
    headers
  });

  let msg = "";

  msg += `签到返回：${JSON.stringify(sign)}\n`;
  msg += `状态：${JSON.stringify(status)}\n`;
  msg += `盲盒结果：${JSON.stringify(box)}\n`;
  msg += `内测状态：${JSON.stringify(beta)}\n`;

  if (NOTIFY) $.msg(TITLE, "签到完成", msg);
  $.log(msg);
}

main().finally(() => $.done());

// ---------------- Env 模块 ----------------
function Env(name) {
  return new class {
    constructor(name) { this.name = name; }
    getdata(k) { return $persistentStore.read(k) || ""; }
    setdata(v, k) { return $persistentStore.write(v, k); }
    log(...x) { console.log(...x); }
    msg(t, s, m) { $notification.post(t, s, m); }
    get(opt, cb) { $httpClient.get(opt, cb); }
    post(opt, cb) { $httpClient.post(opt, cb); }
    done() { }
  };
}