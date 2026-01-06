/*
 * 米游社抓包脚本（适配原神签到接口请求）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：兼容cookie_token_v2/account_id_v2，精准匹配原神签到接口
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS数据读写封装
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
  if (!boxjs) {
    log("error", "BoxJS未连接，抓包脚本终止");
    notify && $notification.post(titlePrefix, "抓包失败", "BoxJS未初始化，请检查授权");
    $done({});
    return;
  }

  const captureEnable = store.get("mihoyo.captureEnable") === "true";
  if (!captureEnable) {
    log("warn", "自动抓包开关已关闭，抓包终止");
    notify && $notification.post(titlePrefix, "抓包未执行", "自动抓包开关已关闭");
    $done({});
    return;
  }

  if (typeof $request === 'undefined') {
    log("error", "无请求对象，无法捕获米游社接口");
    notify && $notification.post(titlePrefix, "抓包失败", "未捕获到米游社HTTP请求");
    $done({});
    return;
  }

  const requestUrl = $request.url;
  const headers = $request.headers || {};
  log("debug", `捕获请求URL：${requestUrl}`);

  // 仅处理米游社签到相关接口（精准匹配原神/星铁等签到接口）
  const signApiReg = /\/event\/luna\/(hk4e|sr|zzz)\/resign_info/;
  if (!signApiReg.test(requestUrl)) {
    log("debug", "非米游社签到接口，跳过凭证提取");
    $done({});
    return;
  }

  // 提取Cookie（兼容v2和原生版本，优先取原生cookie_token/account_id）
  const cookieStr = headers.Cookie || "";
  let cookieToken = "";
  let accountId = "";

  // 提取cookie_token（优先原生，再v2）
  const cookieTokenMatch = cookieStr.match(/cookie_token=([^;]+)/) || cookieStr.match(/cookie_token_v2=([^;]+)/);
  if (cookieTokenMatch) cookieToken = cookieTokenMatch[1];

  // 提取account_id（优先原生，再v2）
  const accountIdMatch = cookieStr.match(/account_id=([^;]+)/) || cookieStr.match(/account_id_v2=([^;]+)/);
  if (accountIdMatch) accountId = accountIdMatch[1];

  // 提取x-rpc-stoken（部分签到接口在请求头中）
  const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";
  // 提取User-Agent
  const userAgent = headers["User-Agent"] || "";

  // 验证提取结果
  const updateFields = [];
  if (cookieToken && accountId) {
    // 拼接标准格式的Cookie（签到脚本需要的格式）
    const standardCookie = `cookie_token=${cookieToken}; account_id=${accountId};`;
    store.set("mihoyo.cookie", standardCookie);
    updateFields.push("Cookie（cookie_token/account_id）");
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
  const notifyAll = store.get("mihoyo.notify") === "true";
  if (notify && notifyAll) {
    if (updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功 ✅",
        `从原神签到接口提取到：\n${updateFields.join("\n")}\n最后抓包：${captureTime}`
      );
      log("info", `抓包成功，更新字段：${updateFields.join(", ")}`);
    } else {
      $notification.post(titlePrefix, "抓包无数据", "未提取到有效Cookie/SToken");
      log("warn", "签到接口中未提取到有效凭证");
    }
  }

  $done({});
})();