/*
 * 米游社签到脚本（适配全量Cookie解析）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：从全量Cookie中智能提取核心字段，兼容v2/原生版本
 * 修复：补全日志函数/通知逻辑/SToken优先级/语法截断
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// BoxJS/Loon本地存储封装（兼容双存储）【调整顺序：先定义store再用】
const store = {
  get: (key) => boxjs ? boxjs.getItem(key) || "" : ($persistentStore.read(key) || ""),
  set: (key, val) => {
    if (boxjs) boxjs.setItem(key, val);
    else $persistentStore.write(val, key);
  }
};

// 日志级别配置 & 日志函数【核心修复：补全定义】
const LOG_LEVEL = store.get("mihoyo.logLevel") || "full"; // silent/simple/full
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社签到-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// 推送通知（适配双开关）【修复逻辑缺失】
function sendNotification(subtitle, content) {
  const notifyAll = store.get("mihoyo.notify") !== "false";
  const notifyOnlyFail = store.get("mihoyo.notifyFail") !== "false";
  const shouldNotify = subtitle.includes("失败") ? (notifyAll || notifyOnlyFail) : notifyAll;
  if (shouldNotify && notify) {
    $notification.post(titlePrefix, subtitle, content);
  }
}

// 凭证过期错误码映射
const EXPIRED_CODES = {
  -100: "登录态失效（Cookie/SToken过期）",
  -101: "未登录或凭证错误",
  401: "权限验证失败（凭证过期）",
  10001: "接口重复请求（非过期）",
  10103: "Cookie无效或已过期"
};

// 【核心优化】从全量Cookie中智能提取核心字段
function parseFullCookie(cookieStr) {
  const cookieObj = {};
  if (!cookieStr) {
    log("warn", "Cookie字符串为空，解析失败");
    return cookieObj;
  }

  // 拆分Cookie（兼容各种分隔符：; 、;、，）
  cookieStr.split(/;\s*|，\s*/).forEach(item => {
    const [key, ...valParts] = item.split("=");
    if (key && valParts.length > 0) {
      cookieObj[key.trim()] = valParts.join("=").trim();
    }
  });

  // 提取核心字段（优先原生，再v2，最后备用字段）
  return {
    cookieToken: cookieObj.cookie_token || cookieObj.cookie_token_v2 || cookieObj.cookieToken || "",
    accountId: cookieObj.account_id || cookieObj.account_id_v2 || cookieObj.accountId || cookieObj.stuid || "",
    stoken: cookieObj.stoken || cookieObj.stoken_v2 || "" // 备用SToken提取
  };
}

// 凭证过期提醒
function sendExpiredTip() {
  sendNotification(
    "凭证过期提醒 ⚠️",
    "Cookie/SToken已失效，请按以下步骤更新：\n1. 确保抓包开关开启\n2. 打开米游社APP进入原神签到页并重新登录"
  );
}

// 解析原神签到接口响应
function parseSignResponse(data) {
  let result = "";
  if (data.signed) {
    result = `✅ 原神签到成功\n本月已签：${data.sign_days}天\n漏签：${data.sign_cnt_missed}天\n米游币：${data.coin_cnt}（补签需${data.coin_cost}币/次）`;
  } else {
    result = `❌ 原神签到失败\n原因：${data.message || "未知错误"}\n本月可补签：${data.resign_limit_monthly - data.resign_cnt_monthly}次`;
  }
  return result;
}

