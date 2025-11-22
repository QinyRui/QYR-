/**********************************
 * 九号自动签到 · 单账号 v2.6
 * 作者：QinyRui & ❥﹒﹏非我不可
 * 更新时间：2025/11/23
 * Telegram 群：https://t.me/JiuHaoAPP
 **********************************/

const KEY_AUTH = "ninebot.auth";
const KEY_DID = "ninebot.deviceId";
const KEY_UA = "ninebot.ua";

// ========= 工具对象 =========
const $ = new Env("九号自动签到");

// ========== 自动从抓包写入 ==========
(() => {
  try {
    const headers = $request?.headers;
    if (headers) {
      if (headers.Authorization) $.setdata(headers.Authorization, KEY_AUTH);
      if (headers.DeviceId) $.setdata(headers.DeviceId, KEY_DID);
      if (headers["User-Agent"]) $.setdata(headers["User-Agent"], KEY_UA);
      $.msg("九号自动写入", "写入成功", "可执行签到任务了");
    }
  } catch (e) {
    console.log("自动写入异常：" + e.message);
  }
})();

if ($request) {
  $.done({});
  return;
}

// ========== 开始执行签到 ==========
!(async () => {
  try {
    const auth = $.getdata(KEY_AUTH);
    const did = $.getdata(KEY_DID);
    const ua = $.getdata(KEY_UA);

    if (!auth || !did || !ua) {
      $.msg("九号签到", "未配置 Token", "请在插件 UI 填写 Authorization / DeviceId / User-Agent");
      return $.done();
    }

    const headers = {
      Authorization: auth,
      DeviceId: did,
      "User-Agent": ua,
      "Content-Type": "application/json",
    };

    // ========== 签到 ==========
    const signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign";
    const signResult = await http("post", signUrl, {}, headers);

    if (!signResult || !signResult.success) {
      return notifyFail("签到失败：" + (signResult?.message || "Params error"));
    }

    // ========== 获取签到信息 ==========
    const infoUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/querySignPage";
    const info = await http("post", infoUrl, {}, headers);

    const {
      continueDays = 0,
      bucksBalance = 0,
      supplyCardCnt = 0,
      blindBox,
      blindBox2,
    } = info?.data || {};

    const bb1 = blindBox?.days || 0;
    const bb1Need = blindBox?.needDays || 0;

    const bb2 = blindBox2?.days || 0;
    const bb2Need = blindBox2?.needDays || 0;

    let extraMsg =
      `连续签到：${continueDays}\n` +
      `补签卡：${supplyCardCnt} 张\n` +
      `余额：${bucksBalance} N币\n\n` +
      `盲盒1：${bb1} 天，剩余 ${bb1Need} 天\n` +
      `盲盒2：${bb2} 天，剩余 ${bb2Need} 天`;

    // ========== 内测资格 ==========
    const testUrl = "https://ebike.ninebot.com/vehicle/vehicle/desktop-component";
    const test = await http("get", testUrl, null, headers);

    if (test?.data?.betaTest === true) {
      extraMsg += "\n\n✓ 已获得内测资格";
    } else {
      extraMsg += "\n\n未获得内测资格，尝试自动申请…";

      const applyUrl = "https://cn-cbu-gateway.ninebot.com/beta/api/applyTest";
      const apply = await http("post", applyUrl, {}, headers);

      if (apply?.success) {
        extraMsg += "\n✓ 自动申请成功";
      } else {
        extraMsg += "\nX 自动申请失败";
      }
    }

    $.msg("九号签到", "签到成功", extraMsg);
  } catch (e) {
    notifyFail("脚本异常：" + e.message);
  } finally {
    $.done();
  }
})();

// ========== 封装请求 ==========
function http(method, url, body, headers) {
  return new Promise((resolve) => {
    const option = {
      method: method,
      url: url,
      headers: headers,
    };
    if (method === "post") option.body = JSON.stringify(body || {});

    $.send(option, (err, resp, data) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

// ========== 通知失败 ==========
function notifyFail(msg) {
  $.msg("九号签到", "", msg);
}

// ========== Env 函数 ==========
function Env(t) {
  return new (class {
    constructor(t) {
      this.name = t;
      this.data = {};
    }
    getdata(t) {
      return $persistentStore.read(t);
    }
    setdata(t, e) {
      return $persistentStore.write(t, e);
    }
    send(t, e) {
      $httpClient.send(t, e);
    }
    msg(t, s, i) {
      $notification.post(t, s, i);
    }
    done(t = {}) {
      $done(t);
    }
  })(t);
}