/***********************************************
Ninebot_Sign_Single_v3.0.1.js 

更新时间：0:00
修复凭证提取逻辑、参数传递错误，适配九号最新API
适配工具：Surge/Quantumult X/Loon
功能覆盖：自动抓包、自动签到、盲盒开箱、资产查询
***********************************************/

// 通用工具类（适配多客户端持久化）
function ENV() {
    const isJSBox = typeof require == "function" && typeof $jsbox != "undefined";
    return {
        isQX: typeof $task !== "undefined",
        isLoon: typeof $loon !== "undefined",
        isSurge: typeof $httpClient !== "undefined" && typeof $utils !== "undefined",
        isNode: typeof require == "function" && !isJSBox,
        isJSBox,
        isRequest: typeof $request !== "undefined"
    };
}

function API(name = "untitled", debug = false) {
    const {isQX, isLoon, isSurge, isNode} = ENV();
    return new (class {
        constructor(name, debug) {
            this.name = name;
            this.debug = debug;
            this.initCache();
        }
        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge) this.cache = JSON.parse($persistentStore.read(this.name) || "{}");
            if (isNode) this.cache = {};
        }
        persistCache() {
            const data = JSON.stringify(this.cache, null, 2);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge) $persistentStore.write(data, this.name);
        }
        write(data, key) {
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isLoon || isSurge) return $persistentStore.write(data, key);
                if (isQX) return $prefs.setValueForKey(data, key);
            } else {
                this.cache[key] = data;
            }
            this.persistCache();
        }
        read(key) {
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isLoon || isSurge) return $persistentStore.read(key);
                if (isQX) return $prefs.valueForKey(key);
            } else {
                return this.cache[key];
            }
        }
        notify(title, subtitle = "", content = "") {
            if (isQX) $notify(title, subtitle, content);
            if (isSurge || isLoon) $notification.post(title, subtitle, content);
            if (isNode) console.log(`${title}\n${subtitle}\n${content}`);
        }
        log(msg) {
            if (this.debug) console.log(`[${this.name}] ${msg}`);
        }
        done(value = {}) {
            if (isQX || isLoon || isSurge) $done(value);
        }
    })(name, debug);
}

// 初始化API实例
const APIKey = "NinebotSign";
const ROOT_KEY = "#ComponentService";
$ = new API(APIKey, true); // 开启debug日志，便于排查

// 配置常量
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign"];
const ENDPOINTS = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
};

// 1. 自动抓包逻辑（优先触发）
if (ENV().isRequest) {
    const isCaptureEnable = $.read("ninebot.captureEnable") !== "false";
    if (isCaptureEnable && $request.url && CAPTURE_PATTERNS.some(p => $request.url.includes(p))) {
        captureNinebotToken();
    }
    $.done({});
} 
// 2. 签到主逻辑（cron触发）
else {
    (async () => {
        await mainSignTask();
    })();
}

// 自动抓包写入ComponentService（强化凭证校验）
function captureNinebotToken() {
    try {
        const headers = $request.headers || {};
        // 严格匹配Authorization格式（必须包含Bearer）
        const auth = (headers.Authorization || headers.authorization || "").trim();
        // 严格匹配DeviceId格式（必须为字母数字组合）
        const deviceId = (headers.device_id || headers.DeviceId || headers.deviceid || "").trim();
        const ua = headers["User-Agent"] || headers["user-agent"] || "";

        // 新增凭证有效性校验
        if (!auth ||!auth.startsWith("Bearer ") ||!deviceId || deviceId.length < 10) {
            $.log(`凭证提取异常：Authorization=${auth}, DeviceId=${deviceId}`);
            $.notify("九号电动车", "抓包失败", "未提取到有效凭证（请确认APP已登录并触发签到页）");
            return;
        }

        // 读取ComponentService根节点
        let root = {};
        const rootRaw = $.read(ROOT_KEY);
        if (rootRaw) root = JSON.parse(rootRaw);

        // 写入九号凭证
        if (!root.Ninebot) root.Ninebot = {};
        if (!root.Ninebot.Settings) root.Ninebot.Settings = {};
        root.Ninebot.Settings.Authorization = auth;
        root.Ninebot.Settings.DeviceId = deviceId;
        root.Ninebot.Settings.UserAgent = ua;
        root.Ninebot.Settings.LastCaptureAt = new Date().toLocaleString();

        // 持久化并同步到BoxJS展示字段
        $.write(JSON.stringify(root), ROOT_KEY);
        $.write(root.Ninebot.Settings.LastCaptureAt, "ninebot.lastCaptureAt");
        
        $.notify("九号电动车", "凭证抓取成功", `最后更新：${root.Ninebot.Settings.LastCaptureAt}`);
        $.log("凭证已写入ComponentService.Ninebot.Settings");
    } catch (e) {
        $.notify("九号电动车", "抓包失败", `错误：${String(e).slice(0, 50)}`);
        $.log(`抓包异常：${e}`);
    }
}

