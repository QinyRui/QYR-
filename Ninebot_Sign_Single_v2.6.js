/*
 * 九号智能电动车 · 自动签到（单账号）
 * Version: v2.6 精准抓包增强版
 */

const scriptName = "九号签到";
const STORAGE_KEY = "NINEBOT_ACCOUNT";

const SIGN_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
const INFO_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/index";
const TEST_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/inner-test";

function now() { return new Date().toLocaleString("zh-CN", { hour12: false }); }
function log(t) { console.log(`[${now()}] ${t}`); }
function notify(t, b) { $notification.post(t, "", b); }

// ======================================================
// 精准抓包：只接受 cn-cbu-gateway.ninebot.com 域名的数据
// ======================================================
if (typeof $request !== "undefined") {
  const url = $request.url || "";

  // 1. 过滤所有不相关的域名（snssdk、埋点、日志通通忽略）
  if (!url.includes("cn-cbu-gateway.ninebot.com")) {
    log(`忽略非 Gateway 请求：${url}`);
    return $done({});
  }

  log(`捕获到九号主接口：${url}`);

  const headers = $request.headers || {};
  const authorization = headers["Authorization"] || headers["authorization"];
  const deviceId = headers["DeviceId"] || headers["deviceid"];
  const userAgent = headers["User-Agent"] || headers["user-agent"];

  // 2. 检查是否完整
  if (authorization && deviceId && userAgent) {
    const data = { authorization, deviceId, userAgent };
    $persistentStore.write(JSON.stringify(data), STORAGE_KEY);
    log("自动写入成功！");
    notify(scriptName, "抓包成功：已写入 Authorization / DeviceId / User-Agent");
  } else {
    log("字段不完整，继续等待更关键接口…");
  }

  return $done({});
}

// ======================================================
// 主签到流程
// ======================================================
!(async () => {
  log("======== 九号自动签到开始 ========");

  const raw = $persistentStore.read(STORAGE_KEY);
  if (!raw) {
    notify(scriptName, "未配置 Token\n请先前往九号 App 任意页面并开启抓包自动写入");
    log("终止：未读取到账号信息");
    return;
  }

  let account;
  try { account = JSON.parse(raw); } catch {
    notify(scriptName, "账号解析失败，请重新抓包");
    return;
  }

  const headers = {
    "Authorization": account.authorization,
    "DeviceId": account.deviceId,
    "User-Agent": account.userAgent,
    "Content-Type": "application/json"
  };

  // ===== 执行签到 =====
  log("开始执行签到…");
  const signResp = await httpPost(SIGN_URL, headers, "{}");

  if (!signResp.success) {
    notify(scriptName, `签到失败：${signResp.error}`);
    log("签到失败：" + signResp.error);
    return;
  }

  log("签到返回：" + JSON.stringify(signResp.data, null, 2));

  // ===== 拉取签到信息 =====
  const infoResp = await httpGet(INFO_URL, headers);
  if (!infoResp.success) {
    notify(scriptName, "签到完成但查询失败：" + infoResp.error);
    return;
  }

  const info = infoResp.data.data;

  // ===== 内测资格 =====
  const testResp = await httpGet(TEST_URL, headers);
  let testMsg = "";
  if (testResp.success) {
    testMsg = testResp.data.data?.isQualified ? "已获得内测资格 ✔" : "未获得内测资格 — 自动申请失败 ✘";
  }

  // ===== 输出通知 =====
  const msg =
    `签到结果：${signResp.data?.message || "未知"}\n` +
    `连续签到：${info?.signContinuity || 0} 天\n` +
    `盲盒：${info?.mallSignIn?.day || "--"} 天\n` +
    `我的积分：${info?.userPoint || "--"} N币\n\n` +
    `${testMsg}`;

  notify(scriptName, msg);
  log("======== 九号签到结束 ========");

})();


// ======================================================
// HTTP 封装
// ======================================================
function httpGet(url, headers) {
  return new Promise(resolve => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) {
        log("GET异常：" + JSON.stringify(err));
        return resolve({ success: false, error: err.error || err });
      }
      try {
        resolve({ success: true, data: JSON.parse(data) });
      } catch {
        resolve({ success: false, error: "JSON 解析失败" });
      }
    });
  });
}

function httpPost(url, headers, body) {
  return new Promise(resolve => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) {
        log("POST异常：" + JSON.stringify(err));
        return resolve({ success: false, error: err.error || err });
      }
      try {
        resolve({ success: true, data: JSON.parse(data) });
      } catch {
        resolve({ success: false, error: "JSON 解析失败" });
      }
    });
  });
}