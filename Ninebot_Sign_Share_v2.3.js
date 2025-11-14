/*
📱 九号智能电动车自动签到脚本（调试版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
🔑 特点：
  - 自动签到九号智能电动车账户
  - 自动捕获 Authorization 与 deviceId
  - 显示签到经验、N币、补签卡数量、盲盒任务
  - 增加详细调试日志，打印每一步接口返回 JSON
*/

if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];

  if (auth) {
    $persistentStore.write(auth, "Ninebot_Authorization");
    console.log("✅ Authorization 捕获成功:", auth);
  }
  if (deviceId) {
    $persistentStore.write(deviceId, "Ninebot_DeviceId");
    console.log("✅ DeviceId 捕获成功:", deviceId);
  }

  if (auth || deviceId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  }
  $done({});
  return;
}

function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}

function formatBlindBox(boxData) {
  if (!boxData?.notOpenedBoxes || boxData.notOpenedBoxes.length === 0) return "";
  let content = "📦 即将开启盲盒：";
  boxData.notOpenedBoxes.forEach(b => {
    const days = b.awardDays ?? "?";
    const left = b.leftDaysToOpen ?? "?";
    content += `\n· ${days}天盲盒，还需${left}天`;
  });
  return content;
}

async function run() {
  const authorization = $persistentStore.read("Ninebot_Authorization") || "";
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || "";

  if (!authorization || !deviceId) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 并抓取 Token");
    console.log("⚠️ 未获取到 Token，请先抓包或手动填写");
    return $done();
  }

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609103606",
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId
  };

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBox: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  let message = "";
  let consecutiveDays = 0;

  try {
    console.log("🚀 开始执行九号签到...");

    // === 签到 ===
    const { data: signRaw } = await httpClientPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    console.log("📄 /sign 接口返回:", signRaw);
    const signData = JSON.parse(signRaw || "{}");

    if (signData.code === 0) {
      const score = signData.data?.score ?? 0;
      const nCoin = signData.data?.nCoin ?? 0;
      message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`;
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到";
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`;
    }

    // === 签到状态 ===
    const { data: statusRaw } = await httpClientGet({ url: urls.status, headers });
    console.log("📄 /status 接口返回:", statusRaw);
    const statusData = JSON.parse(statusRaw || "{}");
    if (statusData.code === 0) {
      consecutiveDays = statusData.data?.consecutiveDays ?? 0;
      const signCards = statusData.data?.signCardsNum ?? 0;
      message += `\n补签卡：${signCards}张\n连续签到：${consecutiveDays}天`;
    }

    // === N币余额 ===
    const { data: balanceRaw } = await httpClientGet({ url: urls.balance, headers });
    console.log("📄 /balance 接口返回:", balanceRaw);
    const balanceData = JSON.parse(balanceRaw || "{}");
    if (balanceData.code === 0) {
      const nBalance = balanceData.data?.balance ?? 0;
      message += `\n当前N币余额：${nBalance}`;
    }

    // === 盲盒任务 ===
    const { data: boxRaw } = await httpClientGet({ url: urls.blindBox, headers });
    console.log("📄 /blind-box/list 接口返回:", boxRaw);
    const boxData = JSON.parse(boxRaw || "{}");
    const blindBoxMsg = formatBlindBox(boxData);
    if (blindBoxMsg) message += `\n${blindBoxMsg}`;

  } catch (err) {
    message = `❌ 脚本执行出错：${err}`;
    console.log(message);
  } finally {
    // ====== 通知格式化 ======
    let notifTitle = "";
    let notifBody = "";

    if (message.includes("已签到")) {
      notifTitle = `✅ 今日已签到 · 连续 ${consecutiveDays} 天`;
    } else if (message.includes("签到成功")) {
      notifTitle = `🎉 签到成功 · 连续 ${consecutiveDays} 天`;
    } else {
      notifTitle = `九号签到`;
    }

    const matchCards = message.match(/补签卡：(\d+)张?/);
    if (matchCards) notifBody += `🎫 补签卡：${matchCards[1]} 张\n`;

    const matchCoin = message.match(/当前N币余额：(\d+)/);
    if (matchCoin) notifBody += `💰 N币余额：${matchCoin[1]}\n`;

    const matchBoxes = message.includes("即将开启盲盒")
      ? message.split("📦 即将开启盲盒：")[1].trim().split("\n").map(b => "· " + b.replace(/^·\s*/, "")).join("\n")
      : "";
    if (matchBoxes) notifBody += `\n📦 盲盒任务：\n${matchBoxes}`;

    $notification.post("九号签到", notifTitle, notifBody.trim());
    console.log("✅ 九号签到完成\n通知内容:\n", notifBody.trim());
    $done();
  }
}

run();