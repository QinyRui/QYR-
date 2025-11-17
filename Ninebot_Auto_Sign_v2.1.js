/*
📱 九号智能电动车 · 自动签到（单号版 v2.1）
👤 作者：QinyRui
📆 更新：2025/11/17
⚠ 保持原抓包写入逻辑
✅ 自动识别车型 schema
✅ 自动盲盒开启（/receive 接口）
✅ BoxJS 可控制通知/日志/自动补签
*/

const STORAGE = {
  auth: "ninebot.authorization",
  device: "ninebot.deviceId",
  ua: "ninebot.userAgent",
  debug: "ninebot.debug",
  notify: "ninebot.notify",
  autoOpen: "ninebot.autoOpenBox",
  autoRepair: "ninebot.autoRepair",
  prefix: "ninebot.titlePrefix",
  schema: "ninebot.schema"
};

const ENDPOINTS = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  blindList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindOpen: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"
};

// ---------------------------
// 保持原抓包写入逻辑
if (typeof $request !== "undefined" && $request.headers) {
  try {
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    if (auth && read(STORAGE.auth) !== auth) write(auth, STORAGE.auth);
    if (dev && read(STORAGE.device) !== dev) write(dev, STORAGE.device);
    if (ua && read(STORAGE.ua) !== ua) write(ua, STORAGE.ua);
  } catch (e) { console.log("抓包写入异常：", e); }
  $done({});
}

// 主流程
!(async () => {
  const $ = Env("九号智能电动车 v2.1");
  const auth = $.getdata(STORAGE.auth);
  const deviceId = $.getdata(STORAGE.device);
  const userAgent = $.getdata(STORAGE.ua) || "NinebotApp/6.6.0";
  const debug = $.getdata(STORAGE.debug) === "true";
  const notifyOn = $.getdata(STORAGE.notify) !== "false";
  const autoOpen = $.getdata(STORAGE.autoOpen) !== "false";
  const autoRepair = $.getdata(STORAGE.autoRepair) === "true";
  const title = $.getdata(STORAGE.prefix) || "九号智能电动车";
  let schema = $.getdata(STORAGE.schema) || "service";

  if (!auth || !deviceId) { if (notifyOn) $.msg(title, "", "⚠️ 未配置 Authorization/DeviceId"); return $.done(); }

  const headers = { Authorization: auth, device_id: deviceId, "User-Agent": userAgent, "Content-Type":"application/json", platform:"h5", Origin:"https://h5-bj.ninebot.com", language:"zh" };

  // 1) 签到
  let signRes = await postJson(ENDPOINTS.sign, headers, { schema, activityCode:"dailySign" });
  if (isParamsError(signRes)) {
    schema = schema==="service"?"scooter":"service";
    signRes = await postJson(ENDPOINTS.sign, headers, { schema, activityCode:"dailySign" });
    if(!isParamsError(signRes)) $.setdata(schema, STORAGE.schema);
  } else { $.setdata(schema, STORAGE.schema); }

  let notifyBody = "";
  if(signRes && (signRes.code===0 || /成功/i.test(signRes.msg))) notifyBody += `🎉 签到成功\n🎁 +${signRes.data?.nCoin||signRes.data?.score||0} N币`;
  else if(signRes && /已签到/i.test(signRes.msg)) notifyBody += `⚠️ 今日已签到`;
  else notifyBody += `❌ 签到失败：${signRes?.msg||JSON.stringify(signRes)}`;

  // 2) 状态
  const st = await getJson(ENDPOINTS.status, headers);
  if(st && st.code===0 && st.data){
    const days = st.data.consecutiveDays ?? st.data.continuousDays ?? 0;
    const cards = st.data.signCardsNum ?? st.data.remedyCard ?? 0;
    notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
    if(autoRepair && cards>0 && days===0){
      try{ const rep = await postJson(ENDPOINTS.repair, headers, { schema,type:"repair" }); if(rep.code===0) notifyBody+=`\n🔧 自动补签成功`; else notifyBody+=`\n🔧 自动补签失败`; } catch(e){ notifyBody+=`\n🔧 自动补签异常`; }
    }
  } else notifyBody += `\n🗓 状态获取失败`;

  // 3) 余额
  const bal = await getJson(ENDPOINTS.balance, headers);
  if(bal && bal.code===0 && bal.data) notifyBody += `\n💰 N币余额：${bal.data.balance||0}`; else notifyBody += `\n💰 N币获取失败`;

  // 4) 盲盒
  const box = await getJson(ENDPOINTS.blindList, headers);
  if(box && Array.isArray(box.data?.notOpenedBoxes||box.data)){
    const list = Array.isArray(box.data?.notOpenedBoxes)?box.data.notOpenedBoxes:box.data;
    if(list.length>0){
      notifyBody += `\n\n📦 盲盒任务：`;
      list.forEach(b=>{const days=b.awardDays??b.boxDays??b.days??"?";const left=b.leftDaysToOpen??b.diffDays??"?"; notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;});
      if(autoOpen){
        const ready=list.filter(b=>{const left=b.leftDaysToOpen??b.diffDays??999; return left===0; });
        if(ready.length>0){ notifyBody+=`\n\n🎉 自动开启盲盒：`;
          for(const b of ready){
            const blindId=b.blindBoxId??b.id??b.boxId??b.awardId; if(!blindId){ notifyBody+=`\n❌ 无法识别盲盒 id`; continue; }
            try{ const r=await postJson(ENDPOINTS.blindOpen, headers, { blindBoxId: blindId }); if(r.code===0) notifyBody+=`\n🎁 ${b.awardDays??b.boxDays??b.days}天盲盒获得：${r.data?.rewardValue??r.data?.score??"未知"}`; else notifyBody+=`\n❌ ${b.awardDays??b.boxDays??b.days}天盲盒领取失败`; } catch(e){ notifyBody+=`\n❌ ${b.awardDays??b.boxDays??b.days}天盲盒异常`; }
          }
        }
      }
    } else notifyBody+=`\n📦 无盲盒任务`;
  } else notifyBody+=`\n📦 盲盒获取失败`;

  if(notifyOn) $.msg(title,"签到结果",notifyBody);
})().finally(()=>$.done());

