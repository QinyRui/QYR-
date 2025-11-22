/******************************************
 * 九号智能电动车 · 单号自动签到（v2.6 最终增强版）
 * Author: QinyRui & ❥﹒﹏非我不可
 * Updated: 2025-11-22 (enhanced)
 ******************************************/

const TITLE = $persistentStore.read("ninebot.titlePrefix") || "九号签到";
const ENABLE_NOTIFY = $persistentStore.read("ninebot.notify") !== "false";
const AUTO_OPEN_BOX = $persistentStore.read("ninebot.autoOpenBox") === "true";
const AUTO_REPAIR = $persistentStore.read("ninebot.autoRepair") === "true";
const AUTO_BETA = $persistentStore.read("ninebot.autoApplyBeta") === "true";
const DEBUG = $persistentStore.read("ninebot.debug") === "true";

function log(...args){ if (DEBUG) console.log(...args); }

// ================== 抓包写入（必走，且写 last_write） ==================
if (typeof $request !== "undefined") {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev1 = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    const last = Number($persistentStore.read("ninebot_last_write") || 0);
    const now = Date.now();

    if (auth && dev1 && ua && (now - last > 60000)) {
      $persistentStore.write(auth, "ninebot.authorization");
      $persistentStore.write(dev1, "ninebot.deviceId");
      $persistentStore.write(dev1, "ninebot.device_id");
      $persistentStore.write(ua, "ninebot.userAgent");
      $persistentStore.write(String(now), "ninebot_last_write");

      if (ENABLE_NOTIFY) $notification.post(TITLE, "抓包写入成功", "Authorization / DeviceId / User-Agent 已写入，请关闭抓包");
      log("[Ninebot] 抓包写入成功");
    } else {
      log("[Ninebot] 抓包触发但未写入（字段不全或 60s 内重复）");
    }
  } catch (e) {
    log("[Ninebot] 抓包异常:", e);
    if (ENABLE_NOTIFY) $notification.post(TITLE, "抓包写入异常", String(e));
  }
  $done({});
}

// ================== 简单 http 封装（支持 GET/POST） ==================
function httpCall(method, url, headers = {}, body = null, cb) {
  try {
    const opt = { url, headers };
    if (body) opt.body = body;
    if (method.toLowerCase() === "get") $httpClient.get(opt, cb);
    else $httpClient.post(opt, cb);
  } catch (e) {
    cb(e);
  }
}

function httpJson(method, url, headers = {}, body = null) {
  return new Promise(resolve => {
    httpCall(method, url, headers, body, (err, resp, data) => {
      if (err) return resolve({ err: String(err) });
      try { resolve(JSON.parse(data)); } catch (e) { resolve({ err: "parse error", raw: data }); }
    });
  });
}

