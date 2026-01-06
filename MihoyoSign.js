/*
 * 米游社签到脚本（适配九号配置格式+凭证过期提醒）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true"; // 插件传递的通知开关
const titlePrefix = boxjs ? boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手" : "米游社签到助手";

// 日志配置（匹配mihoyo.logLevel）
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社签到-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS数据读写封装
const store = {
  get: (key) => boxjs ? boxjs.getItem(key) || "" : "",
  set: (key, val) => boxjs && boxjs.setItem(key, val)
};

// 凭证过期错误码映射
const EXPIRED_CODES = {
  -100: "登录态失效（Cookie/SToken过期）",
  -101: "未登录或凭证错误",
  401: "权限验证失败（凭证过期）"
};

// 推送通知（适配mihoyo.notify/mihoyo.notifyFail）
function sendNotification(subtitle, content) {
  const notifyAll = store.get("mihoyo.notify") === "true";
  const notifyOnlyFail = store.get("mihoyo.notifyFail") === "true";
  
  // 成功时仅开启全通知推送，失败时全通知/仅失败通知都推送
  const shouldNotify = subtitle.includes("成功") ? notifyAll : (notifyAll || notifyOnlyFail);
  if (shouldNotify && notify) {
    $notification.post(titlePrefix, subtitle, content);
  }
}

// 凭证过期提醒
function sendExpiredTip() {
  sendNotification(
    "凭证过期提醒 ⚠️",
    "Cookie/SToken已失效，请按以下步骤更新：\n1. 确保抓包开关开启\n2. 打开米游社APP进入签到页"
  );
}

// 签到核心逻辑（带重试）
async function signMihoyo() {
  log("info", "开始执行米游社签到");
  if (!boxjs) {
    log("error", "BoxJS未连接，签到终止");
    sendNotification("签到失败", "BoxJS未初始化，请检查授权");
    return;
  }

  // 读取凭证（匹配mihoyo.cookie/mihoyo.stoken）
  const cookie = store.get("mihoyo.cookie");
  const stoken = store.get("mihoyo.stoken");
  const userAgent = store.get("mihoyo.userAgent") || "miHoYoBBS/2.50.1 CFNetwork/3860.200.71 Darwin/25.1.0";
  
  log("debug", `凭证状态 - Cookie：${cookie ? "存在" : "不存在"}，SToken：${stoken ? "存在" : "不存在"}`);

  // 凭证校验
  if (!cookie || !stoken) {
    log("error", "Cookie/SToken未配置");
    sendNotification("签到失败", "未配置凭证，请开启抓包获取或手动填写");
    return;
  }

  // 签到请求（带重试）
  let result = "";
  let isExpired = false;
  const maxRetry = 2;
  const signUrl = "https://api-takumi.mihoyo.com/community/apihub/app/api/signIn";
  const headers = {
    "Cookie": cookie,
    "x-rpc-stoken": stoken,
    "User-Agent": userAgent,
    "Content-Type": "application/json"
  };
  const body = JSON.stringify({ gids: 1 }); // 原神签到

  for (let i = 0; i <= maxRetry; i++) {
    try {
      log("debug", `发起签到请求（第${i+1}次）`);
      const response = await $httpClient.post({ url: signUrl, headers, body });
      
      if (response.status === 200) {
        const res = response.data;
        log("debug", `接口返回：${JSON.stringify(res)}`);

        if (res.retcode === 0) {
          result = `✅ 签到成功\n奖励：${res.data?.award?.name || "原石/摩拉"}`;
          log("info", "签到成功");
          break;
        } else if (res.retcode === 10001) {
          result = "ℹ️ 今日已签到，无需重复操作";
          log("info", "今日已签到");
          break;
        } else if (EXPIRED_CODES[res.retcode]) {
          isExpired = true;
          result = `❌ 签到失败：${EXPIRED_CODES[res.retcode]}`;
          log("error", `凭证过期：${EXPIRED_CODES[res.retcode]}`);
          break; // 过期无需重试
        } else {
          result = `❌ 签到失败：${res.message || "未知错误"}`;
          log("warn", `签到失败：${res.message}`);
        }
      } else {
        result = `❌ 网络错误：HTTP ${response.status}`;
        log("error", `网络错误，状态码：${response.status}`);
      }
    } catch (e) {
      result = `❌ 脚本异常：${e.message}`;
      log("error", `脚本异常：${e.message}`);
    }

    // 重试逻辑（非过期场景）
    if (i < maxRetry && result.includes("❌") && !isExpired) {
      log("warn", `签到失败，${1秒后重试（${i+1}/${maxRetry}）}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      result += `\n重试中（${i+1}/${maxRetry}）`;
    }
  }

  // 推送结果+过期提醒
  sendNotification("签到结果", result);
  if (isExpired) sendExpiredTip();

  // 缓存签到结果
  $persistentStore.write(result, "mihoyo_sign_result");
  $persistentStore.write(new Date().toLocaleString(), "mihoyo_sign_time");
  log("info", `签到流程结束，结果：${result}`);
}

// 执行签到
signMihoyo().then(() => $done({}));