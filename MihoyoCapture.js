/*
 * 米游社抓包脚本（核心接口提醒+凭证校验+无效清理）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：核心接口识别、凭证有效性测试、无效数据自动清理
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置（强制full，便于调试）
const LOG_LEVEL = "full";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社抓包-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// BoxJS/Loon本地存储封装（兼容双存储+清理方法）
const store = {
  get: (key) => boxjs ? boxjs.getItem(key) || "" : ($persistentStore.read(key) || ""),
  set: (key, val) => {
    if (boxjs) {
      boxjs.setItem(key, val);
      log("debug", `写入BoxJS：${key}=${val ? "有数据" : "空"}`);
    } else {
      $persistentStore.write(val, key);
      log("debug", `写入Loon本地：${key}=${val ? "有数据" : "空"}`);
    }
  },
  // 【新增】删除指定键数据
  remove: (key) => {
    if (boxjs) {
      boxjs.removeItem(key);
      log("info", `已删除BoxJS中${key}的过期数据`);
    } else {
      $persistentStore.remove(key);
      log("info", `已删除Loon本地中${key}的过期数据`);
    }
  },
  // 【新增】批量清理米游社相关无效数据
  clearAll: () => {
    const keys = ["mihoyo.cookie", "mihoyo.stoken", "mihoyo.userAgent", "mihoyo.lastCaptureAt"];
    keys.forEach(key => store.remove(key));
    log("info", "已批量清理所有米游社凭证数据");
  }
};

// 核心接口列表（米游社签到/账号接口，必带凭证）
const CORE_API_LIST = [
  "/event/luna/hk4e/",    // 原神签到接口
  "/event/luna/sr/",      // 星穹铁道签到接口
  "/event/luna/zzz/",     // 绝区零签到接口
  "/bbs/api/account/",    // 账号信息接口
  "/community/apihub/"    // 社区签到接口
];

// 判断是否为核心接口
function isCoreApi(url) {
  return CORE_API_LIST.some(api => url.includes(api));
}

// 核心接口+凭证提醒
function sendCoreApiTip(url, hasCookie, hasStoken) {
  if (!notify) return;
  let content = `检测到米游社核心接口：\n${url}\n\n`;
  content += hasCookie ? "✅ 已提取Cookie\n" : "❌ 无Cookie\n";
  content += hasStoken ? "✅ 已提取SToken\n" : "❌ 无SToken\n";
  content += hasCookie && hasStoken ? "🎉 凭证完整，开始有效性校验" : "⚠️ 凭证缺失，请重新登录米游社";
  
  $notification.post(
    `${titlePrefix} - 核心接口捕获`,
    hasCookie && hasStoken ? "凭证完整 ✅" : "凭证缺失 ⚠️",
    content
  );
}

// 凭证有效性校验：调用原神签到状态接口测试
async function validateCredential(cookie, stoken, userAgent) {
  const testUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/resign_info";
  const headers = {
    "Cookie": cookie,
    "x-rpc-stoken": stoken,
    "User-Agent": userAgent || "miHoYoBBS/2.99.0 CFNetwork/3860.200.71 Darwin/25.1.0",
    "Referer": "https://webstatic.mihoyo.com/",
    "Origin": "https://webstatic.mihoyo.com/"
  };

  try {
    log("debug", "开始校验凭证有效性：调用原神签到状态接口");
    const response = await $httpClient.get({ url: testUrl, headers });
    const resData = response.data || {};

    if (response.status === 200) {
      if (resData.retcode === 0) {
        // 凭证有效，返回签到状态
        const signed = resData.data?.signed || false;
        const signDays = resData.data?.sign_days || 0;
        log("info", `凭证校验成功 ✅：已签${signDays}天，今日${signed ? "已签" : "未签"}`);
        return { valid: true, msg: `凭证有效 ✅\n原神已签${signDays}天\n今日状态：${signed ? "已签到" : "未签到"}` };
      } else if ([ -100, -101, 10103, 401 ].includes(resData.retcode)) {
        // 凭证过期/无效 → 触发自动清理
        log("error", `凭证校验失败 ❌：${resData.message || "登录态失效"}`);
        store.clearAll(); // 批量清理过期数据
        return { valid: false, msg: `凭证无效 ❌\n原因：${resData.message || "Cookie/SToken已过期"}\n已自动清理过期数据，请重新抓包` };
      } else {
        log("warn", `凭证校验异常：${resData.message || "未知错误"}`);
        return { valid: false, msg: `凭证校验异常 ⚠️\n原因：${resData.message || "接口返回未知错误"}` };
      }
    } else {
      log("error", `凭证校验网络失败：HTTP ${response.status}`);
      return { valid: false, msg: `网络错误 ❌\n状态码：${response.status}` };
    }
  } catch (e) {
    log("error", `凭证校验脚本异常：${e.message}`);
    return { valid: false, msg: `脚本异常 ❌\n原因：${e.message}` };
  }
}

// 核心抓包逻辑（强制开启，不跳过任何接口）
async function main() {
  log("info", "抓包脚本启动（强制开启，不跳过任何米游社接口）");

  if (typeof $request === 'undefined') {
    log("error", "无请求对象，无法捕获米游社接口");
    notify && $notification.post(titlePrefix, "抓包失败", "未捕获到米游社HTTP请求");
    $done({});
    return;
  }

  const requestUrl = $request.url;
  const headers = $request.headers || {};
  log("debug", `捕获请求URL：${requestUrl}`);
  log("debug", `请求头完整数据：${JSON.stringify(headers)}`);

  // 全量提取凭证（不筛选）
  const cookie = headers.Cookie || "";
  const stoken = headers["x-rpc-stoken"] || headers["X-Rpc-Stoken"] || "";
  const userAgent = headers["User-Agent"] || "";

  // 判断是否为核心接口+是否有凭证
  const coreApiFlag = isCoreApi(requestUrl);
  const hasCookie = cookie.length > 0;
  const hasStoken = stoken.length > 0;

  // 写入存储
  const updateFields = [];
  if (hasCookie) {
    store.set("mihoyo.cookie", cookie);
    updateFields.push("Cookie（全量）");
  }
  if (hasStoken) {
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

  // 核心逻辑：核心接口+凭证完整 → 触发有效性校验+清理
  if (coreApiFlag && hasCookie && hasStoken) {
    sendCoreApiTip(requestUrl, hasCookie, hasStoken);
    // 执行凭证校验
    const validateRes = await validateCredential(cookie, stoken, userAgent);
    // 推送校验结果通知
    if (notify) {
      $notification.post(
        `${titlePrefix} - 凭证校验结果`,
        validateRes.valid ? "凭证可用 ✅" : "凭证无效 ❌",
        validateRes.msg
      );
    }
    log("info", `凭证校验最终结果：${validateRes.msg}`);
  } else if (coreApiFlag) {
    // 核心接口但凭证缺失 → 仅提醒，不校验
    sendCoreApiTip(requestUrl, hasCookie, hasStoken);
  } else {
    // 非核心接口，普通通知（有凭证才推送）
    if (notify && updateFields.length > 0) {
      $notification.post(
        titlePrefix,
        "抓包成功（非核心接口）",
        `提取到：${updateFields.join("、")}\n接口：${requestUrl}\n时间：${captureTime}`
      );
    } else if (notify && !coreApiFlag && updateFields.length === 0) {
      log("debug", `非核心接口无凭证：${requestUrl}`);
    }
  }

  $done({});
}

// 执行主逻辑
main().catch(e => {
  log("error", `脚本执行异常：${e.message}`);
  $done({});
});