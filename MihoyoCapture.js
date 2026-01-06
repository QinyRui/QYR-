/*
 * 米游社抓包脚本（带核心接口提醒+全量抓取）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：核心接口识别、凭证存在提醒、不跳过任何接口
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置（强制full，便于调试）
const LOG_LEVEL = "full";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS/Loon本地存储封装（兼容双存储）
const store = {
  get: (key) => boxjs ? boxjs.getItem(key) || "" : ($persistentStore.read(key) || ""),
  set: (key, val) => {
    if (boxjs) {
      boxjs.setItem(key, val);
      log("debug", `写入BoxJS：${key}=${val ? "有数据" : "空"}`);
    } else {
      $persistentStore.write(val, key);
      log("debug", `写入Loon本地：${key}=${val ? "有数据" : "空"}`);
    }
  }
};

// 【新增】核心接口列表（米游社签到/账号接口，必带凭证）
const CORE_API_LIST = [
  "/event/luna/hk4e/",    // 原神签到接口
  "/event/luna/sr/",      // 星穹铁道签到接口
  "/event/luna/zzz/",     // 绝区零签到接口
  "/bbs/api/account/",    // 账号信息接口
  "/community/apihub/"    // 社区签到接口
];

// 【新增】判断是否为核心接口
function isCoreApi(url) {
  return CORE_API_LIST.some(api => url.includes(api));
}

// 【新增】核心接口+凭证提醒
function sendCoreApiTip(url, hasCookie, hasStoken) {
  if (!notify) return;
  let content = `检测到米游社核心接口：\n${url}\n\n`;
  content += hasCookie ? "✅ 已提取Cookie\n" : "❌ 无Cookie\n";
  content += hasStoken ? "✅ 已提取SToken\n" : "❌ 无SToken\n";
  content += hasCookie && hasStoken ? "🎉 凭证完整，可直接签到" : "⚠️ 凭证缺失，请重新登录米游社";
  
  $notification.post(
    `${titlePrefix} - 核心接口捕获`,
    hasCookie && hasStoken ? "凭证完整 ✅" : "凭证缺失 ⚠️",
    content
  );
}

// 核心抓包逻辑（强制开启，不跳过任何接口）
(function main() {
  log("info", "抓包脚本启动（强制开启，不跳过任何米游社接口）");

  if (typeof $request === 'undefined') {
    log("error", "无请求对象，无法捕获米游社接口");
    notify && $notification.post(titlePrefix, "抓包失败", "未捕获到米游社HTTP请求");
    $done({});
    return;
  }

  const requestUrl = $request.url;
  const headers = $request.headers || {};
  log("debug", `捕获请求URL：${requestUrl}`);
  log("debug", `请求头完整数据：${JSON.stringify(headers)}`);

  // 全量提取凭证（不筛选）
  const cookie = headers.Cookie || "";
  const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";
  const userAgent = headers["User-Agent"] || "";

  // 判断是否为核心接口+是否有凭证
  const coreApiFlag = isCoreApi(requestUrl);
  const hasCookie = cookie.length > 0;
  const hasStoken = stoken.length > 0;

  // 写入存储
  const updateFields = [];
  if (hasCookie) {
    store.set("mihoyo.cookie", cookie);
    updateFields.push("Cookie（全量）");
  }
  if (hasStoken) {
    store.set("mihoyo.stoken", stoken);
    updateFields.push("SToken（x-rpc-stoken）");
  }
  if (userAgent) {
    store.set("mihoyo.userAgent", userAgent);
    updateFields.push("User-Agent");
  }

  // 更新抓包时间
  const captureTime = new Date().toLocaleString();
  store.set("mihoyo.lastCaptureAt", captureTime);

  // 【关键】核心接口+凭证提醒
  if (coreApiFlag) {
    sendCoreApiTip(requestUrl, hasCookie, hasStoken);
    log("info", `核心接口捕获：${requestUrl} | Cookie：${hasCookie ? "有" : "无"} | SToken：${hasStoken ? "有" : "无"}`);
  } else {
    // 非核心接口，普通通知
    if (notify && updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功（非核心接口）",
        `提取到：${updateFields.join("、")}\n接口：${requestUrl}\n时间：${captureTime}`
      );
    } else if (notify && !coreApiFlag && updateFields.length === 0) {
      log("debug", `非核心接口无凭证：${requestUrl}`);
    }
  }

  $done({});
})();