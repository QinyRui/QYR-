/* 米游社核心脚本：抓包+签到二合一 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const [action, notify] = $argument || []; // action: capture/sign, notify: true/false
const titlePrefix = "米游社极简签到";

// 读取BoxJS数据
function getBoxData(key) {
    return boxjs ? boxjs.getItem(key) || "" : "";
}

// 写入BoxJS数据
function setBoxData(key, val) {
    if (boxjs) boxjs.setItem(key, val);
}

// -------------- 抓包逻辑 --------------
function capture() {
    if (!boxjs) return;
    const captureEnable = getBoxData("mihoyo.captureEnable") === "true";
    if (!captureEnable) {
        notify && $notification.post(titlePrefix, "抓包未执行", "开关已关闭");
        return;
    }

    if (typeof $request !== 'undefined') {
        const cookie = $request.headers?.Cookie?.match(/(cookie_token=.*?;|account_id=.*?;)/g)?.join(" ") || "";
        const stoken = $request.headers?.["x-rpc-stoken"] || "";
        const now = new Date().toLocaleString();

        if (cookie || stoken) {
            cookie && setBoxData("mihoyo.cookie", cookie);
            stoken && setBoxData("mihoyo.stoken", stoken);
            setBoxData("mihoyo.lastCaptureAt", now);
            notify && $notification.post(titlePrefix, "抓包成功", "凭证已写入BoxJS");
        } else if (notify) {
            $notification.post(titlePrefix, "抓包无数据", "未提取到凭证");
        }
    }
}

// -------------- 签到逻辑（带重试） --------------
async function sign() {
    if (!boxjs) return;
    const cookie = getBoxData("mihoyo.cookie");
    const stoken = getBoxData("mihoyo.stoken");
    if (!cookie || !stoken) {
        notify && $notification.post(titlePrefix, "签到失败", "未配置Cookie/SToken");
        return;
    }

    let result = "";
    const maxRetry = 2;
    for (let i = 0; i <= maxRetry; i++) {
        try {
            const res = await $httpClient.post({
                url: "https://api-takumi.mihoyo.com/community/apihub/app/api/signIn",
                headers: {
                    "Cookie": cookie,
                    "x-rpc-stoken": stoken,
                    "User-Agent": "miHoYoBBS/2.50.1"
                },
                body: JSON.stringify({ gids: 1 })
            });

            if (res.status === 200) {
                const data = res.data;
                if (data.retcode === 0) {
                    result = `✅ 签到成功\n奖励: ${data.data?.award?.name || "原石"}`;
                    break;
                } else if (data.retcode === 10001) {
                    result = "ℹ️ 今日已签到";
                    break;
                } else {
                    result = `❌ 签到失败: ${data.message}`;
                }
            } else {
                result = `❌ 网络错误: HTTP ${res.status}`;
            }
        } catch (e) {
            result = `❌ 脚本异常: ${e.message}`;
        }

        // 最后一次重试不延迟
        if (i < maxRetry && result.includes("❌")) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            result += `\n重试中(${i+1}/${maxRetry})`;
        }
    }

    notify && $notification.post(titlePrefix, "签到结果", result);
    $persistentStore.write(result, "mihoyo_sign_result");
}

// -------------- 主逻辑 --------------
if (action === "capture") capture();
if (action === "sign") sign();

$done({});