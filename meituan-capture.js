// 美团多维度鉴权抓取 | 抓取csec全量参数 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-capture.js
const STORE_PREFIX = "meituan_";
const NOTIFY_SWITCH = true;
const LOG_LEVEL = 2;

// 独立日志函数
function log(level, ...msg) {
    if (level <= LOG_LEVEL) {
        console.log(`[美团抓包-${new Date().toLocaleTimeString()}] [LV${level}]`, ...msg);
    }
}

// 独立通知函数
function notify(title, sub, msg) {
    if (NOTIFY_SWITCH) $notification.post(title, sub, msg);
}

(async function() {
    try {
        log(1, "【抓包调试】脚本启动，匹配URL：", $request.url);
        const authData = {
            // 基础鉴权字段
            token: "",
            deviceId: "",
            uuid: "",
            mtFingerprint: "",
            userAgent: "",
            cookie: "",
            // cube接口专属csec字段
            csecpkgname: "",
            csecplatform: "",
            csecversion: "",
            csecversionname: "",
            // 补充字段
            appVersion: "",
            activityKey: ""
        };

        // 解析请求头
        if ($request.headers) {
            authData.token = $request.headers.token || $request.headers.Token || "";
            authData.deviceId = $request.headers.deviceid || $request.headers["Device-ID"] || "";
            authData.userAgent = $request.headers["User-Agent"] || "";
            authData.cookie = $request.headers.Cookie || "";
            authData.csecpkgname = $request.headers.csecpkgname || "";
            authData.csecplatform = $request.headers.csecplatform || "";
            authData.csecversion = $request.headers.csecversion || "";
        }

        // 解析URL参数（核心提取csec字段）
        if ($request.url) {
            const urlObj = new URL(decodeURIComponent($request.url));
            Object.keys(authData).forEach(key => {
                authData[key] = urlObj.searchParams.get(key) || authData[key];
            });
        }

        // 从UA提取appVersion
        if (authData.userAgent) {
            const uaMatch = authData.userAgent.match(/Meituan\/(\d+\.\d+\.\d+)/);
            if (uaMatch) authData.appVersion = uaMatch[1];
        }

        // 验证核心字段
        const coreKeys = ["token", "deviceId", "csecplatform", "csecpkgname"];
        const validKeys = coreKeys.filter(k => authData[k]);
        if (validKeys.length === 0) throw new Error("无核心鉴权字段，请打开美团签到页重试");

        // 双存储写入
        await Promise.all(Object.keys(authData).map(key => {
            if (!authData[key]) return Promise.resolve();
            return new Promise(resolve => $persistentStore.write(authData[key], STORE_PREFIX + key, resolve));
        }));
        // 本地临时存储兜底
        coreKeys.forEach(k => {
            if (authData[k]) $persistentStore.write(authData[k], `${STORE_PREFIX}${k}_temp`);
        });

        const successMsg = `✅ 抓包成功\n有效字段：${validKeys.join(", ")}`;
        notify("美团抓包结果", "", successMsg);
        log(1, "【抓包调试】执行完成：", successMsg);

    } catch (error) {
        const errMsg = `❌ 抓包失败：${error.message}`;
        notify("美团抓包错误", "", errMsg);
        log(1, errMsg);
    } finally {
        $done({});
    }
})();