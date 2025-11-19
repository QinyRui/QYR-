/******************************************
# 九号智能电动车 · 单账号签到主体脚本
# 支持：Loon Argument UI + 抓包自动写入
# 作者：❥﹒﹏非我不可 & QinyRui
# 版本：2.5 主体修正版
******************************************/

const LOG = $argument.enable_debug === "true";
const NOTIFY = $argument.enable_notify === "true";

const KEY_AUTH = "Ninebot_Authorization";
const KEY_DID = "Ninebot_DeviceId";
const KEY_UA = "Ninebot_UserAgent";

function log(msg) {
  if (LOG) console.log(msg);
}

function save(key, val) {
  $persistentStore.write(val, key);
}

function read(key) {
  return $persistentStore.read(key) || "";
}

/***********************
 * ① 抓包自动写入模式
 ***********************/
if (typeof $request !== "undefined") {
  const headers = $request.headers;

  if (headers) {
    log("抓包成功，正在自动写入…");

    if (headers["authorization"]) {
      save(KEY_AUTH, headers["authorization"]);
      log("写入 Authorization 成功");
    }
    if (headers["deviceid"]) {
      save(KEY_DID, headers["deviceid"]);
      log("写入 DeviceId 成功");
    }
    if (headers["user-agent"]) {
      save(KEY_UA, headers["user-agent"]);
      log("写入 User-Agent 成功");
    }

    if (NOTIFY) $notification.post("九号抓包写入成功", "", "数据已自动保存到插件 UI");

    $done({});
  }
}


/***********************
 * ② 读取账号信息（来自插件 UI 或抓包）
 ***********************/
const Authorization =
  $argument.Authorization?.trim() ||
  read(KEY_AUTH);

const DeviceId =
  $argument.DeviceId?.trim() ||
  read(KEY_DID);

const UserAgent =
  $argument.UserAgent?.trim() ||
  read(KEY_UA);

if (!Authorization || !DeviceId || !UserAgent) {
  if (NOTIFY)
    $notification.post(
      "九号签到助手",
      "",
      "请先抓包一次，或到插件 UI 填写 Authorization / DeviceId / User-Agent"
    );
  $done({});
}


/***********************
 * ③ 开始签到逻辑
 ***********************/
async function sign() {
  log("开始执行签到…");

  const url = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";

  const headers = {
    Authorization,
    DeviceId,
    "User-Agent": UserAgent,
  };

  try {
    const resp = await http("post", url, headers, {});
    log("签到返回：" + JSON.stringify(resp));

    if (NOTIFY)
      $notification.post("九号签到助手", "签到结果", JSON.stringify(resp));

  } catch (e) {
    log("签到异常：" + e);
    if (NOTIFY)
      $notification.post("九号签到助手", "执行失败", String(e));
  }

  $done({});
}


/***********************
 * HTTP 函数封装
 ***********************/
function http(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    $httpClient[method](
      {
        url,
        headers,
        body,
      },
      (err, resp, data) => {
        if (err) reject(err);
        else resolve(JSON.parse(data));
      }
    );
  });
}


// 执行签到
sign();