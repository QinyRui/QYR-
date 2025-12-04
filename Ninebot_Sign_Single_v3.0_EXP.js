/***********************************************
九号智能电动车 · 单号自动签到（v3.0-EXP）
实验版：插件 UI 可调日志等级 · 无 BoxJS · 无 $argument
更新日期：2025-12-05
作者：QinyRui
仓库专用路径：Ninebot_Sign_Single_v3.0_EXP.js
***********************************************/

const ENV = $environment || {};
const ARGS = ENV.arguments || {};

const LOG_LEVEL = ARGS.logLevel || "info";   // debug/info/warn/error
const NOTIFY = ARGS.notify !== "false";      // 默认开启通知
const CAPTURE = ARGS.capture === "true";     // 抓包写入
const CRON_MODE = !$request;                 // 无 request → 表示定时任务

const KEY_TOKEN = "Ninebot_Token";
const KEY_UID   = "Ninebot_UID";

/* 日志函数 */
function log(msg, level = "info") {
    const levels = ["debug", "info", "warn", "error"];
    if (levels.indexOf(level) >= levels.indexOf(LOG_LEVEL)) {
        console.log(`[${level.toUpperCase()}] ${msg}`);
    }
}

/* 本地存取 */
function setVal(key, val) { $persistentStore.write(val, key); }
function getVal(key) { return $persistentStore.read(key); }

/* 通知 */
function notify(title, subtitle = "", body = "") {
    if (!NOTIFY) return;
    $notification.post(title, subtitle, body);
}

/***********************
  抓包写入模式（HTTP）
************************/
async function captureRequest() {
    try {
        const token = $request?.headers["token"] ||
                      $request?.headers["Token"] ||
                      $request?.headers["Authorization"];

        if (!token) {
            log("未捕获到 token", "warn");
            $done({});
            return;
        }

        const uid = $request?.headers["uid"] || "";

        setVal(KEY_TOKEN, token);
        if (uid) setVal(KEY_UID, uid);

        notify("九号 · Token 更新成功", "", "已自动写入插件内部存储");
        log("Token/UID 已写入本地存储", "info");
    } catch (e) {
        log(`抓包异常：${e}`, "error");
    }

    $done({});
}

/***********************
    自动签到流程
************************/
async function signMain() {
    const token = getVal(KEY_TOKEN);
    const uid   = getVal(KEY_UID);

    if (!token) {
        notify("九号自动签到", "失败", "Token 未获取，请先开启抓包并进入签到页");
        log("Token 缺失，无法签到", "error");
        return $done();
    }

    try {
        log("开始请求：签到状态查询", "info");
        const status = await httpGet("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", token, uid);

        log("签到状态返回：" + JSON.stringify(status), "debug");

        if (status?.data?.signedToday) {
            notify("九号签到", "今日已签到", "");
        } else {
            const res = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", token, uid);
            notify("九号签到成功", "", `经验 +${res?.data?.addExp || 0}`);
        }

        // 盲盒开箱
        await openBlindBox(token, uid);

    } catch (e) {
        notify("九号签到异常", "", e.toString());
        log(`签到流程异常：${e}`, "error");
    }

    $done();
}

async function openBlindBox(token, uid) {
    try {
        log("开始请求：盲盒开箱", "info");
        const box = await httpPost("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/openBlindBox", token, uid);
        log("盲盒开箱返回：" + JSON.stringify(box), "debug");

        if (box?.data?.exp) {
            notify("盲盒开箱成功", "", `经验 +${box.data.exp}`);
        }
    } catch (e) {
        log(`盲盒开箱异常：${e}`, "warn");
    }
}

/***********************
    请求封装
************************/
function httpGet(url, token, uid) {
    return new Promise((resolve, reject) => {
        $httpClient.get({
            url,
            headers: { token, uid }
        }, (err, resp, data) => {
            if (err) return reject(err);
            resolve(JSON.parse(data || "{}"));
        });
    });
}

function httpPost(url, token, uid) {
    return new Promise((resolve, reject) => {
        $httpClient.post({
            url,
            headers: { token, uid }
        }, (err, resp, data) => {
            if (err) return reject(err);
            resolve(JSON.parse(data || "{}"));
        });
    });
}

/***********************
        主入口
************************/
(async () => {
    if ($request) {
        log("进入抓包写入模式", "debug");
        await captureRequest();
    } else {
        log("进入定时签到模式", "debug");
        await signMain();
    }
})();