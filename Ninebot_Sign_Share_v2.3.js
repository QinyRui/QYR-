/*
📱 九号智能电动车自动签到脚本（分享版 v2.2 优化）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/14
📦 版本：v2.2 Share Edition（日志+优化通知版）
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能简介：
   - 自动签到九号智能电动车账户
   - 自动捕获 Authorization 与 deviceId
   - 显示签到经验、N币、补签卡数量、盲盒任务
   - 已签到时使用简洁提示
   - 通知排版优化，更直观
   - 控制台详细日志输出
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

// ====== [主执行函数 - 日志详细输出 + 优化通知] ======
async function run() {
  const deviceId = $persistentStore.read("Ninebot_DeviceId") || ""
  const authorization = $persistentStore.read("Ninebot_Authorization") || ""

  if (!authorization || !deviceId) {
    console.log("⚠️ 未获取到 Token，请先登录九号 App 捕获 Authorization 与 deviceId")
    $notification.post("九号签到", "", "⚠️ 请先登录九号 App 抓取 Token")
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

    // === 签到请求 ===
    console.log("🔹 发送签到请求...")
    const signRes = await httpClientPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) })
    console.log("📥 签到返回数据:", signRes.data)
    const signData = JSON.parse(signRes.data || "{}")

    if (signData.code === 0) {
      const { score = 0, nCoin = 0 } = signData.data
      message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`
    } else if (signData.code === 540004) {
      message += "⚠️ 今日已签到"
    } else {
      message += `❌ 签到失败：${signData.msg || "未知错误"}`
    }

    // === 获取签到状态 ===
    console.log("🔹 获取签到状态...")
    const statusRes = await httpClientGet({ url: urls.status, headers })
    console.log("📥 签到状态返回:", statusRes.data)
    const statusData = JSON.parse(statusRes.data || "{}")
    if (statusData.code === 0 && statusData.data) {
      newSignDays = statusData.data.consecutiveDays || 0
      const signCardsNum = statusData.data.signCardsNum || 0
      message += `\n补签卡：${signCardsNum}张`
    }

    // === 获取账户余额 ===
    console.log("🔹 获取账户余额...")
    const balanceRes = await httpClientGet({ url: urls.balance, headers })
    console.log("📥 余额返回:", balanceRes.data)
    const balanceData = JSON.parse(balanceRes.data || "{}")
    if (balanceData.code === 0 && balanceData.data) {
      const nBalance = balanceData.data.balance || 0
      message += `\n余额：${nBalance}`
    }

    // === 获取盲盒任务 ===
    console.log("🔹 获取盲盒任务...")
    const boxRes = await httpClientGet({ url: urls.blindBox, headers })
    console.log("📥 盲盒返回:", boxRes.data)
    const boxData = JSON.parse(boxRes.data || "{}")
    if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
      message += `\n即将开启盲盒：`
      boxData.data.notOpenedBoxes.forEach(b => {
        message += `\n- ${b.awardDays}天盲盒，还需${b.leftDaysToOpen}天`
      })
    }

  } catch (err) {
    console.error("❌ 脚本执行出错:", err)
    message = `❌ 脚本执行出错：${err.message || err}`
  } finally {
    // ===== 优化通知排版 =====
    let notifTitle = ""
    let notifBody = []

    if (message.includes("已签到")) {
      notifTitle = `✅ 今日已签到 · 连续 ${newSignDays} 天`
    } else if (message.includes("签到成功")) {
      notifTitle = `🎉 签到成功 · 连续 ${newSignDays} 天`
    } else {
      notifTitle = `九号签到`
    }

    // 补签卡
    const matchCards = message.match(/补签卡：(\d+)/)
    if (matchCards) notifBody.push(`🎫 补签卡：${matchCards[1]} 张`)

    // N币余额
    const matchCoin = message.match(/余额：(\d+)/)
    if (matchCoin) notifBody.push(`💰 N币余额：${matchCoin[1]}`)

    // 盲盒任务
    const matchBoxes = message.match(/即将开启盲盒：([\s\S]*)/)
    if (matchBoxes) {
      const boxes = matchBoxes[1]
        .trim()
        .split("\n")
        .map(b => b.replace(/^[-\s]+/, "· "))
      notifBody.push(`📦 盲盒任务：\n${boxes.join("\n")}`)
    }

    console.log("✅ 九号签到完成，准备发送通知")
    $notification.post(notifTitle, "", notifBody.join("\n"))
    $done()
  }
}

run()