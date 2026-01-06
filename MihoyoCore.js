/* 米游社独立签到脚本（带重试+日志） */
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

// 签到核心（带重试）
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
        if (data.retcode === 0) {
          result = `✅ 签到成功\n奖励: ${data.data?.award?.name || "原石"}`;
          log("info", "签到成功");
          break;
        } else if (data.retcode === 10001) {
          result = "ℹ️ 今日已签到";
          log("info", "今日已签到");
          break;
        } else {
          result = `❌ 签到失败: ${data.message}`;
          log("warn", data.message);
        }
      } else {
        result = `❌ 网络错误: HTTP ${res.status}`;
        log("error", `状态码${res.status}`);
      }
    } catch (e) {
      result = `❌ 脚本异常: ${e.message}`;
      log("error", e.message);
    }

    if (i < maxRetry && result.includes("❌")) {
      log("warn", `重试中(${i+1}/${maxRetry})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      result += `\n重试中(${i+1}/${maxRetry})`;
    }
  }

  notify && $notification.post(titlePrefix, "签到结果", result);
  $persistentStore.write(result, "mihoyo_sign_result");
  log("info", `签到结束，结果：${result}`);
}

// 执行签到
sign().then(() => $done({}));