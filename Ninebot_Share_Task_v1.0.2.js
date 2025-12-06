/**
 * 九号智能 - 每日分享任务自动完成（插件集成版）
 * 作者: QinyRui
 * 版本: 1.0.3（修复参数错误，兼容 Ninebot.Sign.Single 插件）
 */

const BOXJS_PREFIX = "ninebot";
const CONFIG = {
    // 分享任务日志上报配置（已更新为最新抓包的 base64 请求体）
    TASK_COMPLETE_BODY_A: "EjkgIAIDc90D7eLd7MkZY6wFOmMzu6Ni0T2xTpg7PF/NYPPuWLo4d7MKfRjjvS2KS5Kh5Uvpe2WaJ38NEMp5zEXn8Xxeyan/O6ZW7lLpPF+HpWTM/i6MKhMCikbLT8z005ADWV/HYhfeyB40udiUmxp+vRKOXSwqtU+wDp4nzdXHLl6hZCoeV386SWpfesSwzUq/fIOnWN9Yof+6prwYozGo3wsFvT/Z0JxnvfJ4JBGHX1DGVFlEZI7iTQvUHP2jTjW2TTwH9bqatMW51DO+VgInjIss/aUQSM/1DlhDDtb2VIJg5BkEVCyr/SE22nYLln7bzfkn9zacnjSFKYcNnYu6cwjdn4K+yYaMe+t2Z9rxgIZ2eV805I+dIy2EKSItLOvjiN3HkvrCTQ8mzh+Y031B1wQCwVCnKDMm+yZ8Y4hy8onniVEc4CUuC1OnFgoZS3z7Ach79BHOkw61+fKhpJjSgp4Fp6ZI+bfWgugGqNaEkcKNHl+UkL1PR9e5z35f1IhWdmgGIpf6Ixx8kR/OfJic9xCVZqzwk3dPDLxBspK5qLi6inNsqAobOHSMs//PuWY7i+djJIDGsog4Vk3S+svwzkmioQNW4aMwtxwRPreTDK1lh5FfP6dLJ+hBmssPCKLzawMfx/kQqUGN+ThEIXVNxmunNxzZI+9OrqBaaxyAV/n21hLVXoagYBX+U8clTcFVmvwIT5FCTgpz8NCrQ7nfHiV3UPAu9x6IwJMXD9We9O6D4mQTgVPfv2X7DsJH06/4Xis8c0aQd+KtS3SpjyL6GXONtTtjrkjUFjaOWlQbmRzeo619rArzZtvyoIe3+MDaTPWt3bzMXByZ8o1zDRm2WjZU73jFLZEPUyYaxkb1LT5UeA3CR3VvjGLb0JRPIkylPaHj+fJho6SplBEfZx+c1HBoFeNim6vTzgcmrN1sPo1jLsG/y7i1T4e8RiphlFYG0MgNfqw73kUk62ymz2pjabhEnhWmvqVOIhfkwBwvLRXeCgyg5wfyXLmuB3+Etd2urS1X9JUQ+xVTs3vo9NnIksRvEniuqDt8z5H5kMpnTIIVwZG4H75qYqYAKVBMNwBF5abB+IuGJYHHfECZBnL0KrAWRs/JZzqyLKggNuhpWV9scL1q8J20V3bIGUT9pvG8Fv8+9bnBG2NjZ+UIx3g1eWiYHUvni9/LEXb/scbQgZAssdq7EZzipmamFn2iR4aof2MYeSDd7GmaEdMTrDYL3/+HvEhUNHpPI2U9ROTCOMBGulsSSZBlZlA4CoWDMCaY6htFH6VAb1X7fi0CQm0zwbEh/TCXgskz/tygVCyW1k+MgErHrAcNYUlFi2ngw78rjyARKP6GMg4xu28XsF6ag3yh1bj+fA8JbPAe/bLVgqycawvvpciN8RXzSbXW4UgNmBfKqDsdnOCKytVCC9o4zSbTr50t0IKFt1mpYmXCRoK8f6cFy0Sm3EtCZBGb1D0/tE0h7/N/zTt/JF+PD/Il7q5LIPbNimQSiI7J0QIMnfKzrlU2w3oNxCgrqgCSXUOPemJaoGMESkxAnL+FsJB7qDuNzb2e5ZiphMAYEwaAq5vS4KFSmV+gAqIP8ulds88xV0lCgIrQFDT6KREPTczOFS9ZdLygeOvVYGN6SJ/2RRdyjjySfL+DklruzEsNvKd5zebzOPOX/cRBbM1Ntb6XxRaBvOK2m6sLjdPQD/fo6eM0rOeRxhqWpNweNvnhPJjXMGhWztY3EA/oeux9tAShs4n8880Qw+8gxcSoveoIyvCn98Pm3/dQwDtFnb05JkorvfYubpjzKsXOg6zT29e9abKskPw9uTaz3ExJA3CQMGVD4sSCwFkrqM5JP+lgDVHrb/AKOyrxQXUiwYuplQCwZ4quqA==",
    LOG_URL: "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    REWARD_URL: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward",
    TASK_ID: "1823622692036079618",
    // 奖励领取接口必填加密参数（从分享任务抓包中获取，与上报接口一致）
    v: "101",
    s: "auHj7baygCQwCRY+4BalBgGdicgjzv1Yvh8JEgvzHCQ6TRDeN1cRwibnLhWo2wnkSQxDjtsP0YaklWU2Qt/TSOPz8VKo2/GrPgA+//PkxB6WVK6+77wpk2/Zgz20hrFo8Nphe7wqbVSEYy0/Lmw4RM7iocn7QXwaFNVQ90KMYoU=",
    r: "H5Yi6myGxbbl62EghEcfoaZWe/ndD0ZC4fDeI9ux6Zt4+iqWsP+xJJVpIdQVYaAye4oUc4bqDzqjZVCp78eudE9BVXWm33JRYlUNYepjKGbjXV97LLb4Ijn9NzeYI0J+",
    // 奖励领取完整请求头（与抓包完全匹配，避免参数校验失败）
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
    },
    UA: $persistentStore.read(`${BOXJS_PREFIX}.userAgent`) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    NOTIFY_TITLE: $persistentStore.read(`${BOXJS_PREFIX}.titlePrefix`) || "九号签到助手",
    DELAY_TIME: $persistentStore.read(`${BOXJS_PREFIX}.delayTime`) || 1500 // 领取延迟（可在 BoxJS 调整）
};

