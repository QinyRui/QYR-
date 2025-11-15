/**
 * Ninebot_Sign_Share_v2.2_FullMulti.js
 * 九号智能电动车 — 多账号旗舰版自动签到脚本（发布版）
 * 版本：v2.2 FullMulti
 * 作者：❥﹒﹏非我不可
 * 更新：2025/11/15
 *
 * 功能：
 *  - 多账号（BoxJS 配置或 persistentStore）
 *  - 自动捕获 Authorization / DeviceId（抓包一次）
 *  - 自动签到 / 查询状态 / N币余额 / 盲盒领取（可自动打开）
 *  - 日志开关（debug），通知开关（notify）
 *  - 兼容 Loon / Surge / Quantumult X / Stash / Shadowrocket
 *
 * 使用：
 *  - 在 BoxJS 中添加 Ninebot_Accounts (JSON 数组) 与 Ninebot_GlobalConfig (JSON)
 *  - 或者在 persistentStore 写入 Ninebot_Accounts / Ninebot_GlobalConfig
 *
 * Ninebot_Accounts 示例：
 * [
 *   {
 *     "name": "主号",
 *     "Authorization": "Bearer xxxx",  // 可留空以使用抓包捕获后的持久化值
 *     "DeviceId": "xxxx"               // 可留空以使用抓包捕获后的持久化值
 *   },
 *   {
 *     "name": "副号",
 *     "Authorization": "",
 *     "DeviceId": ""
 *   }
 * ]
 *
 * Ninebot_GlobalConfig 示例：
 * {
 *   "debug": true,
 *   "notify": true,
 *   "titlePrefix": "九号签到",
 *   "logPrefix": "Ninebot-LOG",
 *   "autoOpenBox": true,
 *   "concurrentDelayMs": 500
 * }
 */

// ---------------------- 环境与工具 兼容 ----------------------
const isReq = typeof $request !== "undefined" && $request.headers;
const persistentRead = key => (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null);
const persistentWrite = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const noti = (title, subtitle, body) => { if (typeof $notification !== "undefined") $notification.post(title, subtitle, body); };

