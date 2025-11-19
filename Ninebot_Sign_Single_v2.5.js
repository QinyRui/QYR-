/***************************************
📱 九号智能电动车 · 单账号自动签到脚本（v2.5 修复版）
👉 支持 Loon 插件 UI 自动写入 Authorization / DeviceId / User-Agent
👉 彻底兼容 Loon（使用 $persistentStore）
****************************************/

const isRequest = typeof $request !== "undefined";
const store = $persistentStore;

const KEY_AUTH = "Authorization";
const KEY_DID = "DeviceId";
const KEY_UA = "UserAgent";

// 读取配置
function read(name) {
  return store.read(name) || "";
}

// 写入配置
function write(value, name) {
  return store.write(value, name);
}

// Loon 通知
function notify(title, sub, msg) {
  if (read("enable_notify") === "true" || read("enable_notify") === true) {
    $notification.post(title, sub, msg);
  }
}

// 调试日志
function log(msg) {
  if (read("enable_debug") === "true") console.log(msg);
}

/***********************
 📌 抓包写入模式
***********************/
if (isRequest) {
  const headers = $request.headers || {};

  let auth = headers["Authorization"] || headers["authorization"];
  let did = headers["DeviceId"] || headers["deviceid"] || headers["device-id"];
  let ua = headers["User-Agent"] || headers["user-agent"];

  let updated = false;

  if (auth) {
    write(auth, KEY_AUTH);
    updated = true;
  }
  if (did) {
    write(did, KEY_DID);
    updated = true;
  }
  if (ua) {
    write(ua, KEY_UA);
    updated = true;
  }

  if (updated) {
    notify("九号签到助手", "抓包成功写入账号数据", "");
    log("[写入成功] Authorization / DeviceId / UA 已写入");
  } else {
    log("抓包触发，但未捕获到有效字段");
  }

  $done({});
  return;
}

/***********************
 📌 自动签到执行部分
***********************/
const Authorization = read(KEY_AUTH);
const DeviceId = read(KEY_DID);
const UserAgent = read(KEY_UA);

if (!Authorization || !DeviceId || !UserAgent) {
  notify("九号签到助手", "", "请先抓包或在插件 UI 填写账号信息");
  $done();
  return;
}

// 请求封装
function request(opt) {
  return new Promise((resolve) => {
    $httpClient.post(opt, (err, resp, data) => {
      if (err) {
        resolve({ error: err });
      } else {
        resolve(JSON.parse(data || "{}"));
      }
    });
  });
}

(async () => {
  notify("九号签到助手", "", "开始签到…");

  const headers = {
    "Authorization": Authorization,
    "DeviceId": DeviceId,
    "User-Agent": UserAgent
  };

  // 签到接口
  const signRes = await request({
    url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    headers,
  });

  notify("九号签到助手", "签到结果：", JSON.stringify(signRes));

  $done();
})();