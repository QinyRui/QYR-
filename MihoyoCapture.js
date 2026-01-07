/*************************************************
 * Mihoyo Credential Capture - Enhanced Edition
 * Single Account Only
 * Author: @QinyRui
 *************************************************/

if (typeof $request === "undefined") {
  $done({});
  return;
}

const $store = $persistentStore;
const $notify = $notification;

/* ================= 日志系统 ================= */

const LOG_LEVEL = $store.read("mihoyo.logLevel") || "simple";
const LEVEL = { silent: 0, simple: 1, full: 2 };

function log(msg, level = "simple") {
  if ((LEVEL[LOG_LEVEL] ?? 1) >= LEVEL[level]) {
    console.log(`[Mihoyo][Capture] ${msg}`);
  }
}

/* ================= 开关判断 ================= */

if ($store.read("mihoyo.captureEnable") === "false") {
  log("自动抓包已关闭", "full");
  $done({});
  return;
}

/* ================= 请求基本信息 ================= */

const headers = $request.headers || {};
const url = $request.url || "";

const cookie =
  headers.Cookie ||
  headers.cookie ||
  "";

const ua =
  headers["User-Agent"] ||
  headers["user-agent"] ||
  "";

/* ================= 触发条件过滤 ================= */

// 只在米游社 API 域名下工作
if (!/bbs-api\.mihoyo\.com/.test(url)) {
  $done({});
  return;
}

// 最低 Cookie 有效性
if (!cookie || !/cookie_token=/.test(cookie)) {
  log("Cookie 不完整，跳过", "full");
  $done({});
  return;
}

/* ================= 提取 SToken ================= */

let stoken = "";
const stokenMatch = cookie.match(/stoken=([^;]+)/);
if (stokenMatch) {
  stoken = stokenMatch[1];
}

if (!stoken) {
  log("未发现 SToken，跳过写入", "simple");
  $done({});
  return;
}

/* ================= 旧凭证对比 ================= */

const oldCookie = $store.read("mihoyo.cookie") || "";
const oldStoken = $store.read("mihoyo.stoken") || "";

if (cookie === oldCookie && stoken === oldStoken) {
  log("凭证未发生变化，忽略写入", "full");
  $done({});
  return;
}

/* ================= 写入 BoxJS ================= */

$store.write(cookie, "mihoyo.cookie");
$store.write(stoken, "mihoyo.stoken");

if (ua) {
  $store.write(ua, "mihoyo.userAgent");
}

$store.write("已捕获", "mihoyo.captureStatus");
$store.write(String(Date.now()), "mihoyo.lastCaptureAt");

log("新凭证已写入 BoxJS", "simple");

/* ================= 抓包成功通知（可选） ================= */

if ($store.read("mihoyo.notify") !== "false") {
  $notify.post(
    "米游社凭证捕获成功",
    "Cookie / SToken 已更新",
    "可关闭 App，无需再次抓包"
  );
}

$done({});