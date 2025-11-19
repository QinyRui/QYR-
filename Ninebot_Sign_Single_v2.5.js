/**************************************
📱 九号 单账号自动签到（Loon 专用）
👤 作者：❥﹒﹏非我不可 & QinyRui
📆 版本：2.5
**************************************/

const isRequest = typeof $request !== "undefined";
const KEY_AUTH = "LOON_NINEBOT_AUTH";
const KEY_DID = "LOON_NINEBOT_DID";
const KEY_UA = "LOON_NINEBOT_UA";

const KEY_DEBUG = "enable_debug";
const KEY_NOTIFY = "enable_notify";
const KEY_OPENBOX = "enable_openbox";
const KEY_SUP = "enable_supplement";
const KEY_INTERNAL = "enable_internal_test";
const KEY_TITLE = "notify_title";

const notify = (title, msg) => {
  if ($persistentStore.read(KEY_NOTIFY) !== "false") {
    $notification.post(title, "", msg);
  }
};

const log = (...args) => {
  if ($persistentStore.read(KEY_DEBUG) === "true") console.log(...args);
};

// ===== 抓包写入逻辑 =====
if (isRequest) {
  try {
    const headers = $request.headers || {};

    const auth = headers["Authorization"] || headers["authorization"];
    const did =
      headers["DeviceId"] ||
      headers["deviceid"] ||
      headers["X-Device-Id"];
    const ua = headers["User-Agent"] || headers["user-agent"];

    let changed = false;

    if (auth) {
      $persistentStore.write(auth, KEY_AUTH);
      changed = true;
    }
    if (did) {
      $persistentStore.write(did, KEY_DID);
      changed = true;
    }
    if (ua) {
      $persistentStore.write(ua, KEY_UA);
      changed = true;
    }

    if (changed) {
      notify("九号签到助手", "抓包成功写入账号数据");
      log("抓包写入成功：", auth, did, ua);
    }

    $done({});
  } catch (e) {
    notify("九号签到助手", "抓包写入失败：" + e);
    $done({});
  }
  return;
}

// ===== 签到主体逻辑 =====
(async () => {
  const Authorization = $persistentStore.read(KEY_AUTH) || "";
  const DeviceId = $persistentStore.read(KEY_DID) || "";
  const UserAgent = $persistentStore.read(KEY_UA) || "";

  if (!Authorization || !DeviceId || !UserAgent) {
    notify("九号签到助手", "请先抓包或在插件 UI 填写账号信息");
    return $done();
  }

  const headers = {
    Authorization,
    DeviceId,
    "User-Agent": UserAgent,
    "Content-Type": "application/json",
  };

  const title = $persistentStore.read(KEY_TITLE) || "九号签到助手";

  async function api(url, method = "GET", body = null) {
    return new Promise((resolve) => {
      $httpClient.request(
        {
          url,
          method,
          headers,
          body: body ? JSON.stringify(body) : null,
        },
        (err, resp, data) => {
          if (err) return resolve({ error: err });
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        }
      );
    });
  }

  // ——— 签到 ———
  const sign = await api(
    "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    "POST",
    {}
  );

  // ——— 查询状态 ———
  const status = await api(
    "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
  );

  // ——— 查询盲盒 ———
  const box = await api(
    "https://cn-cbu-gateway.ninebot.com/portal/api/blind-box/list"
  );

  notify(
    title,
    `签到结果：${JSON.stringify(sign)}\n状态：${JSON.stringify(
      status
    )}\n盲盒：${JSON.stringify(box)}`
  );

  $done();
})();