/******************************************
🔋 九号智能电动车自动签到（单账号）
🎯 Sign + 盲盒 + 补签 + 内测检测
👤 作者：❥﹒﹏非我不可 & QinyRui
******************************************/

const $ = new Env("Ninebot_Single");

// ---------------- 配置区 ----------------
const AUTH = $.getdata("ninebot.authorization") || "";
const DEVICE_ID = $.getdata("ninebot.deviceId") || "";
const UA = $.getdata("ninebot.userAgent") || "okhttp/3.12.12";
const DEBUG = $.getdata("ninebot.debug") === "true";
const NOTIFY = $.getdata("ninebot.notify") !== "false";
const AUTO_BOX = $.getdata("ninebot.autoOpenBox") === "true";
const TITLE = $.getdata("ninebot.titlePrefix") || "九号签到";
const AUTO_BETA = $.getdata("ninebot.autoApplyBeta") === "true";

let headers = {
  "Authorization": AUTH,
  "DeviceId": DEVICE_ID,
  "User-Agent": UA,
  "Content-Type": "application/json"
};

// ---------------- 主流程 ----------------
!(async () => {
  $.log("开始签到流程...");

  await sign();
  await signStatus();
  await balance();
  await blindBoxList();

  await checkBeta();

  if (NOTIFY) {
    $.msg(TITLE, "", "🎉 签到流程执行完毕");
  }

})().catch((e) => $.logErr(e)).finally(() => $.done());


// ---------------- 业务函数 ----------------

async function sign() {
  return request("POST", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign");
}

async function signStatus() {
  return request("GET", "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");
}

async function balance() {
  return request("GET", "https://cn-cbu-gateway.ninebot.com/portal/api/user/n/bean/balance");
}

async function blindBoxList() {
  return request("POST", "https://cn-cbu-gateway.ninebot.com/app-api/lottery/blind-box/list", {});
}

// -------- 内测资格检测接口 --------
async function checkBeta() {
  const url = "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status";
  const res = await request("GET", url);

  $.log("内测状态：", JSON.stringify(res));

  if (res?.data?.qualified) {
    $.msg(TITLE, "内测资格", "🎉 已获得内测资格");
  } else {
    $.msg(TITLE, "内测资格", "⚠️ 未获得内测，请手动申请");
  }
}


// ---------------- 网络封装 ----------------
function request(method, url, body = null) {
  return new Promise((resolve) => {
    const opt = {
      url,
      headers,
      method,
      body: body ? JSON.stringify(body) : null,
    };

    $.send(opt, (err, resp, data) => {
      if (DEBUG) $.log("返回：", data);

      if (err) {
        $.log("错误：", err);
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}


// ---------------- Env 环境 ----------------
/*
  完整 Env()，支持
  Loon / Surge / QuanX / Node
*/
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t.method=e;return this.env.request(t)}get(t){return this.send(t)}post(t){return this.send(t,"POST")}}return new class{constructor(t,e){this.name=t;this.http=new s(this);this.data=null;this.dataFile="box.dat";this.logs=[];this.isMute=false;this.isNeedRewrite=false;this.logSeparator="\n";this.encoding="utf-8"}isNode(){return"undefined"!==typeof module&&!!module.exports}isQuanX(){return"undefined"!==typeof $task}isSurge(){return"undefined"!==typeof $httpClient&&"undefined"===typeof $loon}isLoon(){return"undefined"!==typeof $loon}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t);return this.getval(s)?JSON.parse(this.getval(s))[i]:e}return e}setdata(t,e){let s=false;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e);const o=this.getval(i);const h=i;r&&( ( "string"===typeof o?JSON.parse(o):{} )[r]=t ,this.setval(JSON.stringify(o),h));s=true}else s=this.setval(t,e);return s}getval(t){if(this.isSurge()||this.isLoon())return $persistentStore.read(t);if(this.isQuanX())return $prefs.valueForKey(t);if(this.isNode()){this.data=this.loaddata();return this.data[t]}return this.data&&this.data[t]||null}setval(t,e){if(this.isSurge()||this.isLoon())return $persistentStore.write(t,e);if(this.isQuanX())return $prefs.setValueForKey(t,e);if(this.isNode()){this.data=this.loaddata();this.data[e]=t;this.writedata();return true}return false}log(...t){t.length>0&&(this.logs=[...this.logs,...t]);console.log(t.join(this.logSeparator))}logErr(t){const e=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();e?console.error(t):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=new Date().getTime(),s=(e-this.startTime)/1e3;if(this.log("",`${this.name} 结束! ⏱ ${s} 秒`),this.isSurge()||this.isQuanX()||this.isLoon())$done(t)}}(t,e)}