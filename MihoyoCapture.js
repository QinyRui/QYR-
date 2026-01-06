/* 米游社独立抓包脚本（带日志等级） */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = "米游社抓包";

// 日志配置
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS操作
const getBoxData = (key) => boxjs ? boxjs.getItem(key) || "" : "";
const setBoxData = (key, val) => {
  if (boxjs) {
    boxjs.setItem(key, val);
    log("debug", `写入${key}=${val ? "有数据" : "空"}`);
  }
};

// 抓包核心
if (!boxjs) {
  log("error", "BoxJS未连接");
  notify && $notification.post(titlePrefix, "抓包失败", "BoxJS未初始化");
  $done({});
}

const captureEnable = getBoxData("mihoyo.captureEnable") === "true";
if (!captureEnable) {
  log("warn", "抓包开关关闭");
  notify && $notification.post(titlePrefix, "抓包未执行", "开关已关闭");
  $done({});
}

if (typeof $request !== 'undefined') {
  log("debug", `抓到请求：${$request.url}`);
  const cookie = $request.headers?.Cookie?.match(/(cookie_token=.*?;|account_id=.*?;)/g)?.join(" ") || "";
  const stoken = $request.headers?.["x-rpc-stoken"] || "";

  if (cookie || stoken) {
    cookie && setBoxData("mihoyo.cookie", cookie);
    stoken && setBoxData("mihoyo.stoken", stoken);
    setBoxData("mihoyo.lastCaptureAt", new Date().toLocaleString());
    log("info", "抓包成功，凭证已写入");
    notify && $notification.post(titlePrefix, "抓包成功", "凭证已写入BoxJS");
  } else {
    log("warn", "未提取到Cookie/SToken");
    notify && $notification.post(titlePrefix, "抓包无数据", "未提取到有效凭证");
  }
} else {
  log("error", "无请求对象");
}

$done({});