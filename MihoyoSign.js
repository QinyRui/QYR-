/*****************************************
 * Mihoyo Auto Sign - Ultimate Edition
 * Author: @QinyRui
 * Support: Surge / Loon / Quantumult X
 *****************************************/

const $store = $persistentStore;
const $notify = $notification;

/* ================= 配置读取 ================= */

const config = {
  cookie: $store.read("mihoyo.cookie"),
  stoken: $store.read("mihoyo.stoken"),
  ua: $store.read("mihoyo.userAgent") || "miHoYoBBS",
  title: $store.read("mihoyo.titlePrefix") || "米游社签到",
  notify: $store.read("mihoyo.notify") !== "false",
  notifyFail: $store.read("mihoyo.notifyFail") !== "false",
  logLevel: $store.read("mihoyo.logLevel") || "simple"
};

/* ================= 日志系统 ================= */

const LEVEL = { silent: 0, simple: 1, full: 2 };

function log(msg, level = "simple") {
  if ((LEVEL[config.logLevel] ?? 1) >= LEVEL[level]) {
    console.log(`[Mihoyo] ${msg}`);
  }
}

/* ================= 运行环境校验 ================= */

if (typeof $request !== "undefined") {
  log("当前为抓包环境，终止执行", "simple");
  $done();
  return;
}

log("脚本开始执行", "full");

/* ================= 凭证校验 ================= */

if (!config.cookie || !config.stoken) {
  log("凭证缺失（cookie / stoken）", "simple");
  writeStatus("凭证缺失");

  if (config.notifyFail) {
    notify("❌ 凭证缺失", "请打开米游社 App 重新抓包");
  }
  $done();
  return;
}

log("凭证读取成功", "full");

/* ================= 签到请求 ================= */

const request = {
  url: "https://bbs-api.mihoyo.com/apihub/sapi/signIn",
  method: "POST",
  headers: {
    Cookie: config.cookie,
    "User-Agent": config.ua,
    Referer: "https://bbs.mihoyo.com/"
  }
};

log("发起签到请求", "full");

$httpClient.post(request, (err, resp, data) => {
  if (err) {
    handleFail("请求异常", err);
    $done();
    return;
  }

  log(`接口响应：${data}`, "full");

  let json;
  try {
    json = JSON.parse(data);
  } catch (e) {
    handleFail("解析失败", e);
    $done();
    return;
  }

  if (json.retcode === 0) {
    handleSuccess(json);
  } else {
    handleApiFail(json);
  }

  $done();
});

/* ================= 结果处理 ================= */

function handleSuccess(res) {
  writeStatus("签到成功");
  log("签到成功", "simple");

  if (config.notify) {
    notify("✅ 签到成功", res.message || "今日已完成签到");
  }
}

function handleApiFail(res) {
  let reason = res.message || "未知错误";

  if (res.retcode === -100) reason = "登录失效（Cookie 过期）";
  if (res.retcode === -5003) reason = "今日已签到";

  writeStatus(reason);
  log(`签到失败：${reason}`, "simple");

  if (config.notifyFail) {
    notify("❌ 签到失败", reason);
  }
}

function handleFail(title, err) {
  writeStatus(title);
  log(`${title}：${err}`, "simple");

  if (config.notifyFail) {
    notify(`❌ ${title}`, String(err));
  }
}

/* ================= BoxJS 状态回写 ================= */

function writeStatus(text) {
  $store.write(text, "mihoyo.captureStatus");
}

/* ================= 通知封装 ================= */

function notify(subtitle, body = "") {
  $notify.post(config.title, subtitle, body);
}