(async () => {
    const $argument = typeof $argument !== 'undefined' ? $argument : {};
    const notify = $argument.notify !== 'false';
    const titlePrefix = $argument.titlePrefix || "九号签到助手";

    const log = (...args) => console.log(...args);
    const notifySend = (msg) => notify && $notification.post(titlePrefix, "", msg);

    const Authorization = $persistentStore.read("ninebot.authorization") || "";
    const DeviceId = $persistentStore.read("ninebot.deviceId") || "";
    const UserAgent = $persistentStore.read("ninebot.userAgent") || "";

    if (!Authorization || !DeviceId) {
        notifySend("未配置 Authorization 或 DeviceId，请先抓包写入！");
        return;
    }

    const headers = {
        "Authorization": Authorization,
        "DeviceId": DeviceId,
        "User-Agent": UserAgent,
        "Content-Type": "application/json;charset=UTF-8"
    };

    const status = await $httpClient.get({
        url: `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status?t=${Date.now()}`,
        headers
    }).then(r => JSON.parse(r.data)).catch(() => null);

    if (!status) {
        notifySend("签到状态请求失败！");
        return;
    }

    if (status.data.currentSignStatus === 0) {
        const sign = await $httpClient.post({
            url: `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign`,
            headers
        }).then(r => JSON.parse(r.data)).catch(() => null);

        if (sign && sign.code === 0) {
            log("签到成功");
        } else {
            notifySend("签到失败！");
        }
    } else {
        log("今日已签到");
    }

    const taskList = await $httpClient.get({
        url: `https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS`,
        headers
    }).then(r => JSON.parse(r.data)).catch(() => null);

    if (taskList && taskList.data) {
        for (let task of taskList.data) {
            if (!task.finished) {
                await $httpClient.post({
                    url: `https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward`,
                    headers,
                    body: JSON.stringify({taskId: task.taskId})
                }).then(r => log("分享任务领取:", r.data)).catch(e => log(e));
            }
        }
    }

    const blindBox = await $httpClient.get({
        url: `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blindBox?t=${Date.now()}`,
        headers
    }).then(r => JSON.parse(r.data)).catch(() => null);

    if (blindBox && blindBox.data && blindBox.data.notOpenedBoxes) {
        for (let box of blindBox.data.notOpenedBoxes) {
            if (box.leftDaysToOpen <= 0) continue;
            await $httpClient.post({
                url: `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blindBox/open`,
                headers,
                body: JSON.stringify({awardDays: box.awardDays})
            }).then(r => log(`盲盒 ${box.awardDays} 天已开启`, r.data)).catch(e => log(e));
        }
    }

    notifySend(`签到完成！当前连续签到：${status.data.consecutiveDays}天，补签卡：${status.data.signCardsNum}张`);
})();
$done();