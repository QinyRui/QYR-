/*
📱 九号智能电动车自动签到脚本（单账号版 v2.2 修复版）
=====================================================
👤 作者：❥﹒﹏非我不可
📆 保持版本号：2.2（仅修复 Bug，不升级）
*/

const AUTH_KEY = "Ninebot_Authorization";
const DEVICE_KEY = "Ninebot_DeviceId";
const NAME_KEY = "Ninebot_DisplayName";
const NOTIFY_KEY = "Ninebot_Notification";
const LOG_KEY = "Ninebot_Log";

// 环境判断
const env = (() => ({
  isLoon: typeof $loon !== "undefined",
  isQuanX: typeof $task !== "undefined",
  isSurge: typeof $httpClient !== "undefined"
}))();

// 读写
function read(key) {
  if (env.isQuanX) return $prefs.valueForKey(key);
  return $persistentStore.read(key);
}
function write(key, val) {
  if (env.isQuanX) return $prefs.setValueForKey(val, key);
  return $persistentStore.write(val, key);
}

// 日志
function log(msg) {
  if (read(LOG_KEY) === "1") console.log(msg);
}

// 通知
function notify(title, subtitle, msg) {
  if (read(NOTIFY_KEY) !== "1") return;
  if (env.isQuanX) $notify(title, subtitle, msg);
  else $notification.post(title, subtitle, msg);
}

/* ---------------- Token 捕获 ---------------- */
if (typeof $request !== "undefined") {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["Deviceid"];

  if (auth && deviceId) {
    write(AUTH_KEY, auth);
    write(DEVICE_KEY, deviceId);
    notify("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需抓包一次）");
  }

  $done({});
  return;
}

/* ---------------- 主逻辑 ---------------- */

const Authorization = read(AUTH_KEY);
const DeviceId = read(DEVICE_KEY);
const DisplayName = read(NAME_KEY) || "九号账号";  // ★ 修复 undefined → 默认正常名称

if (!Authorization || !DeviceId) {
  notify("九号签到", "未配置账号", "请前往 BoxJS 填写 Authorization 与 DeviceId");
  $done();
  return;
}

// POST 封装
function post(url, body = {}) {
  const headers = {
    "Authorization": Authorization,
    "deviceId": DeviceId,
    "Content-Type": "application/json"
  };

  return new Promise(resolve => {
    if (env.isQuanX) {
      $task.fetch({ url, method: "POST", headers, body: JSON.stringify(body) })
        .then(resp => resolve(JSON.parse(resp.body || "{}")));
    } else {
      $httpClient.post({ url, headers, body: JSON.stringify(body) }, (err, resp, data) => {
        resolve(JSON.parse(data || "{}"));
      });
    }
  });
}

(async () => {
  try {
    log("开始请求签到…");

    const sign = await post("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign");
    const status = await post("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");
    const balance = await post("https://cn-cbu-gateway.ninebot.com/portal/api/user/ncoin/balance");
    const box = await post("https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list");

    // ★ 修复 undefined 字段
    const days = status?.data?.calendarInfo?.days || 0;
    const exp = sign?.data?.experience ?? 0;
    const card = status?.data?.calendarInfo?.reissueCard ?? 0;
    const ncoin = balance?.data?.balance ?? 0;

    const boxList = box?.data?.list || [];
    const boxMsg = boxList
      .map(i => `- ${i?.title || "盲盒"}，还需 ${i?.remainDays ?? 0} 天`)
      .join("\n");

    // ★ 全面修复通知错乱（最重要）
    const msg =
      `连续 ${days} 天\n` +
      `签到成功\n` +
      `+${exp} 经验\n` +
      `补签卡：${card} 张\n` +
      `N币余额：${ncoin}\n\n` +
      `盲盒任务：\n${boxMsg}`;

    notify(`九号签到（${DisplayName}）`, "", msg);

  } catch (err) {
    notify("九号签到失败", "", String(err));
    console.log("错误：", err);
  }

  $done();
})();