function sendNotification(subtitle, content) {
    const title = CONFIG.NOTIFY_TITLE;
    const enableNotify = $persistentStore.read(`${BOXJS_PREFIX}.notify`) === "true";
    const enableFailNotify = $persistentStore.read(`${BOXJS_PREFIX}.notifyFail`) === "true";
    const isFail = subtitle.includes("失败");
    if (enableNotify || (isFail && enableFailNotify)) {
        typeof $notification !== "undefined" && $notification.post(title, subtitle, content);
    }
    const logLevel = $persistentStore.read(`${BOXJS_PREFIX}.logLevel`) || "info";
    if (logLevel === "debug" || (isFail && (logLevel === "warn" || logLevel === "error"))) {
        console.log(`[${title}] ${subtitle} | ${content}`);
    }
}

function httpPost(params, callback) {
    if (typeof $httpClient !== "undefined") {
        $httpClient.post(params, callback);
    } else if (typeof $task !== "undefined") {
        $task.post(params).then(res => callback(null, res.response, res.data), err => callback(err.error, null, null));
    }
}

function getBoxJsConfig() {
    const boxConfig = {};
    boxConfig.authorization = $persistentStore.read(`${BOXJS_PREFIX}.authorization`) || "";
    boxConfig.deviceId = $persistentStore.read(`${BOXJS_PREFIX}.deviceId`) || "";
    boxConfig.installId = $persistentStore.read(`${BOXJS_PREFIX}.install_id`) || "7387027437663600641";
    boxConfig.ttreq = $persistentStore.read(`${BOXJS_PREFIX}.ttreq`) || "1$b5f546fbb02eadcb22e472a5b203b899b5c4048e";
    return boxConfig;
}

