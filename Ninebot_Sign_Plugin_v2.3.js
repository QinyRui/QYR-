/*
📱 九号智能电动车自动签到脚本（自动抓包 + 自动领取盲盒）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/15
💬 支持平台：Loon / Surge / Quantumult X / Shadowrocket
*/

// ====== Token 捕获逻辑 ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) $persistentStore.write(auth, "Ninebot_Authorization");
  if (deviceId) $persistentStore.write(deviceId, "Ninebot_DeviceId");
  if (auth || deviceId) $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  $done({});
  return;
}

// ====== 网络请求封装 ======
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

// ====== 主执行函数 ======
async function run() {
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || "";
  const authorization = $persistentStore.read("Ninebot_Authorization") || "";

  if (!authorization || !deviceId) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 抓取 Token");
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
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  let msg = "", newSignDays = 0;

  try {
    // === 签到 ===
    const signRes = await httpClientPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    const signData = JSON.parse(signRes.data || "{}");
    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data;
      msg += `✅ 签到成功 🎉\n🎁 获得 ${score} 经验 + ${nCoin} N币`;
    } else if (signData.code === 540004) {
      msg += "⚠️ 今日已签到";
    } else {
      msg += `❌ 签到失败：${signData.msg || "未知错误"}`;
    }

    // === 签到状态 ===
    const statusRes = await httpClientGet({ url: urls.status, headers });
    const statusData = JSON.parse(statusRes.data || "{}");
    if (statusData.code === 0 && statusData.data) {
      newSignDays = statusData.data.consecutiveDays || 0;
      const signCardsNum = statusData.data.signCardsNum || 0;
      msg += `\n🗓️ 连续签到：${newSignDays} 天\n🎫 补签卡：${signCardsNum} 张`;
    }

    // === 账户余额 ===
    const balanceRes = await httpClientGet({ url: urls.balance, headers });
    const balanceData = JSON.parse(balanceRes.data || "{}");
    if (balanceData.code === 0 && balanceData.data) {
      msg += `\n💰 当前 N币余额：${balanceData.data.balance}`;
    }

    // === 盲盒列表 & 自动领取 ===
    const boxRes = await httpClientGet({ url: urls.blindBoxList, headers });
    const boxData = JSON.parse(boxRes.data || "{}");
    if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
      msg += `\n\n📦 盲盒奖励：`;
      for (let b of boxData.data.notOpenedBoxes) {
        if (b.leftDaysToOpen <= 0) {
          // 自动领取
          const receiveRes = await httpClientPost({ url: urls.blindBoxReceive, headers, body: JSON.stringify({ awardDays: b.awardDays }) });
          const rData = JSON.parse(receiveRes.data || "{}");
          if (rData.code === 0) msg += `\n  - ${b.awardDays}天盲盒已自动领取 🎁 奖励: ${rData.data.rewardValue}`;
        } else {
          msg += `\n  - ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;
        }
      }
    }

  } catch (e) {
    msg = `❌ 脚本执行出错：${e.message}`;
  } finally {
    if (msg.includes("今日已签到")) {
      $notification.post("九号签到", `已签到 · 连续 ${newSignDays} 天`, "");
    } else {
      $notification.post("九号签到", `连续 ${newSignDays} 天`, msg);
    }
    $done();
  }
}

run();