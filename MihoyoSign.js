/*************************************************
 * Mihoyo Auto Sign - Ultimate Anti-Risk Edition
 * Author: @QinyRui
 * Support: Surge / Loon / Quantumult X
 *************************************************/

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

/* ================= 环境校验 ================= */

if (typeof $request !== "undefined") {
  log("检测到抓包环境，跳过执行", "simple");
  $done();
  return;
}

log("脚本开始执行", "full");

/* ================= 凭证校验 ================= */

if (!config.cookie || !config.stoken) {
  writeStatus("凭证缺失");
  log("未检测到 Cookie / SToken", "simple");

  if (config.notifyFail) {
    notify("❌ 凭证缺失", "请打开米游社 App 重新抓包");
  }
  $done();
  return;
}

log("凭证读取成功", "full");

/* ================= 请求配置 ================= */

const request = {
  url: "https://bbs-api.mihoyo.com/apihub/sapi/signIn",
  method: "POST",
  headers: {
    Cookie: config.cookie,
    "User-Agent": config.ua,
    Referer: "https://bbs.mihoyo.com/",
    "x-rpc-app_version": "2.50.1",
    "x-rpc-client_type": "2"
  }
};

log("发起签到请求", "full");

/* ================= 发起请求 ================= */

$httpClient.post(request, (err, resp, data) => {
  if (err) {
    handleFail("请求异常", err);
    $done();
    return;
  }

  log(`HTTP 状态码：${resp?.status}`, "full");

  /* ====== ① 无返回数据 ====== */
  if (!data || typeof data !== "string") {
    handleFail("接口无返回数据", "Empty response");
    $done();
    return;
  }

  const text = data.trim();
  log(`原始响应前 120 字符：${text.slice(0, 120)}`, "full");

  /* ====== ② 非 JSON（HTML / 文本 / 风控） ====== */
  if (!text.startsWith("{")) {
    let reason = "接口返回非 JSON（疑似风控）";

    if (/403|forbidden/i.test(text)) reason = "403 风控拦截";
    if (/login|sign in/i.test(text)) reason = "登录态失效";

    writeStatus(reason);
    log(reason, "simple");

    if (config.notifyFail) {
      notify("❌ 签到失败", reason + "，请重新抓包");
    }
    $done();
    return;
  }

  /* ====== ③ JSON 解析 ====== */
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    handleFail("JSON 解析失败", e);
    $done();
    return;
  }

  log(`解析成功：retcode=${json.retcode}`, "full");

  /* ====== ④ 业务判断 ====== */
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
    notify("✅ 签到成功", res.message || "今日签到完成");
  }
}

function handleApiFail(res) {
  let reason = res.message || "未知错误";

  if (res.retcode === -100) reason = "登录失效（Cookie 过期）";
  if (res.retcode === -5003) reason = "今日已签到";
  if (res.retcode === -10002) reason = "SToken 失效";

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

/* ================= BoxJS 状态写入 ================= */

function writeStatus(text) {
  $store.write(text, "mihoyo.captureStatus");
}

/* ================= 通知封装 ================= */

function notify(subtitle, body = "") {
  $notify.post(config.title, subtitle, body);
}