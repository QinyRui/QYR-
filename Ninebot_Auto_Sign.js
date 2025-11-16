/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：QinyRui
📆 更新时间：2025/11/16
📦 版本：v1.0
📱 适配：iOS 系统
✈️ 群：telegram = https://t.me/JiuHaoAPP
*/

const $ = new Env("九号智能电动车自动签到");

const API = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/api/coin/balance",
  blind: "https://cn-cbu-gateway.ninebot.com/portal/api/sign/blind-box/list"
};

let config = {
  name: $.getdata("ninebot.name") || "九号账号",
  authorization: $.getdata("ninebot.authorization"),
  deviceId: $.getdata("ninebot.deviceId"),
  userAgent: $.getdata("ninebot.userAgent") || "okhttp/3.12.13",
  showLog: $.getdata("ninebot.log") === "true"
};

/*** 抓包：自动写入 BoxJS */
if (typeof $request !== "undefined") {
  const auth = $request.headers["authorization"] || "";
  const did = $request.headers["deviceid"] || "";
  const ua = $request.headers["User-Agent"] || "";

  if (auth) $.setdata(auth, "ninebot.authorization");
  if (did) $.setdata(did, "ninebot.deviceId");
  if (ua) $.setdata(ua, "ninebot.userAgent");

  $.msg("九号自动签到", "账户数据已捕获", auth);
  $.done();
}

/*** 主执行 */
!(async () => {
  if (!config.authorization) return $.msg("九号签到", "未找到授权信息，请先抓包！");

  let log = (msg) => config.showLog && console.log(msg);

  log("开始签到……");

  const sign = await request("sign");
  const status = await request("status");
  const balance = await request("balance");
  const blind = await request("blind");

  let boxText = "无盲盒任务";
  if (blind?.data?.length) {
    boxText = blind.data
      .map((i) => `- ${i.boxDay}天盲盒，还需 ${i.restDay} 天`)
      .join("\n");
  }

  let text = `
📌 ${config.name}
📅 今日签到：${sign?.message || "未知"}
📈 连续签到：${status?.data?.signContinuousDays || 0} 天
💰 当前N币：${balance?.data?.balance || 0}

🎁 盲盒任务：
${boxText}
`;

  $.msg("九号智能电动车自动签到脚本", "", text.trim());
})().finally(() => $.done());


/*** 请求封装 */
function request(type) {
  return new Promise((resolve) => {
    $.http.post(
      {
        url: API[type],
        headers: {
          Authorization: config.authorization,
          deviceId: config.deviceId,
          "User-Agent": config.userAgent
        },
      },
      (err, resp, data) => resolve(data ? JSON.parse(data) : {})
    );
  });
}

/*** Env（保留你的版本，可继续补全） */
function Env(t, e) { /* ……保留原版 Env …… */ }