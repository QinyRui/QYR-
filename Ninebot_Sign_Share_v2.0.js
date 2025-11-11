/*
📱 九号智能电动车自动签到脚本（分享版）
=========================================
👤 作者：❥﹒﹏非我不可
✈️Telegram：https://t.me/WorKingCopyAPP
📆 更新日期：2025/11/09
📦 版本：v2.0 Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 显示签到经验、N币、补签卡数量
   - 支持盲盒任务列表（如“惊喜盲盒赚不停”）
   - 自动记录并展示连续签到天数
   - 兼容多环境（$notification / $persistentStore）

⚙️ 使用说明：
1️⃣ 打开九号 App 登录后，抓取任意请求头中的 Authorization 与 deviceId。
   - Authorization：请求头中的 Authorization 值（JWT Token）
   - deviceId：可在 App「我的」→「设置」→「关于」中找到
2️⃣ 可通过 BoxJS 或脚本内填写变量。
   BoxJS 环境变量示例：
      🔹 Ninebot_Authorization_1
      🔹 Ninebot_DeviceId_1
      🔹 Ninebot_Authorization_2
      🔹 Ninebot_DeviceId_2
3️⃣ 可设置定时任务（建议每日 8:00 执行）：

[Script]
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.0.js, tag=九号签到

📌 注意：
- 请勿公开分享包含你个人 Token 的版本。
- 本脚本仅供学习研究使用。

===========================================================
*/

// Helper to promisify $httpClient.post
function httpClientPost(request: any): Promise<any> {
  return new Promise((resolve: any, reject: any) => {
    $httpClient.post(request, (error: any, response: any, data: any) => {
      if (error) reject(new Error(error))
      else resolve({ response, data })
    })
  })
}

// Helper to promisify $httpClient.get
function httpClientGet(request: any): Promise<any> {
  return new Promise((resolve: any, reject: any) => {
    $httpClient.get(request, (error: any, response: any, data: any) => {
      if (error) reject(new Error(error))
      else resolve({ response, data })
    })
  })
}

async function run() {
  // === 获取配置 ===
  const deviceIds: string[] = [
    $persistentStore.read("Ninebot_DeviceId_1") || "请填写你的 deviceId 1",
    $persistentStore.read("Ninebot_DeviceId_2") || "请填写你的 deviceId 2",
  ]
  const authorizations: string[] = [
    $persistentStore.read("Ninebot_Authorization_1") || "请填写你的 Authorization 1",
    $persistentStore.read("Ninebot_Authorization_2") || "请填写你的 Authorization 2",
  ]

  if (authorizations.some((auth: string) => auth.includes("请填写"))) {
    $notification.post("九号签到", "", "⚠️ 请先配置 Authorization 与 deviceId，再运行脚本。")
    return $done()
  }

  const taskListUrl: string = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list"
  const signUrl: string = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign"
  const statusUrl: string = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
  const accountInfoUrl: string = "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"

  const title: string = "九号签到"
  let allMessages: string = ""

  for (let i = 0; i < deviceIds.length; i++) {
    const deviceId: string = deviceIds[i]
    const authorization: string = authorizations[i]

    let newSignDays: number = 0
    let signScore: number = 0
    let nCoin: number = 0
    let signCardsNum: number = 0
    let currentNCoinBalance: number = 0
    let message: string = ""

    const commonHeaders: any = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Authorization": authorization,
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609103606",
      "Referer": "https://h5-bj.ninebot.com/",
      "device_id": deviceId,
    }

    try {
      console.log(`开始执行九号签到 (账号 ${i + 1})...`)

      // === 签到请求 ===
      const signReq: any = { url: signUrl, method: "POST", headers: commonHeaders, body: JSON.stringify({ deviceId }) }
      const { data: signData } = await httpClientPost(signReq)
      const signResult: any = JSON.parse(signData || "{}")

      if (signResult.code === 0) {
        signScore = signResult.data.score || 0
        nCoin = signResult.data.nCoin || 0
        message += `✅ 签到成功！🎁 获得 $$e3NpZ25TY29yZX0g57uP6aqMICsg$${nCoin} N币`
      } else if (signResult.code === 540004) {
        message += "⚠️ 今日已签到"
      } else {
        message += `❌ 签到失败：${signResult.msg || "未知错误"}`
      }

      // === 获取签到状态 ===
      const { data: statusData } = await httpClientGet({ url: statusUrl, method: "GET", headers: commonHeaders })
      const statusResult: any = JSON.parse(statusData || "{}")
      if (statusResult.code === 0 && statusResult.data) {
        newSignDays = statusResult.data.consecutiveDays || 0
        signCardsNum = statusResult.data.signCardsNum || 0
        message += `\n🗓️ 连续签到: ${newSignDays} 天\n🎫 补签卡: ${signCardsNum} 张`
      }

      // === 获取账户余额 ===
      const { data: accountData } = await httpClientGet({ url: accountInfoUrl, method: "GET", headers: commonHeaders })
      const accountResult: any = JSON.parse(accountData || "{}")
      if (accountResult.code === 0 && accountResult.data) {
        currentNCoinBalance = accountResult.data.balance || 0
        message += `\n💰 当前N币余额: ${currentNCoinBalance}`
      }

      // === 盲盒任务 ===
      const { data: taskData } = await httpClientGet({ url: taskListUrl, method: "GET", headers: commonHeaders })
      const taskResult: any = JSON.parse(taskData || "{}")
      if (taskResult.code === 0 && taskResult.data?.notOpenedBoxes?.length > 0) {
        message += `\n\n📦 即将开启盲盒:`
        taskResult.data.notOpenedBoxes.forEach((box: any) => {
          message += `\n  - ${box.awardDays}天盲盒，还需${box.leftDaysToOpen}天`
        })
      }

    } catch (err: any) {
      message = `❌ 脚本执行出错：${err.message}`
      console.log("错误详情:", err)
    } finally {
      allMessages += `\n账号 ${i + 1}: ${message}`
      console.log(`签到完成 (账号 ${i + 1})。`)
    }
  }

  $notification.post(title, "", allMessages)
  if (typeof $done !== "undefined") $done()
}

run()