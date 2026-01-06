/*
 * 米游社抓包脚本（适配九号BoxJS配置）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 功能：提取Cookie/SToken并写入BoxJS，支持日志分级、通知开关
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true"; // 插件传递的全局通知开关
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置（匹配BoxJS的mihoyo.logLevel字段）
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS数据读写封装（统一字段命名）
const store = {
  get: (key) => boxjs ? boxjs.getItem(key) || "" : "",
  set: (key, val) => {
    if (boxjs) {
      boxjs.setItem(key, val);
      log("debug", `写入BoxJS：${key}=${val ? "有数据" : "空"}`);
    }
  }
};

// 核心抓包逻辑
(function main() {
  // 1. 校验BoxJS连接
  if (!boxjs) {
    log("error", "BoxJS未连接，抓包脚本终止");
    notify && $notification.post(titlePrefix, "抓包失败", "BoxJS未初始化，请检查授权");
    $done({});
    return;
  }

  // 2. 读取抓包开关（匹配mihoyo.captureEnable）
  const captureEnable = store.get("mihoyo.captureEnable") === "true";
  if (!captureEnable) {
    log("warn", "自动抓包开关已关闭，抓包终止");
    notify && $notification.post(titlePrefix, "抓包未执行", "自动抓包开关已关闭");
    $done({});
    return;
  }

  // 3. 捕获并解析请求
  if (typeof $request === 'undefined') {
    log("error", "无请求对象，无法捕获米游社接口");
    notify && $notification.post(titlePrefix, "抓包失败", "未捕获到米游社HTTP请求");
    $done({});
    return;
  }

  log("debug", `捕获请求URL：${$request.url}`);
  const headers = $request.headers || {};

  // 4. 提取核心凭证（仅保留签到必需字段）
  const cookie = headers.Cookie?.match(/(cookie_token=.*?;|account_id=.*?;)/g)?.join(" ") || "";
  const stoken = headers["x-rpc-stoken"] || "";
  const userAgent = headers["User-Agent"] || "";

  // 5. 写入BoxJS并记录更新字段
  const updateFields = [];
  if (cookie) {
    store.set("mihoyo.cookie", cookie);
    updateFields.push("Cookie");
  }
  if (stoken) {
    store.set("mihoyo.stoken", stoken);
    updateFields.push("SToken");
  }
  if (userAgent) {
    store.set("mihoyo.userAgent", userAgent);
    updateFields.push("User-Agent");
  }

  // 6. 更新抓包时间戳
  const captureTime = new Date().toLocaleString();
  store.set("mihoyo.lastCaptureAt", captureTime);

  // 7. 推送通知（匹配mihoyo.notify/mihoyo.notifyFail）
  const notifyAll = store.get("mihoyo.notify") === "true";
  if (notify && notifyAll) {
    if (updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功 ✅",
        `已更新凭证：${updateFields.join("、")}\n最后抓包：${captureTime}`
      );
      log("info", `抓包成功，更新字段：${updateFields.join("、")}`);
    } else {
      $notification.post(titlePrefix, "抓包无数据", "未提取到有效Cookie/SToken");
      log("warn", "抓包结果：未提取到签到所需的核心凭证");
    }
  }

  $done({});
})();