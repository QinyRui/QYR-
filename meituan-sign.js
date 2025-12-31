// 美团签到脚本 | 适配真实请求头 | 复用全量鉴权字段 | Loon专用
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

// 读取存储（兼容BoxJS和本地临时存储）
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
        log(1, "【签到调试】脚本启动，目标接口：member.meituan.com");
        // 读取与抓包脚本完全匹配的字段
        const authKeys = [
            "token", "cookie", "uuid", "csecpkgname", "csecplatform", "csecversion", 
            "csecversionname", "userAgent", "appVersion", "ctype", "cityId", "lat", "lng", "mtgsig", "yodaversion"
        ];
        const authData = {};
        for (const key of authKeys) {
            authData[key] = await readAuthData(key) || "";
        }

        // 验证核心字段（基于真实请求的必传项）
        if (!authData.token || !authData.cookie || !authData.uuid) {
            throw new Error("缺失核心鉴权字段（token/cookie/uuid），请重新抓包");
        }
        log(2, "【签到调试】核心鉴权字段已获取：token/cookie/uuid");

        // 构造真实请求URL（参考你提供的growthvalue接口格式）
        const requestUrl = new URL("https://cube.meituan.com/topcube/api/toc/taskCenter/getUserTaskByScene");
        // 必传参数（从真实请求中提取的固定值+抓包字段）
        requestUrl.searchParams.append("k", "member_1");
        requestUrl.searchParams.append("csecpkgname", authData.csecpkgname || "com.meituan.imeituan");
        requestUrl.searchParams.append("csecplatform", authData.csecplatform || "2");
        requestUrl.searchParams.append("csecversion", authData.csecversion || "1.0.18");
        requestUrl.searchParams.append("csecversionname", authData.csecversionname || "12.49.410");
        requestUrl.searchParams.append("appVersion", authData.appVersion || "12.49.410");
        requestUrl.searchParams.append("ctype", authData.ctype || "mtiphone");
        requestUrl.searchParams.append("cityId", authData.cityId || "10");
        requestUrl.searchParams.append("uuid", authData.uuid);

        // 构造真实请求头（完全复刻你提供的请求头）
        const headers = {
            "User-Agent": authData.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/6.5.7 miniprogram MMP/1.17.1.82.4 MSC/1.82.4 group/12.49.410",
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Content-Type": "application/json",
            "Connection": "keep-alive",
            "priority": "u=3",
            "yodaready": "native",
            "yodaversion": authData.yodaversion || "1.14.110",
            "referer": "https://mmp.meituan.com/MSCSDK/0/service",
            "csecuuid": authData.csecuuid || authData.uuid,
            "csecuserid": authData.csecuserid || "",
            "token": authData.token,
            "Cookie": authData.cookie,
            "mtgsig": authData.mtgsig || ""
        };

        // 发起GET请求（与真实接口请求方式一致）
        log(2, "【签到调试】请求URL：", requestUrl.toString());
        log(2, "【签到调试】请求头核心字段：", {
            token: authData.token.substring(0, 30) + "...",
            cookie: authData.cookie.substring(0, 50) + "...",
            uuid: authData.uuid
        });

        const signRes = await $task.fetch({
            url: requestUrl.toString(),
            method: "GET",
            headers: headers,
            timeout: 20
        });

        // 解析响应
        log(2, "【签到调试】接口响应状态：", signRes.statusCode);
        if (signRes.statusCode !== 200) throw new Error(`接口返回状态码：${signRes.statusCode}`);

        const signData = JSON.parse(signRes.body);
        if (signData.code === 0 || signData.success) {
            let notifyMsg = "✅ 美团签到成功！";
            // 适配真实接口的签到状态字段
            if (signData.data?.signStatus === 1) notifyMsg += "\n📌 今日已完成签到";
            if (signData.data?.growthValue) notifyMsg += `\n🎫 获得成长值：${signData.data.growthValue}`;
            if (signData.data?.rewardDesc) notifyMsg += `\n🎁 奖励说明：${signData.data.rewardDesc}`;
            notify("美团签到结果", "", notifyMsg);
            log(1, notifyMsg);
        } else {
            throw new Error(`签到失败：${signData.msg || "接口返回无有效数据"}`);
        }

    } catch (error) {
        const errMsg = `❌ 签到失败：${error.message}`;
        notify("美团签到错误", "", errMsg);
        log(1, errMsg);
    } finally {
        $done({});
    }
})();