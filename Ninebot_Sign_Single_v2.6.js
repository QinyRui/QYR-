/**
 * Ninebot_Sign_ArgDemo.js
 * 最终版主体（只用于 Cron，不用于 HTTP-REQUEST）
 * 更新时间：2025-12-01 09:00
 */

const $ = new API("Ninebot_Sign");

// =============== 配置读取 ===============
const CFG = {
    Authorization: $.read("nb_Authorization") || "",
    DeviceId: $.read("nb_DeviceId") || "",
    userAgent: $.read("nb_UserAgent") || "",
    autoOpenBox: $.read("nb_autoOpenBox") === "true",
    notify: $.read("nb_notify") !== "false",
    notifyFail: $.read("nb_notifyFail") !== "false",
    titlePrefix: $.read("nb_titlePrefix") || "- 九号-",
    debug: $.read("nb_debug") === "true",
};

function log(msg) {
    const t = new Date().toISOString().replace("T", " ").split(".")[0];
    console.log(`[${t}] info ${msg}`);
}

// =============== 公用请求头 ===============
function headers() {
    return {
        "Authorization": CFG.Authorization,
        "DeviceId": CFG.DeviceId,
        "User-Agent": CFG.userAgent,
        "Content-Type": "application/json",
    };
}

// =============== API 封装 ===============
function getStatus() {
    return $.http.get({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
        headers: headers(),
    });
}

function doSign() {
    return $.http.post({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
        headers: headers(),
        body: "{}",
    });
}

function openBlindBox() {
    return $.http.post({
        url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/openBlindBox",
        headers: headers(),
        body: "{}",
    });
}

function getCreditLog() {
    const today = new Date().toISOString().slice(0, 10);
    return $.http.get({
        url: `https://cn-cbu-gateway.ninebot.com/web/credit/get-msg?date=${today}`,
        headers: headers(),
    });
}

// =============== 主流程 ===============
(async () => {
    log("九号自动签到开始");

    if (!CFG.Authorization || !CFG.DeviceId || !CFG.userAgent) {
        log("❌ 缺少必要配置（Authorization / DeviceId / User-Agent）");
        if (CFG.notifyFail) $.notify(CFG.titlePrefix + "九号签到失败", "", "未配置 Authorization / DeviceId / UA");
        return $.done();
    }

    // 查询状态
    log("查询签到状态...");
    let status = await getStatus();
    if (!status?.data) {
        log("❌ 状态接口返回为空");
        if (CFG.notifyFail) $.notify(CFG.titlePrefix + "签到失败", "", "状态接口返回异常");
        return $.done();
    }
    status = status.data;

    log(`签到状态返回： ${JSON.stringify(status)}`);

    const signed = status.data.currentSignStatus === 1;
    const days = status.data.consecutiveDays || 0;

    let signChanged = false;

    // === 今日未签到 → 执行签到 ===
    if (!signed) {
        log("今日未签到，执行签到接口...");
        const res = await doSign();
        log(`签到接口返回： ${JSON.stringify(res)}`);

        if (res?.data?.success) {
            signChanged = true;
        }
    } else {
        log("今日已签到，跳过签到接口");
    }

    // === 自动开盲盒 ===
    if (CFG.autoOpenBox && status.data.blindBoxStatus === 1) {
        log("可开盲盒，执行开盲盒...");
        const box = await openBlindBox();
        log(`盲盒接口返回： ${JSON.stringify(box)}`);
    }

    // === 查询今日积分 / N币变化 ===
    const credit = await getCreditLog();
    let todayScore = 0, todayCoin = 0;
    if (credit?.data?.dataList) {
        credit.data.dataList.forEach(e => {
            todayScore += e.scoreChange || 0;
            todayCoin += e.nbChange || 0;
        });
    }
    log(`今日积分/N币统计完成： ${todayScore} ${todayCoin}`);

    // ================== 重新查询状态（获取最新数据） ==================
    const final = await getStatus();
    const finalDays = final?.data?.data?.consecutiveDays || days;

    // ================== 通知 ==================
    if (CFG.notify) {
        const text =
`✨ 今日签到：${signed || signChanged ? "已签到" : "未签到"}

📊 账户状态
- 当前经验：${final?.data?.data?.credit || "-"}（LV.${final?.data?.data?.level || "-" }）
- 距离升级：${final?.data?.data?.levelUpCredit || "-"} 经验
- 当前 N 币：${final?.data?.data?.nb || "-"}
- 补签卡：${final?.data?.data?.signCardsNum || 0} 张
- 连续签到：${finalDays} 天

📦 盲盒进度
7 天盲盒：${finalDays % 7} / 7 天
| 666 天盲盒：${finalDays} / 666 天

🎯 今日获得：积分 ${todayScore} / N币 ${todayCoin}`;

        log("发送通知：\n" + text);
        $.notify(CFG.titlePrefix + "今日签到", "", text);
    }

    log("九号自动签到完成，通知已发送。");
    $.done();

})();


// =============== API 对象定义（必须有，否则会报 API 未定义） ===============
function API(name = "untitled") {
    const isQuanX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined";

    return {
        name,
        read(key) {
            if (isQuanX) return $prefs.valueForKey(key);
            if (isLoon || isSurge) return $persistentStore.read(key);
        },
        write(val, key) {
            if (isQuanX) return $prefs.setValueForKey(val, key);
            if (isLoon || isSurge) return $persistentStore.write(val, key);
        },
        notify(title, sub, body) {
            if (isQuanX) $notify(title, sub, body);
            if (isLoon || isSurge) $notification.post(title, sub, body);
        },
        http: {
            get: opts => new Promise(res => {
                if (isQuanX) $task.fetch(opts).then(resp => res(JSON.parse(resp.body || "{}")));
                if (isLoon) $httpClient.get(opts, (err, resp, data) => res(JSON.parse(data || "{}")));
                if (isSurge) $httpClient.get(opts, (err, resp, data) => res(JSON.parse(data || "{}")));
            }),
            post: opts => new Promise(res => {
                if (isQuanX) $task.fetch(opts).then(resp => res(JSON.parse(resp.body || "{}")));
                if (isLoon) {
                    $httpClient.post(opts, (err, resp, data) => res(JSON.parse(data || "{}")));
                }
                if (isSurge) {
                    $httpClient.post(opts, (err, resp, data) => res(JSON.parse(data || "{}")));
                }
            }),
        },
        done() {
            if (isQuanX) $done();
            if (isLoon) $done();
            if (isSurge) $done();
        }
    };
}