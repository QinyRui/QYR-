/**
 * 九号智能 - 每日分享任务自动完成（集成参数校验+自动抓包）
 * 作者: QinyRui
 * 版本: 1.0.7（一体化整合，减少部署步骤）
 */

const BOXJS_PREFIX = "ninebot";
const CONFIG = {
    TASK_ID: "1823622692036079618",
    LOG_URL: "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    REWARD_URL: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward",
    DELAY_TIME: parseInt($persistentStore.read(`${BOXJS_PREFIX}.delayTime`), 10) || 1500,
    TIMEOUT: 10000,
    rewardHeaders: {
        "content-type": "application/json",
        "sys_language": "zh-CN",
        "accept": "application/json, text/plain, */*",
        "platform": "h5",
        "origin": "https://h5-bj.ninebot.com",
        "referer": "https://h5-bj.ninebot.com/",
        "language": "zh",
        "sec-fetch-dest": "empty",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "accept-language": "zh-CN,zh-Hans;q=0.9",
        "accept-encoding": "gzip, deflate, br"
    }
};

// -------------------------- 工具函数区 --------------------------
function readBoxJS(key) {
    return $persistentStore.read(`${BOXJS_PREFIX}.${key}`) || "";
}

function writeBoxJS(key, value) {
    if (!value) return;
    $persistentStore.write(value, `${BOXJS_PREFIX}.${key}`);
}

function sendNotification(subtitle, content) {
    const title = readBoxJS("titlePrefix") || "九号签到助手";
    const enableNotify = readBoxJS("notify") === "true";
    const enableFailNotify = readBoxJS("notifyFail") === "true";
    const isFail = subtitle.includes("失败") || subtitle.includes("错误") || subtitle.includes("⚠️");

    if (enableNotify || (isFail && enableFailNotify)) {
        typeof $notification !== "undefined" && $notification.post(title, subtitle, content);
    }

    const logLevel = readBoxJS("logLevel") || "info";
    const logMsg = `[${title}] ${subtitle} | ${content}`;
    if (logLevel === "debug" || logLevel === "full") {
        console.log(logMsg);
    } else if (isFail && (logLevel === "warn" || logLevel === "error")) {
        console.error(logMsg);
    }
}

function httpPost(params, callback) {
    if (typeof $httpClient !== "undefined") {
        $httpClient.post(params, callback);
    } else if (typeof $task !== "undefined") {
        $task.post(params).then(
            res => callback(null, res.response, res.data),
            err => callback(err.error, null, null)
        );
    } else {
        callback("不支持的运行环境", null, null);
    }
}

// -------------------------- 参数校验区 --------------------------
function validateParams() {
    const requiredParams = [
        { key: "authorization", name: "账号鉴权Token" },
        { key: "deviceId", name: "设备ID" },
        { key: "install_id", name: "Install ID" },
        { key: "ttreq", name: "TT Request" },
        { key: "v", name: "加密参数v" },
        { key: "s", name: "加密参数s" },
        { key: "r", name: "加密参数r" },
        { key: "task_complete_body", name: "任务提交Body" }
    ];

    const missingParams = [];
    requiredParams.forEach(param => {
        if (!readBoxJS(param.key)) missingParams.push(param.name);
    });

    if (missingParams.length > 0) {
        sendNotification("❌ 配置错误", [
            "以下核心参数缺失：",
            ...missingParams.map(p => `• ${p}`),
            "💡 解决：打开九号APP手动完成一次分享任务，触发抓包更新"
        ].join("\n"));
        return false;
    }

    const lastCapture = readBoxJS("lastCaptureTime");
    if (lastCapture) {
        try {
            const captureDate = new Date(lastCapture.replace(/-/g, "/"));
            const daysDiff = Math.floor((new Date() - captureDate)/(1000*60*60*24));
            if (daysDiff >= 7) {
                sendNotification("⚠️ 参数可能过期", [
                    `最后更新：${lastCapture}`,
                    "已超过7天，建议重新抓包更新",
                    "避免因参数过期导致领取失败"
                ].join("\n"));
            }
        } catch (e) {
            console.error("⚠️ 解析时间失败:", e.message);
        }
    }

    const body = readBoxJS("task_complete_body");
    if (body.length < 100) {
        sendNotification("⚠️ 任务Body异常", "提交Body过短，可能为无效数据，请重新抓包");
    }

    sendNotification("✅ 参数校验通过", [
        "所有核心参数齐全",
        `最后更新：${lastCapture || "未记录"}`,
        "即将执行分享任务..."
    ].join("\n"));
    return true;
}

// -------------------------- 任务执行区 --------------------------
function getBoxJsConfig() {
    const config = {
        authorization: readBoxJS("authorization"),
        deviceId: readBoxJS("deviceId"),
        installId: readBoxJS("install_id") || "7387027437663600641",
        ttreq: readBoxJS("ttreq") || "1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
        v: readBoxJS("v"),
        s: readBoxJS("s"),
        r: readBoxJS("r"),
        taskCompleteBody: readBoxJS("task_complete_body")
    };
    config.isValid = !!config.authorization && !!config.deviceId && !!config.v && !!config.s && !!config.r && !!config.taskCompleteBody;
    return config;
}

