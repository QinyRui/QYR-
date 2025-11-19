/**
 * 九号智能电动车 · 单账号自动签到 v2.5
 * 脱离 BoxJS 完全使用 Loon 插件 [Argument] 变量
 * 支持：
 *  - 调试日志开关
 *  - 通知开关
 *  - 自动盲盒开关
 *  - 自动补签开关
 *  - 内测申请开关
 *  - 自定义通知标题
 *  - 修改签到时间 CRON
 *  - Authorization / DeviceId / User-Agent 可手动输入或抓包自动写入
 */

(async () => {
  // ======= 从 Loon 插件 [Argument] 获取变量 =======
  const DEBUG = enable_debug === "true";
  const NOTIFY = enable_notify === "true";
  const AUTO_OPENBOX = enable_openbox === "true";
  const AUTO_SUPPLEMENT = enable_supplement === "true";
  const APPLY_INTERNAL_TEST = enable_internal_test === "true";

  const AUTH = Authorization || "";
  const DEVICEID = DeviceId || "";
  const UA = UserAgent || "";

  const TITLE = notify_title || "九号签到助手";

  if (!AUTH || !DEVICEID || !UA) {
    console.log("⚠ 未配置 Authorization / DeviceId / User-Agent");
    if (NOTIFY) $notify(TITLE, "未配置账户信息", "请填写 Authorization / DeviceId / User-Agent");
    return;
  }

  // ======= 工具函数 =======
  const request = (opts) => new Promise((resolve) => {
    $.http.request(opts, (err, resp, data) => {
      if (DEBUG) console.log("返回：", data);
      if (err) {
        console.log("错误：", err);
        resolve({});
        return;
      }
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });

  const headers = {
    "Authorization": AUTH,
    "DeviceId": DEVICEID,
    "User-Agent": UA,
    "Content-Type": "application/json"
  };

  console.log("开始签到流程...");

  // ======= 签到接口 =======
  let signResult = await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    method: "POST",
    headers
  });

  // ======= 查询状态 =======
  let statusResult = await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    method: "GET",
    headers
  });

  // ======= 查询盲盒 =======
  let boxResult = AUTO_OPENBOX ? await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
    method: "GET",
    headers
  }) : { code: 0, msg: "未开启盲盒" };

  // ======= 内测申请 =======
  let internalTestResult = null;
  if (APPLY_INTERNAL_TEST) {
    internalTestResult = await request({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      method: "GET",
      headers
    });
  }

  // ======= 输出 =======
  console.log("签到返回：", signResult);
  console.log("状态：", statusResult);
  console.log("盲盒结果：", boxResult);
  console.log("内测状态：", internalTestResult);

  if (NOTIFY) {
    let content = `签到返回：${JSON.stringify(signResult)}
状态：${JSON.stringify(statusResult)}
盲盒结果：${JSON.stringify(boxResult)}
内测状态：${JSON.stringify(internalTestResult)}`;
    $notify(TITLE, "", content);
  }

  console.log("------ Script done -------");
})();