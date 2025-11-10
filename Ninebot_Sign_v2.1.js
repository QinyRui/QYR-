/*
📱 九号智能电动车自动签到脚本（可分享版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/11
📦 版本：v2.1 Preview Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 显示签到经验、N币、补签卡数量、N币余额
   - 支持盲盒任务列表（如“惊喜盲盒赚不停”）
   - 自动记录并展示连续签到天数
   - 兼容多环境（$$aHR0cENsaWVudCAvIA==$$notification / $persistentStore）

⚙️ 使用说明：
1️⃣ 打开九号 App，登录后抓取 Header 中的 Authorization 与 deviceId。
2️⃣ 将下方对应字段中的示例值替换为你自己的。
3️⃣ 可手动运行脚本或设置定时任务（建议每天上午 8 点执行）：

[Script]
cron "0 8 * * *" script-path=https://example.com/Ninebot_Sign_v2.1.js, tag=九号签到

📌 注意：
- 本脚本仅供学习与研究，请勿用于任何商业用途。
- 请勿公开分享包含你个人 token 的版本。
===========================================================
*/

// Helper to promisify $httpClient.post
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (error, response, data) => {
      if (error) reject(new Error(error));
      else resolve({ response, data });
    });
  });
}

// Helper to promisify $httpClient.get
function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (error, response, data) => {
      if (error) reject(new Error(error));
      else resolve({ response, data });
    });
  });
}

async function run() {
  const deviceId = "06965B02-DE89-45AB-9116-9B69923BF54C"; // ← 请替换为你的 deviceId
  const authorization = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."; // ← 请替换为你的 Authorization

  const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
  const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
  const balanceUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user/account/info";
  const taskListUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list?t=1762462726875";

  const commonHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609103606",
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId,
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  };

  let newSignDays = 0;
  let signScore = 0;
  let nCoin = 0;
  let signCardsNum = 0;
  let nCoinBalance = 0;

  const consecutiveSignDaysKey = "ninebot_consecutive_sign_days";
  let finalNotificationTitle = "九号签到";
  let finalNotificationSubtitle = "";
  let finalNotificationBody = "";

  try {
    console.log("开始执行九号签到脚本...");

    // 1️⃣ 签到请求
    const signRequest = {
      url: signUrl,
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ deviceId: deviceId }),
    };

    console.log(`开始签到... URL: ${signUrl}`);
    const { data: signData } = await httpClientPost(signRequest);
    const signResult = JSON.parse(signData);
    console.log(`签到结果: ${JSON.stringify(signResult)}`);

    if (signResult.code === 0) {
      signScore = signResult.data.score || 0;
      nCoin = signResult.data.nCoin || 0;
      finalNotificationBody += `✅ 签到成功！`;
      const gainsInfo = [];
      if (signScore > 0) gainsInfo.push(`+${signScore} 经验`);
      if (nCoin > 0) gainsInfo.push(`+${nCoin} N币`);
      if (gainsInfo.length > 0) finalNotificationBody += ` 🎁 今日奖励: ${gainsInfo.join(" ")}`;
    } else if (signResult.code === 540004) {
      finalNotificationBody += `⚠️ 今日已签到。`;
    } else {
      finalNotificationBody += `❌ 签到失败: ${signResult.msg}`;
    }

    // 2️⃣ 获取签到状态
    console.log(`获取签到状态... URL: ${statusUrl}`);
    const { data: statusData } = await httpClientGet({ url: statusUrl, method: "GET", headers: commonHeaders });
    const statusResult = JSON.parse(statusData);
    console.log(`签到状态结果: ${JSON.stringify(statusResult)}`);

    if (statusResult.code === 0 && statusResult.data) {
      newSignDays = statusResult.data.consecutiveDays || 0;
      signCardsNum = statusResult.data.signCardsNum || 0;
      finalNotificationBody += `\n🎫 补签卡: ${signCardsNum}张`;
    }

    finalNotificationBody += `\n🗓️ 连续签到: ${newSignDays} 天`;

    // 3️⃣ 获取 N 币余额
    console.log(`获取账户资产信息... URL: ${balanceUrl}`);
    const { data: balanceData } = await httpClientGet({ url: balanceUrl, method: "GET", headers: commonHeaders });
    const balanceResult = JSON.parse(balanceData);
    console.log(`账户资产结果: ${JSON.stringify(balanceResult)}`);

    if (balanceResult.code === 0 && balanceResult.data) {
      nCoinBalance = balanceResult.data.balance || 0;
      finalNotificationBody += `\n💰 当前 N 币余额: ${nCoinBalance}`;
    }

    // 4️⃣ 获取盲盒任务列表
    console.log(`获取盲盒任务列表... URL: ${taskListUrl}`);
    const { data: taskData } = await httpClientGet({ url: taskListUrl, method: "GET", headers: commonHeaders });
    const taskResult = JSON.parse(taskData);
    console.log(`盲盒任务列表结果: ${JSON.stringify(taskResult)}`);
    if (taskResult.code === 0 && taskResult.data) {
      const notOpenedBoxes = taskResult.data.notOpenedBoxes || [];
      if (notOpenedBoxes.length > 0) {
        finalNotificationBody += "\n\n📦 即将开启盲盒:";
        notOpenedBoxes.forEach((box) => {
          finalNotificationBody += `\n  - ${box.awardDays}天盲盒，还需${box.leftDaysToOpen}天`;
        });
      }
    }
  } catch (error) {
    finalNotificationBody = "脚本执行失败: " + error.message;
    console.error("脚本执行出错:", error);
  } finally {
    finalNotificationSubtitle = `连续 ${newSignDays} 天`;
    $persistentStore.write(newSignDays.toString(), consecutiveSignDaysKey);
    $notification.post(finalNotificationTitle, finalNotificationSubtitle, finalNotificationBody);
    console.log("脚本执行完成.");
    Script.exit();
  }
}

run();