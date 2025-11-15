/*
📱 九号智能电动车自动签到脚本（发布版 · 可远程订阅）
=========================================
👤 作者：❥﹒﹏非我不可
📆 更新日期：2025/11/15
📦 版本：v2.2 AutoOpen Full Edition + 日志开关
🔧 新增：
   - DEBUG 可通过 BoxJS 配置开关控制
   - 主体执行日志全量输出
   - 可直接用于 Loon / Surge / QX / Stash
*/

// ---------- BoxJS / 脚本配置 ----------
let CONFIG = {
  debug: true,  // 日志开关，BoxJS 可修改
  customTitle: "Ninebot Sign AutoOpen",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6"
};

// 如果 BoxJS 可用，可覆盖默认配置
if (typeof $config !== "undefined") {
  try { CONFIG = { ...CONFIG, ...JSON.parse($config.value) }; } catch(e){ }
}

function log(...msg){ if(CONFIG.debug) console.log("[Ninebot]", ...msg); }

// ---------- Token 捕获 ----------
if(typeof $request !== "undefined" && $request.headers){
  const auth = $request.headers["Authorization"]||$request.headers["authorization"];
  const devId = $request.headers["deviceId"]||$request.headers["device_id"];
  log("📥 捕获请求头：",$request.headers);

  if(auth){ $persistentStore.write(auth,"Ninebot_Authorization"); log("✅ Authorization 捕获成功 →", auth); }
  if(devId){ $persistentStore.write(devId,"Ninebot_DeviceId"); log("✅ DeviceId 捕获成功 →", devId); }
  if(auth||devId) $notification.post("🎯 Ninebot Token 捕获成功","","Authorization 与 DeviceId 已保存");
  $done({}); return;
}

// ---------- 网络请求封装 ----------
function httpPost(req){ log("➡️ POST:", req.url); return new Promise((resolve,reject)=>{ $httpClient.post(req,(err,resp,data)=>{ if(err){ log("❌ POST 错误:",err); reject(err.toString()); } else { log("⬅️ POST 返回:", data); resolve({resp,data}); } }); }); }
function httpGet(req){ log("➡️ GET:", req.url); return new Promise((resolve,reject)=>{ $httpClient.get(req,(err,resp,data)=>{ if(err){ log("❌ GET 错误:",err); reject(err.toString()); } else { log("⬅️ GET 返回:", data); resolve({resp,data}); } }); }); }

// ---------- 奖励解析 ----------
function parseReward(data){ log("🎁 解析奖励:",data); if(!data)return "未知奖励"; switch(data.rewardType){ case 1:return `${data.rewardValue} N币`; case 2:return `补签卡 ×${data.rewardValue}`; default:return `奖励(${data.rewardType}) ×${data.rewardValue}`; } }

// ---------- 自动开启盲盒 ----------
async function openBlindBox(headers){
  log("📦 尝试开启盲盒...");
  try{
    const res = await httpPost({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive", headers, body:"{}"});
    const json = JSON.parse(res.data||"{}");
    log("📦 开盲盒返回:", json);
    return json.code===0 ? parseReward(json.data) : "领取失败："+(json.msg||"");
  }catch(err){ return "执行异常："+err; }
}

// ---------- 主执行 ----------
async function run(){
  log("🚀 启动 Ninebot Sign AutoOpen 任务...");
  const deviceId=$persistentStore.read("Ninebot_DeviceId");
  const authorization=$persistentStore.read("Ninebot_Authorization");
  log("🔐 Token:", {deviceId, authorization});
  if(!deviceId||!authorization){ $notification.post(CONFIG.customTitle,"","⚠️ 请先打开九号 App 抓包以获取 Token"); return $done(); }

  const headers={
    "Content-Type":"application/json","Authorization":authorization,"platform":"h5",
    "Origin":"https://h5-bj.ninebot.com","language":"zh",
    "User-Agent":CONFIG.userAgent,"Referer":"https://h5-bj.ninebot.com/","device_id":deviceId
  };
  log("📨 请求头:", headers);

  const urls={
    sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"
  };
  log("🌐 接口列表:", urls);

  let notify="", days=0;

  try{
    // 签到
    log("📝 开始签到...");
    const signRes=await httpPost({url:urls.sign, headers, body:JSON.stringify({deviceId})});
    const signJson=JSON.parse(signRes.data||"{}");
    log("📝 签到返回:", signJson);
    if(signJson.code===0){ notify+=`🎉 签到成功\n🎁 +${signJson.data.score} 经验，+${signJson.data.nCoin} N币`; }
    else if(signJson.code===540004){ notify+=`⚠️ 今日已签到`; }
    else{ notify+=`❌ 签到失败：${signJson.msg||""}`; }

    // 签到状态
    log("📊 获取签到状态...");
    const statusRes=await httpGet({url:urls.status, headers});
    const statusJson=JSON.parse(statusRes.data||"{}");
    log("📊 状态 JSON:", statusJson);
    if(statusJson.code===0){ const s=statusJson.data; days=s.consecutiveDays||0; notify+=`\n🗓 连续签到：${days} 天\n🎫 补签卡：${s.signCardsNum} 张`; }

    // N币余额
    log("💰 查询 N 币余额...");
    const balRes=await httpGet({url:urls.balance, headers});
    const balJson=JSON.parse(balRes.data||"{}");
    log("💰 余额 JSON:", balJson);
    if(balJson.code===0){ notify+=`\n💰 N币余额：${balJson.data.balance}`; }

    // 盲盒
    log("📦 查询盲盒任务...");
    const boxRes=await httpGet({url:urls.blindBoxList, headers});
    const boxJson=JSON.parse(boxRes.data||"{}");
    log("📦 盲盒 JSON:", boxJson);
    const notOpened=boxJson.data?.notOpenedBoxes||[];
    if(notOpened.length>0){
      notify+=`\n\n📦 盲盒任务：`;
      notOpened.forEach(b=>notify+=`\n- ${b.awardDays}天盲盒，还需 ${b.leftDaysToOpen} 天`);
      const ready=notOpened.filter(b=>b.leftDaysToOpen===0&&b.rewardStatus===2);
      log("📦 可开启盲盒：", ready);
      if(ready.length>0){ notify+=`\n\n🎉 自动开启盲盒...`; for(const b of ready){ log(`📦 开启 ${b.awardDays} 天盲盒`); const reward=await openBlindBox(headers); notify+=`\n🎁 ${b.awardDays}天盲盒获得：${reward}`; } }
    }

  }catch(error){ log("❌ 脚本异常捕获：", error); notify="❌ 脚本异常："+error; }
  finally{ log("📤 最终通知内容:", notify); const title=CONFIG.customTitle; if(notify.includes("今日已签到")) $notification.post(title,`已签到 · 连续 ${days} 天`,notify); else $notification.post(title,`连续 ${days} 天`,notify); log("🏁 Ninebot Sign AutoOpen 完成"); $done(); }
}

run();