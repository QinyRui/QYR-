/**************************************
 * 九号智能电动车 · 自动签到（单账号）v2.6
 * Author: QinyRui & ❥﹒﹏非我不可
 * Telegram: https://t.me/JiuHaoAPP
 **************************************/

const ENV = (() => {
  const isLoon = typeof $loon !== "undefined";
  const isQuanX = typeof $task !== "undefined";
  const isSurge = typeof $httpClient !== "undefined";
  return { isLoon, isQuanX, isSurge };
})();

function log(...x) { console.log(`[Ninebot]`, ...x); }

// -------------------------
// 读取配置（BoxJS 自动写入）
// -------------------------
const Authorization = $persistentStore.read("ninebot.authorization") || "";
const DeviceId = $persistentStore.read("ninebot.deviceId") || "";
const UserAgent = $persistentStore.read("ninebot.userAgent") || "";

// 插件开关（从 Loon 插件 UI 自动注入）
const debug = $argument?.debug === "true";
const notifyFlag = $argument?.notify === "true";
const openBox = $argument?.openbox === "true";
const repairSign = $argument?.repair === "true";
const autoBeta = $argument?.beta === "true";

if (!Authorization || !DeviceId) {
  notify("未配置 Token", "请在插件 UI 填写 Authorization / DeviceId");
  $done();
  return;
}

const headers = {
  "Authorization": Authorization,
  "DeviceId": DeviceId,
  "User-Agent": UserAgent || "Mozilla/5.0"
};

const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/api/nbcoin/v1/balance",
  boxList: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/v2/list",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/supplement",
  beta: "https://cn-cbu-gateway.ninebot.com/portal/api/beta-program/apply"
};

// =================================================================
// HTTP 封装
// =================================================================
function httpGet(opts) {
  return new Promise((resolve) => {
    if (ENV.isQuanX)
      $task.fetch(opts).then((resp) => resolve(JSON.parse(resp.body || "{}")));
    else if (ENV.isLoon)
      $httpClient.get(opts, (err, resp, data) =>
        resolve(JSON.parse(data || "{}"))
      );
    else if (ENV.isSurge)
      $httpClient.get(opts, (err, resp, data) =>
        resolve(JSON.parse(data || "{}"))
      );
  });
}

function httpPost(opts) {
  return new Promise((resolve) => {
    if (ENV.isQuanX)
      $task.fetch(opts).then((resp) => resolve(JSON.parse(resp.body || "{}")));
    else if (ENV.isLoon)
      $httpClient.post(opts, (err, resp, data) =>
        resolve(JSON.parse(data || "{}"))
      );
    else if (ENV.isSurge)
      $httpClient.post(opts, (err, resp, data) =>
        resolve(JSON.parse(data || "{}"))
      );
  });
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// =================================================================
// 签到重试 + 最终确认
// =================================================================
async function trySign(headers, DeviceId, maxRetry = 3) {
  let lastErr = null;

  for (let i = 1; i <= maxRetry; i++) {
    try {
      log(`签到尝试 ${i}/${maxRetry} ...`);
      const body = JSON.stringify({ deviceId: DeviceId });

      const ret = await httpPost({
        url: END.sign,
        headers,
        body,
      });

      log("签到接口返回：", ret);

      let ok =
        ret?.code === 0 ||
        ret?.data?.success === true ||
        (ret?.msg + "").toLowerCase().includes("success");

      if (ok) return { ok: true, resp: ret };

      lastErr = ret;
    } catch (e) {
      lastErr = e;
      log("签到异常：", e);
    }

    await sleep(500 + Math.random() * 500);
  }

  return { ok: false, resp: lastErr };
}

// =================================================================
// 主流程
// =================================================================
(async () => {
  let notifyStr = "";

  log("开始执行九号签到脚本...");
  log("获取签到状态...");

  const st = await httpGet({ url: END.status, headers });
  const beforeDays = st?.data?.consecutiveDays || 0;
  log(`签到前连续天数：${beforeDays}`);

  log("执行签到（带重试 + 确认）...");
  const signResult = await trySign(headers, DeviceId, 3);

  await sleep(600);

  const stAfter = await httpGet({ url: END.status, headers });
  const afterDays = stAfter?.data?.consecutiveDays || beforeDays;
  log(`签到后连续天数：${afterDays}`);

  // 最终判断
  let confirmOk = false;
  if (afterDays > beforeDays) confirmOk = true;

  notifyStr += `🗓 连续签到：${beforeDays} → ${afterDays}\n`;
  notifyStr += `📌 签到接口返回：${signResult?.resp?.msg || JSON.stringify(signResult.resp)}\n`;
  notifyStr += `🔎 最终结果：${confirmOk ? "✔ 已确认生效" : "❌ 失败或未确认"}\n\n`;

  // 查询余额
  const bal = await httpGet({ url: END.balance, headers });
  const coin = bal?.data?.amount || 0;
  notifyStr += `💰 当前 N 币：${coin}\n\n`;

  // 盲盒
  if (openBox) {
    const box = await httpGet({ url: END.boxList, headers });
    if (box?.data?.list?.length) {
      notifyStr += "🎁 盲盒任务：\n";
      for (const x of box.data.list) {
        notifyStr += ` - ${x.name}：还需 ${x.leftDay} 天\n`;
      }
    }
    notifyStr += "\n";
  }

  // 补签
  if (repairSign && !confirmOk) {
    log("尝试补签...");
    const rep = await httpPost({ url: END.repair, headers, body: "{}" });
    notifyStr += `🔧 补签结果：${rep?.msg}\n\n`;
  }

  // 内测申请
  if (autoBeta) {
    log("申请内测资格...");
    const beta = await httpPost({ url: END.beta, headers, body: "{}" });
    notifyStr += `🧪 内测申请：${beta?.msg}\n\n`;
  }

  if (notifyFlag) notify("九号签到", notifyStr);
  $done();
})();

// =================================================================
// 通知封装
// =================================================================
function notify(title, msg = "") {
  if (ENV.isLoon)
    $notification.post(title, "", msg);
  else if (ENV.isQuanX)
    $notify(title, "", msg);
  else if (ENV.isSurge)
    $notification.post(title, "", msg);
}