function submitTaskReport(boxConfig) {
    const params = {
        url: CONFIG.LOG_URL,
        method: "POST",
        timeout: 8000,
        headers: {
            "Host": "snssdk.ninebot.com",
            "Content-Type": "application/octet-stream;tt-data=a",
            "Cookie": `install_id=${boxConfig.installId}; ttreq=${boxConfig.ttreq}`,
            "User-Agent": CONFIG.UA,
            "aid": "10000004",
            "Accept": "application/json",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Connection": "keep-alive"
        },
        body: CONFIG.TASK_COMPLETE_BODY_A,
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
                throw new Error(`报告提交失败：${reportRes.message || '未知错误'}`);
            }
        } catch (e) {
            sendNotification("分享任务失败", `报告提交异常：${e.message}`);
            $done();
            return;
        }
        sendNotification("分享任务进度", "已提交完成报告，等待领取奖励...");
        setTimeout(() => claimReward(boxConfig), CONFIG.DELAY_TIME);
    });
}

function claimReward(boxConfig) {
    // 检查是否已领取（避免重复执行）
    const hasClaimed = $persistentStore.read(`${BOXJS_PREFIX}.task${CONFIG.TASK_ID}_claimed`);
    if (hasClaimed === "true") {
        sendNotification("⚠️ 已领取过奖励", `任务ID：${CONFIG.TASK_ID} 今日已领取，无需重复运行`);
        $done();
        return;
    }

    // 拼接完整请求头（固定字段 + 动态配置）
    const headers = {
        ...CONFIG.rewardHeaders,
        "Host": "cn-cbu-gateway.ninebot.com",
        "Authorization": boxConfig.authorization,
        "User-Agent": CONFIG.UA,
        "device_id": boxConfig.deviceId
    };

    // 完整请求体（包含 v/s/r 加密参数，解决 Params error）
    const requestBody = JSON.stringify({
        v: CONFIG.v,
        s: CONFIG.s,
        r: CONFIG.r,
        taskId: CONFIG.TASK_ID
    });

    const params = {
        url: CONFIG.REWARD_URL,
        method: "POST",
        timeout: 8000,
        headers: headers,
        body: requestBody
    };

    httpPost(params, (err, resp, data) => {
        let subtitle = "", content = "";
        if (err) {
            subtitle = "领取奖励失败";
            content = `网络错误：${err}`;
        } else {
            try {
                const res = JSON.parse(data);
                if (res.code === 0 && res.msg === "Success") {
                    subtitle = "✅ 分享任务+奖励领取双成功";
                    content = `任务ID：${CONFIG.TASK_ID}\n📅 完成时间：${new Date().toLocaleString()}\n🎁 奖励状态：已发放（APP端刷新查看）\n💡 提示：若未显示领取，等待5分钟后重试`;
                    $persistentStore.set(`${BOXJS_PREFIX}.task${CONFIG.TASK_ID}_claimed`, "true"); // 记录领取状态
                } else if (res.code === 2) {
                    subtitle = "领取奖励失败";
                    content = `错误码：${res.code}\n原因：参数错误（v/s/r 过期或缺失）\n建议：重新抓包获取最新 v/s/r 参数`;
                } else if (res.code === 401) {
                    subtitle = "领取奖励失败";
                    content = `错误码：${res.code}\n原因：Authorization 过期，请重新抓包更新`;
                } else {
                    subtitle = "领取奖励失败";
                    content = `错误码：${res.code}\n原因：${res.msg || "未知错误"}\n响应数据：${JSON.stringify(res)}`;
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

function main() {
    const boxConfig = getBoxJsConfig();
    if (!boxConfig.authorization || !boxConfig.deviceId) {
        sendNotification("配置错误", "核心配置缺失，请先通过抓包写入 Token/DeviceId");
        $done();
        return;
    }
    submitTaskReport(boxConfig);
}

main();