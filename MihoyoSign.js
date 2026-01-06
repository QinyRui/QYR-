/*
 * 米游社签到脚本（适配v2凭证+原神签到接口）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 优化：兼容cookie_token_v2/account_id_v2，解析原神签到接口响应
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 日志配置（匹配BoxJS的mihoyo.logLevel）
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

// 凭证过期错误码映射（含原神签到接口专属码）
const EXPIRED_CODES = {
  -100: "登录态失效（Cookie/SToken过期）",
  -101: "未登录或凭证错误",
  401: "权限验证失败（凭证过期）",
  10001: "接口重复请求（非过期）",
  10103: "Cookie无效或已过期"
};

// 解析Cookie（兼容v2版本，提取核心字段）
function parseCookie(cookieStr) {
  const cookieObj = {};
  if (!cookieStr) return cookieObj;

  // 拆分Cookie键值对，兼容;和; 分隔
  cookieStr.split(/;\s*/).forEach(item => {
    const [key, val] = item.split("=");
    if (key && val) cookieObj[key] = val;
  });

  // 优先取原生字段，无则取v2版本
  return {
    cookieToken: cookieObj.cookie_token || cookieObj.cookie_token_v2 || "",
    accountId: cookieObj.account_id || cookieObj.account_id_v2 || ""
  };
}

// 推送通知（适配mihoyo.notify/mihoyo.notifyFail）
function sendNotification(subtitle, content) {
  const notifyAll = store.get("mihoyo.notify") === "true";
  const notifyOnlyFail = store.get("mihoyo.notifyFail") === "true";
  const shouldNotify = subtitle.includes("成功") ? notifyAll : (notifyAll || notifyOnlyFail);
  if (shouldNotify && notify) {
    $notification.post(titlePrefix, subtitle, content);
  }
}

// 凭证过期提醒
function sendExpiredTip() {
  sendNotification(
    "凭证过期提醒 ⚠️",
    "Cookie/SToken已失效，请按以下步骤更新：\n1. 确保抓包开关开启\n2. 打开米游社APP进入原神签到页"
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

// 原神签到核心请求
async function sendSignRequest(cookieToken, accountId, stoken, userAgent) {
  const signUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/sign"; // 原神签到接口
  const resignInfoUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/resign_info"; // 签到状态接口

  // 请求头配置（兼容v2凭证）
  const headers = {
    "Cookie": `cookie_token=${cookieToken}; account_id=${accountId};`,
    "x-rpc-stoken": stoken,
    "User-Agent": userAgent || "miHoYoBBS/2.50.1 CFNetwork/3860.200.71 Darwin/25.1.0",
    "Content-Type": "application/json",
    "Referer": "https://webstatic.mihoyo.com/",
    "Origin": "https://webstatic.mihoyo.com"
  };

  // 先查询签到状态
  try {
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

    // 已签到则直接返回结果
    if (infoData.data.signed) {
      return { success: true, msg: parseSignResponse(infoData.data), isExpired: false };
    }

    // 未签到则发起签到请求
    log("debug", "发起原神签到请求");
    const resSign = await $httpClient.post({
      url: signUrl,
      headers,
      body: JSON.stringify({ act_id: "e202307121442271", region: "cn_gf01", uid: accountId }) // 原神签到act_id
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

    // 签到成功，重新查询状态并解析
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
  log("info", "开始执行米游社原神签到");
  if (!boxjs) {
    log("error", "BoxJS未连接，签到终止");
    sendNotification("签到失败", "BoxJS未初始化，请检查授权");
    return;
  }

  // 读取凭证并解析
  const cookieStr = store.get("mihoyo.cookie");
  const stoken = store.get("mihoyo.stoken");
  const userAgent = store.get("mihoyo.userAgent");
  const { cookieToken, accountId } = parseCookie(cookieStr);

  log("debug", `凭证解析结果 - cookieToken：${cookieToken ? "存在" : "不存在"}，accountId：${accountId ? "存在" : "不存在"}，stoken：${stoken ? "存在" : "不存在"}`);

  // 凭证校验
  if (!cookieToken || !accountId || !stoken) {
    log("error", "Cookie/SToken未配置或解析失败");
    sendNotification("签到失败", "未配置有效凭证，请开启抓包获取或手动填写");
    return;
  }

  // 签到请求（带重试）
  let result = "";
  let isExpired = false;
  const maxRetry = 2;

  for (let i = 0; i <= maxRetry; i++) {
    const signRes = await sendSignRequest(cookieToken, accountId, stoken, userAgent);
    result = signRes.msg;
    isExpired = signRes.isExpired;

    if (signRes.success || isExpired) {
      break; // 成功或凭证过期，停止重试
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

  // 缓存签到结果
  $persistentStore.write(result, "mihoyo_sign_result");
  $persistentStore.write(new Date().toLocaleString(), "mihoyo_sign_time");
  log("info", `原神签到流程结束，结果：${result}`);
}

// 执行签到
signMihoyo().then(() => $done({}));