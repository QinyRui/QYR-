/*
📱 九号智能电动车自动签到脚本（可分享版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/09
📦 版本：v2.0 Preview Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 显示签到经验、N币、补签卡数量
   - 支持盲盒任务列表（如“惊喜盲盒赚不停”）
   - 自动记录并展示连续签到天数
   - 兼容多环境（$$aHR0cENsaWVudCAvIA==$$notification / $persistentStore）

⚙️ 使用说明：
1️⃣ 打开九号 App，登录后抓取 Header 中的 Authorization 与 deviceId。
   - Authorization：在 App 中进行网络请求时，抓取请求头中的 Authorization 字段。
   - deviceId：在 App 中，通常可以在“我的” -> “设置” -> “关于”中找到设备 ID。
2️⃣ 将下方对应字段中的示例值替换为你自己的。
3️⃣ 可手动运行脚本或设置定时任务（建议每天上午 8 点执行）：

[Script]
cron "0 8 * * *" script-path=https://example.com/Ninebot_Sign.js, tag=九号签到

📌 注意：
- 本脚本仅供学习与研究，请勿用于任何商业用途。
- 请勿公开分享包含你个人 token 的版本。

===========================================================
*/

// Helper to promisify $httpClient.post
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    // @ts-ignore: $httpClient is a global object in this environment
    $httpClient.post(request, (error, response, data) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve({ response, data });
      }
    });
  });
}

// Helper to promisify $httpClient.get
function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    // @ts-ignore: $httpClient is a global object in this environment
    $httpClient.get(request, (error, response, data) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve({ response, data });
      }
    });
  });
}

async function run() {
  // **重点：请替换为您的 deviceId**
  // **请务必替换为你在九号 App 中抓取的 deviceId**
  const deviceId = "YOUR_DEVICE_ID"

  // **重点：请替换为您的 authorization**
  // **请务必替换为你在九号 App 中抓取的 authorization**
  const authorization = "YOUR_AUTHORIZATION_TOKEN"

  // **可选：任务列表 URL（盲盒任务等）**
  const taskListUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list?t=1762462726875"

  // 签到 URL
  const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign"

  // 签到日历信息 URL (假设)
  const calendarInfoUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/calendar"

  // 签到状态 URL
  const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"

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
    "Sec-Fetch-Site": "same-site",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "sys_language": "zh-CN",
  }

  let newSignDays = 0
  let signScore = 0
  let nCoin = 0
  let signCardsNum = 0
  let consecutiveSignDaysStored = 0

  const consecutiveSignDaysKey = "ninebot_consecutive_sign_days"

  let finalNotificationTitle = "九号签到"
  let finalNotificationSubtitle = ""
  let finalNotificationBody = ""

  try {
    console.log("开始执行九号签到脚本...")
    const storedConsecutiveSignDays = $persistentStore.read(consecutiveSignDaysKey)
    consecutiveSignDaysStored = parseInt(storedConsecutiveSignDays || "0", 10)
    newSignDays = consecutiveSignDaysStored

    console.log(`当前连续签到天数: ${consecutiveSignDaysStored}`)

    const signRequest = {
      url: signUrl,
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ deviceId: deviceId }),
    }

    console.log(`开始签到... URL: ${signUrl}`)
    const { data: signData } = await httpClientPost(signRequest)
    const signResult = JSON.parse(signData)

    console.log(`签到结果: ${JSON.stringify(signResult)}`)

    if (signResult.code === 0) {
      signScore = signResult.data.score || 0
      nCoin = signResult.data.nCoin || 0
      finalNotificationBody += `✅ 签到成功！`
      const gainsInfo = []
      if (signScore > 0) gainsInfo.push(`+${signScore} 经验`)
      if (nCoin > 0) gainsInfo.push(`+${nCoin} N币`)
      if (gainsInfo.length > 0) {
        finalNotificationBody += ` 🎁 今日奖励: ${gainsInfo.join(" ")}`
      }
    } else if (signResult.code === 540004) {
      finalNotificationBody += `⚠️ 今日已签到。`
    } else {
      finalNotificationBody += `❌ 签到失败: ${signResult.msg}`
    }

    const statusRequest = { url: statusUrl, method: "GET", headers: commonHeaders }

    console.log(`获取签到状态... URL: ${statusUrl}`)
    const { data: statusData } = await httpClientGet(statusRequest)
    const statusResult = JSON.parse(statusData)

    console.log(`签到状态结果: ${JSON.stringify(statusResult)}`)

    if (statusResult.code === 0 && statusResult.data) {
      newSignDays = statusResult.data.consecutiveDays || 0
      signCardsNum = statusResult.data.signCardsNum || 0
      finalNotificationBody += `\n🎫 补签卡: ${signCardsNum}张`
    }

    finalNotificationBody += `\n🗓️ 连续签到: ${newSignDays} 天`

    if (taskListUrl) {
      console.log(`获取盲盒任务列表... URL: ${taskListUrl}`)
      const { data: taskData } = await httpClientGet({ url: taskListUrl, method: "GET", headers: commonHeaders })
      const taskResult = JSON.parse(taskData)
      console.log(`盲盒任务列表结果: ${JSON.stringify(taskResult)}`)
      if (taskResult.code === 0) {
        const notOpenedBoxes = taskResult.data.notOpenedBoxes || []
        if (notOpenedBoxes.length > 0) {
          finalNotificationBody += "\n\n📦 即将开启盲盒:"
          notOpenedBoxes.forEach((box) => {
            finalNotificationBody += `\n  - ${box.awardDays}天盲盒，还需${box.leftDaysToOpen}天`
          })
        }
      }
    }
  } catch (error) {
    finalNotificationBody = "脚本执行失败: " + error.message
    console.error("脚本执行出错:", error)
  } finally {
    finalNotificationSubtitle = `连续 ${newSignDays} 天`
    $persistentStore.write(newSignDays.toString(), consecutiveSignDaysKey)
    $notification.post(finalNotificationTitle, finalNotificationSubtitle, finalNotificationBody)
    console.log("脚本执行完成.")
    Script.exit()
  }
}

run()