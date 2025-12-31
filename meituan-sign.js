// 美团签到脚本 | 精准读取csec参数 | 适配cube接口 | Loon专用
// 仓库: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-sign.js
const STORE_PREFIX = "meituan_";
const NOTIFY_SWITCH = true;
const LOG_LEVEL = 2;

// 独立日志函数
function log(level, ...msg) {
    if (level <= LOG_LEVEL) {
        console.log(`[美团签到-${new Date().toLocaleTimeString()}] [LV${level}]`, ...msg);
    }
}

// 独立通知函数
function notify(title, sub, msg) {
    if (NOTIFY_SWITCH) $notification.post(title, sub, msg);
}

// 读取存储字段（兼容BoxJS和本地临时存储）
function readAuthData(key) {
    return new Promise(resolve => {
        $persistentStore.read(STORE_PREFIX + key, value => {
            if (value) resolve(value);
            else $persistentStore.read(`${STORE_PREFIX}${key}_temp`, resolve);
        });
    });
}

(async function() {
    try {
        log(1, "【签到调试】脚本启动，目标接口：cube.meituan.com");
        // 读取与抓包脚本完全匹配的字段
        const authKeys = ["token", "deviceId", "userAgent", "cookie", "csecpkgname", "csecplatform", "csecversion", "csecversionname"];
        const authData = {};
        for (const key of authKeys) {
            authData[key] = await readAuthData(key) || "";
        }

        // 验证核心字段
        if (!authData.csecplatform || !authData.csecpkgname) {
            throw new Error("缺失csec核心参数，请先触发抓包");
        }
        log(2, "【签到调试】读取到鉴权参数：", authData);

        // 构造请求URL（与你提供的接口完全一致）
        const requestUrl = new URL("https://cube.meituan.com/topcube/api/toc/taskCenter/getUserTaskByScene");
        requestUrl.searchParams.append("k", "member_1");
        requestUrl.searchParams.append("csecpkgname", authData.csecpkgname);
        requestUrl.searchParams.append("csecplatform", authData.csecplatform);
        requestUrl.searchParams.append("csecversion", authData.csecversion || "1.0.18");
        requestUrl.searchParams.append("csecversionname", authData.csecversionname || "12.49.410");

        // 构造请求头
        const headers = {
            "User-Agent": authData.userAgent || "Meituan/12.49.410 iOS/18.0",
            "Accept": "*/*",
            "Connection": "keep-alive"
        };
        if (authData.token) headers.token = authData.token;
        if (authData.cookie) headers.Cookie = authData.cookie;
        if (authData.deviceId) headers["Device-ID"] = authData.deviceId;

        // 发起GET请求
        const signRes = await $task.fetch({
            url: requestUrl.toString(),
            method: "GET",
            headers: headers,
            timeout: 15
        });

        // 解析响应
        log(2, "【签到调试】接口响应状态：", signRes.statusCode);
        log(2, "【签到调试】接口响应内容：", signRes.body);
        if (signRes.statusCode !== 200) throw new Error(`接口返回状态码：${signRes.statusCode}`);

        const signData = JSON.parse(signRes.body);
        if (signData.code === 0 || signData.success) {
            let notifyMsg = "✅ 美团签到成功！";
            if (signData.data?.signStatus === 1) notifyMsg += "\n📌 今日已签到";
            if (signData.data?.reward) notifyMsg += `\n🎁 奖励：${JSON.stringify(signData.data.reward)}`;
            notify("美团签到结果", "", notifyMsg);
            log(1, notifyMsg);
        } else {
            throw new Error(signData.msg || "接口返回签到失败");
        }

    } catch (error) {
        const errMsg = `❌ 签到失败：${error.message}`;
        notify("美团签到错误", "", errMsg);
        log(1, errMsg);
    } finally {
        $done({});
    }
})();