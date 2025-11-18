/************************************************************************
📱 九号智能电动车 · 单账号自动签到（v2.4）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新时间：2025/11/18
📌 功能：签到、补签、盲盒、余额、连续天数、自动开盲盒、内测资格检测
************************************************************************/

// -------------------- 环境封装 --------------------
const isQuanX = typeof $task !== "undefined";
const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined";

function notify(title, subtitle, message) {
  if (isQuanX) $notify(title, subtitle, message);
  else if (isLoon || isSurge) $notification.post(title, subtitle, message);
}

function get(key) {
  if (isQuanX) return $prefs.valueForKey(key);
  if (isLoon || isSurge) return $persistentStore.read(key);
}

function set(key, val) {
  if (isQuanX) return $prefs.setValueForKey(val, key);
  if (isLoon || isSurge) return $persistentStore.write(val, key);
}

function httpGet(opts) {
  return new Promise((resolve, reject) => {
    if (isQuanX) {
      opts.method = "GET";
      $task.fetch(opts).then(resp => resolve(JSON.parse(resp.body)), reject);
    } else if (isLoon) {
      $httpClient.get(opts, (err, resp, data) => {
        if (err) return reject(err);
        resolve(JSON.parse(data));
      });
    } else if (isSurge) {
      $httpClient.get(opts, (err, resp, data) => {
        if (err) return reject(err);
        resolve(JSON.parse(data));
      });
    }
  });
}

function httpPost(opts) {
  return new Promise((resolve, reject) => {
    if (isQuanX) {
      opts.method = "POST";
      $task.fetch(opts).then(resp => resolve(JSON.parse(resp.body)), reject);
    } else {
      $httpClient.post(opts, (err, resp, data) => {
        if (err) return reject(err);
        resolve(JSON.parse(data));
      });
    }
  });
}

function done(value = {}) {
  if (isQuanX) $done(value);
  else $done();
}

// -------------------- 读取变量 --------------------
const authorization = get("ninebot.authorization") || "";
const deviceId = get("ninebot.deviceId") || "";
const userAgent = get("ninebot.userAgent") || "";
const debug = get("ninebot.debug") === "true";
const notifyOn = get("ninebot.notify") !== "false";
const autoOpenBox = get("ninebot.autoOpenBox") !== "false";
const autoApplyBeta = get("ninebot.autoApplyBeta") === "true";
const titlePrefix = get("ninebot.titlePrefix") || "九号签到";

// -------------------- 公共头部 --------------------
const headers = {
  "Authorization": authorization,
  "DeviceId": deviceId,
  "User-Agent": userAgent,
  "Content-Type": "application/json"
};

function log(...msg) {
  if (debug) console.log(...msg);
}

// -------------------- 主流程 --------------------
!(async () => {
  if (!authorization || !deviceId) {
    notify(titlePrefix, "⚠️ 缺少必要参数", "请抓取 Authorization / DeviceId 写入 BoxJS");
    return done();
  }

  log("开始执行九号签到流程…");

  // 签到
  const signRes = await httpPost({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers
  });

  log("签到结果：", signRes);

  // 签到状态
  const statusRes = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });

  log("状态：", statusRes);

  // 余额
  const balRes = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/ncoin/balance",
    headers
  });

  log("余额：", balRes);

  // 盲盒
  const boxRes = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
    headers
  });

  log("盲盒：", boxRes);

  // 内测资格检测
  try {
    const beta = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      headers
    });
    log("内测资格：", beta);

    if (beta?.data?.qualified) {
      notify(titlePrefix, "内测资格", "🎉 已获得内测资格");
    } else {
      notify(titlePrefix, "内测资格", "⚠️ 未获得资格（可在 App 手动申请）");

      // 预留自动申请接口位置
      if (autoApplyBeta) {
        log("预留：自动申请内测（等待抓 POST /apply 接口）");
      }
    }
  } catch (e) {
    log("内测资格检查异常：", e);
  }

  // 通知汇总
  if (notifyOn) {
    notify(
      `${titlePrefix} · 签到完成`,
      `连续：${statusRes?.data?.continuousDays || 0} 天`,
      `今日：${signRes?.msg || "未知"}\n` +
      `余额：${balRes?.data?.availableAmount || 0} N币`
    );
  }

  done();
})();