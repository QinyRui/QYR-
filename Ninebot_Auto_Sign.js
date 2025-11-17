/*
📱 九号智能电动车自动签到（单账号版）
👤 作者：QinyRui
📆 更新：2025/11/17
🔧 功能：抓包写入 + 自动签到 + 盲盒任务 + 连续天数 + N币
*/

const ENV = (() => {
  const isLoon = typeof $loon !== "undefined";
  return { isLoon };
})();

const storeKeyAuth = "ninebot.authorization";
const storeKeyDev = "ninebot.deviceId";
const storeKeyUA = "ninebot.userAgent";

const API = {
  write: (k, v) => $persistentStore.write(v, k),
  read: (k) => $persistentStore.read(k),
  notify: (title, sub, msg) => $notification.post(title, sub, msg),
  http: (opt) => $httpClient[opt.method](opt, opt.cb),
};

// ========== 👀 抓包写入 ==========
if (typeof $request !== "undefined") {
  const h = $request.headers;
  if (h) {
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;

    if (auth && API.read(storeKeyAuth) !== auth) {
      API.write(storeKeyAuth, auth);
      changed = true;
    }
    if (dev && API.read(storeKeyDev) !== dev) {
      API.write(storeKeyDev, dev);
      changed = true;
    }
    if (ua && API.read(storeKeyUA) !== ua) {
      API.write(storeKeyUA, ua);
      changed = true;
    }

    if (changed) {
      API.notify(
        "九号智能电动车（单号）",
        "抓包成功 ✓",
        "Authorization、DeviceId、User-Agent 已自动写入"
      );
    }
  }
  $done({});
  return;
}

// ========== 🏁 开始签到 ==========
const AUTH = API.read(storeKeyAuth) || "";
const DEVICEID = API.read(storeKeyDev) || "";
const UA = API.read(storeKeyUA) || "";

if (!AUTH || !DEVICEID || !UA) {
  API.notify(
    "九号智能电动车（单号）",
    "❌ 缺少参数",
    "请先打开九号 App 主页 → 抓任意请求以写入授权。"
  );
  $done();
  return;
}

const HEADERS = {
  Authorization: AUTH,
  DeviceId: DEVICEID,
  "User-Agent": UA,
};

function get(opt) {
  return new Promise((res) => {
    API.http({ method: "get", ...opt, cb: (e, r, d) => res({ e, r, d }) });
  });
}

// ====== 签到接口 ======
async function sign() {
  const url = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
  return await get({ url, headers: HEADERS });
}

// ====== 查询签到状态 ======
async function status() {
  const url = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status";
  return await get({ url, headers: HEADERS });
}

// ====== 查询盲盒 ======
async function box() {
  const url = "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list";
  return await get({ url, headers: HEADERS });
}

// ====== 查询 N 币 ======
async function balance() {
  const url = "https://cn-cbu-gateway.ninebot.com/portal/api/wallet/balance";
  return await get({ url, headers: HEADERS });
}

(async () => {
  let output = `🚘 九号智能电动车\n`;

  const s = await sign();
  let signText = "";

  try {
    const js = JSON.parse(s.d || "{}");
    if (js.code === 0) {
      signText = `✅ 今日签到成功`;
    } else {
      signText = `❌ 签到失败：${js.msg || "异常"}`;
    }
  } catch {
    signText = "❌ 签到失败（解析异常）";
  }
  output += signText + "\n";

  // 状态
  const st = await status();
  try {
    const js = JSON.parse(st.d || "{}");
    output += `连续签到：${js.data?.continuousDays || 0} 天\n`;
    output += `补签卡：${js.data?.remedyCard || 0} 张\n`;
  } catch {
    output += "连续签到：解析失败\n";
  }

  // N币
  const bl = await balance();
  try {
    const js = JSON.parse(bl.d || "{}");
    output += `💰 N币：${js.data?.balance || 0}\n`;
  } catch {
    output += "💰 N币解析失败\n";
  }

  // 盲盒
  const bx = await box();
  try {
    const js = JSON.parse(bx.d || "{}");
    if (js.data?.length) {
      output += `📦 盲盒任务：\n`;
      js.data.forEach((i) => {
        output += `- ${i.boxName}：还需 ${i.diffDays} 天\n`;
      });
    } else {
      output += "📦 无盲盒任务\n";
    }
  } catch {
    output += "📦 盲盒解析失败\n";
  }

  API.notify("九号智能电动车（单号）", "签到结果", output);
  $done();
})();