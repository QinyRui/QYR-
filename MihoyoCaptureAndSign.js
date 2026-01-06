/**
 * 米游社抓包 + 自动签到整合版
 * 支持 Loon / QX / Surge / BoxJS
 * Author: QinyRui
 */

const notify = $argument?.notify === "true" || $argument === "true";

// ===== 存储封装 =====
function getData(key) {
  return $persistentStore.read(key) || "";
}
function setData(key, value) {
  $persistentStore.write(value, key);
  if (typeof $boxjs !== "undefined") $boxjs.setItem(key, value);
}

// ===== 保护 $request =====
if (typeof $request === "undefined" || !$request.headers) {
    console.log("[米游社抓包] 非 http-request 环境，跳过抓包，仅触发签到");
    triggerSign();
    $done({});
}

// ===== http-request 环境抓包 =====
const headers = $request.headers;
const cookie = headers.Cookie || headers.cookie || headers["Cookie"] || "";
const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";

if (!cookie || !stoken) {
  console.log("[米游社抓包] 未捕获到 Cookie / SToken");
  triggerSign();
  $done({});
}

// 去重
if (getData("mihoyo.cookie") === cookie && getData("mihoyo.stoken") === stoken) {
  console.log("[米游社抓包] 凭证未变化");
  triggerSign();
  $done({});
}

// 写入存储
setData("mihoyo.cookie", cookie);
setData("mihoyo.stoken", stoken);
setData("mihoyo.lastCaptureAt", new Date().toLocaleString());
if (notify) $notification.post("米游社抓包成功 ✅", "凭证已更新", "");

console.log("[米游社抓包] 写入成功");

// 自动触发签到
triggerSign();
$done({});

// ====== 签到触发函数 ======
function triggerSign() {
  const signScript = "https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.js";
  if (typeof $httpClient !== "undefined") {
    // Loon / QX
    $httpClient.get({ url: signScript }, () => {});
  } else if (typeof $task !== "undefined") {
    // Surge / Quantumult X
    $task.fetch({ url: signScript });
  }
  console.log("[米游社抓包] 自动触发签到完成");
}