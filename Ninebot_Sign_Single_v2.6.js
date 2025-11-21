/*
📱 九号智能电动车自动签到 · 单账号版（v2.6）
👤 作者：❥﹒﹏非我不可 & QinyRui
📅 更新时间：2025-02
📌 功能：签到、补签、盲盒、抓包写入、内测申请、美化通知
*/

const $ = new Env("九号智能电动车签到");

// ========== 配置项 ==========
const TITLE = $.getdata("ninebot_notify_title") || "九号签到助手";
const ENABLE_DEBUG = $.getdata("ninebot_enable_debug") === "true";
const ENABLE_NOTIFY = $.getdata("ninebot_enable_notify") !== "false";
const ENABLE_OPENBOX = $.getdata("ninebot_enable_openbox") !== "false";
const ENABLE_SUPPLEMENT = $.getdata("ninebot_enable_supplement") !== "false";
const ENABLE_INTERNAL = $.getdata("ninebot_enable_internal_test") === "true";

// 抓包写入
const enable_capture = $.getdata("ninebot_enable_capture") === "true";

let Authorization = $.getdata("Ninebot_Authorization");
let DeviceId = $.getdata("Ninebot_DeviceId");
let UserAgent = $.getdata("Ninebot_UA") || "Mozilla/5.0";


// ========== 抓包写入 ==========
if (typeof $request !== "undefined" && enable_capture) {
    const headers = $request.headers;

    if (headers.authorization) {
        $.setdata(headers.authorization, "Ninebot_Authorization");
    }
    if (headers["device_id"]) {
        $.setdata(headers["device_id"], "Ninebot_DeviceId");
    }
    if (headers["user-agent"]) {
        $.setdata(headers["user-agent"], "Ninebot_UA");
    }

    $.notify("九号抓包写入成功", "已自动写入以下信息：", "Authorization\nDeviceId\nUser-Agent\n现在可以关闭抓包");
    $.done();
}


// ========== 无配置时提醒 ==========
if (!Authorization || !DeviceId) {
    $.notify(
        "九号签到 · 配置缺失",
        "",
        "未找到 Authorization / DeviceId\n请开启抓包写入并重新打开九号 App"
    );
    $.done();
}


// ========== 主流程 ==========
!(async () => {
    log("🟩 开始执行九号自动签到...");

    const signInfo = await doSign();         // 签到
    const statusInfo = await getStatus();    // 签到状态（连续签到/补签卡）
    const balanceInfo = await getBalance();  // N币余额
    const boxInfo = await getBlindBox();     // 盲盒任务

    let openBoxResult = "";
    if (ENABLE_OPENBOX) {
        openBoxResult = await autoOpenBox(boxInfo);
    }

    let supplementResult = "";
    if (ENABLE_SUPPLEMENT) {
        supplementResult = await autoSupplement(statusInfo);
    }

    let internalResult = "";
    if (ENABLE_INTERNAL) {
        internalResult = await applyInternalTest();
    }

    // ========== 美化通知内容 ==========
    const msg = `
📌 *九号今日结果*

① *签到结果*
• 状态：${signInfo.msg}
• 连续签到：${statusInfo.continuousDays} 天
• 补签卡：${statusInfo.supplyCard} 张
• N币余额：${balanceInfo} 

② *盲盒任务*
${formatBox(boxInfo)}

${openBoxResult ? "③ 自动盲盒：\n" + openBoxResult : ""}
${supplementResult ? "④ 自动补签：\n" + supplementResult : ""}
${internalResult ? "⑤ 内测状态：\n" + internalResult : ""}
`;

    if (ENABLE_NOTIFY) $.notify("🛵 九号签到 • 今日结果", "", msg);

})().finally(() => $.done());


// ======= API 封装 =======
function doSign() {
    return request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", "POST");
}

function getStatus() {
    return request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", "GET");
}

function getBalance() {
    return request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/balance", "GET");
}

function getBlindBox() {
    return request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", "GET");
}

function receiveBox() {
    return request("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive", "POST");
}

function applyInternalTest() {
    return request("https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", "POST");
}


// ===== 工具函数 =====
function formatBox(list) {
    if (!list || !list.length) return "暂无盲盒任务";

    return list.map(i => `• ${i.days} 天盲盒，还需 ${i.leftDays} 天`).join("\n");
}

function log(msg) {
    if (ENABLE_DEBUG) console.log(msg);
}

function request(url, method = "GET", body = null) {
    return new Promise(resolve => {
        const options = {
            url,
            method,
            headers: {
                Authorization,
                device_id: DeviceId,
                "User-Agent": UserAgent,
                "content-type": "application/json"
            }
        };
        if (body) options.body = JSON.stringify(body);

        $.send(options, (err, resp, data) => {
            if (err) return resolve({ msg: "请求失败", error: err });

            try {
                resolve(JSON.parse(data));
            } catch {
                resolve({ msg: "解析失败", raw: data });
            }
        });
    });
}


// ========== Env ==========
function Env(t, s) {
    return new class {
        constructor(t, s) { this.name = t, this.data = {}, this.logs = [] }
        getdata(k) { return $persistentStore.read(k) }
        setdata(v, k) { return $persistentStore.write(v, k) }
        notify(t, s, m) { $notification.post(t, s, m) }
        send(o, t) { $httpClient[o.method.toLowerCase()](o, t) }
        done() { }
    };
}