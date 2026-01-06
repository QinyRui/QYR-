/*
 * 米游社签到脚本（适配全量Cookie解析）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 修复：彻底解决 Unexpected token 语法错误
 */
const boxjs = typeof $boxjs !== "undefined" ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = boxjs ? (boxjs.getItem("mihoyo.titlePrefix") || "米游社签到助手") : "米游社签到助手";

// 存储封装 - 优先BoxJs，兼容Loon/Surge
const store = {
    get: function(key) {
        if (boxjs) return boxjs.getItem(key) || "";
        return typeof $persistentStore !== "undefined" ? $persistentStore.read(key) || "" : "";
    },
    set: function(key, val) {
        if (boxjs) boxjs.setItem(key, val);
        if (typeof $persistentStore !== "undefined") $persistentStore.write(val, key);
    }
};

// 日志配置与函数
const LOG_LEVEL = store.get("mihoyo.logLevel") || "full";
function log(type, msg) {
    if (LOG_LEVEL === "silent") return;
    if (LOG_LEVEL === "simple" && type === "debug") return;
    console.log(`[米游社签到-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// 通知函数 - 修复逻辑与开关
function sendNotification(subtitle, content) {
    const notifyAll = store.get("mihoyo.notify") !== "false";
    const notifyOnlyFail = store.get("mihoyo.notifyFail") !== "false";
    const shouldNotify = subtitle.includes("失败") ? (notifyAll || notifyOnlyFail) : notifyAll;
    if (shouldNotify && notify) {
        $notification.post(titlePrefix, subtitle, content);
    }
}

// 过期错误码映射
const EXPIRED_CODES = {
    "-100": "登录态失效（Cookie/SToken过期）",
    "-101": "未登录或凭证错误",
    "401": "权限验证失败（凭证过期）",
    "10001": "接口重复请求（非过期）",
    "10103": "Cookie无效或已过期"
};

// Cookie解析 - 兼容多格式分隔符
function parseFullCookie(cookieStr) {
    const cookieObj = {};
    if (!cookieStr) {
        log("warn", "Cookie字符串为空");
        return cookieObj;
    }
    cookieStr.split(/;\s*|，\s*/).forEach(item => {
        const parts = item.split("=");
        if (parts.length < 2) return;
        const key = parts[0].trim();
        const val = parts.slice(1).join("=").trim();
        cookieObj[key] = val;
    });
    return {
        cookieToken: cookieObj.cookie_token || cookieObj.cookie_token_v2 || cookieObj.cookieToken || "",
        accountId: cookieObj.account_id || cookieObj.account_id_v2 || cookieObj.accountId || cookieObj.stuid || "",
        stoken: cookieObj.stoken || cookieObj.stoken_v2 || ""
    };
}

// 过期提醒
function sendExpiredTip() {
    sendNotification(
        "凭证过期提醒 ⚠️",
        "请重新抓包更新Cookie/SToken\n1. 开启抓包开关 2. 米游社重新登录签到页"
    );
}

// 响应解析
function parseSignResponse(data) {
    if (data.signed) {
        return `✅ 签到成功\n本月已签：${data.sign_days}天\n漏签：${data.sign_cnt_missed}天\n米游币：${data.coin_cnt}`;
    } else {
        return `❌ 签到失败\n原因：${data.message || "未知错误"}\n本月可补签：${data.resign_limit_monthly - data.resign_cnt_monthly}次`;
    }
}

// 核心签到请求
async function sendSignRequest(parsedCookie, stoken, userAgent) {
    const { cookieToken, accountId } = parsedCookie;
    const signUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/sign";
    const infoUrl = "https://api-takumi.mihoyo.com/event/luna/hk4e/resign_info";
    const headers = {
        "Cookie": `cookie_token=${cookieToken}; account_id=${accountId};`,
        "x-rpc-stoken": stoken,
        "User-Agent": userAgent || "miHoYoBBS/2.50.1",
        "Content-Type": "application/json",
        "Referer": "https://webstatic.mihoyo.com/",
        "Origin": "https://webstatic.mihoyo.com"
    };

    if (!cookieToken || !accountId || !stoken) {
        return { success: false, msg: "凭证缺失：cookie_token/account_id/SToken 不全", isExpired: false };
    }

    try {
        // 查询状态
        const infoRes = await $httpClient.get({ url: infoUrl, headers });
        if (infoRes.status !== 200) return { success: false, msg: `HTTP错误：${infoRes.status}`, isExpired: false };
        const infoData = infoRes.data;
        if (infoData.retcode !== 0) {
            const isExpired = Object.keys(EXPIRED_CODES).includes(infoData.retcode.toString());
            return { success: false, msg: EXPIRED_CODES[infoData.retcode] || infoData.message, isExpired };
        }
        if (infoData.data.signed) return { success: true, msg: parseSignResponse(infoData.data), isExpired: false };

        // 发起签到
        const signRes = await $httpClient.post({
            url: signUrl,
            headers,
            body: JSON.stringify({ act_id: "e202307121442271", region: "cn_gf01", uid: accountId })
        });
        if (signRes.status !== 200) return { success: false, msg: `签到请求失败：${signRes.status}`, isExpired: false };
        const signData = signRes.data;
        if (signData.retcode !== 0) {
            const isExpired = Object.keys(EXPIRED_CODES).includes(signData.retcode.toString());
            return { success: false, msg: EXPIRED_CODES[signData.retcode] || signData.message, isExpired };
        }

        // 最终状态查询
        const finalRes = await $httpClient.get({ url: infoUrl, headers });
        return { success: true, msg: parseSignResponse(finalRes.data.data), isExpired: false };
    } catch (e) {
        return { success: false, msg: `脚本异常：${e.message}`, isExpired: false };
    }
}

// 主逻辑（带重试）
async function signMihoyo() {
    log("info", "米游社签到脚本启动");
    const fullCookie = store.get("mihoyo.cookie");
    const stoken = store.get("mihoyo.stoken") || store.get("mihoyo.x-rpc-stoken");
    const userAgent = store.get("mihoyo.userAgent");
    const parsedCookie = parseFullCookie(fullCookie);

    log("debug", `Cookie解析结果：${parsedCookie.cookieToken ? "有效" : "无效"}`);
    log("debug", `SToken状态：${stoken ? "存在" : "缺失"}`);

    let result = "";
    let isExpired = false;
    const maxRetry = 2;
    for (let i = 0; i <= maxRetry; i++) {
        const res = await sendSignRequest(parsedCookie, stoken, userAgent);
        result = res.msg;
        isExpired = res.isExpired;
        if (res.success || isExpired) break;
        if (i < maxRetry) {
            log("warn", `重试(${i+1}/${maxRetry})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    sendNotification("原神签到结果", result);
    if (isExpired) sendExpiredTip();
    store.set("mihoyo_sign_result", result);
    store.set("mihoyo_sign_time", new Date().toLocaleString());
    log("info", `签到结束：${result}`);
}

// 执行入口
signMihoyo().then(() => $done({}));