// ---------------------------
// 辅助函数
function isParamsError(obj){if(!obj) return true; const m=(obj.msg||"").toLowerCase(); return /param|参数|error/.test(m)||obj.code===400||obj.code===1001;}
function log(...args){if($.getdata(STORAGE.debug)==="true") console.log(...args);}
function getJson(url,headers){return new Promise(resolve=>{if(typeof $httpClient!=="undefined"){$httpClient.get({url,headers},(err,resp,body)=>{try{resolve(JSON.parse(body||"{}"))}catch{resolve({raw:body});});}else if(typeof $task!=="undefined"){$task.fetch({url,method:"GET",headers}).then(r=>{try{resolve(r.body.json())}catch{resolve({raw:r.body});}}).catch(()=>resolve(null));}else resolve(null);});}
function postJson(url,headers,body){return new Promise(resolve=>{const opts={url,headers,body:JSON.stringify(body)}; if(typeof $httpClient!=="undefined"){$httpClient.post(opts,(err,resp,b)=>{try{resolve(JSON.parse(b||"{}"))}catch{resolve({raw:b});}});} else if(typeof $task!=="undefined"){$task.fetch({url,method:"POST",headers,body:JSON.stringify(body)}).then(r=>{try{resolve(r.body.json())}catch{resolve({raw:r.body});}}).catch(()=>resolve(null));} else resolve(null);});}
function Env(name){return{getdata(key){try{if(typeof $persistentStore!=="undefined")return $persistentStore.read(key);if(typeof $prefs!=="undefined")return $prefs.valueForKey(key);return null;}catch(e){return null;}},setdata(val,key){try{if(typeof $persistentStore!=="undefined")return $persistentStore.write(val,key);if(typeof $prefs!=="undefined")return $prefs.setValueForKey(val,key);}catch(e){return false;}},msg(title,sub,body){try{if(typeof $notification!=="undefined")$notification.post(title,sub,body);}catch(e){console.log("通知失败：",e);}},done:function(v){try{if(typeof $done!=="undefined")$done(v);}catch(e){}}};}