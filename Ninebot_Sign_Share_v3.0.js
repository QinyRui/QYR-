/*
📱 九号智能电动车自动签到脚本（Share+ 完整版）
==================================================
👤 作者：❥﹒﹏非我不可
📆 最后更新：2025/11/14
📦 版本：v3.0 Share+
💬 支持：
   - 自动签到
   - 获取签到状态
   - 获取盲盒列表
   - 自动开启已可开启的盲盒
   - 显示开启结果 + 剩余天数
   - 支持多账号（主号/副号）
   - BoxJS 支持昵称、通知开关、自定义显示
   - 全量通知（适配你的习惯，不做摘要）
   - 日志控制台输出全部请求 & 返回信息
*/

const scriptName = "Ninebot Sign v3.0 Share+"
const STORAGE_KEY = "NINEBOT_ACCOUNTS" // 多账号

// ====== 工具函数 ======
function httpClientGet(opts) {
  return new Promise((resolve, reject) => {
    $httpClient.get(opts, (err, resp, data) => {
      if (err) reject(err)
      else resolve({ resp, data })
    })
  })
}

function httpClientPost(opts) {
  return new Promise((resolve, reject) => {
    $httpClient.post(opts, (err, resp, data) => {
      if (err) reject(err)
      else resolve({ resp, data })
    })
  })
}

function notify(title, msg) {
  // 显示完整通知（你偏好）
  $notification.post(title, "", msg)
}

// ====== 主函数 ======
;(async () => {
  let accounts = $persistentStore.read(STORAGE_KEY)
  if (!accounts) {
    notify(scriptName, "❌ 未配置账号，请先抓取 Authorization & deviceId")
    return $done()
  }
  accounts = JSON.parse(accounts)

  for (const acc of accounts) {
    const headers = {
      "Authorization": acc.authorization,
      "deviceId": acc.deviceId,
      "User-Agent": acc.userAgent || "NinebotApp/6.x",
      "Content-Type": "application/json"
    }

    let msg = `👤 账号：${acc.name || "未命名"}\n`

    try {
      // 1) 签到
      msg += `\n🚀 开始签到…`
      let signRes = await httpClientPost({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
        headers,
        body: "{}"
      })
      let sign = JSON.parse(signRes.data || "{}")
      msg += `\n📄 Sign 返回：${sign.data ? "成功" : sign.msg || "失败"}`

      // 2) 获取状态
      msg += `\n\n📊 获取签到状态…`
      let st = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
        headers
      })
      let status = JSON.parse(st.data || "{}")

      msg += `\n✔ 今日签到：${status.data?.currentSignStatus == 1 ? "已签到" : "未签到"}`
      msg += `\n📅 连续：${status.data?.consecutiveDays} 天`
      msg += `\n🎫 补签卡：${status.data?.signCardsNum} 张`

      // 3) 获取 N 币余额
      let balRes = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user/balance/info",
        headers
      })
      let bal = JSON.parse(balRes.data || "{}")
      msg += `\n💰 N 币：${bal.data?.nCoinBalance ?? "?"}`

      // 4) 获取盲盒列表
      msg += `\n\n📦 盲盒情况：`
      let bres = await httpClientGet({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
        headers
      })
      let boxes = JSON.parse(bres.data || "{}")
      let arr = boxes.data?.notOpenedBoxes || []

      const opened = []

      for (const b of arr) {
        const days = b.awardDays
        const left = b.leftDaysToOpen

        // 未到时间
        if (left > 0) {
          msg += `\n  - ${days} 天盲盒：还需 ${left} 天`
          continue
        }

        // 自动开启盲盒
        msg += `\n  - ${days} 天盲盒：可开启 → 正在开启…`
        try {
          let openRes = await httpClientPost({
            url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/open",
            headers,
            body: JSON.stringify({ awardDays: days })
          })
          let od = JSON.parse(openRes.data || "{}")

          if (od.code === 0) {
            const reward = od.data?.awardName || "未知奖励"
            opened.push(`🎉 ${days} 天盲盒已开启，获得：${reward}`)
          } else {
            opened.push(`⚠️ ${days} 天盲盒开启失败：${od.msg || "未知错误"}`)
          }
        } catch (err) {
          opened.push(`❌ ${days} 天盲盒开启接口异常`)
        }
      }

      if (opened.length > 0) {
        msg += `\n\n🎁 盲盒开启结果：`
        opened.forEach(v => (msg += `\n  - ${v}`))
      }

    } catch (err) {
      msg += `\n❌ 执行异常：${err}`
    }

    // 完整通知（符合你的要求）
    notify(`📱 九号签到 · ${acc.name}`, msg)
    console.log(`==== ${acc.name} Log ====\n${msg}\n\n`)
  }

  $done()
})()