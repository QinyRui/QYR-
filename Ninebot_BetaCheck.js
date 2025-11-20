/*
📱 九号智能电动车 · 内测资格检测插件（带自动申请+重试）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动检测内测资格
  - 未获得资格时可自动申请
  - 支持失败自动重试
  - 控制台日志 + 通知
*/

const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// BoxJS Keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_TITLE = "ninebot.titlePrefix";

// 读取配置
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  titlePrefix: read(KEY_TITLE) || "九号内测",
  maxRetry: 3,
  retryInterval: 5000
};

// 检查配置
if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix, "未配置 Token", "请先抓包并写入 Authorization 与 DeviceId");
  $done();
}

// HTTP helpers
function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } 
        catch { resolve({ raw: data }); }
      }
    });
  });
}

function httpPost({ url, headers, body }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body: body || "{}" }, (err, resp, data) => {
      if (err) reject(err);
      else {
        try { resolve(JSON.parse(data || "{}")); } 
        catch { resolve({ raw: data }); }
      }
    });
  });
}

// Headers
const headers = {
  "Authorization": cfg.Authorization,
  "device-id": cfg.DeviceId,
  "User-Agent": "Ninebot/3606 CFNetwork/3860.200.71 Darwin/25.1.0",
  "platform": "iOS",
  "language": "zh",
  "Content-Type": "application/json"
};

// 延迟函数
const delay = ms => new Promise(res => setTimeout(res, ms));

// 主流程
!(async () => {
  let notifyBody = "";
  try{
    // 检查内测状态
    const betaStatus = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      headers
    });

    if(cfg.debug) console.log("[Ninebot] 内测状态返回：", betaStatus);

    if(betaStatus?.data?.qualified){
      notifyBody += "🚀 已获得内测资格";
    }else{
      notifyBody += "⚠️ 未获得内测资格";

      if(cfg.autoApplyBeta){
        let success = false;
        for(let i=1;i<=cfg.maxRetry;i++){
          try{
            const applyResp = await httpPost({
              url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
              headers,
              body: JSON.stringify({ deviceId: cfg.DeviceId })
            });

            if(cfg.debug) console.log(`[Ninebot] 内测申请返回(第${i}次)：`, applyResp);

            if(applyResp?.success){
              notifyBody += ` → 自动申请成功 🎉 (第${i}次)`;
              success = true;
              break;
            }else{
              notifyBody += ` → 自动申请失败 ❌ (第${i}次)`;
              await delay(cfg.retryInterval);
            }
          }catch(e){
            console.log(`[Ninebot] 内测申请异常(第${i}次)：`, e);
            notifyBody += ` → 自动申请异常 ❌ (第${i}次)`;
            await delay(cfg.retryInterval);
          }
        }
        if(!success) notifyBody += "\n⚠️ 已达到最大重试次数，申请失败";
      }
    }

    if(cfg.notify) notify(cfg.titlePrefix, "内测资格检测", notifyBody);

  }catch(e){
    console.log("[Ninebot] 内测脚本异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
  }

  $done();
})();