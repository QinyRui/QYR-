/*
📱 九号智能电动车自动签到脚本（单账号版）
=========================================
👤 作者：@juihao
📆 更新时间：2025/11/16
💬 支持：盲盒任务 · 日志开关 · 自定义名称 · BoxJS
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

!(async () => {
  if (!config.authorization) return $.msg("九号签到", "未找到授权信息，请先抓包获取！");

  let log = (msg) => config.showLog && console.log(msg);

  log("开始签到…");

  let sign = await request("sign");
  let status = await request("status");
  let balance = await request("balance");
  let blind = await request("blind");

  let text = `
🔹 ${config.name}
签到结果：${sign?.message || "未知"}
连续签到：${status?.data?.signContinuousDays || 0} 天
当前N币：${balance?.data?.balance || 0}

📦 盲盒任务：
${blind?.data?.map(i => `- ${i.boxDay}天盲盒，还需 ${i.restDay} 天`).join("\n")}
`;

  $.msg("九号智能电动车自动签到", "", text);
})().finally(() => $.done());


function request(type) {
  const url = API[type];
  return new Promise((resolve) => {
    $.http.post(
      {
        url,
        headers: {
          Authorization: config.authorization,
          deviceId: config.deviceId,
          "User-Agent": config.userAgent
        },
      },
      (err, resp, data) => {
        if (data) resolve(JSON.parse(data));
        else resolve({});
      }
    );
  });
}


// Env（保留）
function Env(t,e){class s{...}