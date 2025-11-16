/*
📱 九号智能电动车自动签到脚本（单账号版 v2.2）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/15
✈️ Telegram群：https://t.me/JiuHaoAPP
*/

const $ = new Env("Ninebot Sign Single Auto");

// BoxJS KEY
const BOX_KEY = "Ninebot_Account_Single";

// 读取本地或 BoxJS
function getConf() {
  const local = $.getdata(BOX_KEY);
  if (local) {
    try { return JSON.parse(local); } catch {}
  }
  return {
    name: "九号账号",
    Authorization: "",
    DeviceId: "",
    UserAgent: "NBScooterApp/5.9.1"
  };
}

// 保存配置
function saveConf(conf) {
  $.setdata(JSON.stringify(conf), BOX_KEY);
}

// 主流程
!(async () => {
  let conf = getConf();

  if ($request && $request.headers) {
    const auth = $request.headers["Authorization"] || $request.headers["authorization"];
    const device = $request.headers["deviceld"] || $request.headers["deviceid"];
    if (auth && device) {
      conf.Authorization = auth;
      conf.DeviceId = device;
      saveConf(conf);
      $.msg("九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存（仅需一次）");
    }
    return;
  }

  if (!conf.Authorization || !conf.DeviceId) {
    $.msg(
      "九号签到",
      "未配置账号",
      "请在 BoxJS 中填写账号，或抓包一次自动保存 Token。"
    );
    return;
  }

  await signMain(conf);
})().catch((err) => $.logErr(err)).finally(() => $.done());

// 签到主函数
async function signMain(conf) {
  const headers = {
    "Authorization": conf.Authorization,
    "DeviceId": conf.DeviceId,
    "User-Agent": conf.UserAgent,
    "Content-Type": "application/json"
  };

  const sign = await post("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", headers, "{}");
  const status = await get("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers);
  const balance = await get("https://cn-cbu-gateway.ninebot.com/portal/api/user-balance/v2/balance", headers);

  const day = status?.data?.continueDay || 0;
  const card = status?.data?.repairCard || 0;
  const exp = sign?.data?.exp || 0;

  const nCoin = balance?.data?.nCoin || 0;

  const box = status?.data?.calendarInfo?.blindBoxTask || [];
  const boxTxt = box
    .map((b) => `- ${b.taskDay}天盲盒，还需 ${b.remainDay} 天`)
    .join("\n");

  const text =
    `连续签到：${day}天\n` +
    `补签卡：${card}张\n` +
    `经验：${exp}\n` +
    `N币余额：${nCoin}\n\n` +
    `盲盒任务：\n${boxTxt}`;

  $.msg(`${conf.name || "九号签到"}`, "签到成功", text);
}

function get(url, headers) {
  return new Promise((resolve) => {
    $.get({ url, headers }, (_, __, data) => resolve(JSON.parse(data || "{}")));
  });
}

function post(url, headers, body) {
  return new Promise((resolve) => {
    $.post({ url, headers, body }, (_, __, data) => resolve(JSON.parse(data || "{}")));
  });
}

function Env(t,s){return new class{constructor(t,s){this.name=t,this.logs=[],this.isMute=false,this.isNeedRewrite=false,this.logSeparator="\n";this.startTime=new Date().getTime(),Object.assign(this,s)}isQuanX(){return"undefined"!=typeof $task}isLoon(){return"undefined"!=typeof $loon}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}getdata(t){let s=this.getval(t);if(/^@/.test(t)){const[,e]=/^@(.*?)\.(.*?)$/.exec(t);const r=e;const i=this.getval("@"+r);if(i)try{const o=JSON.parse(i);s=o[e]}catch{} }return s}setdata(t,s){let e=false;if(/^@/.test(s)){const[,r,i]=/^@(.*?)\.(.*?)$/.exec(s);const o=this.getval("@"+r);const n=r;const a=o?JSON.parse(o):{};a[i]=t,e=this.setval(JSON.stringify(a),"@"+n)}else e=this.setval(t,s);return e}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loadData(),this.data[t]):this.data&&this.data[t]}setval(t,s){return this.isSurge()||this.isLoon()?$persistentStore.write(t,s):this.isQuanX()?$prefs.setValueForKey(t,s):this.isNode()?(this.data=this.loadData(),this.data[s]=t,this.writeData(),true):this.data&&this.data[s]}msg(t,s="",e=""){this.isMute||(this.isSurge()||this.isLoon()?$notification.post(t,s,e):this.isQuanX()&&$notify(t,s,e))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,s){!this.isSurge()&&!this.isQuanX()&&!this.isLoon()||this.log("", "❗️" + this.name + ", 错误!", t)}done(t={}){const s=new Date().getTime(),e=(s-this.startTime)/1000;this.log(`🔍 ${this.name} 结束，耗时 ${e} 秒`)}};
}