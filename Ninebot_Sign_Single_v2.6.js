/*******************************
 *  九号智能电动车 · 单账号自动签到
 *  Version: 2.6
 *  Author: QinyRui & ❥﹒﹏非我不可
 *  更新时间：2025/11
 *******************************/

const TITLE = $persistentStore.read("ninebot.titlePrefix") || "九号签到";
const ENABLE_NOTIFY = $persistentStore.read("ninebot.notify") !== "false";
const AUTO_OPEN_BOX = $persistentStore.read("ninebot.autoOpenBox") === "true";
const AUTO_REPAIR = $persistentStore.read("ninebot.autoRepair") === "true";
const AUTO_BETA = $persistentStore.read("ninebot.autoApplyBeta") === "true";
const DEBUG = $persistentStore.read("ninebot.debug") === "true";

/**************************************
 *  抓包写入区块（最终修复版）
 **************************************/
if (typeof $request !== "undefined") {
    try {
        const headers = $request.headers || {};
        const auth = headers["Authorization"] || headers["authorization"] || "";
        const dev = headers["DeviceId"] || headers["deviceid"] || headers["device_id"] || "";
        const ua = headers["User-Agent"] || headers["user-agent"] || "";

        const tNow = Date.now();
        const tLast = Number($persistentStore.read("ninebot_last_write") || 0);

        if (auth && dev && ua && (tNow - tLast > 60000)) {
            $persistentStore.write(auth, "ninebot.authorization");
            $persistentStore.write(dev, "ninebot.deviceId");
            $persistentStore.write(ua, "ninebot.userAgent");
            $persistentStore.write(String(tNow), "ninebot_last_write");

            if (ENABLE_NOTIFY) {
                $notification.post(
                    TITLE,
                    "抓包写入成功",
                    "Authorization / DeviceId / User-Agent 已写入，请关闭抓包"
                );
            }
            console.log("【Ninebot】抓包写入成功");
        } else {
            console.log("【Ninebot】抓包触发但未写入（字段缺失或 60s 内重复）");
        }
    } catch (e) {
        $notification.post(TITLE, "抓包异常", String(e));
        console.log("【Ninebot】抓包异常:", e);
    }

    // 必须终止流程
    $done({});
    return;
}

/**************************************
 *  工具函数
 **************************************/
function log(...m) { if (DEBUG) console.log(...m); }

async function http(method, url, headers = {}, body = null) {
    return new Promise(resolve => {
        const opt = { url, method, headers, body };
        $httpClient[method.toLowerCase()](opt, (err, res, data) => {
            if (err) {
                resolve({ err });
            } else {
                try { resolve(JSON.parse(data)); }
                catch { resolve({ err: "JSON 解析失败", raw: data }); }
            }
        });
    });
}

function notify(sub, msg) {
    if (ENABLE_NOTIFY) $notification.post(TITLE, sub, msg);
}

/**************************************
 *  主流程
 **************************************/
(async () => {
    const authorization = $persistentStore.read("ninebot.authorization");
    const deviceId = $persistentStore.read("ninebot.deviceId");
    const userAgent = $persistentStore.read("ninebot.userAgent");

    if (!authorization || !deviceId || !userAgent) {
        notify("❌ 未配置 Token", "请开启抓包并重新获取 Authorization / DeviceId / User-Agent");
        return $done();
    }

    const headers = {
        "Authorization": authorization,
        "DeviceId": deviceId,
        "User-Agent": userAgent,
        "Content-Type": "application/json"
    };

    log("开始九号签到流程…");

    /*************** 1. /sign ***************/
    const signRes = await http("post",
        "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
        headers,
        "{}"
    );
    log("Sign 返回:", signRes);

    /*************** 2. /status ***************/
    const statusRes = await http("get",
        "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
        headers
    );
    log("Status 返回:", statusRes);

    const consecutiveDays = statusRes?.data?.consecutiveDays || 0;
    const blindBoxStatus = statusRes?.data?.blindBoxStatus || 0;
    const signCards = statusRes?.data?.signCardsNum || 0;

    /*************** 3. /balance ***************/
    const balanceRes = await http("get",
        "https://cn-cbu-gateway.ninebot.com/portal/api/coin/balance",
        headers
    );
    const nb = balanceRes?.data?.coinBalance || 0;

    /*************** 4. /blind-box/list ***************/
    const boxRes = await http("get",
        "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list",
        headers
    );
    log("BlindBox 返回:", boxRes);

    const notOpened = boxRes?.data?.notOpenedBoxes || [];
    const opened = boxRes?.data?.openedBoxes || [];

    /*************** 自动开盲盒 ***************/
    if (AUTO_OPEN_BOX && blindBoxStatus === 1) {
        log("执行自动开盲盒…");
        await http("post",
            "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/open",
            headers,
            "{}"
        );
    }

    /*************** 自动补签 ***************/
    if (AUTO_REPAIR && statusRes?.data?.currentSignStatus === 0) {
        log("执行自动补签…");
        await http("post",
            "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
            headers,
            "{}"
        );
    }

    /*************** 自动申请内测 ***************/
    if (AUTO_BETA) {
        await http("post",
            "https://cn-cbu-gateway.ninebot.com/vehicle/vehicle/apply-inner-test",
            headers,
            "{}"
        );
    }

    /**************************************
     *  通知内容组装（v2.6 完整版）
     **************************************/
    let msg = `🗓️ 连续签到: ${consecutiveDays}\n`;
    msg += signRes?.data ? "✅ 已签到\n" : "⚠️ 签到失败\n";
    msg += `💰 N币余额: ${nb}\n`;
    msg += `🃏 补签卡剩余: ${signCards}\n`;

    if (notOpened.length > 0) {
        msg += `🎁 盲盒任务:\n`;
        notOpened.forEach(x => {
            msg += `   - ${x.awardDays}天盲盒，还需${x.leftDaysToOpen}天\n`;
        });
    }

    notify("签到结果", msg);

    $done();
})();