// ================== 主流程 ==================
(async () => {
  const authorization = $persistentStore.read("ninebot.authorization");
  const deviceId = $persistentStore.read("ninebot.deviceId") || $persistentStore.read("ninebot.device_id");
  const userAgent = $persistentStore.read("ninebot.userAgent");

  if (!authorization || !deviceId || !userAgent) {
    if (ENABLE_NOTIFY) $notification.post(TITLE, "❌ 未配置 Token", "请先抓包写入 Authorization / DeviceId / User-Agent");
    return $done();
  }

  // 双写请求头，兼容多种要求
  const headers = {
    "Authorization": authorization,
    "DeviceId": deviceId,
    "device_id": deviceId,
    "User-Agent": userAgent,
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "*/*",
    "Connection": "keep-alive"
  };

  log("[Ninebot] 开始主流程（签到、状态、余额、盲盒）");

  // 为了兼容多种返回结构：我会按顺序尝试多个 URL / 字段（优先级）
  // 1) 执行签到（如果未签到，sign 接口可能会返回 RepeatSign/Success 等）
  const trySign = async () => {
    const urls = [
      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      "https://ebike.ninebot.com/portal/api/user-sign/v2/sign"
    ];
    for (const u of urls) {
      const res = await httpJson("post", u, headers, "{}");
      if (res && !res.err) return { url: u, res };
    }
    return { url: null, res: null };
  };

  // 2) 获取状态（包含 consecutiveDays, signCardsNum, currentSignStatus, blindBoxStatus）
  const tryStatus = async () => {
    const urls = [
      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
      "https://ebike.ninebot.com/portal/api/user-sign/v2/status"
    ];
    for (const u of urls) {
      const res = await httpJson("get", u, headers);
      if (res && !res.err) return { url: u, res };
    }
    return { url: null, res: null };
  };

  // 3) 获取余额（尝试多路径）
  const tryBalance = async () => {
    const candidates = [
      "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
      "https://cn-cbu-gateway.ninebot.com/portal/api/coin/balance",
      "https://ebike.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
    ];
    for (const u of candidates) {
      const res = await httpJson("get", u, headers);
      if (res && !res.err) return { url: u, res };
    }
    return { url: null, res: null };
  };

  // 4) 盲盒列表
  const tryBlindBox = async () => {
    const urls = [
      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
      "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list"
    ];
    for (const u of urls) {
      const res = await httpJson("get", u, headers);
      if (res && !res.err) return { url: u, res };
    }
    return { url: null, res: null };
  };

  // 先查状态（可以知道是否已签到、补签数、连续天数）
  const { res: statusRes } = await tryStatus();
  log("StatusRes:", statusRes);

  const consecutiveDays = statusRes?.data?.consecutiveDays ?? 0;
  const signCardsNum = statusRes?.data?.signCardsNum ?? 0;
  const currentSignStatus = statusRes?.data?.currentSignStatus ?? 0; // 1 已签到

  // 如果未签到就尝试签到（但如果 status 显示已签到则跳过）
  let signRes = null;
  if (currentSignStatus !== 1) {
    const s = await trySign();
    signRes = s.res;
    log("SignRes:", signRes);
  } else {
    log("已签到，跳过 sign 请求");
  }

  // 查询余额（回退多端点）
  const { res: balanceRes } = await tryBalance();
  log("BalanceRes:", balanceRes);
  let nCoin = 0;
  if (balanceRes?.data?.balance != null) nCoin = balanceRes.data.balance;
  else if (balanceRes?.data?.coinBalance != null) nCoin = balanceRes.data.coinBalance;
  else nCoin = 0;

  // 查询盲盒
  const { res: boxRes } = await tryBlindBox();
  log("BoxRes:", boxRes);
  const notOpened = boxRes?.data?.notOpenedBoxes || [];

  // 自动开盲盒（只在配置并且存在可开的盲盒时调用）
  if (AUTO_OPEN_BOX && notOpened.length > 0) {
    for (const b of notOpened) {
      if (b.leftDaysToOpen === 0) {
        // 尝试两个可能的领取接口（回退）
        const openUrls = [
          "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
          "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/receive"
        ];
        for (const u of openUrls) {
          const or = await httpJson("post", u, headers, "{}");
          log("blind-box open:", u, or);
          if (or && !or.err) break;
        }
      }
    }
  }

  // 自动补签（如果配置且 status 显示需要补签）
  if (AUTO_REPAIR && statusRes?.data?.repairSign) {
    const repairUrls = [
      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
      "https://ebike.ninebot.com/portal/api/user-sign/v2/repair"
    ];
    for (const u of repairUrls) {
      const rr = await httpJson("post", u, headers, "{}");
      log("repair:", u, rr);
      if (rr && !rr.err) break;
    }
  }

  // 自动申请内测（可选）
  if (AUTO_BETA) {
    const betaUrls = [
      "https://cn-cbu-gateway.ninebot.com/vehicle/vehicle/apply-inner-test",
      "https://ebike.ninebot.com/vehicle/vehicle/apply-inner-test"
    ];
    for (const u of betaUrls) {
      const br = await httpJson("post", u, headers, "{}");
      log("apply-inner-test:", u, br);
      if (br && !br.err) break;
    }
  }

  // 组装通知（遵循你指定的格式）
  let notifyBody = `🗓️ 连续签到: ${consecutiveDays}\n`;

  // 判断签到是否成功：多条件判断，尽量鲁棒
  let signedText = "⚠️ 签到失败";
  if (signRes) {
    if (signRes.code === 0 || (signRes.data && (signRes.data.result === "Success" || signRes.data.result === "success"))) signedText = "✅ 签到成功";
    else if ((String(signRes.msg || "")).includes("已签到") || (statusRes?.data?.currentSignStatus === 1)) signedText = "✅ 已签到";
    else signedText = "⚠️ 签到结果：" + (signRes.msg || JSON.stringify(signRes));
  } else {
    // 如果没有触发 signRes（因为 status 表示已签到），则直接显示已签到
    if (statusRes?.data?.currentSignStatus === 1) signedText = "✅ 已签到";
  }

  notifyBody += `${signedText}\n`;
  notifyBody += `💰 N币余额: ${nCoin}\n`;
  notifyBody += `🃏 补签卡剩余: ${signCardsNum}\n`;

  // 盲盒（未开启）
  if (notOpened.length === 0) {
    notifyBody += `🎁 盲盒任务:\n   - 暂无盲盒可开\n`;
  } else {
    notifyBody += `🎁 盲盒任务:\n`;
    for (const b of notOpened) {
      notifyBody += `   - ${b.awardDays}天盲盒，还需${b.leftDaysToOpen}天\n`;
    }
  }

  if (ENABLE_NOTIFY) $notification.post(TITLE, "签到完成", notifyBody);
  log("[Ninebot] 通知已发:\n", notifyBody);

  $done();
})();