/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新日期：2025/11/21 16:00:00
Telegram 群：https://t.me/JiuHaoAPP
支持系统：iOS / iPadOS / macOS
*/

const isReq: boolean = typeof $request !== "undefined" && $request.headers !== undefined
const read = (k: string): any => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null)
const write = (v: any, k: string): boolean | void => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k) }
const notify = (title: string, sub: string, body: string): void => { if (typeof $notification !== "undefined") $notification.post(title, sub, body) }

interface Config {
  debug: boolean
  notify: boolean
  autoOpenBox: boolean
  autoRepair: boolean
  autoApplyBeta: boolean
  titlePrefix: string
  enable_capture: boolean
}

const cfg: Config = {
  debug: read("ninebot.debug") === "false" ? false : true,
  notify: read("ninebot.notify") === "false" ? false : true,
  autoOpenBox: read("ninebot.autoOpenBox") === "true",
  autoRepair: read("ninebot.autoRepair") === "true",
  autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
  titlePrefix: read("ninebot.titlePrefix") || "九号签到",
  enable_capture: read("ninebot.enable_capture") === "true"
}

// ---------- 抓包写入 ----------
if (isReq && cfg.enable_capture) {
  try {
    const h: Record<string, string> = $request.headers || {}
    const auth: string = h["Authorization"] || h["authorization"] || ""
    const dev: string = h["DeviceId"] || h["deviceid"] || h["device_id"] || ""
    const ua: string = h["User-Agent"] || h["user-agent"] || ""

    const lastWriteTime: number = Number(read("ninebot_last_write")) || 0
    const now: number = Date.now()
    if ((auth && dev && ua) && now - lastWriteTime > 60000) { // 1 分钟内不重复写
      write(auth, "ninebot.authorization")
      write(dev, "ninebot.deviceId")
      write(ua, "ninebot.userAgent")
      write(now, "ninebot_last_write")
      console.log(`[${new Date().toLocaleString()}] [Ninebot] ✅ 抓包写入成功`)
      if (cfg.notify) notify(cfg.titlePrefix, "抓包写入成功", "Authorization / DeviceId / User-Agent 已写入")
    }
  } catch (e) {
    console.error(`[${new Date().toLocaleString()}] [Ninebot] 抓包写入异常：`, e)
  }
  $done({})
}

// ---------- HTTP helper ----------
interface HttpRequestOptions {
  url: string
  headers: Record<string, string>
  body?: string
}

interface HttpResponse {
  data: any
  raw: any
  msg?: string
}

function httpPost({ url, headers, body = "{}" }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err: any, resp: any, data: any) => {
      if (err) {
        console.error(`[${new Date().toLocaleString()}] [Ninebot] HTTP POST 请求失败：`, err)
        reject(err)
      } else {
        try { resolve(JSON.parse(data || "{}")) } catch { resolve({ raw: data }) }
      }
    })
  })
}

function httpGet({ url, headers }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err: any, resp: any, data: any) => {
      if (err) {
        console.error(`[${new Date().toLocaleString()}] [Ninebot] HTTP GET 请求失败：`, err)
        reject(err)
      } else {
        try { resolve(JSON.parse(data || "{}")) } catch { resolve({ raw: data }) }
      }
    })
  })
}

// ---------- 主流程 ----------
!(async () => {
  let notifyBody: string = ""
  console.log(`[${new Date().toLocaleString()}] [Ninebot] -------------------- 开始执行九号签到脚本 --------------------`)

  const Authorization: string = read("ninebot.authorization") || ""
  const DeviceId: string = read("ninebot.deviceId") || ""
  const UserAgent: string = read("ninebot.userAgent") || ""

  if (!Authorization || !DeviceId) {
    notify(cfg.titlePrefix, "未配置 Token", "请先抓包写入 Authorization / DeviceId / User-Agent")
    $done()
  }

  const headers: Record<string, string> = {
    "Authorization": Authorization,
    "device_id": DeviceId,
    "User-Agent": UserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "Content-Type": "application/json",
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh"
  }

  const END: Record<string, string> = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status"
  }

  try {
    console.log(`[${new Date().toLocaleString()}] [Ninebot] 获取签到状态...`)
    const st: HttpResponse = await httpGet({ url: END.status, headers })
    console.log(`[${new Date().toLocaleString()}] [Ninebot] 当前连续签到天数:`, st.data?.consecutiveDays || 0)

    console.log(`[${new Date().toLocaleString()}] [Ninebot] 开始签到...`)
    const sign: HttpResponse = await httpPost({ url: END.sign, headers, body: JSON.stringify({ deviceId: DeviceId }) })
    notifyBody += `签到结果: ${sign.msg || "未知"}\n`

    console.log(`[${new Date().toLocaleString()}] [Ninebot] 签到返回:`, sign)

    const bal: HttpResponse = await httpGet({ url: END.balance, headers })
    notifyBody += `N币余额: ${bal.data?.balance || 0}\n`

    const box: HttpResponse = await httpGet({ url: END.blindBoxList, headers })
    notifyBody += `盲盒任务:\n`
    for (const b of box.data?.notOpenedBoxes || []) {
      notifyBody += `- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天\n`
      // 自动开启
      if (cfg.autoOpenBox && (b.leftDaysToOpen === 0)) {
        const r: HttpResponse = await httpPost({ url: END.blindBoxReceive, headers, body: JSON.stringify({}) })
        notifyBody += `→ ${b.awardDays}天盲盒领取结果: ${r.data?.rewardType === 1 ? "经验" : "N币"} +${r.data?.rewardValue || 0}\n`
        console.log(`[${new Date().toLocaleString()}] [Ninebot] ${b.awardDays}天盲盒领取结果:`, r)
      }
    }

    if (cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody)
    console.log(`[${new Date().toLocaleString()}] [Ninebot] -------------------- 脚本执行完成. --------------------`)
  } catch (e) {
    console.error(`[${new Date().toLocaleString()}] [Ninebot] 主流程异常:`, e)
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e))
  }

  $done()
})()