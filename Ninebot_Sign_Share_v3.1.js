/*
📱 九号智能电动车自动签到脚本（v3.1 Share+ 完整版）
==================================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
💬 功能：
  - 自动签到 + 状态显示
  - N币余额 + 补签卡
  - 自动抓取 Authorization & deviceId
  - 盲盒自动开启 + 开启结果
  - 多账号支持
  - BoxJS 昵称 + 全量通知
*/

const scriptName = "Ninebot Sign v3.1 Share+";
const STORAGE_KEY = "NINEBOT_ACCOUNTS";

// ====== 自动抓取 Token ======
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
}

// ====== 网络请求封装 ======
function httpClientGet(opts) {
  return new Promise((resolve, reject) => {
    $httpClient.get(opts, (err, resp, data) => {
      if (err) reject(err);
      else resolve({ resp, data });
    });
  });
}

function httpClientPost(opts) {
  return new Promise((resolve, reject) => {
    $httpClient.post(opts, (err, resp, data) => {
      if (err) reject(err);
      else resolve({ resp, data });
    });
  });
}

function notify(title, msg) {
  $notification.post(title, "", msg);
}

// ====== 主函数 ======
(async () => {
  let accounts = $persistentStore.read(STORAGE_KEY);
  if (!accounts) {
    notify(scriptName, "❌ 未配置账号，请先抓取 Authorization & deviceId");
    return $done();
  }
  accounts = JSON.parse(accounts);

  for (const acc of accounts) {
    const headers = {
      "Authorization": acc.authorization || $persistentStore.read("Ninebot_Authorization"),
      "deviceId": acc.deviceId || $persistentStore.read("Ninebot_DeviceId"),
      "User-Agent": acc.userAgent || "NinebotApp/6.x",
      "Content-Type": "application/json"
    };

    let message = `👤 账号：${acc.name || "未命名"}\n`;

    try {
      // === 签到 ===
      message += `\n🚀 开始签到…`;
      const signRes = await httpClientPost({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
        headers,
        body: JSON.stringify({ deviceId: headers.deviceId })
      });
      const signData = JSON.parse(signRes.data || "{}");
      if (signData.code === 0) {
        const score = signData.data?.score || 0;
        const nCoin = signData.data?.nCoin || 0;
        message += `\n✅ 签到成功 🎉 获得 ${score} 经验 + ${nCoin} N币`;
      } else if (signData.code === 540004) {
        message += `\n⚠️ 今日已签到`;
      } else {
        message += `\n❌ 签到失败：${signData.msg || "未知错误"}`;
      }

      // === 获取签到状态 ===
      const statusRes = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
        headers
      });
      const statusData = JSON.parse(statusRes.data || "{}");
      const consecutiveDays = statusData.data?.consecutiveDays || 0;
      const signCardsNum = statusData.data?.signCardsNum || 0;
      message += `\n🗓️ 连续签到：${consecutiveDays} 天`;
      message += `\n🎫 补签卡：${signCardsNum} 张`;

      // === 获取账户余额 ===
      const balanceRes = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
        headers
      });
      const balanceData = JSON.parse(balanceRes.data || "{}");
      const nBalance = balanceData.data?.balance || 0;
      message += `\n💰 当前 N币余额：${nBalance}`;

      // === 获取盲盒列表 ===
      const boxRes = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
        headers
      });
      const boxData = JSON.parse(boxRes.data || "{}");
      const notOpened = boxData.data?.notOpenedBoxes || [];
      const openedResult = [];

      if (notOpened.length > 0) {
        message += `\n\n📦 盲盒任务：`;
      }

      for (const box of notOpened) {
        const days = box.awardDays || "?";
        const left = box.leftDaysToOpen || "?";

        if (left > 0) {
          message += `\n  - ${days} 天盲盒：还需 ${left} 天`;
          continue;
        }

        // 自动开启盲盒
        message += `\n  - ${days} 天盲盒：可开启 → 正在开启...`;
        try {
          const openRes = await httpClientPost({
            url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/open",
            headers,
            body: JSON.stringify({ awardDays: days })
          });
          const openData = JSON.parse(openRes.data || "{}");
          if (openData.code === 0) {
            const reward = openData.data?.awardName || "未知奖励";
            openedResult.push(`🎉 ${days} 天盲盒已开启，获得：${reward}`);
          } else {
            openedResult.push(`⚠️ ${days} 天盲盒开启失败：${openData.msg || "未知错误"}`);
          }
        } catch (err) {
          openedResult.push(`❌ ${days} 天盲盒开启接口异常`);
        }
      }

      if (openedResult.length > 0) {
        message += `\n\n🎁 盲盒开启结果：`;
        openedResult.forEach(r => (message += `\n  - ${r}`));
      }

    } catch (err) {
      message += `\n❌ 脚本执行异常：${err}`;
    }

    // 完整通知
    notify(`📱 九号签到 · ${acc.name}`, message);
    console.log(`==== ${acc.name} Log ====\n${message}\n\n`);
  }

  $done();
})();
