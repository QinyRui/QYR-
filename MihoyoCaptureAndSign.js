/**
 * 米游社抓包 + 自动签到
 * 打开米游社即抓包，并立即触发签到
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

// ===== 匹配米游社 API =====
if (!$request || !$request.headers) $done({});

const url = $request.url;
if (!/api-takumi\.mihoyo\.com|bbs-api\.mihoyo\.com|passport-api\.mihoyo\.com/.test(url)) {
  $done({});
}

// ===== 提取 Cookie / SToken =====
const headers = $request.headers;
const cookie = headers.Cookie || headers.cookie || headers["Cookie"] || "";
const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";

if (!cookie || !stoken) $done({});

// ===== 去重 =====
if (getData("mihoyo.cookie") === cookie && getData("mihoyo.stoken") === stoken) {
  console.log("[米游社抓包] 凭证未变化");
  $done({});
}

// ===== 写入存储 =====
setData("mihoyo.cookie", cookie);
setData("mihoyo.stoken", stoken);
setData("mihoyo.lastCaptureAt", new Date().toLocaleString());

if (notify) {
  $notification.post("米游社抓包成功 ✅", "凭证已更新", "");
}

console.log("[米游社抓包] 写入成功");

// ===== 自动触发签到 =====
(async () => {
  const signScript = "https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.js";

  if (typeof $httpClient !== "undefined") {
    // Loon / QX 异步执行
    await $httpClient.get({ url: signScript }, () => {});
  } else if (typeof $task !== "undefined") {
    // Surge / Quantumult X
    $task.fetch({ url: signScript });
  }

  console.log("[米游社抓包] 自动触发签到完成");
})();

$done({});