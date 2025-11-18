/****************************
 九号智能电动车自动签到（单账号）
 v2.4 — 含内测资格检测
 作者：❥﹒﹏非我不可 & QinyRui
*****************************/

/* --- 必须保留！API 环境框架 --- */
class API {
  constructor(name = 'API') {
    this.name = name;
    this.isLoon = typeof $loon !== "undefined";
    this.isQuanX = typeof $task !== "undefined";
    this.isSurge = typeof $httpClient !== "undefined" && !this.isLoon;
  }

  read(key) {
    if (this.isLoon || this.isSurge) return $persistentStore.read(key);
    if (this.isQuanX) return $prefs.valueForKey(key);
  }

  write(val, key) {
    if (this.isLoon || this.isSurge) return $persistentStore.write(val, key);
    if (this.isQuanX) return $prefs.setValueForKey(val, key);
  }

  notify(title, sub, body) {
    if (this.isLoon) $notification.post(title, sub, body);
    if (this.isSurge) $notification.post(title, sub, body);
    if (this.isQuanX) $notify(title, sub, body);
  }

  get(options) {
    return new Promise((resolve, reject) => {
      if (this.isLoon || this.isSurge) {
        $httpClient.get(options, (err, resp, data) => {
          if (err) reject(err); else resolve({ status: resp.status, body: data });
        });
      } else if (this.isQuanX) {
        options.method = "GET";
        $task.fetch(options).then(resp => resolve({ status: resp.statusCode, body: resp.body }), reject);
      }
    });
  }

  post(options) {
    return new Promise((resolve, reject) => {
      if (this.isLoon || this.isSurge) {
        $httpClient.post(options, (err, resp, data) => {
          if (err) reject(err); else resolve({ status: resp.status, body: data });
        });
      } else if (this.isQuanX) {
        options.method = "POST";
        $task.fetch(options).then(resp => resolve({ status: resp.statusCode, body: resp.body }), reject);
      }
    });
  }

  done() {
    if (this.isQuanX) return;
    if (typeof $done !== "undefined") $done();
  }
}

const $ = new API("Ninebot_Sign_Single");

/* ------------------------- */

const cfg = {
  auth: $.read("ninebot.authorization") || "",
  deviceId: $.read("ninebot.deviceId") || "",
  ua: $.read("ninebot.userAgent") || "",
  title: $.read("ninebot.titlePrefix") || "九号签到",
  autoOpenBox: $.read("ninebot.autoOpenBox") === "true",
  autoApplyBeta: $.read("ninebot.autoApplyBeta") === "true",
  notify: $.read("ninebot.notify") !== "false",
  debug: $.read("ninebot.debug") === "true"
};

function log(...args) {
  if (cfg.debug) console.log(...args);
}

async function httpGet(opt) {
  const res = await $.get(opt);
  return JSON.parse(res.body || "{}");
}

async function httpPost(opt) {
  const res = await $.post(opt);
  return JSON.parse(res.body || "{}");
}

const headers = {
  Authorization: cfg.auth,
  DeviceId: cfg.deviceId,
  "User-Agent": cfg.ua,
  "Content-Type": "application/json"
};

/* -------------------------
   主流程
------------------------- */

(async () => {

  if (!cfg.auth || !cfg.deviceId) {
    $.notify(cfg.title, "配置缺失", "请先抓包写入 Authorization / DeviceId");
    return $.done();
  }

  log("开始签到流程...");

  /* 1️⃣ 签到 */
  try {
    const sign = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: "{}"
    });

    log("签到返回：", sign);

  } catch (e) {
    $.notify(cfg.title, "签到失败", String(e));
  }

  /* 2️⃣ 查看签到状态 + 余额 */
  try {
    const status = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
      headers
    });
    log("状态：", status);
  } catch (e) {}

  /* 3️⃣ 自动盲盒 */
  if (cfg.autoOpenBox) {
    try {
      const box = await httpPost({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/open",
        headers,
        body: "{}"
      });
      log("盲盒结果：", box);
    } catch (e) {}
  }

  /* 4️⃣ 内测资格检测 */
  try {
    const beta = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      headers
    });

    log("内测状态：", beta);

    if (beta?.data?.qualified) {
      $.notify(cfg.title, "内测资格", "🎉 已成功获得内测资格");
    } else {
      $.notify(cfg.title, "内测资格", "⚠️ 你还没有内测资格，请手动申请");
    }

  } catch (e) {
    log("内测检测失败：", e);
  }

  $.done();
})();