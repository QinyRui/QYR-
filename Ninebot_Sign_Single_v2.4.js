/*
📱 九号智能电动车自动签到（单账号）
📝 Version: v2.4
👤 Author: ❥﹒﹏非我不可 & QinyRui
✈️ Telegram: https://t.me/JiuHaoAPP
*/

const $ = API("Ninebot_Auto_Sign");

const CONFIG = {
  auth: $.read("ninebot.authorization"),
  deviceId: $.read("ninebot.deviceId"),
  userAgent: $.read("ninebot.userAgent"),
  debug: $.read("ninebot.debug") ?? true,
  notify: $.read("ninebot.notify") ?? true,
  autoOpenBox: $.read("ninebot.autoOpenBox") ?? true,
  autoApplyBeta: $.read("ninebot.autoApplyBeta") ?? false,
  titlePrefix: $.read("ninebot.titlePrefix") || "九号签到"
};

// -------------------- 工具函数 --------------------
function log(...msg) { if (CONFIG.debug) console.log(...msg); }
function notify(title, subtitle, body) {
  if (CONFIG.notify) $.notify(title, subtitle, body);
}

function httpGet(opt) {
  return new Promise(resolve => {
    $.get(opt, (err, resp, data) => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function httpPost(opt) {
  return new Promise(resolve => {
    $.post(opt, (err, resp, data) => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

// -------------------- 主流程 --------------------
(async () => {
  if (!CONFIG.auth || !CONFIG.deviceId) {
    notify(CONFIG.titlePrefix, "错误", "未写入 Authorization / DeviceId");
    return $.done();
  }

  const headers = {
    Authorization: CONFIG.auth,
    "Device-Id": CONFIG.deviceId,
    "User-Agent": CONFIG.userAgent || "Ninebot",
  };

  // ----------- 1. /sign 正常签到 -----------
  const signRes = await httpPost({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers
  });
  log("签到返回：", signRes);

  // ----------- 2. 查询签到状态 -----------
  const status = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    headers
  });

  // ----------- 3. 余额 -----------
  const balance = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/nb-coin/v1/balance",
    headers
  });

  // ----------- 4. 盲盒 -----------
  const boxList = await httpGet({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/v1/list",
    headers
  });

  // ----------- 5. 内测资格检测 -----------
  let betaMsg = "";
  try {
    const beta = await httpGet({
      url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
      headers
    });
    log("内测资格状态：", beta);

    if (beta?.data?.qualified) {
      betaMsg = "🎉 已具有内测资格";
    } else {
      betaMsg = "⚠️ 未获得内测资格";

      // --------- 自动申请内测（预留） ---------
      if (CONFIG.autoApplyBeta) {
        betaMsg += "（尝试自动申请 ➜ 未实现，等待抓包 POST 接口）";
        // await applyBeta();
      }
    }
  } catch (e) {
    log("内测检测异常：", e);
  }

  // ----------- 通知 -----------
  notify(
    CONFIG.titlePrefix,
    "签到完成",
    `签到结果：${signRes?.msg || "未知"}\n连续：${status?.data?.continuityDays || "?"} 天\nN币：${balance?.data?.balance || "?"}\n盲盒数：${boxList?.data?.length || 0}\n内测：${betaMsg}`
  );

  $.done();
})();

// -------------------- applyBeta 预留 --------------------
async function applyBeta() {
  // 等你抓到 POST 申请内测接口后，我帮你完整实现
}