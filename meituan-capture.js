// 美团抓包脚本 | 适配真实请求头 | 提取全量鉴权字段 | Loon专用
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
            // 核心鉴权字段（从真实请求头提取）
            token: "",
            mini_program_token: "",
            mt_c_token: "",
            lt: "",
            w_token: "",
            cookie: "",
            uuid: "",
            iuuid: "",
            userid: "",
            csecuserid: "",
            csecuuid: "",
            // csec系列参数
            csecpkgname: "",
            csecplatform: "",
            csecversion: "",
            csecversionname: "",
            // 设备/版本字段
            userAgent: "",
            appVersion: "",
            ctype: "",
            cityId: "",
            lat: "",
            lng: "",
            // 其他关键字段
            mtgsig: "",
            yodaversion: ""
        };

        // 1. 解析请求头（优先提取，真实请求的核心字段在请求头）
        if ($request.headers) {
            const headers = $request.headers;
            // 鉴权Token类
            authData.token = headers.token || "";
            authData.mini_program_token = headers["mini_program_token"] || "";
            authData.mt_c_token = headers["mt_c_token"] || "";
            authData.lt = headers.lt || "";
            authData.w_token = headers["w_token"] || "";
            // Cookie（合并所有Cookie字段）
            authData.cookie = headers.Cookie || headers.cookie || "";
            if (typeof authData.cookie === "object") authData.cookie = Object.values(authData.cookie).join("; ");
            // csec参数
            authData.csecpkgname = headers.csecpkgname || "";
            authData.csecplatform = headers.csecplatform || "";
            authData.csecversion = headers.csecversion || "";
            authData.csecversionname = headers.csecversionname || "";
            // 其他关键字段
            authData.uuid = headers.uuid || "";
            authData.iuuid = headers.iuuid || "";
            authData.csecuserid = headers.csecuserid || "";
            authData.csecuuid = headers.csecuuid || "";
            authData.userAgent = headers["User-Agent"] || "";
            authData.mtgsig = headers.mtgsig || "";
            authData.yodaversion = headers.yodaversion || "";
        }

        // 2. 解析URL参数（补充请求头中缺失的字段）
        if ($request.url) {
            const urlObj = new URL(decodeURIComponent($request.url));
            Object.keys(authData).forEach(key => {
                if (!authData[key]) authData[key] = urlObj.searchParams.get(key) || "";
            });
            // 补充URL中的cityId/lat/lng等参数
            authData.cityId = urlObj.searchParams.get("cityId") || authData.cityId;
            authData.lat = urlObj.searchParams.get("lat") || authData.lat;
            authData.lng = urlObj.searchParams.get("lng") || authData.lng;
            authData.ctype = urlObj.searchParams.get("ctype") || authData.ctype;
            authData.appVersion = urlObj.searchParams.get("appVersion") || authData.appVersion;
        }

        // 3. 验证核心鉴权字段（基于真实请求的必传项）
        const coreKeys = ["token", "cookie", "uuid", "csecpkgname", "csecplatform"];
        const validKeys = coreKeys.filter(k => authData[k]);
        if (validKeys.length < 3) throw new Error(`核心字段不足（仅${validKeys.length}个），请确保访问美团会员/签到页`);

        // 4. 双存储写入（BoxJS + 本地临时存储，防止丢失）
        await Promise.all(Object.keys(authData).map(key => {
            if (!authData[key]) return Promise.resolve();
            return new Promise(resolve => {
                $persistentStore.write(authData[key], STORE_PREFIX + key, resolve);
            });
        }));
        coreKeys.forEach(k => {
            if (authData[k]) $persistentStore.write(authData[k], `${STORE_PREFIX}${k}_temp`);
        });

        // 5. 推送结果通知
        const successMsg = `✅ 抓包成功\n核心字段：${validKeys.join(", ")}\nCookie长度：${authData.cookie.length}字符`;
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