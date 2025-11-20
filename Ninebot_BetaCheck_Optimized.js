/*
📱 九号智能电动车 · 内测检测优化版
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 内测资格检测
  - 自动申请内测（仅未获得资格时）
  - 完整日志打印
  - BoxJS 配置读取
*/

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_TITLE = "ninebot.titlePrefix";

// 读取配置
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先抓包写入 Authorization 与 DeviceId");
  $done();
}

// HTTP helper
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

// Endpoints
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device-id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform": "iOS"
};

const END = {
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};

// 主流程
!(async () => {
  try {
    const beta = await httpGet({ url: END.betaStatus, headers });
    console.log("[Ninebot] 内测状态返回：", JSON.stringify(beta));

    if (beta?.data?.qualified) {
      notify(cfg.titlePrefix, "内测状态", "🚀 已获得内测资格");
      console.log("[Ninebot] 已获得内测资格");
    } else {
      console.log("[Ninebot] 未获得内测资格", JSON.stringify(beta));
      notify(cfg.titlePrefix, "内测状态", "⚠️ 未获得内测资格");

      if (cfg.autoApplyBeta) {
        try {
          const applyResp = await httpPost({
            url: END.betaApply,
            headers,
            body: JSON.stringify({ deviceId: cfg.DeviceId })
          });
          console.log("[Ninebot] 内测申请返回：", JSON.stringify(applyResp));

          if (applyResp?.success) {
            notify(cfg.titlePrefix, "内测申请", "🎉 自动申请成功");
          } else {
            notify(cfg.titlePrefix, "内测申请", `❌ 自动申请失败：${applyResp?.msg || "未知原因"}`);
          }
        } catch (e) {
          console.log("[Ninebot] 内测自动申请异常：", e);
          notify(cfg.titlePrefix, "内测申请", "❌ 自动申请异常");
        }
      }
    }
  } catch (e) {
    console.log("[Ninebot] 内测检测异常：", e);
    notify(cfg.titlePrefix, "内测状态", `脚本异常：${e.message || e}`);
  }

  $done();
})();