// 原神签到核心请求（适配解析后的凭证）
async function sendSignRequest(parsedCookie, stoken, userAgent) {
  const { cookieToken, accountId } = parsedCookie;
  const signUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/sign";
  const resignInfoUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/resign_info";

  // 校验解析后的凭证
  if (!cookieToken || !accountId) {
    return { success: false, msg: "Cookie解析失败：未提取到cookie_token/account_id", isExpired: false };
  }
  if (!stoken) {
    return { success: false, msg: "未提取到SToken（x-rpc-stoken）", isExpired: false };
  }

  // 请求头配置（使用解析后的核心字段）
  const headers = {
    "Cookie": `cookie_token=${cookieToken}; account_id=${accountId};`,
    "x-rpc-stoken": stoken,
    "User-Agent": userAgent || "miHoYoBBS/2.50.1 CFNetwork/3860.200.71 Darwin/25.1.0",
    "Content-Type": "application/json",
    "Referer": "https://webstatic.mihoyo.com/",
    "Origin": "https://webstatic.mihoyo.com"
  };

  try {
    // 查询签到状态
    log("debug", "查询原神签到状态");
    const resInfo = await $httpClient.get({ url: resignInfoUrl, headers });
    if (resInfo.status !== 200) {
      return { success: false, msg: `网络错误：HTTP ${resInfo.status}`, isExpired: false };
    }

    const infoData = resInfo.data;
    if (infoData.retcode !== 0) {
      const isExpired = Object.keys(EXPIRED_CODES).includes(infoData.retcode.toString());
      return {
        success: false,
        msg: `签到状态查询失败：${EXPIRED_CODES[infoData.retcode] || infoData.message}`,
        isExpired
      };
    }

    // 已签到直接返回
    if (infoData.data.signed) {
      return { success: true, msg: parseSignResponse(infoData.data), isExpired: false };
    }

    // 发起签到请求
    log("debug", "发起原神签到请求");
    const resSign = await $httpClient.post({
      url: signUrl,
      headers,
      body: JSON.stringify({ act_id: "e202307121442271", region: "cn_gf01", uid: accountId })
    });

    if (resSign.status !== 200) {
      return { success: false, msg: `签到请求失败：HTTP ${resSign.status}`, isExpired: false };
    }

    const signData = resSign.data;
    if (signData.retcode !== 0) {
      const isExpired = Object.keys(EXPIRED_CODES).includes(signData.retcode.toString());
      return {
        success: false,
        msg: `签到失败：${EXPIRED_CODES[signData.retcode] || signData.message}`,
        isExpired
      };
    }

    // 重新查询状态并返回
    const resFinal = await $httpClient.get({ url: resignInfoUrl, headers });
    return {
      success: true,
      msg: parseSignResponse(resFinal.data.data),
      isExpired: false
    };
  } catch (e) {
    return { success: false, msg: `脚本异常：${e.message}`, isExpired: false };
  }
}

// 主签到逻辑（带重试）
async function signMihoyo() {
  log("info", "开始执行米游社原神签到（全量Cookie解析模式）");

  // 读取存储的全量Cookie和SToken
  const fullCookie = store.get("mihoyo.cookie");
  const stokenFromStore = store.get("mihoyo.stoken") || store.get("mihoyo.x-rpc-stoken");
  const userAgent = store.get("mihoyo.userAgent");

  // 解析全量Cookie
  log("debug", `原始全量Cookie：${fullCookie.substring(0, 50)}...`); // 仅打印前50字符，避免日志过长
  const parsedCookie = parseFullCookie(fullCookie);
  log("debug", `解析结果 - cookieToken：${parsedCookie.cookieToken ? "已提取" : "缺失"}，accountId：${parsedCookie.accountId ? "已提取" : "缺失"}`);
  log("debug", `SToken：${stokenFromStore ? "已提取" : "缺失"}`);

  // 签到请求（带重试）
  let result = "";
  let isExpired = false;
  const maxRetry = 2;

  for (let i = 0; i <= maxRetry; i++) {
    const signRes = await sendSignRequest(parsedCookie, stokenFromStore, userAgent);
    result = signRes.msg;
    isExpired = signRes.isExpired;

    if (signRes.success || isExpired) {
      break; // 成功或过期，停止重试
    }

    // 重试逻辑
    if (i < maxRetry) {
      log("warn", `签到失败，1秒后重试（${i+1}/${maxRetry}）`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      result += `\n重试中（${i+1}/${maxRetry}）`;
    }
  }

  // 推送结果+过期提醒
  sendNotification("原神签到结果", result);
  if (isExpired) sendExpiredTip();

  // 缓存结果
  if (typeof $persistentStore !== 'undefined') {
    $persistentStore.write(result, "mihoyo_sign_result");
    $persistentStore.write(new Date().toLocaleString(), "mihoyo_sign_time");
  }
  log("info", `原神签到流程结束，结果：${result}`);
}

// 执行签到
signMihoyo().then(() => $done({}));