/*
📱 九号智能电动车 · 单账号自动签到（v2.5 最终版）
📌 不依赖 BoxJS，仅使用 Loon 插件 Argument 储存数据
📌 支持：抓包写入 + 手动签到 + 自动签到 + 调试日志 + 开关控制
👤 作者：❥﹒﹏非我不可 & QinyRui
*/

const $L = {
  read: (k) => $persistentStore.read(k),
  write: (v, k) => $persistentStore.write(v, k),
  notify: (title, sub, body) => $notification.post(title, sub, body),
  log: (...msg) => console.log(`[九号]`, ...msg)
};

// 从 Argument 读取 UI 参数
function arg(key, def = "") {
  return typeof $argument !== "undefined" && $argument[key] !== undefined
    ? $argument[key]
    : def;
}

const enable_debug = arg("enable_debug", "false") === "true";
const enable_notify = arg("enable_notify", "true") === "true";
const enable_openbox = arg("enable_openbox", "true") === "true";
const enable_supplement = arg("enable_supplement", "true") === "true";
const enable_internal_test = arg("enable_internal_test", "false") === "true";
const notify_title = arg("notify_title", "九号签到助手");

const Authorization = arg("Authorization", "");
const DeviceId = arg("DeviceId", "");
const UserAgent = arg("UserAgent", "");

// 保存抓包数据
function saveToken(auth, did, ua) {
  $L.write(auth, "NINEBOT_AUTH");
  $L.write(did, "NINEBOT_DID");
  $L.write(ua, "NINEBOT_UA");
}

// 读取最终使用的数据
const FINAL_AUTH = Authorization || $L.read("NINEBOT_AUTH") || "";
const FINAL_DID = DeviceId || $L.read("NINEBOT_DID") || "";
const FINAL_UA = UserAgent || $L.read("NINEBOT_UA") || "";

function logDebug(...msg) {
  if (enable_debug) $L.log(...msg);
}

(async () => {

  // ----------------------- 抓包处理 -----------------------
  if (typeof $request !== "undefined") {
    const auth = $request.headers["Authorization"] || "";
    const did = $request.headers["DeviceId"] || "";
    const ua = $request.headers["User-Agent"] || "";

    if (auth && did) {
      saveToken(auth, did, ua);
      $L.notify("九号智能电动车", "抓包成功", "Authorization / DeviceId / User-Agent 已写入");
      return $done({});
    }

    return $done({});
  }

  // ----------------------- 签到执行 -----------------------
  if (!FINAL_AUTH || !FINAL_DID) {
    if (enable_notify)
      $L.notify(notify_title, "", "未配置 Token\n请在插件 UI 填写 Authorization / DeviceId");
    return;
  }

  logDebug("开始执行签到…");

  const headers = {
    "Authorization": FINAL_AUTH,
    "DeviceId": FINAL_DID,
    "User-Agent": FINAL_UA || "NBScooterApp/1.5.0"
  };

  function httpPost(url, body = {}) {
    return new Promise(resolve => {
      $httpClient.post(
        { url, headers, body: JSON.stringify(body) },
        (err, resp, data) => {
          if (err) resolve({ code: -1, msg: err });
          try { resolve(JSON.parse(data)); }
          catch { resolve({ code: -2, msg: "JSON解析失败" }); }
        }
      );
    });
  }

  // ① 签到
  const sign = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign");

  // ② 状态
  const status = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");

  // ③ N币
  const balance = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-account/balance");

  // ④ 盲盒
  const box = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list");

  let msg = "";

  msg += `签到：${sign.msg || JSON.stringify(sign)}\n\n`;
  msg += `连续签到：${status.data?.continueDays || 0} 天\n补签卡：${status.data?.supplyCardCount || 0} 张\n\n`;
  msg += `N币余额：${balance.data?.nbBalance || 0}\n\n`;

  msg += `盲盒任务：\n`;
  if (Array.isArray(box.data?.calendarInfo)) {
    for (let i of box.data.calendarInfo) {
      msg += `- ${i.days} 天盲盒，还需 ${i.remainDays} 天\n`;
    }
  }

  if (enable_notify) {
    $L.notify(notify_title, "签到完成", msg);
  }

  logDebug("签到完成：", msg);

})();