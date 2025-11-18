/*
📱 九号智能电动车签到（单账号）v2.4
👤 作者：❥﹒﹏非我不可 & QinyRui
📆 更新：2025/11/20
🔧 功能：签到 · 补签 · 盲盒 · 余额查询 · 内测资格检测（含预留自动申请）
*/

const ENV_IS_REQUEST = typeof $request !== "undefined";
const STORAGE_KEY = "NINEBOT_ACCOUNT_SINGLE";

/* ====================== 工具封装 ====================== */

function read(key) { return $persistentStore.read(key) || ""; }
function write(key, val) { return $persistentStore.write(val, key); }

function notify(title, sub, body) {
  const enable = read("ninebot.notify");
  if (enable === "false") return;
  $notification.post(title, sub, body);
}

function log(...msg) {
  if (read("ninebot.debug") === "false") return;
  console.log("[Ninebot] ", ...msg);
}

function httpGet(opts) {
  return new Promise(res => {
    $httpClient.get(opts, (err, resp, data) => {
      if (err) res({ error: err });
      else res(JSON.parse(data || "{}"));
    });
  });
}

function httpPost(opts) {
  return new Promise(res => {
    $httpClient.post(opts, (err, resp, data) => {
      if (err) res({ error: err });
      else res(JSON.parse(data || "{}"));
    });
  });
}

/* =============== 抓包写入阶段 =============== */

if (ENV_IS_REQUEST) {
  const auth = $request.headers["Authorization"] || "";
  const ua = $request.headers["User-Agent"] || "";
  const deviceId = $request.headers["deviceid"] || "";

  if (auth) write("ninebot.authorization", auth);
  if (ua) write("ninebot.userAgent", ua);
  if (deviceId) write("ninebot.deviceId", deviceId);

  notify("九号签到", "账号数据已写入", "Authorization / User-Agent / DeviceId 已保存");

  $done({});
  return;
}

/* =============== 主流程 =============== */

!(async () => {
  const authorization = read("ninebot.authorization");
  const deviceId = read("ninebot.deviceId");
  const userAgent = read("ninebot.userAgent");
  const titlePrefix = read("ninebot.titlePrefix") || "九号签到";
  const autoBox = read("ninebot.autoOpenBox") !== "false";

  const headers = {
    Authorization: authorization,
    deviceId,
    "User-Agent": userAgent
  };

  /* ==== ① 签到 ==== */
  const sign = await httpPost({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers
  });
  log("签到返回：", sign);

  /* ==== ② 状态 ==== */
  const status = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });
  log("签到状态：", status);

  /* ==== ③ 余额 ==== */
  const balance = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/balance/v2/detail",
    headers
  });

  /* ==== ④ 盲盒 ==== */
  const boxList = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
    headers
  });

  if (autoBox && boxList?.data) {
    for (let b of boxList.data) {
      if (b.leftDays === 0) {
        await httpPost({
          url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/open",
          headers,
          body: JSON.stringify({ id: b.id })
        });
      }
    }
  }

  /* ==== ⑤ 内测资格检测 ==== */
  const betaStatus = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
    headers
  });

  let betaMsg = "";
  if (betaStatus?.data?.qualified) {
    betaMsg = "🎉 已获得内测资格";
  } else {
    betaMsg = "⚠️ 尚未获得内测资格（目前尚无申请接口）";
  }

  /* ==== 通知 ==== */
  notify(
    `${titlePrefix}`,
    `签到：${sign?.msg || "完成"}`,
    `连续签到：${status?.data?.continuousDays || 0} 天
余额：${balance?.data?.nb || 0} N币
盲盒：${boxList?.data?.length || 0} 个任务
内测状态：${betaMsg}`
  );

  $done({});
})();