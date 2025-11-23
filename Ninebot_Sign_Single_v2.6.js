/*
 * 九号智能电动车 · 自动签到（单账号）
 * Version: v2.6
 * Author: QinyRui
 * Telegram: https://t.me/JiuHaoAPP
 */

const scriptName = "九号签到";
const STORAGE_KEY = "NINEBOT_ACCOUNT";
const SIGN_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
const INFO_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/index";
const TEST_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/inner-test";

// ========== 工具函数 ==========
function now() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function log(msg) {
  console.log(`[${now()}] ${msg}`);
}

function notify(title, body) {
  $notification.post(title, "", body);
}

// ========== 读取 / 保存账号 ==========
function loadAccount() {
  const raw = $persistentStore.read(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    log("账号解析失败：" + e);
    return null;
  }
}

function saveAccount(data) {
  $persistentStore.write(JSON.stringify(data), STORAGE_KEY);
}

// ========== 抓包自动写入 ==========
if (typeof $request !== "undefined") {
  log("进入抓包写入流程…");

  const headers = $request.headers;
  if (!headers) {
    log("抓包异常：未获取到 headers");
    notify(scriptName, "自动写入失败：未获取到请求头");
    $done({});
  }

  const authorization = headers["Authorization"] || headers["authorization"];
  const deviceId = headers["DeviceId"] || headers["deviceid"];
  const userAgent = headers["User-Agent"] || headers["user-agent"];

  if (authorization && deviceId && userAgent) {
    const data = { authorization, deviceId, userAgent };
    saveAccount(data);
    log("抓包自动写入成功！");
    notify(scriptName, "抓包成功：已自动写入 Authorization / DeviceId / User-Agent");
  } else {
    log("抓包失败：字段不完整");
    notify(scriptName, "自动写入失败：未捕获完整参数");
  }

  return $done({});
}

// ========== 主流程 ==========
!(async () => {
  log("======== 九号自动签到开始 ========");

  const account = loadAccount();
  if (!account || !account.authorization) {
    notify(scriptName, "未配置 Token\n请在插件 UI 填写 Authorization / Deviceld / User-Agent");
    log("终止：未读取到账号信息");
    return;
  }

  const headers = {
    "Authorization": account.authorization,
    "DeviceId": account.deviceId,
    "User-Agent": account.userAgent,
    "Content-Type": "application/json"
  };

  // ======= 调用签到 =======
  log("开始执行签到请求…");

  const signResp = await httpPost(SIGN_URL, headers, "{}");

  if (!signResp.success) {
    notify(scriptName, `签到失败：${signResp.error}`);
    log("签到失败：" + signResp.error);
    return;
  }

  const signData = signResp.data;
  log("签到响应：" + JSON.stringify(signData, null, 2));

  // ====== 获取签到信息 ======
  log("获取最新签到状态…");
  const infoResp = await httpGet(INFO_URL, headers);

  if (!infoResp.success) {
    notify(scriptName, `签到完成但查询失败：${infoResp.error}`);
    return;
  }

  const info = infoResp.data.data;

  // ====== 内测资格 ======
  log("检测内测资格…");
  const testResp = await httpGet(TEST_URL, headers);

  let testMsg = "";
  if (testResp.success) {
    testMsg = testResp.data.data?.isQualified ? "已获得内测资格 ✔" : "未获得内测资格 — 自动申请失败 ✘";
  } else {
    testMsg = "内测检测异常";
  }

  // ====== 输出通知 ======
  let msg =
    `签到结果：${signData?.message || "未知"}\n` +
    `连续：${info?.signContinuity || 0} 天\n\n` +
    `盲盒：\n- ${info?.mallSignIn?.day || "--"} 天盲盒\n` +
    `余额：${info?.userPoint || "--"} N币\n\n` +
    `${testMsg}`;

  notify(scriptName, msg);

  log("======== 九号签到结束 ========");

})();

// ========== HTTP ==========
function httpGet(url, headers) {
  return new Promise(resolve => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) {
        log("GET 请求异常：" + JSON.stringify(err));
        return resolve({ success: false, error: err.error || err });
      }
      try {
        resolve({ success: true, data: JSON.parse(data) });
      } catch (e) {
        resolve({ success: false, error: "JSON 解析失败" });
      }
    });
  });
}

function httpPost(url, headers, body) {
  return new Promise(resolve => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) {
        log("POST 请求异常：" + JSON.stringify(err));
        return resolve({ success: false, error: err.error || err });
      }
      try {
        resolve({ success: true, data: JSON.parse(data) });
      } catch (e) {
        resolve({ success: false, error: "JSON 解析失败" });
      }
    });
  });
}