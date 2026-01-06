/*
 * 米游社抓包脚本（BoxJS授权失败兜底版）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 功能：无需BoxJS授权，用Loon本地存储保存凭证
 */
const notify = $argument?.[0] === "true";
const titlePrefix = "米游社签到助手";

// 日志配置（无需BoxJS，直接用固定等级）
const LOG_LEVEL = "full"; // 调试用full，正常用simple
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// 改用Loon本地存储（替代BoxJS）
const store = {
  get: (key) => $persistentStore.read(key) || "",
  set: (key, val) => {
    $persistentStore.write(val, key);
    log("debug", `写入Loon本地存储：${key}=${val ? "有数据" : "空"}`);
  }
};

// 核心抓包逻辑（无需BoxJS连接校验）
(function main() {
  // 读取抓包开关（从Loon本地存储读取）
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

  // 仅处理米游社签到相关接口
  const signApiReg = /\/event\/luna\/(hk4e|sr|zzz)\/resign_info/;
  if (!signApiReg.test(requestUrl)) {
    log("debug", "非米游社签到接口，跳过凭证提取");
    $done({});
    return;
  }

  // 提取Cookie（兼容v2版本）
  const cookieStr = headers.Cookie || "";
  let cookieToken = "";
  let accountId = "";
  const cookieTokenMatch = cookieStr.match(/cookie_token=([^;]+)/) || cookieStr.match(/cookie_token_v2=([^;]+)/);
  const accountIdMatch = cookieStr.match(/account_id=([^;]+)/) || cookieStr.match(/account_id_v2=([^;]+)/);
  cookieToken = cookieTokenMatch ? cookieTokenMatch[1] : "";
  accountId = accountIdMatch ? accountIdMatch[1] : "";

  // 提取SToken和User-Agent
  const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";
  const userAgent = headers["User-Agent"] || "";

  // 写入Loon本地存储
  const updateFields = [];
  if (cookieToken && accountId) {
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
  if (notify) {
    if (updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功 ✅",
        `从原神签到接口提取到：\n${updateFields.join("\n")}\n最后抓包：${captureTime}\n（凭证存于Loon本地）`
      );
      log("info", `抓包成功，更新字段：${updateFields.join(", ")}`);
    } else {
      $notification.post(titlePrefix, "抓包无数据", "未提取到有效Cookie/SToken");
      log("warn", "签到接口中未提取到有效凭证");
    }
  }

  $done({});
})();