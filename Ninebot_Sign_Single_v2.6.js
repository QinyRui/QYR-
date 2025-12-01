/*
九号智能电动车 · 单号自动签到（含分享奖励）
修复“今日积分/N 币始终为 0”问题
保持原来自动写入 Keys（nb_Authorization / nb_DeviceId / nb_UserAgent）
*/

const $ = new API("Ninebot");

function API(name = 'untitled') {
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined";
  const isQuanX = typeof $task !== "undefined";

  const read = (key) => (isQuanX ? $prefs.valueForKey(key) : $persistentStore.read(key));
  const write = (value, key) => (isQuanX ? $prefs.setValueForKey(value, key) : $persistentStore.write(value, key));

  const notify = (title, subtitle, msg) => {
    if (isQuanX) $notify(title, subtitle, msg);
    if (isSurge) $notification.post(title, subtitle, msg);
    if (isLoon) $notification.post(title, subtitle, msg);
  };

  const get = (opts, cb) => {
    if (isQuanX) {
      opts.method = "GET";
      $task.fetch(opts).then((r) => cb(null, r, r.body));
    }
    if (isSurge || isLoon) $httpClient.get(opts, cb);
  };

  const post = (opts, cb) => {
    if (isQuanX) {
      opts.method = "POST";
      $task.fetch(opts).then((r) => cb(null, r, r.body));
    }
    if (isSurge || isLoon) $httpClient.post(opts, cb);
  };

  return { read, write, notify, get, post };
}

/* ========= 自动写入（保持你原来的 Key） ========= */

const Authorization = $.read("nb_Authorization") || "";
const DeviceId = $.read("nb_DeviceId") || "";
const UserAgent = $.read("nb_UserAgent") || "";
const shareTaskUrl = $.read("nb_shareTaskUrl") || "";

/* ========== 缺少配置时提示 ========== */
if (!Authorization || !DeviceId || !UserAgent) {
  $.notify("九号智能电动车", "", "❌ 未配置 Token / DeviceId / User-Agent\n请先抓包写入 BoxJS");
  $done({});
}

/* ========== API Header ========== */

const baseH5 = "https://cn-cbu-gateway.ninebot.com";

const headers = {
  "Authorization": Authorization,
  "DeviceId": DeviceId,
  "User-Agent": UserAgent,
  "Content-Type": "application/json"
};

/* =================== 主流程 =================== */

Start();

async function Start() {
  console.log("[info] 九号自动签到开始");

  const signInfo = await getSignStatus();

  /* ===== 今日积分修复版 ===== */
  let todayCredit = 0;
  let todayCoin = 0;

  const flow = await getTodayChange();
  if (flow) {
    todayCredit = flow.incomeToday || 0; // 今日获得经验/积分
    todayCoin = flow.coinToday || 0;    // 今日获得 N 币
  }

  // 未签到则执行签到
  if (signInfo.currentSignStatus === 0) {
    await doSign();
  } else {
    console.log("[info] 今日已签到");
  }

  const exp = await getExp();
  const balance = await getBalance();
  const boxList = await getBoxList();

  const msg =
`✨ 今日签到：${signInfo.currentSignStatus === 1 ? "已签到" : "成功签到"}

📊 账户状态
- 当前经验：${exp.credit}（LV.${exp.level}）
- 距离升级：${exp.need}
- 当前 N 币：${balance.balance}
- 补签卡：${signInfo.signCardsNum} 张
- 连续签到：${signInfo.consecutiveDays} 天

📦 盲盒进度
7 天盲盒：${boxList.small.opened} / ${boxList.small.target} 天
| 666 天盲盒：${boxList.big.opened} / ${boxList.big.target} 天

🎯 今日获得：积分 ${todayCredit} / N币 ${todayCoin}
`;

  $.notify("- 九号-", "", msg);
  console.log("[info] 通知已发送");
  $done();
}

/* =================== API Functions =================== */

function getSignStatus() {
  return new Promise((resolve) => {
    $.get({
      url: `${baseH5}/portal/api/user-sign/v2/status`,
      headers
    }, (_, __, data) => {
      resolve(JSON.parse(data || "{}").data || {});
    });
  });
}

function doSign() {
  return new Promise((resolve) => {
    $.post({
      url: `${baseH5}/portal/api/user-sign/v2/sign`,
      headers
    }, () => resolve(true));
  });
}

/* 修复：统计今日变化（经验 + N 币） */
function getTodayChange() {
  return new Promise((resolve) => {
    $.get({
      url: `${baseH5}/portal/api/credit/flow?days=1`,
      headers
    }, (_, __, data) => {
      const obj = JSON.parse(data || "{}");
      const d = obj.data || {};
      resolve({
        incomeToday: d.incomeToday || 0, // 今日积分
        coinToday: d.coinToday || 0      // 今日N币
      });
    });
  });
}

function getExp() {
  return new Promise((resolve) => {
    $.get({
      url: `${baseH5}/portal/api/credit/info`,
      headers
    }, (_, __, data) => {
      const obj = JSON.parse(data || "{}");
      const d = obj.data || {};

      const need = d.credit_range ? d.credit_range[1] - d.credit : 0;

      resolve({
        credit: d.credit,
        level: d.level,
        need
      });
    });
  });
}

function getBalance() {
  return new Promise((resolve) => {
    $.get({
      url: `${baseH5}/portal/api/coin/balance`,
      headers
    }, (_, __, data) => {
      const obj = JSON.parse(data || "{}");
      resolve(obj.data || {});
    });
  });
}

function getBoxList() {
  return new Promise((resolve) => {
    $.get({
      url: `${baseH5}/portal/api/blind-box/list`,
      headers
    }, (_, __, data) => {
      const obj = JSON.parse(data || "{}");
      const list = obj.data || [];

      resolve({
        small: list[0] || { opened: 0, target: 7 },
        big: list[1] || { opened: 0, target: 666 }
      });
    });
  });
}