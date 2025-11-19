/*
📱 九号智能电动车 · 单账号自动签到主体脚本（v2.5）
====================================================
👤 作者：❥﹒﹏非我不可  &  QinyRui
📆 更新时间：2025/11/19
📌 支持：
- 抓包写入 Authorization / DeviceId / User-Agent（可开关）
- 自动签到（CRON）
- 手动签到（开关触发）
- 自动补签
- 自动盲盒
- 自动申请内测
- 通知开关、自定义标题、调试日志
*/

const $ = new Env("九号签到助手");

// UI 配置
const cfg = {
  Authorization: $.getdata("Authorization"),
  DeviceId: $.getdata("DeviceId"),
  UserAgent: $.getdata("UserAgent"),

  notify_title: $.getdata("notify_title") || "九号签到助手",
  enable_notify: $.getdata("enable_notify") === "true",
  enable_debug: $.getdata("enable_debug") === "true",
  enable_openbox: $.getdata("enable_openbox") === "true",
  enable_supplement: $.getdata("enable_supplement") === "true",
  enable_internal_test: $.getdata("enable_internal_test") === "true",
  enable_manual_sign: $.getdata("enable_manual_sign") === "true",
  enable_capture: $.getdata("enable_capture") === "true",
};

// 输出调试
function logDebug(msg) {
  if (cfg.enable_debug) $.log(`【DEBUG】${msg}`);
}

// =============== 抓包写入 ===============
if (typeof $request !== "undefined" && cfg.enable_capture) {
  const h = $request.headers;

  const auth = h["Authorization"] || h["authorization"];
  const device = h["Deviceld"] || h["DeviceId"] || h["deviceid"] || h["deviceld"];
  const ua = h["User-Agent"] || h["user-agent"];

  if (auth) $.setdata(auth, "Authorization");
  if (device) $.setdata(device, "DeviceId");
  if (ua) $.setdata(ua, "UserAgent");

  $.notify(cfg.notify_title, "抓包成功", "授权信息已写入 UI");
  $.done();
  return;
}

// =============== 主流程（签到/手动签到） ===============
(async () => {

  if (!cfg.Authorization || !cfg.DeviceId) {
    $.notify(cfg.notify_title, "未绑定账号", "请先抓包或在 UI 填写 Authorization 和 DeviceId");
    return $.done();
  }

  let signResult = await signAction();

  if (cfg.enable_notify) {
    $.notify(cfg.notify_title, "签到结果", signResult);
  }

  $.done();
})();


// =============== 签到逻辑 ===============
async function signAction() {
  logDebug("开始执行九号签到逻辑...");

  const headers = {
    "Authorization": cfg.Authorization,
    "DeviceId": cfg.DeviceId,
    "User-Agent": cfg.UserAgent || "NinebotApp"
  };

  // ① 签到
  const sign = await http("post", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", {}, headers);
  logDebug("签到接口返回：" + JSON.stringify(sign));

  if (!sign || sign.errno !== 0) {
    return "签到失败：" + (sign?.errmsg || "未知错误");
  }

  // ② 获取状态
  const status = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", null, headers);
  logDebug("状态接口返回：" + JSON.stringify(status));

  // ③ 获取余额
  const balance = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/api/coin/balance", null, headers);

  // ④ 获取盲盒
  const blind = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list", null, headers);

  // 拼装通知
  let msg = `
今日已签到
连续签到：${status?.data?.calendarInfo?.continueDays || 0}天
补签卡：${status?.data?.supplyCardCount || 0}张
N 币余额：${balance?.data?.coinBalance || 0}

盲盒任务：
${formatBlind(blind?.data?.list)}
`;

  // 自动补签
  if (cfg.enable_supplement && status?.data?.needSupply) {
    const sp = await http("post", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/supply", {}, headers);
    msg += sp?.errno === 0 ? "\n自动补签成功" : "\n自动补签失败";
  }

  // 自动内测申请
  if (cfg.enable_internal_test) {
    const it = await http("post", "https://nc-gateway.ninebot.com/test/apply", {}, headers);
    msg += it?.errno === 0 ? "\n内测申请成功" : "\n内测申请失败";
  }

  return msg;
}

// =============== 工具函数 ===============
function formatBlind(list) {
  if (!list || !list.length) return "无盲盒任务";
  return list.map(i => `- ${i.days}天盲盒，还需${i.remainDays}天`).join("\n");
}

function http(method, url, body, headers) {
  return new Promise(resolve => {
    const opts = { url, headers, method, timeout: 15000 };
    if (method === "post") opts.body = JSON.stringify(body);

    $.send(opts, (err, resp, data) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

// =============== 通用 Env ===============
function Env(t, s) { return new (class {...})(t, s); }