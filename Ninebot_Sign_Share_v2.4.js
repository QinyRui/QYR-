/*
📱 九号智能电动车自动签到脚本 v2.4
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
💬 支持平台：Loon / Surge / Quantumult X / Stash / Shadowrocket / BoxJS
🔑 功能：
  - 自动签到九号智能电动车账户
  - 显示签到经验、N币、补签卡数量
  - 双号分开通知
  - 支持盲盒任务列表
  - 自动记录并展示连续签到天数
*/

function httpClientPost(request) {
  return new Promise((resolve, reject) => {
    $httpClient.post(request, (error, response, data) => {
      if (error) reject(new Error(error))
      else resolve({ response, data })
    })
  })
}

function httpClientGet(request) {
  return new Promise((resolve, reject) => {
    $httpClient.get(request, (error, response, data) => {
      if (error) reject(new Error(error))
      else resolve({ response, data })
    })
  })
}

async function run() {
  const authList = ($persistentStore.read("Ninebot_Authorization") || "").split("&")
  const deviceIdList = ($persistentStore.read("Ninebot_DeviceId") || "").split("&")
  const nameList = ($persistentStore.read("Ninebot_Names") || "").split("&")

  if (!authList[0] || !deviceIdList[0]) {
    $notification.post("九号签到", "", "⚠️ 请先配置 Authorization 与 deviceId，再运行脚本。")
    return $done()
  }

  for (let i = 0; i < authList.length; i++) {
    const authorization = authList[i]
    const deviceId = deviceIdList[i] || deviceIdList[0]
    const accountName = nameList[i] || `账号${i + 1}`

    const taskListUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list"
    const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign"
    const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
    const accountInfoUrl = "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Authorization": authorization,
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Segway v6 C 609103606",
      "Referer": "https://h5-bj.ninebot.com/",
      "device_id": deviceId,
    }

    let message = ""
    let newSignDays = 0, signScore = 0, nCoin = 0, signCardsNum = 0, currentNCoinBalance = 0

    try {
      // 签到请求
      const signReq = { url: signUrl, method: "POST", headers, body: JSON.stringify({ deviceId }) }
      const { data: signData } = await httpClientPost(signReq)
      const signResult = JSON.parse(signData || "{}")

      if (signResult.code === 0) {
        signScore = signResult.data.score || 0
        nCoin = signResult.data.nCoin || 0
        message += `✅ 签到成功！🎁 获得 ${signScore} 经验 + ${nCoin} N币`
      } else if (signResult.code === 540004) {
        message += "⚠️ 今日已签到"
      } else {
        message += `❌ 签到失败：${signResult.msg || "未知错误"}`
      }

      // 获取签到状态
      const { data: statusData } = await httpClientGet({ url: statusUrl, method: "GET", headers })
      const statusResult = JSON.parse(statusData || "{}")
      if (statusResult.code === 0 && statusResult.data) {
        newSignDays = statusResult.data.consecutiveDays || 0
        signCardsNum = statusResult.data.signCardsNum || 0
        message += `\n🗓️ 连续签到: ${newSignDays} 天\n🎫 补签卡: ${signCardsNum} 张`
      }

      // 获取账户余额
      const { data: accountData } = await httpClientGet({ url: accountInfoUrl, method: "GET", headers })
      const accountResult = JSON.parse(accountData || "{}")
      if (accountResult.code === 0 && accountResult.data) {
        currentNCoinBalance = accountResult.data.balance || 0
        message += `\n💰 当前N币余额: ${currentNCoinBalance}`
      }

      // 盲盒任务
      const { data: taskData } = await httpClientGet({ url: taskListUrl, method: "GET", headers })
      const taskResult = JSON.parse(taskData || "{}")
      if (taskResult.code === 0 && taskResult.data?.notOpenedBoxes?.length > 0) {
        message += `\n\n📦 即将开启盲盒:`
        taskResult.data.notOpenedBoxes.forEach(box => {
          message += `\n  - ${box.awardDays}天盲盒，还需${box.leftDaysToOpen}天`
        })
      }

    } catch (err) {
      message = `❌ 脚本执行出错：${err.message}`
      console.log("错误详情:", err)
    } finally {
      $notification.post(`${accountName} · 九号签到`, `连续 ${newSignDays} 天`, message)
      console.log(`${accountName} 签到完成。`)
      if (typeof $done !== "undefined") $done()
    }
  }
}

run()