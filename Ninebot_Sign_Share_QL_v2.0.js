const axios = require('axios');

// 使用 axios 封装 POST 请求
async function httpClientPost(request) {
  try {
    const response = await axios.post(request.url, request.body, { 
      headers: request.headers, 
      timeout: 10000  // 设置超时时间为 10秒
    });
    return { response, data: response.data };
  } catch (error) {
    throw new Error(error);
  }
}

// 使用 axios 封装 GET 请求
async function httpClientGet(request) {
  try {
    const response = await axios.get(request.url, { 
      headers: request.headers,
      timeout: 10000  // 设置超时时间为 10秒
    });
    return { response, data: response.data };
  } catch (error) {
    throw new Error(error);
  }
}

async function run() {
  // === 获取配置 ===
  const deviceId = process.env.NINEBOT_DEVICE_ID || "请填写你的 deviceId";
  const authorization = process.env.NINEBOT_AUTHORIZATION || "请填写你的 Authorization";
  
  // Bark 配置
  const barkKey = process.env.BARK_KEY || "请填写你的BARK_KEY";
  const barkUrl = process.env.BARK_URL || "https://api.day.app";
  const barkGroup = process.env.BARK_GROUP || "默认分组";
  const barkIcon = process.env.BARK_ICON || "https://example.com/icon.png"; // 默认图标链接

  if (authorization.includes("请填写") || barkKey.includes("请填写")) {
    notify('九号签到', '', '⚠️ 请先配置 Authorization 与 deviceId，再运行脚本。');
    return;
  }

  const taskListUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list";
  const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
  const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
  const accountInfoUrl = "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606";

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
  };

  let newSignDays = 0;
  let signScore = 0;
  let nCoin = 0;
  let signCardsNum = 0;
  let currentNCoinBalance = 0;

  let message = "";

  try {
    console.log("开始执行九号签到...");

    // === 签到请求 ===
    const signReq = { url: signUrl, method: "POST", headers: commonHeaders, body: JSON.stringify({ deviceId }) };
    const { data: signData } = await httpClientPost(signReq);
    const signResult = signData || {};

    if (signResult.code === 0) {
      signScore = signResult.data.score || 0;
      nCoin = signResult.data.nCoin || 0;
      message += `✅ 签到成功！🎁 获得 ${signScore} 经验 + ${nCoin} N币\n`;
    } else if (signResult.code === 540004) {
      message += "⚠️ 今日已签到\n";
    } else {
      message += `❌ 签到失败：${signResult.msg || "未知错误"}\n`;
    }

    // === 获取签到状态 ===
    const { data: statusData } = await httpClientGet({ url: statusUrl, method: "GET", headers: commonHeaders });
    const statusResult = statusData || {};
    if (statusResult.code === 0 && statusResult.data) {
      newSignDays = statusResult.data.consecutiveDays || 0;
      signCardsNum = statusResult.data.signCardsNum || 0;
      message += `🗓️ 连续签到: ${newSignDays} 天\n🎫 补签卡: ${signCardsNum} 张\n`;
    }

    // === 获取账户余额 ===
    const { data: accountData } = await httpClientGet({ url: accountInfoUrl, method: "GET", headers: commonHeaders });
    const accountResult = accountData || {};
    if (accountResult.code === 0 && accountResult.data) {
      currentNCoinBalance = accountResult.data.balance || 0;
      message += `💰 当前N币余额: ${currentNCoinBalance}\n`;
    }

    // === 盲盒任务 ===
    const { data: taskData } = await httpClientGet({ url: taskListUrl, method: "GET", headers: commonHeaders });
    const taskResult = taskData || {};
    if (taskResult.code === 0 && taskResult.data?.notOpenedBoxes?.length > 0) {
      message += `\n📦 即将开启盲盒:\n`;
      taskResult.data.notOpenedBoxes.forEach(box => {
        message += `  - ${box.awardDays}天盲盒，还需${box.leftDaysToOpen}天\n`;
      });
    }

  } catch (err) {
    message = `❌ 脚本执行出错：${err.message}`;
    console.log("错误详情:", err);
  } finally {
    // 打印出消息内容，检查是否正确生成
    console.log("发送到Bark的消息：", message);

    // Bark 通知
    barkNotify("九号签到", `连续签到: ${newSignDays} 天`, message, barkKey, barkUrl, barkGroup, barkIcon);
    console.log("签到完成。");
  }
}

// Bark 通知函数
async function barkNotify(title, subtitle, message, barkKey, barkUrl, barkGroup, barkIcon) {
  try {
    // 构建Bark通知的URL
    let notificationUrl = `${barkUrl}/${barkKey}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;

    // 构建附加参数
    const params = [];

    // 设置分组
    if (barkGroup) {
      params.push(`group=${encodeURIComponent(barkGroup)}`);
    }

    // 设置图标
    if (barkIcon) {
      params.push(`icon=${encodeURIComponent(barkIcon)}`);
    }

    // 拼接参数
    if (params.length > 0) {
      notificationUrl += `?${params.join('&')}`;
    }

    console.log(`发送Bark通知: ${notificationUrl}`);

    // 发送通知
    await axios.get(notificationUrl, { timeout: 5000 });
    console.log(`Bark 通知发送成功`);
  } catch (error) {
    console.error(`Bark 通知发送失败: ${error.message}`);
  }
}

run();
