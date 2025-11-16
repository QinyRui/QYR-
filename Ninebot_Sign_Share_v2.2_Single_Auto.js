/**
 * Ninebot_Sign_Share_v2.2_Single_Auto.js
 * 九号智能电动车 — 单账号自动签到脚本
 * 修复：经验 undefined / nCoin undefined / 自动盲盒异常
 */

const isReq = typeof $request !== "undefined";
const read = k => $persistentStore.read(k);
const write = (v, k) => $persistentStore.write(v, k);

if (isReq) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"];
    const devId = h["deviceId"] || h["DeviceId"] || h["device_id"];

    const captured = read("Ninebot_TokenCaptured");

    if (!captured && (auth || devId)) {
      if (auth) write(auth, "Ninebot_Authorization");
      if (devId) write(devId, "Ninebot_DeviceId");
      write("1", "Ninebot_TokenCaptured");

      $notification.post("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
    }
  } catch (e) {}
  return $done({});
}

// ---------------- 配置 ----------------
let CFG = {
  notify: true,
  debug: true,
  title: "九号签到",
  autoOpenBox: true,
};

// 日志
function log(...x) { if (CFG.debug) console.log(`[Ninebot]`, ...x); }

// HTTP
function GET(req) { return new Promise(r => $httpClient.get(req, (e,s,d)=>r({e,s,d}))); }
function POST(req) { return new Promise(r => $httpClient.post(req, (e,s,d)=>r({e,s,d}))); }

(async () => {
  const authorization = read("Ninebot_Authorization");
  const deviceId = read("Ninebot_DeviceId");

  if (!authorization || !deviceId) {
    let msg = "未检测到授权数据，请抓包获取 Token";
    $notification.post(CFG.title, "未配置账号", msg);
    return $done();
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": authorization,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    "Origin": "https://h5-bj.ninebot.com",
    "Referer": "https://h5-bj.ninebot.com/",
    "platform": "h5",
    "device_id": deviceId,
    "language": "zh",
  };

  let notifyMsg = "";

  // 1️⃣ 签到
  const sign = await POST({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers,
    body: JSON.stringify({deviceId})
  });

  let s = {};
  try { s = JSON.parse(sign.d || sign.data || "{}"); } catch {}

  const score = s?.data?.score ?? 0;
  const ncoin = s?.data?.nCoin ?? 0;

  if (s.code === 0) {
    notifyMsg += `🎉 签到成功\n+${score} 经验\n+${ncoin} N币\n`;
  } else if (s.code === 540004) {
    notifyMsg += `⚠️ 今日已签到\n`;
  } else {
    notifyMsg += `❌ 签到失败：${s.msg || "未知错误"}\n`;
  }

  // 2️⃣ 状态
  const status = await GET({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });

  let st = {};
  try { st = JSON.parse(status.d || status.data || "{}").data || {}; } catch {}
  notifyMsg += `🗓 连续签到：${st.consecutiveDays || 0} 天\n🎫 补签卡：${st.signCardsNum || 0} 张\n`;

  // 3️⃣ N币
  const bal = await GET({
    url: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    headers
  });

  const balance = JSON.parse(bal.d || bal.data || "{}")?.data?.balance ?? 0;
  notifyMsg += `💰 N币余额：${balance}\n`;

  // 4️⃣ 盲盒
  const boxes = await GET({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    headers
  });

  let bx = JSON.parse(boxes.d || boxes.data || "{}")?.data?.notOpenedBoxes || [];
  if (bx.length) {
    notifyMsg += `📦 盲盒任务：`;
    bx.forEach(b => notifyMsg += `\n- ${b.awardDays} 天盲盒，还需 ${b.leftDaysToOpen} 天`);

    if (CFG.autoOpenBox) {
      const can = bx.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
      if (can.length) {
        notifyMsg += `\n🎉 自动开启盲盒…`;
        for (const b of can) {
          const r = await POST({
            url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
            headers,
            body: "{}"
          });
          const rr = JSON.parse(r.d || r.data || "{}");
          notifyMsg += `\n🎁 ${b.awardDays} 天盲盒获得：${rr.data?.rewardValue || "未知"} `;
        }
      }
    }
  }

  if (CFG.notify) {
    $notification.post(
      CFG.title,
      `连续 ${st.consecutiveDays || 0} 天`,
      notifyMsg
    );
  }

  log("脚本执行完成");
  $done();
})();