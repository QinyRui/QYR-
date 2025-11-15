/*
📱 九号智能电动车自动签到脚本（分享版）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/13
📦 版本：v2.1 Share Edition
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 自动捕获 Authorization 与 deviceId
   - 显示签到经验、N币、补签卡数量、盲盒任务
   - 支持 BoxJS 与 $persistentStore 存储
   - 已签到时显示简短提示

⚙️ 使用说明：
1️⃣ 打开九号 App 登录后，访问任意接口时会自动捕获 Token（无需手动填写）。
2️⃣ 若需手动配置，可在 BoxJS 中添加以下变量：
      🔹 Ninebot_Authorization
      🔹 Ninebot_DeviceId
3️⃣ 可设置定时任务（建议每日 8:00 执行）：

[Script]
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.1.js, tag=九号签到
# 可选：用于自动捕获Token
http-request ^https:\/\/cn-cbu-gateway\.ninebot\.com\/ requires-body=0,script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.1.js, tag=九号Token捕获

📌 注意：
- 请勿公开分享包含你个人 Token 的版本。
- 本脚本仅供学习研究使用。

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

// ====== [网络请求封装] ======
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
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || ""
  const authorization = $persistentStore.read("Ninebot_Authorization") || ""

  if (!authorization || !deviceId) {
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 抓取 Token（Authorization 与 deviceId）")
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
  const title = "九号签到"

  try {
    console.log("🚀 开始执行九号签到...")

    // === 签到请求 ===
    const signRes = await httpClientPost({
      url: urls.sign,
      headers,
      body: JSON.stringify({ deviceId }),
    })
    const signData = JSON.parse(signRes.data || "{}")

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data
      message += `✅ 签到成功 🎉\n🎁 获得 ${score} 经验 + ${nCoin} N币`
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到"
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`
    }

    // === 获取签到状态 ===
    const statusRes = await httpClientGet({ url: urls.status, headers })
    const statusData = JSON.parse(statusRes.data || "{}")
    if (statusData.code === 0 && statusData.data) {
      newSignDays = statusData.data.consecutiveDays || 0
      const signCardsNum = statusData.data.signCardsNum || 0
      message += `\n🗓️ 连续签到：${newSignDays} 天\n🎫 补签卡：${signCardsNum} 张`
    }

    // === 获取账户余额 ===
    const balanceRes = await httpClientGet({ url: urls.balance, headers })
    const balanceData = JSON.parse(balanceRes.data || "{}")
    if (balanceData.code === 0 && balanceData.data) {
      const nBalance = balanceData.data.balance || 0
      message += `\n💰 当前 N币余额：${nBalance}`
    }

    // === 获取盲盒任务 ===
    const boxRes = await httpClientGet({ url: urls.blindBox, headers })
    const boxData = JSON.parse(boxRes.data || "{}")
    if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
      message += `\n\n📦 即将开启盲盒：`
      boxData.data.notOpenedBoxes.forEach(b => {
        message += `\n  - ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`
      })
    }
  } catch (err) {
    message = `❌ 脚本执行出错：${err.message}`
  } finally {
    if (message.includes("已签到")) {
      $notification.post(title, `已签到 · 连续 ${newSignDays} 天`, "")
    } else {
      $notification.post(title, `连续 ${newSignDays} 天`, message)
    }
    console.log("✅ 九号签到完成")
    $done()
  }
}

run()