// 读取配置（兼容ComponentService和旧key，新增日志输出）
function getConfig() {
    let root = {};
    const rootRaw = $.read(ROOT_KEY);
    if (rootRaw) root = JSON.parse(rootRaw);
    const ninebotSettings = root.Ninebot?.Settings || {};

    const config = {
        Authorization: ninebotSettings.Authorization || $.read("ninebot.authorization") || "",
        DeviceId: ninebotSettings.DeviceId || $.read("ninebot.deviceId") || "",
        UserAgent: ninebotSettings.UserAgent || $.read("ninebot.userAgent") || "Ninebot/3620",
        titlePrefix: $.read("ninebot.titlePrefix") || "九号签到助手",
        notify: $.read("ninebot.notify") !== "false",
        autoOpenBox: $.read("ninebot.autoOpenBox") === "true",
        logLevel: $.read("ninebot.logLevel") || "simple"
    };
    $.log(`读取配置：${JSON.stringify(config)}`);
    return config;
}

// 构造请求头（新增字段校验）
function getHeaders(cfg) {
    if (!cfg.Authorization ||!cfg.DeviceId) {
        $.log("请求头构造失败：凭证为空");
        throw new Error("缺少有效凭证");
    }
    return {
        "Authorization": cfg.Authorization,
        "device_id": cfg.DeviceId,
        "User-Agent": cfg.UserAgent,
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "Content-Type": "application/json" // 新增必要请求头
    };
}

// HTTP请求封装（新增详细日志）
function request(method, url, headers, body = null) {
    $.log(`发起请求：${method} ${url}`);
    $.log(`请求头：${JSON.stringify(headers)}`);
    if (body) $.log(`请求体：${JSON.stringify(body)}`);
    return new Promise((resolve, reject) => {
        const opts = { url, headers, timeout: 15000 };
        if (method === "POST" && body) opts.body = JSON.stringify(body);

        const callback = (err, resp, data) => {
            if (err) {
                $.log(`请求错误：${err}`);
                return reject(err);
            }
            $.log(`响应状态码：${resp.status}`);
            $.log(`响应数据：${data?.slice(0, 500)}`);
            try {
                resolve(JSON.parse(data || "{}"));
            } catch (e) {
                $.log(`响应解析失败：${e}`);
                reject(new Error("响应解析失败"));
            }
        };

        if (ENV().isSurge || ENV().isLoon) {
            method === "GET" ? $httpClient.get(opts, callback) : $httpClient.post(opts, callback);
        } else if (ENV().isQX) {
            $task.fetch(opts).then(resp => resolve(JSON.parse(resp.body)), reject);
        }
    });
}

// 签到主任务（新增步骤日志）
async function mainSignTask() {
    const cfg = getConfig();
    if (!cfg.Authorization ||!cfg.DeviceId) {
        if (cfg.notify) $.notify(cfg.titlePrefix, "任务终止", "未配置有效凭证，请先触发抓包");
        return $.done();
    }

    const headers = getHeaders(cfg);
    let notifyContent = [];

    try {
        // 1. 查询签到状态
        $.log("开始查询签到状态...");
        const statusResp = await request("GET", ENDPOINTS.status, headers);
        const isSigned = [1, "1", true].includes(statusResp.data?.currentSignStatus);
        $.log(`签到状态：${isSigned? "已签到" : "未签到"}`);

        // 2. 执行签到
        if (!isSigned) {
            $.log("开始执行签到...");
            const signResp = await request("POST", ENDPOINTS.sign, headers, { deviceId: cfg.DeviceId });
            if (signResp.code === 0) {
                notifyContent.push(`✅ 今日签到成功`);
            } else {
                notifyContent.push(`❌ 签到失败：${signResp.msg || "未知错误"}`);
                $.log(`签到失败响应：${JSON.stringify(signResp)}`);
            }
        } else {
            notifyContent.push(`✅ 今日已签到`);
        }

        // 3. 自动开箱
        if (cfg.autoOpenBox) {
            $.log("开始查询盲盒状态...");
            const boxResp = await request("GET", ENDPOINTS.status, headers);
            const availableBoxes = boxResp.data?.notOpenedBoxes?.filter(b => Number(b.leftDaysToOpen) === 0) || [];
            $.log(`可开箱盲盒数量：${availableBoxes.length}`);
            for (const box of availableBoxes) {
                if (box.rewardId) {
                    $.log(`开启盲盒：rewardId=${box.rewardId}`);
                    const openResp = await request("POST", ENDPOINTS.blindBoxReceive, headers, { rewardId: box.rewardId });
                    if (openResp.code === 0) {
                        const reward = `${openResp.data?.rewardValue || 0}${openResp.data?.rewardType === 1 ? "经验" : "N币"}`;
                        notifyContent.push(`📦 盲盒开箱：+${reward}`);
                    }
                }
            }
            if (availableBoxes.length === 0) notifyContent.push(`📦 盲盒开箱：无可用盲盒`);
        }

        // 4. 查询N币余额
        $.log("开始查询N币余额...");
        const balanceResp = await request("GET", ENDPOINTS.balance, headers);
        const nCoin = balanceResp.data?.balance || 0;
        notifyContent.push(`💰 当前N币余额：${nCoin}`);

        // 发送通知
        if (cfg.notify) {
            $.notify(cfg.titlePrefix, "签到任务完成", notifyContent.join("\n"));
        }
    } catch (e) {
        const errMsg = `任务异常：${String(e).slice(0, 50)}`;
        if (cfg.notify) $.notify(cfg.titlePrefix, "任务失败", errMsg);
        $.log(errMsg);
    }

    $.done();
}