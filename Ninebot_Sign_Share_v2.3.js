/*
📱 九号智能电动车自动签到脚本（分享版）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/13
📦 版本：v2.3 Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket
🔑 功能：
   - 多账号支持（用 & 分隔 Authorization 与 DeviceId）
   - 独立通知，每个账号单独推送签到结果
   - 可自定义账号名称（Ninebot_Names）
   - 美化通知显示：签到经验、N币、补签卡、盲盒任务
   - 自动捕获 Token
*/

// ====== [Token 捕获逻辑] ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) $persistentStore.write(auth, "Ninebot_Authorization");
  if (deviceId) $persistentStore.write(deviceId, "Ninebot_DeviceId");
  if (auth || deviceId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  }
  $done({});
  return;
}

// ====== [网络请求封装] ======
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (error, response, data) => {
      if (error) reject(error.toString());
      else resolve({ response, data });
    });
  });
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (error, response, data) => {
      if (error) reject(error.toString());
      else resolve({ response, data });
    });
  });
}

// ====== [主执行函数] ======
async function run() {
  const authStr = $persistentStore.read("Ninebot_Authorization") || "";
  const deviceStr = $persistentStore.read("Ninebot_DeviceId") || "";
  const nameStr = $persistentStore.read("Ninebot_Names") || "";

  if (!authStr || !deviceStr) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 抓取 Token（Authorization 与 DeviceId）");
    return $done();
  }

  const authArr = authStr.split("&");
  const deviceArr = deviceStr.split("&");
  const nameArr = nameStr ? nameStr.split("&") : [];

  for (let i = 0; i < authArr.length; i++) {
    const token = authArr[i].trim();
    const deviceId = (deviceArr[i] || "").trim();
    const accountName = nameArr[i]?.trim() || `账号${i + 1}`;

    if (!token || !deviceId) continue;

    await signInAccount(accountName, token, deviceId);
  }

  $done();
}

// ====== [单账号签到逻辑] ======
async function signInAccount(accountName, authorization, deviceId) {
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
    blindBox: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  };

  let message = "";
  let newSignDays = 0;

  try {
    // ===== 签到请求 =====
    const signRes = await httpClientPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    const signData = JSON.parse(signRes.data || "{}");

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data;
      message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`;
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到";
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`;
    }

    // ===== 获取签到状态 =====
    const statusRes = await httpClientGet({ url: urls.status, headers });
    const statusData = JSON.parse(statusRes.data || "{}");
    if (statusData.code === 0 && statusData.data) {
      newSignDays = statusData.data.consecutiveDays || 0;
      const signCardsNum = statusData.data.signCardsNum || 0;
      message += `\n连续签到：${newSignDays}天\n补签卡：${signCardsNum}张`;
    }

    // ===== 获取账户余额 =====
    const balanceRes = await httpClientGet({ url: urls.balance, headers });
    const balanceData = JSON.parse(balanceRes.data || "{}");
    if (balanceData.code === 0 && balanceData.data) {
      const nBalance = balanceData.data.balance || 0;
      message += `\n当前N币余额：${nBalance}`;
    }

    // ===== 获取盲盒任务 =====
    const boxRes = await httpClientGet({ url: urls.blindBox, headers });
    const boxData = JSON.parse(boxRes.data || "{}");
    if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
      message += `\n即将开启盲盒：`;
      boxData.data.notOpenedBoxes.forEach(b => {
        message += `\n- ${b.awardDays}天盲盒，还需${b.leftDaysToOpen}天`;
      });
    }

  } catch (err) {
    message = `❌ 脚本执行出错：${err.message}`;
  } finally {
    // ===== 通知排版优化 =====
    let notifTitle = `🚘 九号${accountName}`;
    let notifBody = "";

    if (message.includes("已签到")) {
      notifTitle = `🚘 九号${accountName}`;
    }

    const matchCards = message.match(/补签卡：(\d+)/);
    const matchCoin = message.match(/余额：(\d+)/);
    const matchBoxes = message.match(/即将开启盲盒：([\s\S]*)/);

    if (matchCards) notifBody += `🎫 补签卡：${matchCards[1]} 张\n`;
    if (matchCoin) notifBody += `💰 N币余额：${matchCoin[1]}\n`;
    if (matchBoxes) {
      const boxes = matchBoxes[1].trim().split("\n").map(b => b.replace(/^[-\s]+/, "· ")).join("\n");
      notifBody += `\n📦 盲盒任务：\n${boxes}`;
    }

    $notification.post(notifTitle, message.includes("已签到") ? `✅ 今日已签到 · 连续 ${newSignDays} 天` : `🎉 签到成功 · 连续 ${newSignDays} 天`, notifBody.trim());
    console.log(`✅ ${accountName} 签到完成`);
  }
}

run();