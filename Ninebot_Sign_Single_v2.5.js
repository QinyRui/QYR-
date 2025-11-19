/****************************
 * 九号智能电动车签到 · 单账号
 * 修复：Loon 不执行的问题
 ****************************/

!(async () => {
  const isRequest = typeof $request !== "undefined";
  const PREFIX = "NINEBOT_";

  function read(key) {
    return $persistentStore.read(PREFIX + key) || "";
  }
  function write(key, val) {
    return $persistentStore.write(val, PREFIX + key);
  }
  function log(msg) {
    if (read("enable_debug") === "true") console.log(msg);
  }
  function notify(title, msg) {
    if (read("enable_notify") !== "false") $notification.post(title, "", msg);
  }

  // =========== 抓包写入 ===========
  if (isRequest) {
    const headers = $request.headers || {};
    if (headers.Authorization) {
      write("Authorization", headers.Authorization);
      notify("九号签到助手", "已自动写入 Authorization");
      log("写入 Authorization = " + headers.Authorization);
    }
    if (headers["User-Agent"]) {
      write("UserAgent", headers["User-Agent"]);
      log("写入 User-Agent = " + headers["User-Agent"]);
    }
    if (headers["Deviceld"]) {
      write("DeviceId", headers["Deviceld"]);
      log("写入 DeviceId = " + headers["Deviceld"]);
    }
    $done({});
    return;
  }

  // =========== 签到执行 ===========
  const Authorization = read("Authorization");
  const DeviceId = read("DeviceId");
  const UserAgent = read("UserAgent");

  if (!Authorization || !DeviceId || !UserAgent) {
    notify("九号签到助手", "请先抓包或在插件 UI 填写账号信息");
    $done();
    return;
  }

  log("开始执行签到…");

  const sign_url = `https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign`;
  const headers2 = {
    Authorization,
    DeviceId,
    "User-Agent": UserAgent,
    "Content-Type": "application/json"
  };

  const req = {
    url: sign_url,
    method: "POST",
    headers: headers2,
    body: "{}"
  };

  $httpClient.post(req, function (err, resp, data) {
    if (err) {
      notify("九号签到助手", "签到失败，网络错误");
      log("网络错误: " + JSON.stringify(err));
      $done();
      return;
    }

    log("签到返回: " + data);

    try {
      const obj = JSON.parse(data);
      notify("九号签到助手", "签到结果: " + (obj.msg || "未知"));
    } catch (e) {
      notify("九号签到助手", "签到返回无法解析");
    }

    $done();
  });

})();