/*
📱 九号智能电动车自动签到脚本（v2.3+多账户升级版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
💬 功能：
  - 多账户签到（BoxJS 配置）
  - 支持自定义显示名称
  - 通知点击跳转签到页/盲盒页
  - 显示连续签到、补签卡、N币余额
  - 解析 calendarInfo 盲盒任务
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

// ====== 网络请求封装 ======
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

// ====== 读取账户配置 ======
function getAccounts() {
  try {
    const json = $persistentStore.read("Ninebot_Accounts");
    if (!json) return [];
    const accounts = JSON.parse(json);
    if (!Array.isArray(accounts)) return [];
    return accounts.map(acc => ({
      displayName: acc.displayName || "九号账号",
      authorization: acc.authorization,
      deviceId: acc.deviceId
    }));
  } catch (e) {
    console.log("⚠️ 读取账户配置失败", e);
    return [];
  }
}

// ====== 签到逻辑 ======
async function signAccount(account) {
  const { displayName, authorization, deviceId } = account;
  if (!authorization || !deviceId) {
    $notification.post(displayName, "", "⚠️ 未配置 Authorization 或 deviceId");
    return;
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

  let notifBody = "";
  let newSignDays = 0;

  try {
    console.log(`🚀 开始执行 ${displayName} 签到`);

    // 签到
    const signRes = await httpClientPost({
      url: urls.sign,
      headers,
      body: JSON.stringify({ deviceId }),
    });
    const signData = JSON.parse(signRes.data || "{}");
    let notifTitle = displayName;

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data;
      notifTitle += " 🎉 签到成功";
      notifBody += `🎁 今日获得：${score} 经验 + ${nCoin} N币\n`;
    } else if (signData.code === 540004) {
      notifTitle += " ✅ 今日已签到";
    } else {
      notifTitle += " ❌ 签到失败";
      notifBody += `错误信息：${signData.msg || "未知"}\n`;
    }

    // 状态
    const statusRes = await httpClientGet({ url: urls.status, headers });
    const statusData = JSON.parse(statusRes.data || "{}");
    if (statusData.code === 0) {
      newSignDays = statusData.data.consecutiveDays || 0;
      const signCardsNum = statusData.data.signCardsNum || 0;
      notifBody += `连续签到：${newSignDays} 天\n补签卡：${signCardsNum} 张\n`;
    }

    // N币余额
    const balanceRes = await httpClientGet({ url: urls.balance, headers });
    const balanceData = JSON.parse(balanceRes.data || "{}");
    if (balanceData.code === 0 && balanceData.data) {
      notifBody += `💰 当前 N币余额：${balanceData.data.balance ?? 0}\n`;
    }

    // 日历盲盒
    const calendarRes = await httpClientGet({ url: urls.calendar, headers });
    const calendarData = JSON.parse(calendarRes.data || "{}");
    if (calendarData.code === 0 && Array.isArray(calendarData.data.calendarInfo)) {
      let boxesMsg = "";
      calendarData.data.calendarInfo.forEach(day => {
        if (day.rewardInfo) {
          const days = day.rewardInfo.days || 7;
          const received = day.rewardInfo.receiveStatus === 2;
          const leftDays = received ? 0 : days;
          boxesMsg += `\n· ${days}天盲盒，还需${leftDays}天${received ? " ✅" : ""}`;
        }
      });
      if (boxesMsg) notifBody += `📦 盲盒任务：${boxesMsg}`;
    }

    // 点击跳转链接（签到页 + 首个未领取盲盒）
    let jumpUrl = statusData.data.jumpLink || "https://h5-bj.ninebot.com/ninebotApp/#/clockIns";
    if (calendarData.data.calendarInfo) {
      const pendingBox = calendarData.data.calendarInfo.find(d => d.rewardInfo && d.rewardInfo.receiveStatus === 1);
      if (pendingBox && pendingBox.rewardInfo.rewardId) {
        jumpUrl = `https://h5-bj.ninebot.com/ninebotApp/#/openBlindBox?rewardId=${pendingBox.rewardInfo.rewardId}`;
      }
    }

    $notification.post(notifTitle, notifBody.trim(), jumpUrl);

    console.log(`✅ ${displayName} 签到完成`);

  } catch (err) {
    $notification.post(displayName, "❌ 脚本执行出错", `${err}`);
    console.log(`⚠️ ${displayName} 签到出错:`, err);
  }
}

// ====== 主执行函数 ======
async function run() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    $notification.post("九号签到", "", "⚠️ 未检测到账户，请在 BoxJS 配置 Ninebot_Accounts");
    return $done();
  }

  for (let i = 0; i < accounts.length; i++) {
    await signAccount(accounts[i]);
  }

  $done();
}

run();