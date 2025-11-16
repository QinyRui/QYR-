/**
 * Ninebot_Sign_Share_v2.2_Single_Auto.js
 * 九号智能电动车 — 单账号自动签到脚本（修复 undefined）
 * 版本：v2.2 Single_Auto (Fix)
 * 作者：❥﹒﹏非我不可
 */

// ---------------------- 环境工具 ----------------------
const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null);
const persistentWrite = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

// ---------------------- Token 捕获 ----------------------
if (isReq) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"];
    const devId = headers["deviceId"] || headers["device_id"] || headers["DeviceId"];

    const prevCaptured = persistentRead("Ninebot_TokenCaptured");
    if (!prevCaptured && (auth || devId)) {
      if (auth) persistentWrite(auth, "Ninebot_Authorization");
      if (devId) persistentWrite(devId, "Ninebot_DeviceId");
      persistentWrite("1", "Ninebot_TokenCaptured");
      noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
    }
  } catch (e) {
    console.log("[Ninebot][TokenCapture] 异常：", e);
  }
  $done({});
  return;
}

// ---------------------- 配置 ----------------------
let GLOBAL = {
  debug: true,
  notify: true,
  titlePrefix: "九号签到",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  autoOpenBox: true
};
const log = (...x) => GLOBAL.debug && console.log("[Ninebot]", ...x);

// ---------------------- HTTP ----------------------
function httpPost(req) { return new Promise((res, rej) => $httpClient.post(req, (e, r, d) => e ? rej(e) : res({ r, d }))); }
function httpGet(req) { return new Promise((res, rej) => $httpClient.get(req, (e, r, d) => e ? rej(e) : res({ r, d }))); }

// ---------------------- 奖励解析（修复空字段） ----------------------
function parseReward(d) {
  if (!d) return "未知奖励";
  const type = d.rewardType ?? "未知类型";
  const val = d.rewardValue ?? 0;
  if (type === 1) return `${val} N币`;
  if (type === 2) return `补签卡 ×${val}`;
  return `奖励(${type}) ×${val}`;
}

// ---------------------- 开盲盒 ----------------------
async function openBlindBox(headers) {
  try {
    const res = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
      headers,
      body: "{}"
    });
    const json = JSON.parse(res.d || "{}");
    return json.code === 0 ? parseReward(json.data) : "领取失败：" + (json.msg || "");
  } catch (e) {
    return "执行异常：" + e;
  }
}

// ---------------------- 主流程 ----------------------
async function main() {
  const authorization = persistentRead("Ninebot_Authorization");
  const deviceId = persistentRead("Ninebot_DeviceId");

  if (!authorization || !deviceId) {
    const msg = "未检测到 Authorization 或 DeviceId，请抓包一次获取 Token。";
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
    // ------- 签到 -------
    const signRes = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      headers,
      body: JSON.stringify({ deviceId })
    });
    const signJson = JSON.parse(signRes.d || "{}");

    const score = signJson?.data?.score ?? 0;
    const nCoin = signJson?.data?.nCoin ?? 0;

    let notifyBody =
      signJson.code === 0
        ? `🎉 签到成功\n🎁 +${score} 经验，+${nCoin} N币`
        : signJson.code === 540004
          ? `⚠️ 今日已签到`
          : `❌ 签到失败：${signJson.msg || ""}`;

    // ------- 状态 -------
    const statusRes = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
      headers
    });
    const s = JSON.parse(statusRes.d || "{}")?.data || {};

    const days = s.consecutiveDays ?? 0;
    const cards = s.signCardsNum ?? 0;

    notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;

    // ------- N币余额 -------
    const balRes = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
      headers
    });
    const balance = JSON.parse(balRes.d || "{}")?.data?.balance ?? 0;

    notifyBody += `\n💰 N币余额：${balance}`;

    // ------- 盲盒 -------
    const boxRes = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
      headers
    });

    const notOpened = JSON.parse(boxRes.d || "{}")?.data?.notOpenedBoxes ?? [];

    if (notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => {
        const award = b?.awardDays ?? "未知";
        const left = b?.leftDaysToOpen ?? "未知";
        notifyBody += `\n- ${award} 天盲盒，还需 ${left} 天`;
      });

      // 自动开盲盒
      if (GLOBAL.autoOpenBox) {
        const ready = notOpened.filter(b =>
          (b?.leftDaysToOpen === 0 && b?.rewardStatus === 2)
        );

        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒...`;
          for (const b of ready) {
            const reward = await openBlindBox(headers);
            notifyBody += `\n🎁 ${b.awardDays} 天盲盒获得：${reward}`;
          }
        }
      }
    }

    // 通知
    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, `连续 ${days} 天`, notifyBody);

  } catch (e) {
    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, "脚本异常", "❌ " + e);
  } finally {
    $done();
  }
}

// 运行
main();