/**
 * 米游社独立签到脚本（Loon / Surge / QX 通用）
 * Author: QinyRui
 */

const notify = $argument?.[0] === "true" || $argument === "true";
const titlePrefix = "米游社签到";

// ===== 存储封装（BoxJS / 原生通用）=====
function getData(key) {
  return typeof $boxjs !== "undefined"
    ? $boxjs.getItem(key)
    : $persistentStore.read(key);
}

function setData(key, value) {
  if (typeof $boxjs !== "undefined") {
    $boxjs.setItem(key, value);
  } else {
    $persistentStore.write(value, key);
  }
}

// ===== 日志 =====
const LOG_LEVEL = getData("mihoyo.logLevel") || "simple";

function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社签到-${type}] ${msg}`);
}

// ===== HTTP Promise 封装 =====
function httpPost(options) {
  return new Promise((resolve, reject) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) reject(error);
      else {
        try {
          resolve({
            status: response.status,
            data: JSON.parse(data)
          });
        } catch {
          resolve({ status: response.status, data });
        }
      }
    });
  });
}

// ===== 过期码 =====
const EXPIRED_CODES = {
  "-100": "登录态失效（Cookie / SToken 过期）",
  "-101": "未登录或凭证错误",
  "401": "权限验证失败（凭证过期）"
};

// ===== 过期提醒 =====
function sendExpiredTip() {
  if (!notify) return;
  $notification.post(
    titlePrefix,
    "凭证过期提醒 ⚠️",
    "Cookie / SToken 已失效\n请开启抓包并打开米游社 App 刷新凭证"
  );
}

// ===== 签到主逻辑 =====
async function sign() {
  log("info", "开始执行签到");

  const cookie = getData("mihoyo.cookie");
  const stoken = getData("mihoyo.stoken");

  if (!cookie || !stoken) {
    log("error", "凭证未配置");
    notify &&
      $notification.post(titlePrefix, "签到失败", "未配置 Cookie / SToken");
    return;
  }

  let result = "";
  let isExpired = false;
  const maxRetry = 2;

  for (let i = 0; i <= maxRetry; i++) {
    try {
      log("debug", `签到请求（第 ${i + 1} 次）`);

      const res = await httpPost({
        url: "https://api-takumi.mihoyo.com/community/apihub/app/api/signIn",
        headers: {
          Cookie: cookie,
          "x-rpc-stoken": stoken,
          "x-rpc-client_type": "5",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) miHoYoBBS/2.55.1"
        },
        body: JSON.stringify({ gids: 1 })
      });

      if (res.status !== 200) {
        result = `❌ 网络错误：HTTP ${res.status}`;
        continue;
      }

      const data = res.data;
      log("debug", JSON.stringify(data));

      if (data.retcode === 0) {
        result = `✅ 签到成功\n奖励：${data.data?.award?.name || "原石"}`;
        break;
      }

      if (data.retcode === 10001) {
        result = "ℹ️ 今日已签到";
        break;
      }

      if (EXPIRED_CODES[data.retcode]) {
        isExpired = true;
        result = `❌ ${EXPIRED_CODES[data.retcode]}`;
        break;
      }

      result = `❌ 签到失败：${data.message || "未知错误"}`;
    } catch (e) {
      result = `❌ 异常：${e.message}`;
    }

    if (i < maxRetry && !isExpired) {
      log("warn", `重试中 (${i + 1}/${maxRetry})`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (notify) {
    $notification.post(titlePrefix, "签到结果", result);
    if (isExpired) sendExpiredTip();
  }

  setData("mihoyo_sign_result", result);
  log("info", `结束：${result}`);
}

sign().finally(() => $done({}));