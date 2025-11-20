/*
九号智能电动车签到脚本 v2.5 最终版
功能：
1. 支持手动填写 Authorization 和 DeviceId，写入持久化
2. 支持抓包自动写入 Authorization 和 DeviceId
3. 支持手动签到、自动签到（CRON）
4. 支持自动盲盒、补签、内测开关
*/

const $ = new ToolClient();

// --- 读取持久化配置 ---
const loadConfig = () => $.readJson("config") || {};
const saveConfig = (data) => $.writeJson(data, "config");

// --- 从 UI 获取输入 ---
const AuthorizationUI = $argument?.Authorization || "";
const DeviceIdUI = $argument?.DeviceId || "";
const enable_manual_sign = $argument?.enable_manual_sign === "true";
const enable_capture = $argument?.enable_capture === "true";

// --- 如果 UI 填写了，立即写入持久化 ---
if (AuthorizationUI && DeviceIdUI) {
    saveConfig({ Authorization: AuthorizationUI, DeviceId: DeviceIdUI });
    $.msg("九号签到助手", "已写入 Authorization / DeviceId 到持久化");
}

// --- 获取当前持久化数据 ---
const config = loadConfig();
const Authorization = config.Authorization || "";
const DeviceId = config.DeviceId || "";

// --- 提示未配置 ---
if (!Authorization || !DeviceId) {
    $.msg("未配置 Token", "请在插件 UI 填写 Authorization 和 DeviceId");
    $done();
}

// --- 捕获抓包写入 ---
if (enable_capture && typeof $request !== "undefined" && $request.headers) {
    const auth = $request.headers["Authorization"] || $request.headers["authorization"];
    const device = $request.headers["DeviceId"] || $request.headers["deviceid"];
    if (auth && device) {
        saveConfig({ Authorization: auth, DeviceId: device });
        $.msg("抓包成功", "已自动写入 Authorization / DeviceId 到持久化");
    } else {
        $.msg("抓包失败", "未捕获到 Authorization 或 DeviceId");
    }
    $done();
}

// --- 签到主逻辑 ---
const signIn = async () => {
    try {
        const response = await $.fetch({
            method: "POST",
            url: "https://api.ninebot.com/sign_in",
            headers: {
                Authorization,
                DeviceId,
            },
        });

        const data = await response.toJson();
        if (data.success) {
            $.msg("签到成功", `连续签到：${data.continuousSignInDays}天\nN币余额：${data.balance || 0}`);
        } else {
            $.msg("签到失败", data.message || "未知错误");
        }
    } catch (err) {
        $.msg("签到异常", err.message || err);
    }
};

// --- 手动签到 ---
if (enable_manual_sign) {
    signIn();
    $done();
}

// --- 自动签到（CRON 控制） ---
if (typeof $cron !== "undefined") {
    signIn();
}

// --- 工具类 ---
function ToolClient() {
    this.readJson = (key) => {
        const val = $persistentStore.read(key);
        return val ? JSON.parse(val) : null;
    };
    this.writeJson = (val, key) => $persistentStore.write(JSON.stringify(val), key);
    this.msg = (title, subTitle, body) => $notification.post(title, subTitle, body || "");
    this.fetch = async (options) => {
        return new Promise((resolve, reject) => {
            $httpClient[options.method.toLowerCase()](
                options,
                (err, resp, body) => {
                    if (err) return reject(err);
                    resolve({
                        body,
                        toJson: (cb) => {
                            try {
                                const json = JSON.parse(body);
                                return cb ? cb(json) : json;
                            } catch (e) {
                                return cb ? cb(body) : body;
                            }
                        },
                    });
                }
            );
        });
    };
}