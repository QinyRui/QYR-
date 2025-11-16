/*
📱 九号智能电动车自动签到脚本（v2.2 单号版）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新：保持 v2.2，仅修复字段，不升级版本
🔧 修复内容：
  - 经验值 undefined
  - 连续签到天数异常
  - 盲盒任务字段 tundefined / Nif / null
  - balance 为空
*/

const $ = new Env("九号电动车 · v2.2 修复版");

const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
const statusUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
const balanceUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user/sign/balance";
const blindBoxUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list";

let token = $.getdata("NINEBOT_TOKEN") || "";

if (typeof $request !== "undefined") {
    const auth = $request.headers["Authorization"] || $request.headers["authorization"];
    if (auth) {
        $.setdata(auth, "NINEBOT_TOKEN");
        $.msg("九号自动签到", "Token 捕获成功", auth);
    }
    $.done();
}

!(async () => {
    if (!token) {
        $.msg("九号自动签到", "", "未找到 Token，请先登录抓取！");
        return;
    }

    const headers = {
        "Authorization": token,
        "Content-Type": "application/json"
    };

    // 🟦 1. /sign
    const signRes = await $.post(signUrl, headers);
    const exp = signRes?.data?.exp || 0;
    const today = signRes?.data?.today ?? "未知";

    // 🟩 2. /status
    const statusRes = await $.get(statusUrl, headers);
    const keepDays = statusRes?.data?.keepDays || 0;
    const signCard = statusRes?.data?.makeUpCardCount || 0;

    // 🟨 3. /balance
    const balRes = await $.get(balanceUrl, headers);
    const balance = balRes?.data?.balance || 0;

    // 🟧 4. /blind-box/list — 修复 undefined 字段
    const bRes = await $.get(blindBoxUrl, headers);
    const blindList = bRes?.data?.list || [];

    const blindMsg = blindList
        .map(b => {
            const name = b?.name || "未知盲盒";
            const need = b?.needDays ?? "--";
            const now = b?.nowDays ?? 0;
            return `- ${name}盲盒，还需 ${need - now} 天`;
        })
        .join("\n");

    // 最终通知
    const msg =
`九号签到
连续${keepDays}天
签到成功
+${exp} 经验，连续签到：${keepDays}天
补签卡：${signCard}张
$
N币余额：${balance}
盲盒任务：
${blindMsg}`;

    $.msg("九号自动签到 v2.2", "", msg);

})()
    .catch((e) => $.log(e))
    .finally(() => $.done());

/* ---- Env 模板（保持原版 v2.2）---- */
function Env(t, e) {
    class s {
        constructor(t) { this.env = t }
        getdata(t) { return $loon?.read(t) || null }
        setdata(t, e) { return $loon?.write(t, e) }
        msg(t, e, s) { $loon && $notification.post(t, e, s) }
        get(t, e = {}) { return this.request("GET", t, e) }
        post(t, e = {}) { return this.request("POST", t, e) }
        request(m, url, h) {
            return new Promise(r => {
                $httpClient.request(
                    { method: m, url: url, headers: h },
                    (err, resp, data) => {
                        try { r(JSON.parse(data)) }
                        catch { r({}) }
                    }
                )
            });
        }
        log(t) { console.log(t) }
    }
    return new s(t, e);
}