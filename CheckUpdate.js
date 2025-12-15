// 九号电动车脚本更新检测脚本（Loon 专用）
// 检测目标：Ninebot_Sign_Single_v2.7.js
const SCRIPT_NAME = "Ninebot_Sign_Single_v2.7.js"
const REMOTE_SCRIPT_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.7.js"
const UPDATE_NOTICE_TITLE = "九号签到脚本更新提醒"

// 版本号提取正则（匹配脚本内的 version 注释，例如：// version: 2.7.1）
const VERSION_REG = /\/\/\s*version:\s*([\d\.]+)/i

// 主函数
async function checkUpdate() {
    try {
        // 1. 获取远程脚本内容和更新时间
        const remoteResp = await fetch(REMOTE_SCRIPT_URL, {
            method: "GET",
            headers: {
                "User-Agent": "Loon/2.1.0"
            }
        })

        if (!remoteResp.ok) {
            console.log(`[更新检测] 远程脚本请求失败，状态码：${remoteResp.status}`)
            $done()
            return
        }

        const remoteContent = await remoteResp.text()
        const remoteLastModified = remoteResp.headers.get("Last-Modified") || "未知时间"
        const remoteVersion = remoteContent.match(VERSION_REG)?.[1] || "未知版本"

        // 2. 获取本地脚本内容（Loon 本地缓存）
        let localVersion = "未安装"
        try {
            const localContent = await $httpClient.get(`script://${SCRIPT_NAME}`)
            if (localContent?.body) {
                localVersion = localContent.body.match(VERSION_REG)?.[1] || "本地版本未知"
            }
        } catch (e) {
            console.log(`[更新检测] 本地脚本未找到：${e.message}`)
        }

        // 3. 版本对比（简易语义化版本对比）
        const isUpdateAvailable = compareVersion(remoteVersion, localVersion) > 0

        // 4. 推送通知
        let message = ""
        if (isUpdateAvailable) {
            message = `发现新版本！\n本地版本：${localVersion}\n远程版本：${remoteVersion}\n更新时间：${remoteLastModified}\n\n请前往 Loon 插件设置刷新脚本`
            console.log(`[更新检测] ${message}`)
            $notification.post(UPDATE_NOTICE_TITLE, "", message)
        } else {
            message = `当前脚本已是最新版本\n本地版本：${localVersion}\n远程版本：${remoteVersion}\n最后更新：${remoteLastModified}`
            console.log(`[更新检测] ${message}`)
        }

        $done()
    } catch (error) {
        console.log(`[更新检测] 异常：${error.message}`)
        $done()
    }
}

// 语义化版本对比工具函数
// 返回 1: remote > local; 0: 相等; -1: remote < local
function compareVersion(remoteVer, localVer) {
    if (remoteVer === "未知版本" || localVer === "未安装") return 1
    if (localVer === "本地版本未知") return -1

    const remoteParts = remoteVer.split(".").map(Number)
    const localParts = localVer.split(".").map(Number)
    const maxLen = Math.max(remoteParts.length, localParts.length)

    for (let i = 0; i < maxLen; i++) {
        const r = remoteParts[i] || 0
        const l = localParts[i] || 0
        if (r > l) return 1
        if (r < l) return -1
    }
    return 0
}

// 执行检测
checkUpdate()