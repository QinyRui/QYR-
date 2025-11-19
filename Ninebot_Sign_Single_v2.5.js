/*
📱 九号智能电动车自动签到（单账号）
=========================================
👤 作者：❥﹒﹏非我不可 & QinyRui
📆 版本：v2.5
💬 功能：签到 + 盲盒 + 内测申请
🚀 自动抓包写入 Authorization、DeviceId、User-Agent
*/

const DEBUG = true; // 控制详细日志，可在插件UI开关关闭
const NOTIFY = true; // 是否发送通知
const AUTO_OPEN_BOX = true; // 是否自动开盲盒
const AUTO_SUPPLEMENT = true; // 是否自动补签
const ENABLE_INTERNAL_TEST = true; // 是否申请内测

const CRON_TIME = "10 8 * * *"; // 默认签到时间，可由插件UI修改
let Authorization = $prefs.valueForKey("Authorization") || "";
let DeviceId = $prefs.valueForKey("DeviceId") || "";
let UserAgent = $prefs.valueForKey("UserAgent") || "";

function log(...args) {
    if (DEBUG) console.log(...args);
}

function notify(title, body) {
    if (NOTIFY) {
        if (typeof $notify === "function") {
            $notify(title, "", body);
        } else {
            console.log(title, body);
        }
    }
}

async function request(url, method = "GET", body = null) {
    if (!Authorization || !DeviceId || !UserAgent) {
        log("⚠ 参数缺失，无法请求接口");
        return null;
    }
    const headers = {
        "Authorization": Authorization,
        "DeviceId": DeviceId,
        "User-Agent": UserAgent,
        "Content-Type": "application/json"
    };
    return new Promise(resolve => {
        $httpClient[method.toLowerCase()]({
            url,
            headers,
            body: body ? JSON.stringify(body) : null,
            timeout: 12000
        }, (err, resp, data) => {
            if (err) {
                log("❌ 请求错误:", err);
                resolve(null);
            } else {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    log("❌ 返回解析失败:", data);
                    resolve(null);
                }
            }
        });
    });
}

async function checkSignStatus() {
    const url = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
    const resp = await request(url);
    if (!resp) return false;
    if (resp.code === 0 && resp.data && resp.data.todaySigned) {
        log("今天已经签到过了");
        notify("九号签到", "今日已签到，跳过签到接口");
        return true;
    }
    return false;
}

async function doSign() {
    if (!Authorization || !DeviceId || !UserAgent) {
        notify("九号签到", "⚠ 未配置 Authorization / DeviceId / User-Agent");
        return;
    }

    const signed = await checkSignStatus();
    if (signed) return;

    const url = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
    const resp = await request(url, "POST");
    if (resp) {
        log("签到返回：", resp);
        notify("九号签到", JSON.stringify(resp));
    } else {
        log("签到接口请求失败");
    }
}

async function openBlindBox() {
    if (!AUTO_OPEN_BOX) return;
    const url = "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list";
    const resp = await request(url);
    if (resp) {
        log("盲盒列表：", resp);
    }
}

async function applyInternalTest() {
    if (!ENABLE_INTERNAL_TEST) return;
    const url = "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/apply";
    const resp = await request(url, "POST");
    if (resp) {
        log("内测申请返回：", resp);
    }
}

async function main() {
    log("开始九号签到流程...");
    await doSign();
    await openBlindBox();
    await applyInternalTest();
    log("------ Script done -------");
}

main();