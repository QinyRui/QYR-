/*
📱 九号智能电动车自动签到脚本（v2.3+升级版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
💬 支持：解析 calendarInfo 智能显示盲盒任务
*/

if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) $persistentStore.write(auth, "Ninebot_Authorization");
  if (deviceId) $persistentStore.write(deviceId, "Ninebot_DeviceId");
  if (auth || deviceId) $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  $done({});
  return;
}

function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (err, resp, data) => err ? reject(err) : resolve({ resp, data }));
  });
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (err, resp, data) => err ? reject(err) : resolve({ resp, data }));
  });
}

async function run() {
  const authorization = $persistentStore.read("Ninebot_Authorization") || "";
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || "";

  if (!authorization || !deviceId) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 并抓取 Token");
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
    "device_id": deviceId,
  };

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    calendar: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/calendar?appVersion=609103606"
  };

  let message = "";
  let newSignDays = 0;
  let notifBody = "";

  try {
    console.log("🚀 开始执行九号签到...");

    // === 签到 ===
    const signRes = await httpClientPost({
      url: urls.sign,
      headers,
      body: JSON.stringify({ deviceId }),
    });
    const signData = JSON.parse(signRes.data || "{}");

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data;
      message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`;
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到";
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`;
    }

    // === 签到状态 ===
    const statusRes = await httpClientGet({ url: urls.status, headers });
    const statusData = JSON.parse(statusRes.data || "{}");
    if (statusData.code === 0) {
      newSignDays = statusData.data.consecutiveDays || 0;
      const signCardsNum = statusData.data.signCardsNum || 0;
      notifBody += `🎫 补签卡：${signCardsNum} 张\n连续签到：${newSignDays}天\n`;
    }

    // === N币余额 ===
    const balanceRes = await httpClientGet({ url: urls.balance, headers });
    const balanceData = JSON.parse(balanceRes.data || "{}");
    if (balanceData.code === 0 && balanceData.data) {
      const nBalance = balanceData.data.balance ?? 0;
      notifBody += `💰 N币余额：${nBalance}\n`;
    }

    // === 获取日历盲盒 ===
    const calendarRes = await httpClientGet({ url: urls.calendar, headers });
    const calendarData = JSON.parse(calendarRes.data || "{}");

    if (calendarData.code === 0 && Array.isArray(calendarData.data.calendarInfo)) {
      let boxesMsg = "";
      calendarData.data.calendarInfo.forEach(day => {
        if(day.rewardInfo) {
          const days = day.rewardInfo.days || 7;
          const received = day.rewardInfo.receiveStatus === 2;
          const leftDays = received ? 0 : days;
          boxesMsg += `\n· ${days}天盲盒，还需${leftDays}天${received ? " ✅" : ""}`;
        }
      });
      if(boxesMsg) notifBody += `\n📦 盲盒任务：${boxesMsg}`;
    }

  } catch (err) {
    notifBody += `❌ 脚本执行出错：${err}`;
  } finally {
    let notifTitle = "";
    if (message.includes("已签到")) {
      notifTitle = `✅ 今日已签到 · 连续 ${newSignDays} 天`;
    } else if (message.includes("签到成功")) {
      notifTitle = `🎉 签到成功 · 连续 ${newSignDays} 天`;
    } else {
      notifTitle = "九号签到";
    }

    $notification.post("九号签到", notifTitle, notifBody.trim());
    console.log("✅ 九号签到完成");
    $done();
  }
}

run();