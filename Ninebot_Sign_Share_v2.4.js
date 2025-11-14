/*
📱 九号智能电动车自动签到脚本（多账号分享版）
====================================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/14
📦 版本：v2.4 · Final
📝 特性：
  - 主号 + 副号（可扩展更多）
  - BoxJS 自定义名称（主号/副号）
  - 全量盲盒进度
  - 完整控制台日志输出
  - 全平台兼容（Loon / Surge / QX / Stash / Shadowrocket）

🎯 通知格式完全按用户要求定制：
  连续3天！ 今日已签到。
  🪪 补签卡：1张
  📅 连续签到：3天
  💰 当前N币余额：11
  ⏰ 20分钟前
  📦 即将开启盲盒：
  - 7天盲盒，还需4天
  - 30天盲盒，还需27天
  - ...
====================================================
*/

const $ = new Env("Ninebot Sign · v2.4");

// -------------------------------
//          读取账号
// -------------------------------
function loadAccounts() {
  const accounts = [];

  const auth1 = $.getdata("Ninebot_Authorization_1");
  const dev1 = $.getdata("Ninebot_DeviceId_1");
  const name1 = $.getdata("Ninebot_Name_1") || "主号";

  const auth2 = $.getdata("Ninebot_Authorization_2");
  const dev2 = $.getdata("Ninebot_DeviceId_2");
  const name2 = $.getdata("Ninebot_Name_2") || "副号";

  if (auth1 && dev1) accounts.push({ name: name1, authorization: auth1, deviceId: dev1 });
  if (auth2 && dev2) accounts.push({ name: name2, authorization: auth2, deviceId: dev2 });

  return accounts;
}

// -------------------------------
//              主逻辑
// -------------------------------
!(async () => {
  console.log(`========== 九号签到脚本启动 v2.4 ==========\n`);

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    $.msg("Ninebot", "", "❌ 未发现账号，请先抓取 Authorization");
    return;
  }

  let finalNotify = "";

  for (let acc of accounts) {
    console.log(`\n▶ 开始执行账号：【${acc.name}】`);
    const result = await runSign(acc);
    finalNotify += result + "\n\n";
  }

  $.msg("九号智能电动车签到 v2.4", "", finalNotify);
})()
.catch((e) => console.log(e))
.finally(() => $.done());


// -------------------------------
//      账号签到流程
// -------------------------------
async function runSign(account) {
  const startTime = Date.now();

  const headers = {
    "authorization": account.authorization,
    "device-id": account.deviceId,
    "user-agent": "ninebot-app"
  };

  // 获取状态
  const status = await http(
    "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    "GET",
    headers
  );
  console.log("📘 状态返回：", status);

  const info = status?.data || {};
  const todaySigned = info.currentSignStatus === 1;
  const signDays = info.continueDays || 0;
  const cardNum = info.signCardsNum || 0;
  const coin = info.coin || 0;

  // 盲盒结构
  const boxes = [
    { days: 7, left: info.blindBoxStatus?.d7 || 0 },
    { days: 30, left: info.blindBoxStatus?.d30 || 0 },
    { days: 66, left: info.blindBoxStatus?.d66 || 0 },
    { days: 100, left: info.blindBoxStatus?.d100 || 0 },
    { days: 365, left: info.blindBoxStatus?.d365 || 0 },
    { days: 666, left: info.blindBoxStatus?.d666 || 0 }
  ];

  // 如果未签到则执行签到
  if (!todaySigned) {
    console.log(`⏳ 今日未签到，正在执行签到...`);
    const signRes = await http(
      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
      "POST",
      headers
    );
    console.log("📗 签到返回：", signRes);
  }

  const usedTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // -------------------------------
  //       组装通知模板
  // -------------------------------
  const blindBoxList = boxes
    .map(b => `- ${b.days}天盲盒，还需${b.left}天`)
    .join("\n");

  const text =
`${account.name} · 连续${signDays}天！ 今日${todaySigned ? "已签到" : "已补签"}。
🪪 补签卡：${cardNum} 张
📅 连续签到：${signDays} 天
💰 当前 N 币余额：${coin}

⏰ ${usedTime} 秒前

📦 即将开启盲盒：
${blindBoxList}`;

  console.log("\n📩 最终通知内容：\n" + text + "\n");

  return text;
}


// -------------------------------------
//             网络请求封装
// -------------------------------------
function http(url, method, headers, body) {
  return new Promise((resolve) => {
    const opt = {
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout: 12e3
    };

    $.send(opt, (err, resp, data) => {
      if (err) {
        console.log("❌ 请求错误：", err);
        return resolve({});
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}


// -------------------------------------
//                ENV
// -------------------------------------
function Env(t, s) {
  return new class {
    constructor(t, s) { this.name = t, this.data = null, this.logs = [], this.isMute = !1, this.isNeedRewrite = !1 }
    getdata(t) { let s = this.getval(t); if (/^@/.test(t)) { const [, e, r] = /^@(.*?)\.(.*?)$/.exec(t), i = e ? this.getval(e) : ""; if (i) try { const t = JSON.parse(i); s = t ? this.lodash_get(t, r, "") : s } catch { s = "" } } return s }
    setdata(t, s) { let e = !1; if (/^@/.test(s)) { const [, r, i] = /^@(.*?)\.(.*?)$/.exec(s), o = this.getval(r), h = r ? ("null" === o ? null : o || "{}") : "{}"; try { const s = JSON.parse(h); this.lodash_set(s, i, t), e = this.setval(JSON.stringify(s), r) } catch { const s = {}; this.lodash_set(s, i, t), e = this.setval(JSON.stringify(s), r) } } else e = this.setval(t, s); return e }
    getval(t) { return $request ? $request.headers[t] : (this.isSurge() || this.isLoon()) ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.data && this.data[t] || null }
    setval(t, s) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, s) : this.isQuanX() ? $prefs.setValueForKey(t, s) : this.data && (this.data[s] = t), !0 }
    msg(title, sub = "", body = "") { console.log(`\n📢 通知：${title}\n${sub}\n${body}`); if (!this.isMute) if (this.isSurge() || this.isLoon()) $notification.post(title, sub, body); else if (this.isQuanX()) $notify(title, sub, body) }
    send(opt, cb) { if (this.isQuanX()) { opt.method = opt.method || "GET", $task.fetch(opt).then(res => cb(null, res, res.body), err => cb(err)); } else if (this.isSurge() || this.isLoon()) { const req = opt.method === "POST" ? $httpClient.post : $httpClient.get; req(opt, cb); } }
    isSurge() { return typeof $httpClient !== "undefined" && !this.isLoon() }
    isLoon() { return typeof $loon !== "undefined" }
    isQuanX() { return typeof $task !== "undefined" }
    done(t = {}) { console.log("\n========= 完成 =========\n"), $done(t) }
  }(t, s)
}