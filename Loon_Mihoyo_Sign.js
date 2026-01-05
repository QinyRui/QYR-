/*
 * 米游社自动签到脚本（Loon 专用）
 * 初始名: Loon_Mihoyo_Sign.js
 * 依赖 BoxJS 存储的 Cookie/SToken
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = $argument?.[0] === "true";
const titlePrefix = $argument?.[1] || "米游社签到助手";

// 读取BoxJS数据
function getBoxData(key) {
    if (boxjs) return boxjs.getItem(key) || "";
    if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key) || "";
    return "";
}

// 执行签到
async function signMihoyo() {
    const cookie = getBoxData("mihoyo.cookie");
    const stoken = getBoxData("mihoyo.stoken");

    if (!cookie || !stoken) {
        return "未配置Cookie/SToken，请先在BoxJS中填写";
    }

    const signUrl = "https://api-takumi.mihoyo.com/community/apihub/app/api/signIn";
    const headers = {
        "Cookie": cookie,
        "x-rpc-stoken": stoken,
        "User-Agent": "miHoYoBBS/2.50.1 CFNetwork/3860.200.71 Darwin/25.1.0",
        "Content-Type": "application/json"
    };
    const body = JSON.stringify({ gids: 1 }); // 固定原神签到

    try {
        const response = await $httpClient.post({ url: signUrl, headers: headers, body: body });
        if (response.status === 200) {
            const res = response.data;
            if (res.retcode === 0) return `✅ 签到成功\n奖励: ${res.data?.award?.name || "原石/摩拉"}`;
            if (res.retcode === 10001) return "ℹ️ 今日已签到";
            return `❌ 签到失败: ${res.message || "未知错误"}`;
        }
        return `❌ 网络错误: HTTP ${response.status}`;
    } catch (e) {
        return `❌ 脚本异常: ${e.message}`;
    }
}

// 主逻辑
(async function() {
    const result = await signMihoyo();
    if (notify) $notification.post(titlePrefix, "签到结果", result);
    // 缓存签到结果供小组件读取
    $persistentStore.write(result, "mihoyo_sign_result");
    $persistentStore.write(new Date().toLocaleString(), "mihoyo_sign_time");
    $done({});
})();