// ---------------------- Token 捕获（抓包用） ----------------------
if (isReq) {
  try {
    const headers = $request.headers || {};
    const auth = headers["Authorization"] || headers["authorization"];
    const devId = headers["deviceId"] || headers["device_id"] || headers["device-id"] || headers["DeviceId"];
    if (auth) {
      persistentWrite(auth, "Ninebot_Authorization");
      console.log("[Ninebot][TokenCapture] ✅ Authorization captured.");
    }
    if (devId) {
      persistentWrite(devId, "Ninebot_DeviceId");
      console.log("[Ninebot][TokenCapture] ✅ DeviceId captured.");
    }
    if (auth || devId) noti("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
  } catch (e) {
    console.log("[Ninebot][TokenCapture] 捕获异常：", e);
  }
  $done({});
  return;
}

// ---------------------- 默认配置 ----------------------
let GLOBAL = {
  debug: true,
  notify: true,
  titlePrefix: "九号签到",
  logPrefix: "Ninebot-LOG",
  autoOpenBox: true,
  concurrentDelayMs: 600,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"
};

// 读取 BoxJS / $config（部分客户端注入 $config），或 persistentStore
try {
  // $config.value 用于 BoxJS 注入（若 BoxJS 导入 actions/settings）
  if (typeof $config !== "undefined" && $config.value) {
    try {
      const parsed = JSON.parse($config.value);
      GLOBAL = { ...GLOBAL, ...parsed };
    } catch (e) { /* ignore */ }
  }
} catch (e) { /* ignore */ }

// 读取 persistentStore 的全局配置（Ninebot_GlobalConfig）
try {
  const gRaw = persistentRead("Ninebot_GlobalConfig");
  if (gRaw) {
    try {
      const g = JSON.parse(gRaw);
      GLOBAL = { ...GLOBAL, ...g };
    } catch (e) { /* ignore */ }
  }
} catch (e) { /* ignore */ }

// 日志函数（受 debug 控制）
function log(...args) {
  if (GLOBAL.debug) {
    try { console.log(GLOBAL.logPrefix ? `[${GLOBAL.logPrefix}]` : "[Ninebot]", ...args); } catch (e) {}
  }
}

// 安全打印 token（部分掩码）
function maskToken(t) {
  if (!t) return "";
  const s = String(t);
  if (s.length > 12) return s.slice(0, 6) + "..." + s.slice(-6);
  if (s.length > 6) return s.slice(0, 3) + "..." + s.slice(-3);
  return s;
}

// ---------------------- 读取多账号配置 ----------------------
function readAccounts() {
  // 优先从 persistentStore 的 Ninebot_Accounts（字符串化 JSON）
  let raw = persistentRead("Ninebot_Accounts");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch (e) {
      log("读取 Ninebot_Accounts JSON 解析失败：", e);
    }
  }

  // 如果没有，尝试 $prefs（某些平台）
  if (typeof $prefs !== "undefined") {
    try {
      const p = $prefs.valueForKey ? $prefs.valueForKey("Ninebot_Accounts") : null;
      if (p) {
        const arr = JSON.parse(p);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) { /* ignore */ }
  }

  // 如果没有持久化账号，返回空数组（用户需要在 BoxJS 或仓库编辑）
  return [];
}

// ---------------------- HTTP 封装（兼容不同客户端） ----------------------
function httpPost(req) {
  return new Promise((resolve, reject) => {
    $httpClient.post(req, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}
function httpGet(req) {
  return new Promise((resolve, reject) => {
    $httpClient.get(req, (err, resp, data) => {
      if (err) reject(err.toString());
      else resolve({ resp, data });
    });
  });
}

// ---------------------- 业务工具函数 ----------------------
function parseReward(data) {
  if (!data) return "未知奖励";
  try {
    switch (data.rewardType) {
      case 1: return `${data.rewardValue} N币`;
      case 2: return `补签卡 ×${data.rewardValue}`;
      default: return `奖励(${data.rewardType}) ×${data.rewardValue}`;
    }
  } catch (e) {
    return JSON.stringify(data);
  }
}

async function openBlindBox(headers) {
  try {
    const res = await httpPost({
      url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
      headers,
      body: "{}"
    });
    const json = JSON.parse(res.data || "{}");
    log("openBlindBox 返回：", json);
    if (json.code === 0) return parseReward(json.data);
    return "领取失败：" + (json.msg || JSON.stringify(json));
  } catch (err) {
    log("openBlindBox 异常：", err);
    return "执行异常：" + err;
  }
}

// ---------------------- 单个账号流程 ----------------------
async function processAccount(account, index) {
  const name = account.name || `Account${index + 1}`;
  // 优先使用账号内指定的 Authorization / DeviceId，否则使用全局保存的 persistentStore（抓包捕获后会写入）
  let authorization = account.Authorization || account.authorization || persistentRead("Ninebot_Authorization");
  let deviceId = account.DeviceId || account.deviceId || account.device_id || persistentRead("Ninebot_DeviceId");

  log(`【${name}】开始执行`, `auth=${maskToken(authorization)}`, `deviceId=${maskToken(deviceId)}`);

  if (!authorization || !deviceId) {
    const msg = `未检测到 Authorization 或 DeviceId，请先打开九号 App 并抓包一次或在 BoxJS 填写账号信息。`;
    log(`【${name}】${msg}`);
    if (GLOBAL.notify) noti(`${GLOBAL.titlePrefix} · ${name}`, "未配置 Token", msg);
    return { name, ok: false, reason: "missing_token" };
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": authorization,
    "platform": "h5",
    "Origin": "https://h5-bj.ninebot.com",
    "language": "zh",
    "User-Agent": account.userAgent || GLOBAL.userAgent,
    "Referer": "https://h5-bj.ninebot.com/",
    "device_id": deviceId
  };

  const urls = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };

  let notifyBody = "";
  let days = 0;

  try {
    // ===== 签到 =====
    log(`【${name}】发起签到请求：`, urls.sign);
    const signRes = await httpPost({ url: urls.sign, headers, body: JSON.stringify({ deviceId }) });
    const signJson = JSON.parse(signRes.data || "{}");
    log(`【${name}】签到返回：`, signJson);

    if (signJson.code === 0) {
      notifyBody += `🎉 签到成功\n🎁 +${signJson.data.score || 0}经验，+${signJson.data.nCoin || 0} N币`;
    } else if (signJson.code === 540004) {
      notifyBody += `⚠️ 今日已签到`;
    } else {
      notifyBody += `❌ 签到失败：${signJson.msg || JSON.stringify(signJson)}`;
    }

    // ===== 签到状态 =====
    log(`【${name}】查询签到状态：`, urls.status);
    const statusRes = await httpGet({ url: urls.status, headers });
    const statusJson = JSON.parse(statusRes.data || "{}");
    log(`【${name}】状态返回：`, statusJson);
    if (statusJson.code === 0) {
      const s = statusJson.data || {};
      days = s.consecutiveDays || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${s.signCardsNum || 0} 张`;
    }

    // ===== N币余额 =====
    log(`【${name}】查询余额：`, urls.balance);
    const balRes = await httpGet({ url: urls.balance, headers });
    const balJson = JSON.parse(balRes.data || "{}");
    log(`【${name}】余额返回：`, balJson);
    if (balJson.code === 0) notifyBody += `\n💰 N币余额：${(balJson.data && balJson.data.balance) || 0}`;

    // ===== 盲盒任务 =====
    log(`【${name}】查询盲盒任务：`, urls.blindBoxList);
    const boxRes = await httpGet({ url: urls.blindBoxList, headers });
    const boxJson = JSON.parse(boxRes.data || "{}");
    log(`【${name}】盲盒返回：`, boxJson);

    const notOpened = boxJson.data?.notOpenedBoxes || [];
    if (notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      notOpened.forEach(b => notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`);
      // 准备自动开启
      if (GLOBAL.autoOpenBox) {
        const ready = notOpened.filter(b => b.leftDaysToOpen === 0 && b.rewardStatus === 2);
        log(`【${name}】可自动开启盲盒：`, ready);
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒...`;
          for (const b of ready) {
            log(`【${name}】尝试开启 ${b.awardDays} 天盲盒...`);
            const reward = await openBlindBox(headers);
            notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${reward}`;
          }
        }
      } else {
        log(`【${name}】autoOpenBox 已关闭，跳过自动开启盲盒。`);
      }
    } else {
      log(`【${name}】无未开启盲盒。`);
    }

    // 发送通知（按配置）
    const title = `${GLOBAL.titlePrefix}${name ? " · " + name : ""}`;
    if (GLOBAL.notify) {
      const sub = notifyBody.includes("今日已签到") ? `已签到 · 连续 ${days} 天` : `连续 ${days} 天`;
      noti(title, sub, notifyBody);
      log(`【${name}】通知已发送：`, title, sub);
    } else {
      log(`【${name}】notify=false，已跳过通知。`);
    }

    return { name, ok: true, days, body: notifyBody };
  } catch (err) {
    log(`【${name}】执行异常：`, err);
    const errMsg = `❌ 脚本异常：${err}`;
    if (GLOBAL.notify) noti(`${GLOBAL.titlePrefix} · ${name}`, "脚本异常", errMsg);
    return { name, ok: false, reason: "exception", error: String(err) };
  }
}

