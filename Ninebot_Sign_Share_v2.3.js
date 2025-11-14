/*
📱 九号智能电动车自动签到脚本（分享版）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/14
📦 版本：v2.3 Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 自动捕获 Authorization 与 deviceId
   - 显示签到经验、N币、补签卡数量、盲盒任务
   - 修复盲盒 leftDaysToOpen 为 undefined 的问题
   - 已签到时使用简洁提示（适配你的通知习惯）
   - 丰富调试日志输出

⚙️ 使用说明：
1️⃣ 打开九号 App 登录后，访问任意接口会自动捕获 Token。
2️⃣ 若需手动配置，可在 BoxJS 中添加以下变量：
      🔹 Ninebot_Authorization
      🔹 Ninebot_DeviceId
3️⃣ 可设置定时任务：

[Script]
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.3.js, tag=九号签到
http-request ^https:\/\/cn-cbu-gateway\.ninebot\.com\/ requires-body=0,script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.3.js, tag=九号Token捕获

📌 注意：
- 本脚本仅供学习研究使用，请勿公开分享包含 Token 的版本。

===========================================================
*/

// ====== [Token 捕获逻辑] ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"]
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"]

  if (auth) {
    $persistentStore.write(auth, "Ninebot_Authorization")
    console.log("✅ Authorization 捕获成功")
  }
  if (deviceId) {
    $persistentStore.write(deviceId, "Ninebot_DeviceId")
    console.log("✅ DeviceId 捕获成功")
  }

  if (auth || deviceId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存")
  }
  $done({})
  return
}

// ====== [封装请求函数] ======
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (error, response, data) => {
      if (error) reject(error.toString())
      else resolve({ response, data })
    })
  })
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (error, response, data) => {
      if (error) reject(error.toString())
      else resolve({ response, data })
    })
  })
}

// ====== [主执行函数] ======
async function run() {
  const authorization = $persistentStore.read("Ninebot_Authorization") || ""
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || ""

  if (!authorization || !deviceId) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 并抓取 Token（Authorization 与 deviceId）")
    return $done()
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
  }

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBox: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  }

  let message = ""
  let newSignDays = 0

  try {
    console.log("🚀 开始执行九号签到...")

    // === 签到 ===
    const signRes = await httpClientPost({
      url: urls.sign,
      headers,
      body: JSON.stringify({ deviceId }),
    })
    const signData = JSON.parse(signRes.data || "{}")

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data
      message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到"
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`
    }

    // === 签到状态 ===
    const statusRes = await httpClientGet({ url: urls.status, headers })
    const statusData = JSON.parse(statusRes.data || "{}")
    if (statusData.code === 0) {
      newSignDays = statusData.data.consecutiveDays || 0
      const signCardsNum = statusData.data.signCardsNum || 0
      message += `\n补签卡：${signCardsNum}张\n连续签到：${newSignDays}天`
    }

    // === N 币余额 ===
    const balanceRes = await httpClientGet({ url: urls.balance, headers })
    const balanceData = JSON.parse(balanceRes.data || "{}")
    if (balanceData.code === 0) {
      const nBalance = balanceData.data.balance ?? 0
      message += `\n当前N币余额：${nBalance}`
    }

    // === 盲盒任务（已修复 undefined） ===
    const boxRes = await httpClientGet({ url: urls.blindBox, headers })
    const boxData = JSON.parse(boxRes.data || "{}")

    if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
      message += `\n即将开启盲盒：`
      boxData.data.notOpenedBoxes.forEach(b => {
        const awardDays = b.awardDays ?? "?"
        const leftDays = b.leftDaysToOpen ?? 0
        message += `\n- ${awardDays}天盲盒，还需${leftDays}天`
      })
    }

  } catch (err) {
    message = `❌ 脚本执行出错：${err}`
  } finally {

    // =========== 通知格式化 ==============
    let notifTitle = ""
    let notifBody = ""

    if (message.includes("已签到")) {
      notifTitle = `✅ 今日已签到 · 连续 ${newSignDays} 天`
    } else if (message.includes("签到成功")) {
      notifTitle = `🎉 签到成功 · 连续 ${newSignDays} 天`
    } else {
      notifTitle = `九号签到`
    }

    // 匹配补签卡
    const matchCards = message.match(/补签卡：(\d+)张?/)
    if (matchCards) notifBody += `🎫 补签卡：${matchCards[1]} 张\n`

    // 匹配 N 币余额
    const matchCoin = message.match(/当前N币余额：(\d+)/)
    if (matchCoin) notifBody += `💰 N币余额：${matchCoin[1]}\n`

    // 提取盲盒列表
    const matchBoxes = message.includes("即将开启盲盒：")
      ? message.split("即将开启盲盒：")[1].trim()
      : ""

    if (matchBoxes) {
      const boxLines = matchBoxes
        .split("\n")
        .map(b => b.replace(/^[-\s]+/, "· "))
        .join("\n")
      notifBody += `\n📦 盲盒任务：\n${boxLines}`
    }

    // 发送通知
    $notification.post(
      "九号签到",
      notifTitle,
      notifBody.trim()
    )

    console.log("✅ 九号签到完成")
    $done()
  }
}

run()