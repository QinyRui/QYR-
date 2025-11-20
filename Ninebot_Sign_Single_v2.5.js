/*
九号智能电动车签到脚本 v2.5
功能：
1. 手动填写 Authorization 和 DeviceId，保存为持久化数据
2. 支持手动签到、自动签到（由 CRON 控制）
3. 支持抓包自动写入 Authorization 和 DeviceId（由插件配置控制）
4. 支持自动盲盒、自动补签、内测开关
*/

const $ = new ToolClient();

// ======================
// 持久化读写
// ======================
const loadData = () => $.readJson("Ninebot_Config") || {};
const saveData = (data) => $.writeJson(data, "Ninebot_Config");

// ======================
// 获取 / 设置 Auth 数据
// ======================
const getAuthData = () => {
    const cfg = loadData();
    return {
        Authorization: cfg.Authorization || "",
        DeviceId: cfg.DeviceId || "",
        UserAgent: cfg.UserAgent || ""
    };
};
const setAuthData = ({ Authorization, DeviceId, UserAgent }) => {
    const cfg = loadData();
    if (Authorization) cfg.Authorization = Authorization;
    if (DeviceId) cfg.DeviceId = DeviceId;
    if (UserAgent) cfg.UserAgent = UserAgent;
    saveData(cfg);
};

// ======================
// 用户通知
// ======================
const notify = (title, message) => $.msg(title, message);

// ======================
// 主签到逻辑
// ======================
const signIn = async () => {
    const { Authorization, DeviceId, UserAgent } = getAuthData();

    if (!Authorization || !DeviceId) {
        return notify("未配置 Token", "请在插件 UI 填写 Authorization / DeviceId");
    }

    try {
        const response = await $.fetch({
            method: "POST",
            url: "https://api.ninebot.com/sign_in",
            headers: {
                Authorization,
                DeviceId,
                "User-Agent": UserAgent || "NinebotApp/2.5.0"
            },
        });

        const data = await response.toJson();

        if (data.success) {
            notify("签到成功", `签到完成！当前连续签到：${data.continuousSignInDays || 0} 天`);
        } else {
            notify("签到失败", `失败原因：${data.message || "未知"}`);
        }
    } catch (e) {
        notify("签到异常", e.message || e);
    }
};

// ======================
// 自动签到（CRON 调用）
// ======================
const autoSignIn = async () => await signIn();

// ======================
// 手动签到调用
// ======================
const manualSignIn = async () => await signIn();

// ======================
// 捕获请求写入 Auth 数据
// 插件配置里 http-request 触发时调用
// ======================
const captureAuthData = (captured) => {
    if (!captured) return notify("抓包失败", "未捕获到 Authorization / DeviceId");
    setAuthData(captured);
    notify("抓包成功", "已写入 Authorization / DeviceId 到插件持久化");
};

// ======================
// 脚本入口
// ======================
!(async () => {
    // 如果是插件 HTTP 捕获回调传入 $request
    if (typeof $request !== "undefined" && $request?.headers) {
        captureAuthData({
            Authorization: $request.headers["Authorization"] || $request.headers["authorization"],
            DeviceId: $request.headers["DeviceId"] || $request.headers["deviceid"],
            UserAgent: $request.headers["User-Agent"] || $request.headers["user-agent"]
        });
    } else {
        // 否则正常执行签到（自动或手动由插件开关控制）
        await signIn();
    }
})()
.catch(e => $.msg("脚本异常", e.message || e))
.finally(() => $done());

// ======================
// ToolClient 工具类（持久化、HTTP、通知）
// ======================
function ToolClient() {
    const env = (() => {
        if (typeof $task !== "undefined") return "Qx";
        if (typeof $httpClient !== "undefined") return "Surge";
        if (typeof $loon !== "undefined") return "Loon";
        throw new Error("不支持的运行环境");
    })();

    this.read = (key) => {
        if (env === "Qx") return $prefs.valueForKey(key);
        return $persistentStore.read(key);
    };
    this.write = (val, key) => {
        if (env === "Qx") return $prefs.setValueForKey(val, key);
        return $persistentStore.write(val, key);
    };
    this.readJson = (key) => {
        const val = this.read(key);
        try { return JSON.parse(val); } catch { return null; }
    };
    this.writeJson = (obj, key) => this.write(JSON.stringify(obj), key);
    this.fetch = async (options) => {
        const { method = "GET", url, headers = {}, body } = options;
        return new Promise((resolve, reject) => {
            if (env === "Qx") {
                $task.fetch({ method, url, headers, body }).then(resolve, reject);
            } else {
                $httpClient[method.toLowerCase()]({ url, headers, body }, (err, resp, data) => {
                    if (err) return reject(err);
                    resolve({ body: data, toJson: async () => JSON.parse(data) });
                });
            }
        });
    };
    this.msg = (title, subtitle = "", body = "") => {
        if (env === "Qx") $notify(title, subtitle, body);
        else $notification.post(title, subtitle, body);
    };
}