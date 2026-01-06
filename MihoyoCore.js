/* 米游社独立签到脚本（带重试+凭证过期提醒+日志） */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = "米游社签到";

// 日志配置
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社签到-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS操作
const getBoxData = (key) => boxjs ? boxjs.getItem(key) || "" : "";

// 凭证过期错误码映射（米游社常见过期码）
const EXPIRED_CODES = {
  10001: "接口重复请求（非过期）",
  -100: "登录态失效（Cookie/SToken过期）",
  -101: "未登录或凭证错误",
  401: "权限验证失败（凭证过期）"
};

// 推送过期提醒
function sendExpiredTip() {
  if (!notify) return;
  $notification.post(
    titlePrefix,
    "凭证过期提醒 ⚠️",
    "Cookie/SToken已失效，请打开米游社APP触发抓包更新凭证\n操作步骤：1. 确保抓包开关开启 2. 打开米游社社区/签到页"
  );
}

// 签到核心（带重试+过期提醒）
async function sign() {
  log("info", "开始执行签到");
  if (!boxjs) {
    log("error", "BoxJS未连接");
    notify && $notification.post(titlePrefix, "签到失败", "BoxJS未初始化");
    return;
  }

  const cookie = getBoxData("mihoyo.cookie");
  const stoken = getBoxData("mihoyo.stoken");
  log("debug", `凭证状态 - Cookie：${cookie ? "存在" : "不存在"}，SToken：${stoken ? "存在" : "不存在"}`);

  if (!cookie || !stoken) {
    log("error", "凭证未配置");
    notify && $notification.post(titlePrefix, "签到失败", "未配置Cookie/SToken（可开启抓包获取）");
    return;
  }

  let result = "";
  const maxRetry = 2;
  let isExpired = false; // 标记是否凭证过期
  for (let i = 0; i <= maxRetry; i++) {
    try {
      log("debug", `发起签到请求（第${i+1}次）`);
      const res = await $httpClient.post({
        url: "https://api-takumi.mihoyo.com/community/apihub/app/api/signIn",
        headers: {
          "Cookie": cookie,
          "x-rpc-stoken": stoken,
          "User-Agent": "miHoYoBBS/2.50.1"
        },
        body: JSON.stringify({ gids: 1 })
      });

      if (res.status === 200) {
        const data = res.data;
        log("debug", `接口返回：${JSON.stringify(data)}`);

        if (data.retcode === 0) {
          result = `✅ 签到成功\n奖励: ${data.data?.award?.name || "原石"}`;
          log("info", "签到成功");
          break;
        } else if (data.retcode === 10001) {
          result = "ℹ️ 今日已签到";
          log("info", "今日已签到");
          break;
        } else {
          // 判定是否为凭证过期错误
          if (Object.keys(EXPIRED_CODES).includes(data.retcode.toString())) {
            isExpired = true;
            result = `❌ 签到失败: ${EXPIRED_CODES[data.retcode] || data.message}`;
            log("error", `凭证过期：${EXPIRED_CODES[data.retcode]}`);
            break; // 过期无需重试
          } else {
            result = `❌ 签到失败: ${data.message}`;
            log("warn", data.message);
          }
        }
      } else {
        result = `❌ 网络错误: HTTP ${res.status}`;
        log("error", `状态码${res.status}`);
      }
    } catch (e) {
      result = `❌ 脚本异常: ${e.message}`;
      log("error", e.message);
    }

    if (i < maxRetry && result.includes("❌") && !isExpired) {
      log("warn", `重试中(${i+1}/${maxRetry})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      result += `\n重试中(${i+1}/${maxRetry})`;
    }
  }

  // 推送结果+过期提醒
  if (notify) {
    $notification.post(titlePrefix, "签到结果", result);
    if (isExpired) sendExpiredTip(); // 单独推送过期提醒
  }
  $persistentStore.write(result, "mihoyo_sign_result");
  log("info", `签到结束，结果：${result}`);
}

// 执行签到
sign().then(() => $done({}));