// ---------------------- 主入口：多账号循环 ----------------------
async function main() {
  log("▶▶▶ Ninebot 多账号执行开始", JSON.stringify(GLOBAL));

  let accounts = readAccounts();

  // 如果没有从 persistentStore 读到账号，尝试从 $config（BoxJS 注入）读取
  try {
    if ((!accounts || accounts.length === 0) && typeof $config !== "undefined" && $config && $config.accounts) {
      try {
        const parsed = typeof $config.accounts === "string" ? JSON.parse($config.accounts) : $config.accounts;
        if (Array.isArray(parsed)) accounts = parsed;
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // 再尝试从 persistentStore 的另一个键（兼容不同命名）
  if ((!accounts || accounts.length === 0)) {
    const tryRaw = persistentRead("Ninebot_Accounts");
    if (tryRaw) {
      try {
        const parsed = typeof tryRaw === "string" ? JSON.parse(tryRaw) : tryRaw;
        if (Array.isArray(parsed)) accounts = parsed;
      } catch (e) { /* ignore */ }
    }
  }

  if (!accounts || accounts.length === 0) {
    const msg = "未检测到任何账号配置。请在 BoxJS 中的 Ninebot_Accounts 填写账号列表（JSON 数组），或使用抓包捕获 Token。";
    log(msg);
    if (GLOBAL.notify) noti(GLOBAL.titlePrefix, "未配置账号", msg);
    return $done();
  }

  log(`检测到 ${accounts.length} 个账号，开始逐个执行（每账号间延迟 ${GLOBAL.concurrentDelayMs}ms）`);

  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    // 标准化字段名（兼容大小写）
    const normalized = {
      name: acc.name || acc.nickname || `账号${i + 1}`,
      Authorization: acc.Authorization || acc.authorization || "",
      DeviceId: acc.DeviceId || acc.deviceId || acc.device_id || ""
    };
    // 如果账号中未填写 Authorization/DeviceId，则会使用 persistentStore 中的捕获值（单全局）
    try {
      const res = await processAccount(normalized, i);
      results.push(res);
    } catch (e) {
      log("单账号执行错误：", e);
      results.push({ name: normalized.name, ok: false, error: String(e) });
    }
    // 每个账号之间延迟，防止短时间并发请求导致接口异常（可配置）
    await new Promise(r => setTimeout(r, GLOBAL.concurrentDelayMs || 600));
  }

  // 总结日志与通知（可选）
  const successCount = results.filter(r => r.ok).length;
  log("▶ 执行完成：", results);
  if (GLOBAL.notify) {
    const summary = `共 ${results.length} 个账号，成功 ${successCount} 个`;
    noti(GLOBAL.titlePrefix, "执行完成", summary);
  }

  $done();
}

// 启动
main();