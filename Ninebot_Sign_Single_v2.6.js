/**********************************
 * 九号自动签到 · 单账号 v2.6
 * 作者：QinyRui & ❥﹒﹏非我不可
 **********************************/

// ---------- 判断是否抓包环境 ----------
const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null;
const write = (v, k) => typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : false;
const notify = (title, sub, body) => typeof $notification !== "undefined" && $notification.post(title, sub, body);

// ---------- 自动写入抓包数据 ----------
if (isRequest) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth && read("ninebot.auth") !== auth) { write(auth, "ninebot.auth"); changed = true; }
    if (dev && read("ninebot.deviceId") !== dev) { write(dev, "ninebot.deviceId"); changed = true; }
    if (ua && read("ninebot.ua") !== ua) { write(ua, "ninebot.ua"); changed = true; }

    if (changed) notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
  } catch (e) {
    console.log("自动写入异常：", e.message || e);
  }
  $done({});
}

// ---------- 自动签到流程 ----------
!(async () => {
  const auth = read("ninebot.auth");
  const did = read("ninebot.deviceId");
  const ua = read("ninebot.ua");

  if (!auth || !did || !ua) {
    notify("九号签到", "未配置 Token", "请在插件 UI 填写 Authorization / DeviceId / User-Agent");
    return;
  }

  const headers = {
    Authorization: auth,
    DeviceId: did,
    "User-Agent": ua,
    "Content-Type": "application/json"
  };

  try {
    // 签到
    const sign = await http("post", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", {deviceId: did}, headers);
    let notifyBody = "";

    if (sign?.code === 0) notifyBody += `🎉 签到成功 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
    else if (sign?.code === 540004) notifyBody += "⚠️ 今日已签到";
    else notifyBody += `❌ 签到失败：${sign?.msg || "Params error"}`;

    // 获取状态
    const status = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", null, headers);
    const days = status?.data?.consecutiveDays || status?.data?.continuousDays || 0;
    const cards = status?.data?.signCardsNum || status?.data?.remedyCard || 0;
    notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;

    // 获取余额
    const bal = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", null, headers);
    notifyBody += `\n💰 N币余额：${bal?.data?.balance || 0}`;

    // 盲盒
    const box = await http("get", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", null, headers);
    const boxes = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(boxes) && boxes.length) {
      notifyBody += `\n\n📦 盲盒任务：`;
      boxes.forEach(b => {
        const days = b.awardDays || b.boxDays || b.days || "?";
        const left = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
      });
    }

    // 内测资格
    const beta = await http("get", "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status", null, headers);
    if (beta?.data?.qualified) notifyBody += "\n🚀 已获得内测资格";
    else notifyBody += "\n⚠️ 未获得内测资格";

    notify("九号签到", "签到结果", notifyBody);
  } catch (e) {
    notify("九号签到", "脚本异常", e.message || e);
  }
})();

// ---------- 封装请求 ----------
function http(method, url, body, headers) {
  return new Promise(resolve => {
    const option = {method, url, headers};
    if (method === "post") option.body = JSON.stringify(body || {});
    $httpClient.send(option, (err, resp, data) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}