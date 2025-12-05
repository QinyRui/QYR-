/**
 * 九号智能 - 每日分享任务自动完成（插件集成版）
 * 作者: QinyRui
 * 版本: 1.0.2（与 Ninebot.Sign.Single 插件完全兼容）
 */

const BOXJS_PREFIX = "ninebot";
const CONFIG = {
    TASK_COMPLETE_BODY_A: "EjkgIAIDc90D7eLd7MkZY6wFOmMzu6Ni0T2xTpg7PF/NYPPuWLo4d7MKfRjjvS2KS5Kh5Uvpe2WaJ38NEMp5zEXn8Xxeyan/O6ZW7lLpPF+HpWTM/i6MKhMCikbLT8z005ADWV/HYhfeyB40udiUmxp+vRKOXSwqtU+wDp4nzdXHLl6hZCoeV386SWpfesSwzUq/fIOnWN9Yof+6prwYozGo3wsFvT/Z0JxnvfJ4JBGHX1DGVFlEZI7iTQvUHP2jTjW2TTwH9bqatMW51DO+VgInjIss/aUQSM/1DlhDDtb2VIJg5BkEVCyr/SE22nYLln7bzfkn9zacnjSFKYcNnYu6cwjdn4K+yYaMe+t2Z9rxgIZ2eV805I+dIy2EKSItLOvjiN3HkvrCTQ8mzh+Y031B1wQCwVCnKDMm+yZ8Y4hy8onniVEc4CUuC1OnFgoZS3z7Ach79BHOkw61+fKhpJjSgp4Fp6ZI+bfWgugGqNaEkcKNHl+UkL1PR9e5z35f1IhWdmgGIpf6Ixx8kR/OfJic9xCVZqzwk3dPDLxBspK5qLi6inNsqAobOHSMs//PuWY7i+djJIDGsog4Vk3S+svwzkmioQNW4aMwtxwRPreTDK1lh5FfP6dLJ+hBmssPCKLzawMfx/kQqUGN+ThEIXVNxmunNxzZI+9OrqBaaxyAV/n21hLVXoagYBX+U8clTcFVmvwIT5FCTgpz8NCrQ7nfHiV3UPAu9x6IwJMXD9We9O6D4mQTgVPfv2X7DsJH06/4Xis8c0aQd+KtS3SpjyL6GXONtTtjrkjUFjaOWlQbmRzeo619rArzZtvyoIe3+MDaTPWt3bzMXByZ8o1zDRm2WjZU73jFLZEPUyYaxkb1LT5UeA3CR3VvjGLb0JRPIkylPaHj+fJho6SplBEfZx+c1HBoFeNim6vTzgcmrN1sPo1jLsG/y7i1T4e8RiphlFYG0MgNfqw73kUk62ymz2pjabhEnhWmvqVOIhfkwBwvLRXeCgyg5wfyXLmuB3+Etd2urS1X9JUQ+xVTs3vo9NnIksRvEniuqDt8z5H5kMpnTIIVwZG4H75qYqYAKVBMNwBF5abB+IuGJYHHfECZBnL0KrAWRs/JZzqyLKggNuhpWV9scL1q8J20V3bIGUT9pvG8Fv8+9bnBG2NjZ+UIx3g1eWiYHUvni9/LEXb/scbQgZAssdq7EZzipmamFn2iR4aof2MYeSDd7GmaEdMTrDYL3/+HvEhUNHpPI2U9ROTCOMBGulsSSZBlZlA4CoWDMCaY6htFH6VAb1X7fi0CQm0zwbEh/TCXgskz/tygVCyW1k+MgErHrAcNYUlFi2ngw78rjyARKP6GMg4xu28XsF6ag3yh1bj+fA8JbPAe/bLVgqycawvvpciN8RXzSbXW4UgNmBfKqDsdnOCKytVCC9o4zSbTr50t0IKFt1mpYmXCRoK8f6cFy0Sm3EtCZBGb1D0/tE0h7/N/zTt/JF+PD/Il7q5LIPbNimQSiI7J0QIMnfKzrlU2w3oNxCgrqgCSXUOPemJaoGMESkxAnL+FsJB7qDuNzb2e5ZiphMAYEwaAq5vS4KFSmV+gAqIP8ulds88xV0lCgIrQFDT6KREPTczOFS9ZdLygeOvVYGN6SJ/2RRdyjjySfL+DklruzEsNvKd5zebzOPOX/cRBbM1Ntb6XxRaBvOK2m6sLjdPQD/fo6eM0rOeRxhqWpNweNvnhPJjXMGhWztY3EA/oeux9tAShs4n8880Qw+8gxcSoveoIyvCn98Pm3/dQwDtFnb05JkorvfYubpjzKsXOg6zT29e9abKskPw9uTaz3ExJA3CQMGVD4sSCwFkrqM5JP+lgDVHrb/AKOyrxQXUiwYuplQCwZ4quqA==",
    LOG_URL: "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
    REWARD_URL: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward",
    TASK_ID: "1823622692036079618",
    UA: $persistentStore.read(`${BOXJS_PREFIX}.userAgent`) || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
    NOTIFY_TITLE: $persistentStore.read(`${BOXJS_PREFIX}.titlePrefix`) || "九号签到助手"
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
        sendNotification("分享任务进度", "已提交完成报告，等待领取奖励...");
        setTimeout(() => claimReward(boxConfig), 1500);
    });
}

function claimReward(boxConfig) {
    const params = {
        url: CONFIG.REWARD_URL,
        method: "POST",
        timeout: 8000,
        headers: {
            "Host": "cn-cbu-gateway.ninebot.com",
            "Content-Type": "application/json",
            "Authorization": boxConfig.authorization,
            "User-Agent": CONFIG.UA,
            "device_id": boxConfig.deviceId,
            "Accept": "application/json",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9"
        },
        body: JSON.stringify({ taskId: CONFIG.TASK_ID })
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
                    subtitle = "分享任务完成";
                    content = `任务ID：${CONFIG.TASK_ID}\n✅ 奖励已发放`;
                } else {
                    subtitle = "领取奖励失败";
                    content = `错误码：${res.code}\n原因：${res.msg || "未知错误"}`;
                }
            } catch (e) {
                subtitle = "解析响应失败";
                content = `数据异常：${e.message}`;
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