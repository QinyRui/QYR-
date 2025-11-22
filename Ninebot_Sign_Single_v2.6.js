/******************************************
 * 九号智能电动车 · 单号自动签到 v2.6（内容升级版）
 * 功能已包含：
 * ✔ 自动开盲盒
 * ✔ 自动补签（扣 N 币）
 * ✔ 内测申请 & 状态判断
 * ✔ 精简通知（无“接口返回”字样）
 * ✔ Loon 插件参数控制（无需 BoxJS 开关）
 ******************************************/

const $ = new Env("九号签到");
const BASE = "https://cn-cbu-gateway.ninebot.com";

let token = $.getdata("ninebot.authorization") || "";
let deviceId = $.getdata("ninebot.deviceId") || "";
let ua = $.getdata("ninebot.userAgent") || "";

// Loon 插件开关
const DEBUG = $argument?.debug === "true";
const NOTIFY = $argument?.notify !== "false";
const AUTO_BOX = $argument?.openbox === "true";
const AUTO_REPAIR = $argument?.repair === "true";
const AUTO_BETA = $argument?.beta === "true";
const TITLE = $argument?.titlePrefix || "九号签到助手";


/********************* 主流程 *********************/
!(async () => {
  if (!token || !deviceId || !ua) {
    notify("❌ 未配置 Authorization / DeviceId / UA");
    return;
  }

  log("开始执行签到…");

  const statusRes = await api("/portal/api/user-sign/v2/status", "POST");
  if (!statusRes?.data) {
    notify("❌ 获取签到状态失败");
    return;
  }

  const status = statusRes.data;
  const continuousDays = status.continuousDays || 0;

  // 判断是否已签到
  let signMsg = "";
  if (status.todaySigned) {
    signMsg = "已签到";
    log("今日已签到");
  } else {
    const signRes = await api("/portal/api/user-sign/v2/sign", "POST");
    const result = signRes?.data?.result || "";

    if (result === "Success") signMsg = "签到成功";
    else if (result === "RepeatSign") signMsg = "已签到";
    else signMsg = "签到失败";
  }

  /******** 自动补签（扣 N 币） ********/
  let repairMsg = "";
  if (AUTO_REPAIR && status.repairSign) {
    const rep = await api("/portal/api/user-sign/v2/repair", "POST");
    if (rep?.data?.result === "Success") {
      repairMsg = "已自动补签";
    } else {
      repairMsg = "补签失败（N币不足或网络异常）";
    }
  }

  /******** 自动开盲盒 ********/
  let boxMsg = "";
  if (AUTO_BOX) {
    const boxList = await api("/portal/api/blind-box/list", "POST");
    if (boxList?.data?.list) {
      for (let b of boxList.data.list) {
        if (b.taskFinishDays >= b.taskTotalDays && !b.opened) {
          await api("/portal/api/blind-box/open", "POST", { boxId: b.boxId });
          boxMsg += `🎁 已开启：${b.name}\n`;
        }
      }
      if (!boxMsg) boxMsg = "🎁 盲盒未达成";
    }
  }

  /******** 内测申请 ********/
  let betaMsg = "";
  if (AUTO_BETA) {
    const beta = await api("/inner-test/api/test/status", "POST");
    betaMsg = `内测：${beta?.data?.statusDesc || "未知"}`;
  }

  /******** 查询 N 币 ********/
  const balanceRes = await api("/integral/api/integral/balance", "POST");
  const balance = balanceRes?.data?.balance || 0;

  /******** 最终通知内容（精简版） ********/
  let msg =
    `${signMsg}\n` +
    `连续签到：${continuousDays}\n` +
    `N币余额：${balance}\n`;

  if (repairMsg) msg += repairMsg + "\n";
  if (boxMsg) msg += boxMsg + "\n";
  if (betaMsg) msg += betaMsg + "\n";

  notify(msg.trim());
})().finally(() => $.done());


/********************* 请求封装 *********************/
function api(path, method, body) {
  return new Promise((resolve) => {
    const opts = {
      url: BASE + path,
      method,
      headers: {
        Authorization: token,
        DeviceId: deviceId,
        "User-Agent": ua,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : ""
    };

    $.post(opts, (err, resp, data) => {
      if (err) {
        log(`❌ 请求失败: ${err}`);
        return resolve(null);
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        log("❌ JSON 解析失败");
        resolve(null);
      }
    });
  });
}


/********************* 工具函数 *********************/
function log(msg) {
  if (DEBUG) console.log(msg);
}
function notify(msg) {
  if (NOTIFY) $.notify(TITLE, "", msg);
}


/********************* Env（Loon/Surge/QX 通用） *********************/
function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
    }
    getdata(k) {
      return typeof $persistentStore !== "undefined"
        ? $persistentStore.read(k)
        : null;
    }
    setdata(v, k) {
      return typeof $persistentStore !== "undefined"
        ? $persistentStore.write(v, k)
        : null;
    }
    notify(title, sub, msg) {
      if (typeof $notification !== "undefined")
        $notification.post(title, sub, msg);
    }
    post(opts, cb) {
      if (typeof $task !== "undefined") {
        $task.fetch(opts).then(
          (resp) => cb(null, resp, resp.body),
          (err) => cb(err)
        );
      } else if (typeof $httpClient !== "undefined") {
        $httpClient.post(opts, cb);
      }
    }
    done() {}
  })(name);
}