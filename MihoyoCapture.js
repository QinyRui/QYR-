/*
 * 米游社抓包脚本（修复数据抓取不到问题）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：扩大匹配范围+全量提取+详细日志
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置（改为full，便于调试）
const LOG_LEVEL = "full";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS/Loon存储封装
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

// 核心逻辑（强制开启抓包，跳过开关判定）
(function main() {
  log("info", "抓包脚本启动（强制开启，忽略开关状态）");

  if (typeof $request === 'undefined') {
    log("error", "无请求对象，无法捕获米游社接口");
    notify && $notification.post(titlePrefix, "抓包失败", "未捕获到米游社HTTP请求");
    $done({});
    return;
  }

  const requestUrl = $request.url;
  const headers = $request.headers || {};
  log("debug", `捕获请求URL：${requestUrl}`);
  log("debug", `请求头完整数据：${JSON.stringify(headers)}`); // 全量请求头日志
  log("debug", `Cookie原始值：${headers.Cookie || "无"}`); // Cookie全量日志

  // 扩大请求匹配范围：米游社签到/社区/账号接口
  const signApiReg = /\/(event\/luna|bbs\/api|account\/api|webstatic\/api)\/.*/;
  if (!signApiReg.test(requestUrl)) {
    log("debug", `非目标接口，跳过：${requestUrl}`);
    $done({});
    return;
  }

  // 全量提取凭证（不筛选字段）
  const cookie = headers.Cookie || "";
  const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || headers["stoken"] || "";
  const userAgent = headers["User-Agent"] || "";

  // 写入存储
  const updateFields = [];
  if (cookie) {
    store.set("mihoyo.cookie", cookie);
    updateFields.push("Cookie（全量）");
  }
  if (stoken) {
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

  // 推送通知
  if (notify) {
    if (updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功 ✅",
        `提取到以下数据：\n${updateFields.join("\n")}\n最后抓包：${captureTime}`
      );
      log("info", `抓包成功，更新字段：${updateFields.join(", ")}`);
    } else {
      $notification.post(titlePrefix, "抓包无数据", "未提取到任何凭证字段（查看日志了解详情）");
      log("warn", "未提取到凭证：Cookie/SToken均为空");
    }
  }

  $done({});
})();