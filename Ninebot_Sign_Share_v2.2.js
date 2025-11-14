/*
📱 九号智能电动车自动签到脚本（分享版 · 完整发布版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/15
📦 版本：v2.2 AutoOpen Full Edition
🔑 功能：
   - 自动捕获 Authorization 与 deviceId（仅需打开一次 App 抓包）
   - 每日自动签到
   - 自动获取并显示连续签到天数、补签卡、N币余额
   - 自动判断盲盒是否可开启，自动开启并领取奖励
   - 通知显示盲盒任务与奖励
   - 支持 Loon / Surge / Quantumult X / Stash / Shadowrocket 等
⚠️ 注意：请勿公开分享含你个人 Token 的版本，仅供学习研究
*/

// ====== Token 捕获逻辑 ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const devId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) {
    $persistentStore.write(auth, "Ninebot_Authorization");
    console.log("✅ Authorization 捕获成功");
  }
  if (devId) {
    $persistentStore.write(devId, "Ninebot_DeviceId");
    console.log("✅ DeviceId 捕获成功");
  }
  if (auth || devId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  }
  $done({});
  return;
}

// ====== 网络请求封装 ======
function httpPost(req) {
  return new Promise((resolve, reject) => {
    $httpClient.post(req, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}
function httpGet(req) {
  return new Promise((resolve, reject) => {
    $httpClient.get(req, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}

// ====== 奖励解析函数 ======
function parseReward(data) {
  if (!data) return "未知奖励";
  switch (data.rewardType) {
    case 1: return `${data.rewardValue} N币`;
    case 2: return `补签卡 ×${data.rewardValue}`;
    default: return `奖励(${data.rewardType}) ×${data.rewardValue}`;
  }
}

// ====== 自动开启盲盒函数 ======
async function openBlindBox(headers) {
  try {
    const res = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
      headers,
      body: "{}"
    });
    const json = JSON.parse(res.data || "{}");
    if (json.code === 0) {
      return parseReward(json.data);
    } else {
      return "领取失败：" + (json.msg || "");
    }
  } catch (err) {
    return "执行异常：" + err;
  }
}

// ====== 主执行函数 ======
async function run() {
  const deviceId = $persistentStore.read("Ninebot_DeviceId");
  const authorization = $persistentStore.read("Ninebot_Authorization");
  if (!deviceId || !authorization) {
    $notification.post("九号签到", "", "⚠️ 请先打开九号 App 登录并抓包一次以获取 Token");
    return $done();
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId
  };

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  let notify = "";
  let days = 0;

  try {
    // —— 签到 —— 
    const signRes = await httpPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    const signJson = JSON.parse(signRes.data || "{}");
    if (signJson.code === 0) {
      notify += `🎉 签到成功\n🎁 +${signJson.data.score} 经验，+${signJson.data.nCoin} N币`;
    } else if (signJson.code === 540004) {
      notify += `⚠️ 今日已签到`;
    } else {
      notify += `❌ 签到失败：${signJson.msg || ""}`;
    }

    // —— 签到状态 —— 
    const statusRes = await httpGet({ url: urls.status, headers });
    const statusJson = JSON.parse(statusRes.data || "{}");
    if (statusJson.code === 0) {
      const s = statusJson.data;
      days = s.consecutiveDays || 0;
      notify += `\n🗓 连续签到：${days} 天`;
      notify += `\n🎫 补签卡：${s.signCardsNum} 张`;
    }

    // —— N币余额 —— 
    const balRes = await httpGet({ url: urls.balance, headers });
    const balJson = JSON.parse(balRes.data || "{}");
    if (balJson.code === 0) {
      notify += `\n💰 N币余额：${balJson.data.balance}`;
    }

    // —— 盲盒任务 —— 
    const boxRes = await httpGet({ url: urls.blindBoxList, headers });
    const boxJson = JSON.parse(boxRes.data || "{}");
    const notOpened = boxJson.data?.notOpenedBoxes || [];

    if (notOpened.length > 0) {
      notify += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        notify += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`;
      });

      // —— 自动开启盲盒 —— 
      const ready = notOpened.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
      if (ready.length > 0) {
        notify += `\n\n🎉 自动开启盲盒...`;
        for (const b of ready) {
          const reward = await openBlindBox(headers);
          notify += `\n🎁 ${b.awardDays}天盲盒获得：${reward}`;
        }
      }
    }

  } catch (error) {
    notify = "❌ 脚本异常：" + error;
  } finally {
    const title = "九号签到";
    if (notify.includes("今日已签到")) {
      $notification.post(title, `已签到 · 连续 ${days} 天`, notify);
    } else {
      $notification.post(title, `连续 ${days} 天`, notify);
    }
    console.log("✅ 九号签到完成");
    $done();
  }
}

run();