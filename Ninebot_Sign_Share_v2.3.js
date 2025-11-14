/*
📱 九号智能电动车自动签到脚本（整合版）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/14
📦 版本：v2.3+ 整合版
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket
🔑 功能：
  - 自动签到九号智能电动车账户
  - 自动捕获 Authorization 与 deviceId
  - 显示签到经验、N币、补签卡数量、盲盒任务
  - 修复盲盒 leftDaysToOpen 为 undefined 的问题
  - 已签到时使用简洁提示
  - 丰富日志输出
*/

// ====== [Token 捕获逻辑] ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];

  if (auth) {
    $persistentStore.write(auth, "Ninebot_Authorization");
    console.log("✅ Authorization 捕获成功");
  }
  if (deviceId) {
    $persistentStore.write(deviceId, "Ninebot_DeviceId");
    console.log("✅ DeviceId 捕获成功");
  }

  if (auth || deviceId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  }
  $done({});
  return;
}

// ====== [封装请求函数] ======
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (err, resp, data) => err ? reject(err.toString()) : resolve({ resp, data }));
  });
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (err, resp, data) => err ? reject(err.toString()) : resolve({ resp, data }));
  });
}

// ====== [盲盒解析函数] ======
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

// ====== [主执行函数] ======
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
    const statusData = JSON.parse(statusRaw || "{}");
    if (statusData.code === 0) {
      consecutiveDays = statusData.data?.consecutiveDays ?? 0;
      const signCards = statusData.data?.signCardsNum ?? 0;
      message += `\n补签卡：${signCards}张\n连续签到：${consecutiveDays}天`;
    }

    // === N币余额 ===
    const { data: balanceRaw } = await httpClientGet({ url: urls.balance, headers });
    const balanceData = JSON.parse(balanceRaw || "{}");
    if (balanceData.code === 0) {
      const nBalance = balanceData.data?.balance ?? 0;
      message += `\n当前N币余额：${nBalance}`;
    }

    // === 盲盒任务 ===
    const { data: boxRaw } = await httpClientGet({ url: urls.blindBox, headers });
    const boxData = JSON.parse(boxRaw || "{}");
    const blindBoxMsg = formatBlindBox(boxData);
    if (blindBoxMsg) message += `\n${blindBoxMsg}`;

  } catch (err) {
    message = `❌ 脚本执行出错：${err}`;
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

    // 匹配补签卡
    const matchCards = message.match(/补签卡：(\d+)张?/);
    if (matchCards) notifBody += `🎫 补签卡：${matchCards[1]} 张\n`;

    // 匹配 N币余额
    const matchCoin = message.match(/当前N币余额：(\d+)/);
    if (matchCoin) notifBody += `💰 N币余额：${matchCoin[1]}\n`;

    // 盲盒内容
    const matchBoxes = blindBoxMsg ? blindBoxMsg.split("\n").slice(1).map(b => "· " + b.replace(/^·\s*/, "")).join("\n") : "";
    if (matchBoxes) notifBody += `\n📦 盲盒任务：\n${matchBoxes}`;

    $notification.post("九号签到", notifTitle, notifBody.trim());
    console.log("✅ 九号签到完成");
    $done();
  }
}

run();