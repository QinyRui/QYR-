/*
 * 九号智能电动车 · 自动签到（单账号）
 * Author: QinyRui & ❥﹒﹏非我不可
 * Version: 2.6-LogEnhanced
 * Update: 2025/11/23
 * Description: 支持自动写入 Authorization / DeviceId / User-Agent
 * Telegram: https://t.me/JiuHaoAPP
 */

/**************************************
 *  日志模块（无前缀版）
 **************************************/

function ts() {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

function line(title = "") {
  console.log(`\n===== ${title} =====`);
}

function LOG(...msg) {
  console.log(`[${ts()}]`, ...msg);
}

function INFO(...msg) {
  console.info(`[${ts()}]`, ...msg);
}

function WARN(...msg) {
  console.warn(`[${ts()}]`, ...msg);
}

function ERROR(...msg) {
  console.error(`[${ts()}]`, ...msg);
}

function J(obj, label = "") {
  console.log(
    `[${ts()}] ${label ? label + "：" : ""}\n` +
    JSON.stringify(obj, null, 2)
  );
}

/**************************************
 *  核心任务
 **************************************/

const env = new Env("九号自动签到");
const STORAGE_KEY = "NINEBOT_ACCOUNT";
const SIGN_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
const INFO_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-info/get";

(async () => {
  try {
    line("任务开始");

    const account = env.getdata(STORAGE_KEY);

    if (!account) {
      ERROR("未配置 Token，请抓包写入 Authorization / DeviceId / User-Agent");
      env.msg("九号自动签到", "", "❌ 未配置 Token，请前往插件填写");
      return env.done();
    }

    let cfg;
    try {
      cfg = JSON.parse(account);
    } catch (e) {
      ERROR("本地存储解析失败：", e.message);
      return env.done();
    }

    J(cfg, "当前账号配置");

    const headers = {
      "authorization": cfg.authorization,
      "deviceid": cfg.deviceId,
      "user-agent": cfg.userAgent,
      "content-type": "application/json",
    };

    J(headers, "请求 Headers");

    // ========== 获取用户信息 ==========
    line("获取用户信息");
    const infoRes = await httpPost(INFO_URL, {}, headers);

    J(infoRes, "用户信息返回");

    if (infoRes.r !== 0) {
      WARN("获取用户信息失败：", infoRes.msg || "未知错误");
    } else {
      INFO(`登录账号：${infoRes.data?.nickname || "未知昵称"}`);
    }

    // ========== 执行签到 ==========
    line("执行签到");

    const signRes = await httpPost(SIGN_URL, {}, headers);

    J(signRes, "签到返回");

    if (signRes.r === 0) {
      INFO(`签到成功：获得 ${signRes.data?.bonus || 0} 积分`);
      env.msg("九号自动签到", "✅ 签到成功", `获得 ${signRes.data?.bonus || 0} 积分`);
    } else if (signRes.r === 411100015) {
      INFO("今日已签到");
      env.msg("九号自动签到", "✔ 今日已签到", "无需重复操作");
    } else {
      WARN(`签到失败：${signRes.msg}`);
      env.msg("九号自动签到", "❌ 签到失败", signRes.msg || "未知原因");
    }

  } catch (e) {
    ERROR("脚本执行异常：", e.message || e);
  } finally {
    line("任务结束");
    env.done();
  }
})();

/**************************************
 *  HTTP 请求封装
 **************************************/

function httpPost(url, body, headers) {
  return new Promise((resolve) => {
    env.post(
      {
        url,
        headers,
        body: JSON.stringify(body),
        timeout: 12000,
      },
      (err, resp, data) => {
        if (err) {
          ERROR("HTTP 请求异常：", err);
          return resolve({ r: -1, msg: err });
        }
        try {
          const json = JSON.parse(data);
          return resolve(json);
        } catch (parseErr) {
          ERROR("返回解析失败：", parseErr);
          return resolve({ r: -1, msg: "JSON 解析错误" });
        }
      }
    );
  });
}

/**************************************
 *  Env 统一环境模块
 **************************************/
function Env(name) {
  const isQX = typeof $task !== "undefined";
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;

  const getdata = (key) => {
    if (isSurge || isLoon) return $persistentStore.read(key);
    if (isQX) return $prefs.valueForKey(key);
  };

  const setdata = (val, key) => {
    if (isSurge || isLoon) return $persistentStore.write(val, key);
    if (isQX) return $prefs.setValueForKey(val, key);
  };

  const msg = (title, subt, desc) => {
    if (isQX) $notify(title, subt, desc);
    if (isLoon) $notification.post(title, subt, desc);
    if (isSurge) $notification.post(title, subt, desc);
  };

  const post = (options, callback) => {
    if (isQX) $task.fetch({ ...options, method: "POST" }).then((resp) =>
      callback(null, resp, resp.body)
    );
    if (isLoon || isSurge) $httpClient.post(options, callback);
  };

  const done = () => {
    if (isQX) $done({});
  };

  return { name, getdata, setdata, msg, post, done };
}