/**
 * Ninebot_Sign_Share_v2.2_Single_Auto.js
 * 九号智能电动车 — 单账号旗舰版（自动补账号版）
 * 版本：v2.2 Single-Auto
 * 作者：❥﹒﹏非我不可
 * 更新：2025/11/15
 *
 * 功能：
 *  - 单账号自动签到
 *  - 自动捕获 Authorization / DeviceId（抓包一次即可）
 *  - 自动保存，不再提示“未配置账号”
 *  - 自动签到 / 查询状态 / N币余额 / 盲盒领取（支持自动开启）
 *  - 通知开关、日志开关
 *  - 兼容 Loon / Surge / QuanX / Stash / Shadowrocket
 */

// ====== 环境兼容 ======
const isReq = typeof $request !== "undefined" && $request.headers;
const readStore = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const writeStore = (v, k) => (typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : null);
const notify = (t, s, b) => { if (typeof $notification !== "undefined") $notification.post(t, s, b); };

// ================== Token 捕获 ==================
if (isReq) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"];
    const devId = h["deviceId"] || h["DeviceId"] || h["device_id"];

    let saved = false;

    if (auth) {
      writeStore(auth, "Ninebot_Authorization");
      console.log("✔ 捕获 Authorization");
      saved = true;
    }
    if (devId) {
      writeStore(devId, "Ninebot_DeviceId");
      console.log("✔ 捕获 DeviceId");
      saved = true;
    }

    if (saved) notify("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");

  } catch (e) {}
  return $done({});
}

// ================== 默认配置 ==================
let GLOBAL = {
  debug: true,
  notify: true,
  titlePrefix: "九号签到",
  autoOpenBox: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7)",
};

// 日志
function log(...a) { if (GLOBAL.debug) console.log("[Ninebot]", ...a); }

// HTTP
const httpPost = req => new Promise((res, rej) => $httpClient.post(req, (e, r, d) => e ? rej(e) : res({ r, d })));
const httpGet  = req => new Promise((res, rej) => $httpClient.get(req, (e, r, d) => e ? rej(e) : res({ r, d })));

// ================== 主流程（单账号） ==================
async function main() {
  log("== 开始执行九号单账号签到 ==");

  // 自动读取已保存 Token（不需要 BoxJS）
  const authorization = readStore("Ninebot_Authorization");
  const deviceId = readStore("Ninebot_DeviceId");

  if (!authorization || !deviceId) {
    const msg = "未捕获 Token（Authorization / DeviceId）。请先打开九号 App 抓包一次。";
    log(msg);
    if (GLOBAL.notify) notify(GLOBAL.titlePrefix, "未检测到 Token", msg);
    return $done();
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "User-Agent": GLOBAL.userAgent,
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId
  };

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  let body = "";

  try {
    // === 签到 ===
    log("签到中...");
    const s1 = await httpPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    const j1 = JSON.parse(s1.d || "{}");
    log("签到返回:", j1);

    if (j1.code === 0)
      body += `🎉 签到成功\n🎁 +${j1.data.nCoin || 0} N币`;
    else if (j1.code === 540004)
      body += "⚠️ 今日已签到";
    else
      body += `❌ 签到失败：${j1.msg}`;

    // === 状态 ===
    const s2 = await httpGet({ url: urls.status, headers });
    const j2 = JSON.parse(s2.d || "{}");
    log("状态:", j2);
    if (j2.code === 0)
      body += `\n🗓 连续签到：${j2.data.consecutiveDays} 天\n🎫 补签卡：${j2.data.signCardsNum || 0} 张`;

    // === N 币 ===
    const s3 = await httpGet({ url: urls.balance, headers });
    const j3 = JSON.parse(s3.d || "{}");
    log("余额:", j3);
    if (j3.code === 0)
      body += `\n💰 N币余额：${j3.data.balance}`;

    // === 盲盒 ===
    const s4 = await httpGet({ url: urls.blindBoxList, headers });
    const j4 = JSON.parse(s4.d || "{}");
    log("盲盒:", j4);

    const list = j4.data?.notOpenedBoxes || [];
    if (list.length > 0) {
      body += "\n\n📦 盲盒：";
      list.forEach(b => body += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`);

      if (GLOBAL.autoOpenBox) {
        const ready = list.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);

        for (const b of ready) {
          const r = await httpPost({
            url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
            headers,
            body: "{}"
          });
          const j = JSON.parse(r.d || "{}");
          if (j.code === 0)
            body += `\n🎉 开启 ${b.awardDays} 天盲盒：${b.rewardValue || "奖励"}`;
        }
      }
    }

    if (GLOBAL.notify) notify(GLOBAL.titlePrefix, "", body);

  } catch (e) {
    log("异常：", e);
    if (GLOBAL.notify) notify(GLOBAL.titlePrefix, "脚本异常", String(e));
  }

  $done();
}

main();