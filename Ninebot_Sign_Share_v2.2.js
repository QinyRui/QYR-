/*
📱 九号智能电动车自动签到脚本（v2.4 多账号独立通知 + 彩色日志）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/13
📦 版本：v2.4 Share Edition
💬 支持平台：Loon / Surge / Quantumult X / Stash / Shadowrocket / BoxJS
*/

function log(accountName, status, data = "") {
  const time = new Date().toLocaleTimeString();
  let emoji = "ℹ️";
  if (status === "SUCCESS") emoji = "✅";
  if (status === "WARN") emoji = "⚠️";
  if (status === "ERROR") emoji = "❌";
  console.log(`[${time}][签到][${accountName}] ${emoji} ${data}`);
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

async function runSingleAccount(account, index) {
  const name = account.name || `账号${index + 1}`;
  try {
    log(name, "INFO", "开始签到");

    // 签到
    const { data: signData } = await httpClientPost({ url: account.signUrl, method: "POST", headers: account.headers, body: JSON.stringify({ deviceId: account.deviceId }) });
    const signResult = JSON.parse(signData || "{}");
    if (signResult.code === 0) log(name, "SUCCESS", `签到成功，获得 ${signResult.data.score} 经验 + ${signResult.data.nCoin} N币`);
    else if (signResult.code === 540004) log(name, "WARN", "今日已签到");
    else log(name, "ERROR", `签到失败：${signResult.msg || "未知错误"}`);

    // 签到状态
    const { data: statusData } = await httpClientGet({ url: account.statusUrl, headers: account.headers });
    const statusResult = JSON.parse(statusData || "{}");
    log(name, "INFO", `连续签到: ${statusResult.data?.consecutiveDays || 0} 天，补签卡: ${statusResult.data?.signCardsNum || 0} 张`);

    // 账户余额
    const { data: accountData } = await httpClientGet({ url: account.accountInfoUrl, headers: account.headers });
    const accountResult = JSON.parse(accountData || "{}");
    log(name, "INFO", `当前 N币余额: ${accountResult.data?.balance || 0}`);

    // 盲盒任务
    const { data: taskData } = await httpClientGet({ url: account.taskListUrl, headers: account.headers });
    const taskResult = JSON.parse(taskData || "{}");
    if (taskResult.data?.notOpenedBoxes?.length > 0) {
      taskResult.data.notOpenedBoxes.forEach(box => log(name, "INFO", `盲盒 ${box.awardDays}天，还需 ${box.leftDaysToOpen} 天`));
    }

    // 发送通知
    let msg = `[签到][${name}] `;
    msg += signResult.code === 0 ? `✅ 签到成功！` : (signResult.code === 540004 ? `⚠️ 今日已签到` : `❌ 签到失败`);
    $notification.post(name, `连续 ${statusResult.data?.consecutiveDays || 0} 天`, msg);

  } catch (err) {
    log(name, "ERROR", `脚本执行出错：${err.message}`);
  }
}

async function run() {
  const auths = ($persistentStore.read("Ninebot_Authorization") || "").split("&");
  const devices = ($persistentStore.read("Ninebot_DeviceId") || "").split("&");
  const names = ($persistentStore.read("Ninebot_Names") || "").split("&");

  if (!auths[0] || !devices[0]) {
    $notification.post("九号签到", "", "⚠️ 请先配置 Authorization 与 deviceId，再运行脚本。");
    return $done();
  }

  const urls = {
    taskListUrl: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    signUrl: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    statusUrl: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    accountInfoUrl: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  for (let i = 0; i < auths.length; i++) {
    const account = {
      deviceId: devices[i] || devices[0],
      name: names[i] || `账号${i + 1}`,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Authorization": auths[i],
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609103606",
        "Referer": "https://h5-bj.ninebot.com/",
        "device_id": devices[i] || devices[0],
      },
      ...urls
    };
    await runSingleAccount(account, i);
  }

  console.log("✅ 九号签到所有账号执行完毕。");
  if (typeof $done !== "undefined") $done();
}

run();