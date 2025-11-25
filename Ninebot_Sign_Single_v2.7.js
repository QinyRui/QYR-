/**
 * 九号智能电动车自动签到 + 自动领取分享奖励
 * 版本：v2.7
 * 更新时间：2025-11-26
 * 支持抓包自动写入签到状态和分享动作接口
 */

const API_BASE = 'https://cn-cbu-gateway.ninebot.com';
const APP_LOG = 'https://snssdk.ninebot.com/service/2/app_log/?aid=10000004';

(async () => {
    try {
        const capture = $argument.capture === "true";
        const notify = $argument.notify === "true";
        const titlePrefix = $argument.titlePrefix || "九号签到助手";

        log(`======= 九号自动签到 v2.7 开始 =======`);

        // 1️⃣ 抓包写入（可选）
        if (capture) {
            log("抓包写入开关开启：签到状态 & 分享任务接口");
        }

        // 2️⃣ 查询签到状态
        log("查询签到状态...");
        let status = await httpGet(`${API_BASE}/portal/api/user-sign/v2/status?t=${Date.now()}`);
        log(`签到状态：${JSON.stringify(status)}`);

        // 3️⃣ 自动签到
        if (status.currentSignStatus !== 1) {
            log("发送签到请求...");
            let signRes = await httpPost(`${API_BASE}/portal/api/user-sign/v2/sign`);
            log(`签到结果：${JSON.stringify(signRes)}`);
        } else {
            log("今日已签到");
        }

        // 4️⃣ 获取分享任务列表
        log("查询分享任务列表...");
        let shareList = await httpGet(`${API_BASE}/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS`);
        let tasks = shareList.data || [];
        log(`分享任务列表原始数据：${JSON.stringify(shareList)}`);

        // 5️⃣ 自动领取分享奖励
        for (let task of tasks) {
            if (!task.rewardReceived) {
                log(`发现未领取分享任务: ${task.title}，准备领取...`);
                let claim = await httpPost(`${API_BASE}/portal/self-service/task/reward`, { taskId: task.id });
                log(`领取结果：${claim.msg}`);
            }
        }

        // 6️⃣ 查询盲盒状态
        log("查询盲盒状态...");
        let boxStatus = await httpGet(`${API_BASE}/portal/api/user-sign/v2/boxes?t=${Date.now()}`);
        log(`盲盒状态：${JSON.stringify(boxStatus)}`);

        // 7️⃣ 发送通知
        if (notify) {
            let msg = `九号 APP ⚠️ 今日签到完成\n连续签到：${status.consecutiveDays} 天\n补签卡：${status.signCardsNum} 张`;
            $notify(titlePrefix, "", msg);
        }

        log(`======= 九号自动签到 v2.7 结束 =======`);
    } catch (e) {
        log(`异常：${e.message || e}`);
        if ($argument.notify === "true") $notify("九号签到助手", "签到异常", e.message || e);
    }
})();

// =======================
// HTTP 封装
// =======================
function httpGet(url) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, timeout: 10000 }, (err, resp, data) => {
            if (err) return reject(err);
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
    });
}

function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        let options = { url, timeout: 15000, headers: { 'Content-Type': 'application/json' } };
        if (body) options.body = JSON.stringify(body);
        $httpClient.post(options, (err, resp, data) => {
            if (err) return reject(err);
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
    });
}

function log(msg) {
    console.log(msg);
}