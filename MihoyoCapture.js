/**
 * MihoyoCapture.js
 * 米游社 Cookie / SToken 稳定抓包脚本
 * Author: QinyRui
 */

const boxjs = typeof $boxjs !== "undefined" ? $boxjs : null;
const notify = $argument?.notify === "true" || $argument === "true";

if (!boxjs) {
  console.log("[米游社抓包] BoxJS 未连接");
  $done({});
}

// 抓包开关（双保险）
const captureEnable = boxjs.getItem("mihoyo.captureEnable");
if (captureEnable === "false") {
  console.log("[米游社抓包] 抓包开关关闭，跳过");
  $done({});
}

// 只处理 request
if (!$request || !$request.headers) {
  $done({});
}

const url = $request.url;
const headers = $request.headers;

// 只命中核心接口（防止乱触发）
if (
  !/api-takumi\.mihoyo\.com|bbs-api\.mihoyo\.com|passport-api\.mihoyo\.com/.test(
    url
  )
) {
  $done({});
}

// ===== 提取 Cookie =====
const rawCookie =
  headers.Cookie || headers.cookie || headers["Cookie"] || "";

if (!rawCookie) {
  console.log("[米游社抓包] 未检测到 Cookie");
  $done({});
}

// ===== 提取 SToken =====
const stoken =
  headers["x-rpc-stoken"] ||
  headers["X-Rpc-Stoken"] ||
  headers["x-rpc-stoken_v2"] ||
  "";

// ===== 校验关键字段 =====
if (!/cookie_token=|account_id=/.test(rawCookie) || !stoken) {
  console.log("[米游社抓包] Cookie / SToken 不完整，跳过");
  $done({});
}

// ===== 去重写入 =====
const oldCookie = boxjs.getItem("mihoyo.cookie");
const oldStoken = boxjs.getItem("mihoyo.stoken");

if (oldCookie === rawCookie && oldStoken === stoken) {
  console.log("[米游社抓包] 凭证未变化，跳过写入");
  $done({});
}

// ===== 写入 BoxJS =====
boxjs.setItem("mihoyo.cookie", rawCookie);
boxjs.setItem("mihoyo.stoken", stoken);

const now = new Date().toLocaleString();
boxjs.setItem("mihoyo.lastCaptureAt", now);

// ===== 通知 =====
if (notify) {
  $notification.post(
    "米游社抓包成功 ✅",
    "凭证已更新",
    `时间：${now}`
  );
}

console.log("[米游社抓包] Cookie / SToken 写入成功");
$done({});