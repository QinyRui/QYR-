/*
📱 九号智能电动车自动签到脚本 v2.5
作者：❥﹒﹏非我不可 & QinyRui
支持：Loon / iOS
*/

(async () => {
  const DEBUG = true; // 控制控制台日志
  const ENABLE_NOTIFY = true; // 控制通知

  // 这里从插件 UI 或抓包写入读取
  const AUTHORIZATION = typeof $argument !== "undefined" ? $argument.Authorization || "" : "";
  const DEVICEID = typeof $argument !== "undefined" ? $argument.DeviceId || "" : "";
  const USER_AGENT = typeof $argument !== "undefined" ? $argument.UserAgent || "Ninebot/3606 CFNetwork/3860.200.71" : "";

  if (!AUTHORIZATION || !DEVICEID) {
    if (ENABLE_NOTIFY) $notify("九号签到助手", "缺少 Authorization 或 DeviceId", "请先填写或抓包写入");
    if (DEBUG) console.log("缺少 Authorization 或 DeviceId");
    return;
  }

  const $http = typeof $httpClient !== "undefined" ? $httpClient : $task; // Loon 兼容
  const request = (options) => new Promise((resolve) => {
    $http.fetch(options, (err, resp) => {
      if (DEBUG) console.log("请求返回：", resp?.status, err);
      resolve({err, resp, data: resp ? resp.body : null});
    });
  });

  // 示例签到接口
  const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
  const headers = {
    "Authorization": AUTHORIZATION,
    "DeviceId": DEVICEID,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json"
  };

  const signResult = await request({
    url: signUrl,
    method: "POST",
    headers,
    body: "{}"
  });

  let message = "";
  try {
    const json = JSON.parse(signResult.data || "{}");
    if (json.code === 0) {
      message = `签到成功 🎉\n连续签到：${json.data?.continuous || 0}天\nN币余额：${json.data?.balance || 0}`;
    } else if (json.code === 2) {
      message = `签到失败：已签到或参数错误\n${JSON.stringify(json)}`;
    } else {
      message = `签到返回：${JSON.stringify(json)}`;
    }
  } catch(e) {
    message = "签到解析失败：" + e.message;
  }

  if (ENABLE_NOTIFY) $notify("九号签到助手", "签到结果", message);
  if (DEBUG) console.log("签到结果：", message);
})();