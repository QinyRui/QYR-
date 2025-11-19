/**
 * 九号智能电动车 · 单账号自动签到 v2.5
 * 完全兼容 Loon 插件 v2.5
 */

(async () => {
  const DEBUG = enable_debug === "true";
  const NOTIFY = enable_notify === "true";
  const AUTO_OPENBOX = enable_openbox === "true";
  const AUTO_SUPPLEMENT = enable_supplement === "true";
  const APPLY_INTERNAL_TEST = enable_internal_test === "true";

  const AUTH = Authorization || "";
  const DEVICEID = DeviceId || "";
  const UA = UserAgent || "";

  const TITLE = notify_title || "九号签到助手";

  const log = (...args) => {
    if (DEBUG) console.log(...args);
  };

  const notify = (title, subtitle, message) => {
    if (!NOTIFY) return;
    // Loon 插件最新方法
    if (typeof $notification !== "undefined") {
      $notification.post(title, subtitle, message);
    } else if (typeof $notify !== "undefined") {
      $notify(title, subtitle, message);
    } else {
      console.log("通知:", title, subtitle, message);
    }
  };

  if (!AUTH || !DEVICEID || !UA) {
    log("⚠ 未配置 Authorization / DeviceId / User-Agent");
    notify(TITLE, "未配置账户信息", "请填写 Authorization / DeviceId / User-Agent");
    return;
  }

  const request = (opts) => new Promise((resolve) => {
    if (typeof $httpClient !== "undefined") {
      $httpClient[opts.method.toLowerCase()]({
        url: opts.url,
        headers: opts.headers,
        body: opts.body
      }, (err, resp, data) => {
        if (DEBUG) log("返回：", data);
        if (err) { log("错误：", err); resolve({}); return; }
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    } else {
      log("⚠ $httpClient 不存在");
      resolve({});
    }
  });

  log("开始签到流程...");

  const headers = {
    "Authorization": AUTH,
    "DeviceId": DEVICEID,
    "User-Agent": UA,
    "Content-Type": "application/json"
  };

  let signResult = await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    method: "POST",
    headers
  });

  let statusResult = await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    method: "GET",
    headers
  });

  let boxResult = AUTO_OPENBOX ? await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
    method: "GET",
    headers
  }) : { code: 0, msg: "未开启盲盒" };

  let internalTestResult = null;
  if (APPLY_INTERNAL_TEST) {
    internalTestResult = await request({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      method: "GET",
      headers
    });
  }

  const content = `签到返回：${JSON.stringify(signResult)}
状态：${JSON.stringify(statusResult)}
盲盒结果：${JSON.stringify(boxResult)}
内测状态：${JSON.stringify(internalTestResult)}`;

  log(content);
  notify(TITLE, "", content);

  log("------ Script done -------");
})();