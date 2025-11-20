/*
📱 九号智能电动车 · 内测检测 BoxJS 版
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 内测资格检测 + 自动申请
  - 支持 BoxJS 配置读取
  - 打印完整接口返回，显示真实失败原因
*/

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_TITLE = "ninebot.titlePrefix";

// ---------- 读取配置 ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  titlePrefix: read(KEY_TITLE) || "九号内测"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请在 BoxJS 中配置 Authorization 与 DeviceId");
  $done();
}

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
      }
    });
  });
}

// ---------- Endpoints ----------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};

const END = {
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  registration: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// ---------- 主流程 ----------
!(async () => {
  let notifyBody = "";

  try {
    // 1) 内测状态
    const beta = await httpGet({ url: END.betaStatus, headers });
    console.log("内测状态返回：", beta);

    if (beta?.data?.qualified) {
      notifyBody += "\n🚀 已获得内测资格";
    } else {
      notifyBody += "\n⚠️ 未获得内测资格";

      // 2) 自动申请内测
      if (cfg.autoApplyBeta) {
        try {
          const applyResp = await httpPost({
            url: END.registration,
            headers,
            body: JSON.stringify({ deviceId: cfg.DeviceId })
          });

          console.log("内测申请返回：", applyResp);

          if (applyResp?.success) {
            notifyBody += " → 自动申请成功 🎉";
          } else if (applyResp?.msg) {
            notifyBody += ` → 自动申请失败 ❌ 原因：${applyResp.msg}`;
          } else {
            notifyBody += " → 自动申请失败 ❌ 原因未知";
          }
        } catch (e) {
          console.log("内测自动申请异常：", e);
          notifyBody += " → 自动申请异常 ❌";
        }
      }
    }

    // 3) 最终通知
    if (cfg.notify) notify(cfg.titlePrefix, "内测检测结果", notifyBody);

  } catch (e) {
    console.log("内测检测异常：", e);
    if (cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();