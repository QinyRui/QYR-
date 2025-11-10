/*
📱 九号智能电动车 - 自动签到脚本 v2.2
适用于 Loon / Surge / Quantumult X / Stash

=====================
👤 作者：❥﹒﹏非我不可
🕐 更新日期：2025/11/11
🧩 新增功能：
  - 自动检测 token 失效并推送通知
  - 修复 N 币接口路径 (account → ncoin)
  - 优化通知显示顺序与细节

📢 TG群：https://t.me/NinebotHelper
=====================
*/

const authorization = "在这里填入你的 Authorization Token";
const deviceId = "在这里填入你的 deviceId";

const commonHeaders = {
  "Authorization": authorization,
  "deviceid": deviceId,
  "User-Agent": "okhttp/3.12.12",
  "Content-Type": "application/json",
};

// 通知方法封装
function notify(title, msg) {
  if ($loon || $httpClient) {
    $notification.post(title, "", msg);
  } else if ($notify) {
    $notify(title, "", msg);
  } else {
    console.log(`${title}\n${msg}`);
  }
}

// HTTP请求封装
function httpClientGet({ url, method, headers }) {
  return new Promise((resolve) => {
    const request = { url, method, headers };
    if ($httpClient) {
      $httpClient.get(request, (_, response, data) => resolve({ response, data }));
    } else if ($task) {
      $task.fetch(request).then(
        (response) => resolve({ response, data: response.body }),
        (error) => resolve({ response: {}, data: JSON.stringify(error) })
      );
    }
  });
}

function httpClientPost({ url, method, headers, body }) {
  return new Promise((resolve) => {
    const request = { url, method, headers, body };
    if ($httpClient) {
      $httpClient.post(request, (_, response, data) => resolve({ response, data }));
    } else if ($task) {
      $task.fetch(request).then(
        (response) => resolve({ response, data: response.body }),
        (error) => resolve({ response: {}, data: JSON.stringify(error) })
      );
    }
  });
}

// 主函数
!(async () => {
  console.log("开始执行九号签到脚本...");

  let finalNotificationTitle = "九号签到";
  let finalNotificationBody = "";

  try {
    // === Step 1 签到 ===
    const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
    console.log(`开始签到... URL: ${signUrl}`);
    const { data: signData } = await httpClientPost({
      url: signUrl,
      method: "POST",
      headers: commonHeaders,
      body: "{}",
    });
    console.log(`签到结果: ${signData}`);

    const signResult = JSON.parse(signData);
    if (signResult.code === 401 || signResult.msg?.includes("token")) {
      notify("九号签到 · 登录失效", "⚠️ 请重新登录九号 App 获取新的 Authorization。");
      $done();
      return;
    }

    if (signResult.code === 0) {
      const nCoin = signResult.data?.nCoin || 0;
      const score = signResult.data?.score || 0;
      finalNotificationBody += `✅ 签到成功！🎁 奖励: +${score} 经验 +${nCoin} N币`;
    } else if (signResult.msg?.includes("重复")) {
      finalNotificationBody += "✅ 今日已签到";
    } else {
      finalNotificationBody += `❌ 签到失败: ${signResult.msg || "未知错误"}`;
    }

    // === Step 2 获取签到状态 ===
    const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
    console.log(`获取签到状态... URL: ${statusUrl}`);
    const { data: statusData } = await httpClientGet({
      url: statusUrl,
      method: "GET",
      headers: commonHeaders,
    });
    console.log(`签到状态结果: ${statusData}`);

    const statusResult = JSON.parse(statusData);
    if (statusResult.code === 0 && statusResult.data) {
      finalNotificationBody += `\n🗓️ 连续签到: ${statusResult.data.consecutiveDays} 天`;
      finalNotificationBody += `\n🎫 补签卡: ${statusResult.data.signCardsNum} 张`;
    }

    // === Step 3 获取账户资产信息 (N币余额) ===
    const balanceUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user/ncoin/account/info";
    console.log(`获取账户资产信息... URL: ${balanceUrl}`);
    const { data: balanceData } = await httpClientGet({
      url: balanceUrl,
      method: "GET",
      headers: commonHeaders,
    });
    console.log(`账户资产结果: ${balanceData}`);

    const balanceResult = JSON.parse(balanceData);
    if (balanceResult.code === 0 && balanceResult.data) {
      const balance = balanceResult.data.balance || 0;
      finalNotificationBody += `\n💰 当前 N 币余额: ${balance}`;
    }

    // === Step 4 获取盲盒任务列表 ===
    const blindBoxUrl = `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list?t=${Date.now()}`;
    console.log(`获取盲盒任务列表... URL: ${blindBoxUrl}`);
    const { data: blindData } = await httpClientGet({
      url: blindBoxUrl,
      method: "GET",
      headers: commonHeaders,
    });
    console.log(`盲盒任务列表结果: ${blindData}`);

    const blindResult = JSON.parse(blindData);
    if (blindResult.code === 0 && Array.isArray(blindResult.data?.tasks)) {
      const unfinished = blindResult.data.tasks.filter(t => !t.isCompleted);
      finalNotificationBody += `\n🎁 盲盒任务未完成: ${unfinished.length} 项`;
    }

  } catch (err) {
    console.log(`❌ 脚本执行异常: ${err}`);
    finalNotificationBody += `\n❌ 执行异常: ${err.message || err}`;
  }

  console.log("脚本执行完成.");
  notify(finalNotificationTitle, finalNotificationBody);
  $done();
})();
