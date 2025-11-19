/******************************
 * 九号自动写入模块（Loon 专用）
 * 自动抓包写入 Authorization / DeviceId / User-Agent
 ******************************/

const header = $request?.headers || {};
const store = $store;

// UI 字段对应 Argument 名
const KEY_AUTH = "Authorization";
const KEY_DID = "DeviceId";
const KEY_UA = "UserAgent";

function notify(title, msg) {
  if ($argument.enable_notify === "true") {
    $notification.post(title, "", msg);
  }
}

function writeIfChanged(key, newValue) {
  const oldValue = store.read(key) || "";
  if (newValue && newValue !== oldValue) {
    store.write(newValue, key);
    return true;
  }
  return false;
}

(function () {
  let changed = false;

  // Authorization
  const auth = header["Authorization"] || header["authorization"];
  if (auth) {
    if (writeIfChanged(KEY_AUTH, auth)) {
      changed = true;
    }
  }

  // DeviceId
  const did =
    header["DeviceId"] ||
    header["deviceId"] ||
    header["X-Device-Id"] ||
    header["x-device-id"];
  if (did) {
    if (writeIfChanged(KEY_DID, did)) {
      changed = true;
    }
  }

  // User-Agent
  const ua = header["User-Agent"] || header["user-agent"];
  if (ua) {
    if (writeIfChanged(KEY_UA, ua)) {
      changed = true;
    }
  }

  if (changed) {
    notify("九号签到助手", "抓包成功写入账号数据");
    $done({ matched: true });
  } else {
    $done({});
  }
})();