function submitTaskReport(boxConfig) {
    const params = {
        url: CONFIG.LOG_URL,
        method: "POST",
        timeout: CONFIG.TIMEOUT,
        headers: {
            "Host": "snssdk.ninebot.com",
            "Content-Type": "application/octet-stream;tt-data=a",
            "Cookie": `install_id=${boxConfig.installId}; ttreq=${boxConfig.ttreq}`,
            "User-Agent": readBoxJS("userAgent") || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
            "aid": "10000004",
            "Accept": "application/json",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Connection": "keep-alive"
        },
        body: boxConfig.taskCompleteBody,
        "body-base64": true
    };

    httpPost(params, (err, resp, data) => {
        if (err) {
            sendNotification("分享任务失败", `提交报告失败：${err}`);
            $done();
            return;
        }

        try {
            const reportRes = JSON.parse(data);
            if (reportRes.e !== 0) {
                throw new Error(reportRes.message || "未知错误（e≠0）");
            }
            sendNotification("分享任务进度", "✅ 完成报告提交成功，等待领取奖励...");
            setTimeout(() => claimReward(boxConfig), CONFIG.DELAY_TIME);
        } catch (e) {
            sendNotification("分享任务失败", `报告提交异常：${e.message}`);
            $done();
        }
    });
}

function claimReward(boxConfig) {
    const claimedKey = `${BOXJS_PREFIX}.task${CONFIG.TASK_ID}_claimed`;
    if (readBoxJS(`task${CONFIG.TASK_ID}_claimed`) === "true") {
        sendNotification("⚠️ 今日已领取", `任务ID：${CONFIG.TASK_ID} 无需重复执行`);
        $done();
        return;
    }

    const params = {
        url: CONFIG.REWARD_URL,
        method: "POST",
        timeout: CONFIG.TIMEOUT,
        headers: {
            ...CONFIG.rewardHeaders,
            "Host": "cn-cbu-gateway.ninebot.com",
            "Authorization": boxConfig.authorization,
            "User-Agent": readBoxJS("userAgent") || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
            "device_id": boxConfig.deviceId
        },
        body: JSON.stringify({
            v: boxConfig.v,
            s: boxConfig.s,
            r: boxConfig.r,
            taskId: CONFIG.TASK_ID
        })
    };

    httpPost(params, (err, resp, data) => {
        let subtitle = "领取奖励失败", content = "";
        if (err) {
            content = `网络错误：${err}`;
        } else {
            try {
                const res = JSON.parse(data);
                switch (res.code) {
                    case 0:
                        if (res.msg === "Success") {
                            subtitle = "✅ 分享任务+奖励领取双成功";
                            content = [
                                `任务ID：${CONFIG.TASK_ID}`,
                                `📅 完成时间：${new Date().toLocaleString()}`,
                                "🎁 奖励状态：已发放（APP端刷新查看）",
                                "💡 提示：未显示可等待5分钟后重试"
                            ].join("\n");
                            writeBoxJS(`task${CONFIG.TASK_ID}_claimed`, "true");
                            break;
                        }
                        throw new Error(`成功码异常：${JSON.stringify(res)}`);
                    case 2:
                        content = [
                            "错误码：2（参数错误）",
                            "原因：v/s/r 加密参数过期或无效",
                            "建议：重新抓包更新 v/s/r 参数"
                        ].join("\n");
                        break;
                    case 401:
                        content = [
                            "错误码：401（授权过期）",
                            "原因：Authorization Token 失效",
                            "建议：重新抓包更新 Authorization"
                        ].join("\n");
                        break;
                    case 500:
                        content = [
                            "错误码：500（服务端异常）",
                            "原因：九号服务器临时故障",
                            "建议：10分钟后重试"
                        ].join("\n");
                        break;
                    default:
                        content = [
                            `错误码：${res.code}`,
                            `原因：${res.msg || "未知错误"}`,
                            `响应数据：${JSON.stringify(res)}`
                        ].join("\n");
                }
            } catch (e) {
                subtitle = "解析响应失败";
                content = `数据异常：${e.message}\n原始响应：${data}`;
            }
        }
        sendNotification(subtitle, content);
        $done();
    });
}

function resetDailyState() {
    const today = new Date().toLocaleDateString();
    const lastResetDate = readBoxJS("lastResetDate");
    if (lastResetDate !== today) {
        writeBoxJS(`task${CONFIG.TASK_ID}_claimed`, "false");
        writeBoxJS("lastResetDate", today);
    }
}

// -------------------------- 入口函数 --------------------------
function main() {
    resetDailyState();
    if (!validateParams()) {
        $done();
        return;
    }
    const boxConfig = getBoxJsConfig();
    if (!boxConfig.isValid) {
        sendNotification("❌ 配置错误", "核心配置缺失：请在 BoxJS 中填写完整参数");
        $done();
        return;
    }
    submitTaskReport(boxConfig);
}

main();