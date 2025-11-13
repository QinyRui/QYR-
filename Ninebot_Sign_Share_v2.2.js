/*
📱 九号智能电动车自动签到脚本（多账户版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
💬 适用平台：Loon / Surge / Quantumult X / Stash / Shadowrocket 等
🔑 功能：
   - 多账户自动签到
   - BoxJS 配置账户信息
   - 自定义显示名称（主号/副号）
   - 单独通知每个账户签到状态
   - 盲盒字段安全处理，避免 undefined
*/

if (typeof $request !== "undefined" && $request.headers) {
  // === Token 捕获逻辑 ===
  const auth = $request.headers["Authorization"] || $request.headers["authorization"]
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"]
  if (auth) $persistentStore.write(auth, "Ninebot_Authorization")
  if (deviceId) $persistentStore.write(deviceId, "Ninebot_DeviceId")
  if (auth || deviceId) {
    $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存")
  }
  $done({})
  return
}

// ===== HTTP 请求封装 =====
function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (err, resp, data) => {
      if (err) reject(err.toString())
      else resolve({ response: resp, data })
    })
  })
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (err, resp, data) => {
      if (err) reject(err.toString())
      else resolve({ response: resp, data })
    })
  })
}

// ===== 主函数 =====
async function run() {
  const accountsRaw = $persistentStore.read("Ninebot_Accounts") || "[]"
  let accounts = []
  try { accounts = JSON.parse(accountsRaw) } catch(e) { }

  if (!accounts.length) {
    $notification.post("九号签到", "", "⚠️ 请在 BoxJS 配置 Ninebot_Accounts，至少一个账户")
    return $done()
  }

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBox: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  }

  for (let account of accounts) {
    const name = account.name || "九号签到"
    const authorization = account.authorization || ""
    const deviceId = account.deviceId || ""

    if (!authorization || !deviceId) {
      $notification.post(name, "", "⚠️ 缺少 Authorization 或 DeviceId")
      continue
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

    let message = ""
    let newSignDays = 0

    try {
      // === 签到 ===
      const signRes = await httpClientPost({
        url: urls.sign,
        headers,
        body: JSON.stringify({ deviceId })
      })
      const signData = JSON.parse(signRes.data || "{}")
      if (signData.code === 0) {
        const { score = 0, nCoin = 0 } = signData.data || {}
        message += `🎉 今日签到成功！\n🎁 获得 ${score} 经验 + ${nCoin} N币`
      } else if (signData.code === 540004) {
        message += "⚠️ 今日已签到"
      } else {
        message += `❌ 签到失败：${signData.msg || "未知错误"}`
      }

      // === 签到状态 ===
      const statusRes = await httpClientGet({ url: urls.status, headers })
      const statusData = JSON.parse(statusRes.data || "{}")
      if (statusData.code === 0 && statusData.data) {
        newSignDays = statusData.data.consecutiveDays || 0
        const signCardsNum = statusData.data.signCardsNum || 0
        message += `\n连续签到：${newSignDays}天\n补签卡：${signCardsNum}张`
      }

      // === N币余额 ===
      const balanceRes = await httpClientGet({ url: urls.balance, headers })
      const balanceData = JSON.parse(balanceRes.data || "{}")
      if (balanceData.code === 0 && balanceData.data) {
        const nBalance = balanceData.data.balance || 0
        message += `\n当前N币余额：${nBalance}`
      }

      // === 盲盒任务 ===
      const boxRes = await httpClientGet({ url: urls.blindBox, headers })
      const boxData = JSON.parse(boxRes.data || "{}")
      if (boxData.code === 0 && boxData.data?.notOpenedBoxes?.length > 0) {
        message += `\n即将开启盲盒：`
        boxData.data.notOpenedBoxes.forEach(b => {
          const days = b.awardDays ?? b.days ?? 0
          const left = b.leftDaysToOpen ?? b.leftDays ?? b.remainDays ?? 0
          message += `\n- ${days}天盲盒，还需${left}天`
        })
      }

    } catch (err) {
      message = `❌ 脚本执行出错：${err.message || err}`
    }

    // ===== 通知排版 =====
    let notifTitle = ""
    let notifBody = ""

    if (message.includes("已签到")) notifTitle = `✅ 今日已签到 · 连续 ${newSignDays} 天`
    else if (message.includes("签到成功")) notifTitle = `🎉 签到成功 · 连续 ${newSignDays} 天`
    else notifTitle = "九号签到"

    const matchCards = message.match(/补签卡：(\d+)/)
    const matchCoin = message.match(/余额：(\d+)/)
    const matchBoxes = message.match(/即将开启盲盒：([\s\S]*)/)

    if (matchCards) notifBody += `🎫 补签卡：${matchCards[1]} 张\n`
    if (matchCoin) notifBody += `💰 N币余额：${matchCoin[1]}\n`
    if (matchBoxes) {
      const boxes = matchBoxes[1].trim().split("\n").map(b => b.replace(/^[-\s]+/, "· ")).join("\n")
      notifBody += `\n📦 盲盒任务：\n${boxes}`
    }

    $notification.post(name, notifTitle, notifBody.trim())
    console.log(`✅ ${name} 签到完成`)
  }

  $done()
}

run()