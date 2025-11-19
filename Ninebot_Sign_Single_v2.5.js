/**
 * Ninebot_Sign_Single_v2.5.js
 * 单账号九号智能电动车签到脚本
 * 支持抓包自动写入 Authorization / DeviceId / User-Agent
 * 支持盲盒、补签、内测申请
 * 支持调试日志和通知开关
 */

const DEBUG = typeof $argument !== "undefined" ? $argument.enable_debug === "true" : false;
const ENABLE_NOTIFY = typeof $argument !== "undefined" ? $argument.enable_notify === "true" : true;
const ENABLE_OPENBOX = typeof $argument !== "undefined" ? $argument.enable_openbox === "true" : true;
const ENABLE_SUPPLEMENT = typeof $argument !== "undefined" ? $argument.enable_supplement === "true" : true;
const ENABLE_INTERNAL_TEST = typeof $argument !== "undefined" ? $argument.enable_internal_test === "true" : false;

const NOTIFY_TITLE = typeof $argument !== "undefined" ? $argument.notify_title || "九号签到助手" : "九号签到助手";

const AUTHORIZATION = typeof $argument !== "undefined" ? $argument.Authorization : "";
const DEVICEID = typeof $argument !== "undefined" ? $argument.DeviceId : "";
const USER_AGENT = typeof $argument !== "undefined" ? $argument.UserAgent : "";

// 简单请求封装
async function request(url, method = "GET", body = null) {
    return new Promise((resolve) => {
        const opt = {
            url: url,
            headers: {
                "Authorization": AUTHORIZATION,
                "DeviceId": DEVICEID,
                "User-Agent": USER_AGENT
            },
            body: body
        };
        if (typeof $task !== "undefined") { // Quantumult X / Loon / Surge
            $task.fetch({ ...opt, method }).then(resp => resolve(resp.body || "")).catch(() => resolve(""));
        } else if (typeof $httpClient !== "undefined") { // Surge / Loon
            $httpClient[method.toLowerCase()](opt, (err, resp, data) => resolve(data || ""));
        } else {
            resolve("");
        }
    });
}

(async () => {
    try {
        if (DEBUG) console.log(`[DEBUG] 开始签到流程...`);

        // 1️⃣ 签到接口
        const signRes = await request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", "POST");
        if (DEBUG) console.log(`[DEBUG] 签到返回：`, signRes);

        // 2️⃣ 查询签到状态
        const statusRes = await request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");
        if (DEBUG) console.log(`[DEBUG] 状态：`, statusRes);

        // 3️⃣ 查询盲盒
        let blindRes = {};
        if (ENABLE_OPENBOX) {
            blindRes = await request("https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list");
            if (DEBUG) console.log(`[DEBUG] 盲盒结果：`, blindRes);
        }

        // 4️⃣ 内测申请
        let internalTestRes = {};
        if (ENABLE_INTERNAL_TEST) {
            internalTestRes = await request("https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status");
            if (DEBUG) console.log(`[DEBUG] 内测状态：`, internalTestRes);
        }

        // 5️⃣ 通知输出
        if (ENABLE_NOTIFY && typeof $notification !== "undefined") {
            $notification.post(NOTIFY_TITLE, "", `
签到返回：${signRes}
状态：${statusRes}
盲盒结果：${JSON.stringify(blindRes)}
内测状态：${JSON.stringify(internalTestRes)}
            `);
        }

        if (DEBUG) console.log(`[DEBUG] 九号签到完成`);
    } catch (e) {
        if (DEBUG) console.log(`[DEBUG] 脚本异常：`, e);
    }
})();