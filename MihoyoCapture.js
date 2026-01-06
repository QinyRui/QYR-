/**
 * MihoyoCapture.js
 * Loon / Surge / QX / BoxJS 通用抓包脚本
 */

const notify = $argument?.notify === "true" || $argument === "true";

// ===== 存储封装 =====
function getData(key) {
  return typeof $boxjs !== "undefined"
    ? $boxjs.getItem(key)
    : $persistentStore.read(key);
}

function setData(key, value) {
  if (typeof $boxjs !== "undefined") {
    $boxjs.setItem(key, value);
  } else {
    $persistentStore.write(value, key);
  }
}

// ===== 抓包开关 =====
const captureEnable = getData("mihoyo.captureEnable");
if (captureEnable === "false") {
  console.log("[米游社抓包] 抓包开关关闭");
  $done({});
}

if (!$request || !$request.headers) $done({});

const url = $request.url;
if (
  !/api-takumi\.mihoyo\.com|bbs-api\.mihoyo\.com|passport-api\.mihoyo\.com/.test(
    url
  )
) {
  $done({});
}

// ===== 提取 Cookie / SToken =====
const headers = $request.headers;
const cookie =
  headers.Cookie || headers.cookie || headers["Cookie"] || "";

const stoken =
  headers["x-rpc-stoken"] ||
  headers["X-Rpc-Stoken"] ||
  headers["x-rpc-stoken_v2"] ||
  "";

if (!cookie || !stoken) $done({});

// ===== 校验 =====
if (!/cookie_token=|account_id=/.test(cookie)) $done({});

// ===== 去重 =====
if (
  getData("mihoyo.cookie") === cookie &&
  getData("mihoyo.stoken") === stoken
) {
  console.log("[米游社抓包] 凭证未变化");
  $done({});
}

// ===== 写入 =====
setData("mihoyo.cookie", cookie);
setData("mihoyo.stoken", stoken);
setData("mihoyo.lastCaptureAt", new Date().toLocaleString());

if (notify) {
  $notification.post("米游社抓包成功 ✅", "凭证已更新", "");
}

console.log("[米游社抓包] 写入成功");
$done({});