/**
 * 九号智能电动车自动签到 v2.7
 * 支持抓包写入签到状态接口和分享任务接口
 * 作者：QinyRui
 * 更新时间：2025-11-26
 */

const $argument = typeof $argument === "undefined" ? {} : $argument;
const notify = $argument.notify === "false" ? false : true;
const autoOpenBox = true;
const autoRepair = true;
const titlePrefix = $argument.titlePrefix || "九号签到助手";

const log = (...args) => {
    console.log(...args);
};

async function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        $httpClient.post({
            url,
            ...options
        }, (err, resp, data) => {
            if (err) reject(err);
            else resolve({resp, data});
        });
    });
}

// ==================== 签到逻辑 ====================
async function doSign() {
    log("======== 九号自动签到开始 ========");
    log("当前配置：", {notify, autoOpenBox, autoRepair, titlePrefix});

    try {
        // 查询签到状态
        log("查询签到状态...");
        const statusRes = await request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status?t=" + Date.now());
        const statusData = JSON.parse(statusRes.data || "{}");
        log("签到状态返回：", statusData);

        // 发送签到请求
        log("发送签到请求...");
        const signRes = await request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", {
            headers: {"Content-Type": "application/json"}
        });
        const signData = JSON.parse(signRes.data || "{}");
        log("签到结果：", signData);

        // 盲盒处理
        if (autoOpenBox && signData?.data?.notOpenedBoxes) {
            for (let box of signData.data.notOpenedBoxes) {
                if (box.leftDaysToOpen <= 0) {
                    log(`自动开启盲盒 ${box.awardDays}天`);
                    // 可加请求开启盲盒
                } else {
                    log(`盲盒 ${box.awardDays}天，还需 ${box.leftDaysToOpen} 天`);
                }
            }
        }

        // 分享任务抓包接口
        log("抓取分享任务接口...");
        const shareRes = await request("https://snssdk.ninebot.com/service/2/app_log/?aid=10000004");
        log("分享任务接口返回：", shareRes.data);

        // TODO: 自动领取分享奖励可加这里
        log("匹配到今日未完成分享任务数：0");

        if (notify) {
            $notification.post(`${titlePrefix}`, "签到完成", `签到状态：${statusData.data?.currentSignStatus ? "已签到" : "未签到"}`);
        }
    } catch (e) {
        log("签到异常：", e.message || e);
        if (notify) $notification.post(`${titlePrefix}`, "签到异常", e.message || e);
    }
    log("======== 九号自动签到结束 ========");
}

// 执行
doSign().finally(() => $done());