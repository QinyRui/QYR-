/**
 * 九号智能 - 每日分享任务自动完成（插件集成版）
 * 作者: QinyRui
 * 版本: 1.0.2（与 Ninebot.Sign.Single 插件完全兼容）
 */

const BOXJS_PREFIX = "ninebot";
const CONFIG = {
    TASK_COMPLETE_BODY_A: "EjkgIAIDn46Cep3Gllh7a+ZAZZ8l8dWPEqkgDwSVIPvff7N4u/wGrLtiUpc96hu4MmGRGikBX7LU7FA4WpkAt+9lNd+AwrflxcNDWOxS8AgRja0zOCBYsM8lwE+3hrdfIB/PWV6qmLUM2OvxwSKdiYIpMnOm0ggV1eivxQXHgw7g0an32ht5AriIyignyMvBzf+Jcql7b/FL5KKSAHclhKClCJttOo3CL95NMNCBb6dTV/iHF4ffTpmXDk4upB8d0aByv7gVvk+pus1rzM5c4t8EqVma91ppdPkkuLcgA8GTPoX8/p4A47Ayh5nb89NETy+kwwwvQqq9OfTxhRjYtnVI26ta/fho18wAneSkQWfVHwkDWde4QldIeDb6czS4QrrixdN+31XrLP6YjwDXgwFEv3bEkzEqdHlfl2lNEuQ2VE7OOO9AJQ2ljofROa908VUk7Quuf1yYYs/Ou6e6jgWMh1XmG4qfhD2dJ5aOBc/9MqXlnSTu5G27UViL0YmjjPlX0gwhocLKPdL1VqwI3zJquPi0uSNPKgiALJRWSiek9rhiHBuBEhmCBd2t6X15jr+NDqzZtQnb+ZAgakOYdzwVUbLeaeCDWvh5srTrEsSUgrcU00MyYLvELyTfwZ0e9K4JbOHwkup8ZJ9tBjQkv4jsFbXgMDNw8d3u5h/zloZtuweiyYfa/ZCl7WwK1n7I2/BGcGQ7HrI41394OJFjaEY7mlg6WDKQNjAmFpQYWyFz5WsU5U+rzB3/skZRFZSLbr3cIghppOj/Fgv+rMijCItXTxBClPBMh9T3dYgtDHh37Y/5REjjtKOK60CJof7hlF+kd7oelbNG0rKoGlgJ43I8ehZT14Ys8yVrI+Xz6iMv3trf32WaxAOro0zhDL6G6GFK0z3Td+QbM64EohpHDrcBlrfF971KRhfeaZqIug/7dMCtTw1Y1t9dVd0llgJ0KjTEm7gYKd3JGqAAmdzNjI6BrKVQ4gkzYS8TgUGe1wzw3yNYssj0qKv6J2Mbod/Q9RMlECVZH+Zm2VxYWfqp4JgMlG25bcl8Q3hL2FD2RzCjCzH9nmnpS7eNL+OaRnOaAzxYfsaWF0rES2pqeBp8yk8Bh5VZEoKmm08Ngh5XtLa4Vr+z9NgD8DrfEtDVQeZpJhrxmoIVA8hZaVGxXee431eYhAWwdFNlev0quJZ/sJXPLd+g6qkuzCCmYMqUMrrdkmFxCrtTP1aqMrNtqdOCuqlh89tRz4yd/rKCpO+r+JNTeMPnrt8XKccPbQtxfz7Ezcs5Qvk9J2IN8JtnI4yY1Wmfv54sp6L+JZFz5ABbgTyC/TgW9OrlOLg7X4Ryg3MHyDtzBx9M68ZbTXJ6O7lKcIFur/K9Ydzyjq+OzNR+AB/XAh/VewNNqcGUPwSLoJ7yeQKA0AXMqFTSOeykBScS3BDnVeK26Fw3wqYXJJS5x6yMzpYSN22ePIgC7pe7l/PZAJXwvRHcxJgVB6mvT+ElfsWJJbbemTl1FuMSs8jcRH1SJrSxfAOr5uI8S8Fdc2OgUCADjXuM4UTYEr0Ytk8Q1vWOY9FNcOtyFv/AkhpGD5TLMocaYkflZj4CKesLhJ0ALnXLBNJ5GTnrF9oZmPHF1zqR/L5eh043smg2o6tGYvwxXJHgbChr9xE1LISM3sbPs0KQi8zCno0qehrRYhCJv0/nShM3CHLTyTRdyOyt+OaydRAdr/itpWg2tiGxYZ2EiQIa35beMUs9F/JO9iU6mxvBG4C3JAPGtp1YE1UisvezJ64305TvF2Kor20AqI8164ZtpYlK1/iMd93PPIu+/aJ+4Vj8E+c/qNawFfm/CARwCIJTe4r725mDJl4l0teH385ZqikfppHyZkj+l1/DvaZTUXeYJv22yy2FrD2e250pDPVTxAMjoGaNE6RRMXJ9YR0mA6Uq94QqawaMRHbeT7V9aD7iIwB1mAzWqM8JlTGnmZbgx+Q=",
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