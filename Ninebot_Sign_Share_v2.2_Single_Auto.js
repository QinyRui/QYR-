/**
 * Ninebot_Sign_Share_v2.2_FullSingle.js
 * 九号智能电动车 — 单账号自动签到脚本
 * 版本：v2.2 FullSingle
 * 作者：❥﹒﹏非我不可
 * 更新：2025/11/15
 *
 * 功能：
 *  - 单账号
 *  - 自动捕获 Authorization / DeviceId（抓包一次）
 *  - 自动签到 / 查询状态 / N币余额 / 盲盒领取
 *  - 日志开关（debug），通知开关（notify）
 *  - 避免重复 Token 捕获通知
 *  - 兼容 Loon / Surge / Quantumult X / Stash / Shadowrocket
 */

// ---------------------- 环境与工具 ----------------------
const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null);
const persistentWrite = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

// ---------------------- Token 捕获（抓包用） ----------------------
if (isReq) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"];
    const devId = headers["deviceId"] || headers["device_id"] || headers["DeviceId"];

    // 避免重复通知
    const prevCaptured = persistentRead("Ninebot_TokenCaptured");
    if (!prevCaptured && (auth || devId)) {
      if (auth) persistentWrite(auth, "Ninebot_Authorization");
      if (devId) persistentWrite(devId, "Ninebot_DeviceId");
      persistentWrite("1", "Ninebot_TokenCaptured");
      noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
    }
  } catch (e) { console.log("[Ninebot][TokenCapture] 异常：", e); }
  $done({});
  return;
}

// ---------------------- 配置 ----------------------
let GLOBAL = {
  debug: true,
  notify: true,
  titlePrefix: "九号签到",
  logPrefix: "Ninebot-LOG",
  autoOpenBox: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"
};
function log(...args) { if (GLOBAL.debug) console.log(`[${GLOBAL.logPrefix}]`, ...args); }

// ---------------------- HTTP 封装 ----------------------
function httpPost(req) { return new Promise((resolve, reject) => $httpClient.post(req, (err, resp, data) => err ? reject(err) : resolve({ resp, data }))); }
function httpGet(req) { return new Promise((resolve, reject) => $httpClient.get(req, (err, resp, data) => err ? reject(err) : resolve({ resp, data }))); }

// ---------------------- 奖励解析 ----------------------
function parseReward(data) {
  if (!data) return "未知奖励";
  switch (data.rewardType) {
    case 1: return `${data.rewardValue} N币`;
    case 2: return `补签卡 ×${data.rewardValue}`;
    default: return `奖励(${data.rewardType}) ×${data.rewardValue}`;
  }
}

// ---------------------- 自动开启盲盒 ----------------------
async function openBlindBox(headers) {
  try {
    const res = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
      headers,
      body: "{}"
    });
    const json = JSON.parse(res.data || "{}");
    log("openBlindBox 返回：", json);
    return json.code === 0 ? parseReward(json.data) : "领取失败：" + (json.msg || "");
  } catch (err) { log("openBlindBox 异常：", err); return "执行异常：" + err; }
}

// ---------------------- 单账号流程 ----------------------
async function main() {
  const authorization = persistentRead("Ninebot_Authorization");
  const deviceId = persistentRead("Ninebot_DeviceId");

  if (!authorization || !deviceId) {
    const msg = "未检测到 Authorization 或 DeviceId，请抓包一次获取 Token。";
    log(msg);
    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, "未配置账号", msg);
    return $done();
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "User-Agent": GLOBAL.userAgent,
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId
  };

  try {
    // 签到
    const signRes = await httpPost({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", headers, body: JSON.stringify({ deviceId }) });
    const signJson = JSON.parse(signRes.data || "{}");
    let notifyBody = signJson.code === 0
      ? `🎉 签到成功\n🎁 +${signJson.data.score}经验，+${signJson.data.nCoin} N币`
      : signJson.code === 540004
        ? `⚠️ 今日已签到`
        : `❌ 签到失败：${signJson.msg || ""}`;
    log("签到结果：", notifyBody);

    // 状态
    const statusRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers });
    const s = JSON.parse(statusRes.data || "{}").data || {};
    const days = s.consecutiveDays || 0;
    notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${s.signCardsNum || 0} 张`;

    // N币余额
    const balRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606", headers });
    notifyBody += `\n💰 N币余额：${JSON.parse(balRes.data || "{}").data?.balance || 0}`;

    // 盲盒
    const boxRes = await httpGet({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers });
    const notOpened = JSON.parse(boxRes.data || "{}").data?.notOpenedBoxes || [];
    if (notOpened.length) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`);
      if (GLOBAL.autoOpenBox) {
        const ready = notOpened.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        if (ready.length) {
          notifyBody += `\n\n🎉 自动开启盲盒...`;
          for (const b of ready) {
            const reward = await openBlindBox(headers);
            notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${reward}`;
          }
        }
      }
    }

    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, `连续 ${days} 天`, notifyBody);
    log("脚本执行完成：", notifyBody);
  } catch (err) {
    log("脚本异常：", err);
    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, "脚本异常", `❌ ${err}`);
  } finally { $done(); }
}

// 启动
main();