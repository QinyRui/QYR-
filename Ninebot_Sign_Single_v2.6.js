/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 更新时间：2025/11/20
📖 功能：支持自动签到、补签、盲盒领取、内测资格自动申请、详细日志打印
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null;
const write = (v, k) => typeof $persistentStore !== "undefined" ? $persistentStore.write(v, k) : null;
const notify = (t, s, b) => { if(typeof $notification !== "undefined") $notification.post(t, s, b); };
const log = (...args) => { if(read("ninebot.debug")==="true") console.log("[Ninebot]", ...args); }

// ---------- HTTP helpers + 重试 ----------
async function httpPost({ url, headers, body="{}" }) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err, resp, data) => {
      if(err) reject(err);
      else {
        try { resolve(JSON.parse(data||"{}")); } catch { resolve({ raw:data }); }
      }
    });
  });
}
async function httpGet({ url, headers }) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, data) => {
      if(err) reject(err);
      else {
        try { resolve(JSON.parse(data||"{}")); } catch { resolve({ raw:data }); }
      }
    });
  });
}
async function retry(fn, times=3, delay=2000){
  for(let i=0;i<times;i++){
    try{ return await fn(); }
    catch(e){ log(`请求失败，第${i+1}次重试`, e); if(i===times-1) throw e; await new Promise(r=>setTimeout(r, delay)); }
  }
}

// ---------- 延迟首次请求 ----------
await new Promise(r=>setTimeout(r,1000));

// ---------- 读取 BoxJS 配置 ----------
const cfg = {
  debug: read("ninebot.debug")==="true",
  notify: read("ninebot.notify")==="true",
  autoOpenBox: read("ninebot.autoOpenBox")==="true",
  autoRepair: read("ninebot.autoRepair")==="true",
  autoApplyBeta: read("ninebot.autoApplyBeta")==="true",
  titlePrefix: read("ninebot.titlePrefix") || "九号签到",
  Authorization: read("ninebot.authorization"),
  DeviceId: read("ninebot.deviceId"),
  userAgent: read("ninebot.userAgent")
};

if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包写入 Authorization / DeviceId / User-Agent");
  $done();
}

// ---------- HTTP 请求头 ----------
const headers = {
  "Authorization": cfg.Authorization,
  "Content-Type":"application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone) Mobile",
  "platform":"h5",
  "Origin":"https://h5-bj.ninebot.com",
  "language":"zh"
};

// ---------- 主流程 ----------
!(async ()=>{
  let notifyBody = "";

  try{
    log("开始执行九号签到脚本...");

    // 1) 签到
    log("开始签到...");
    const sign = await retry(()=>httpPost({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", headers, body: JSON.stringify({deviceId: cfg.DeviceId})}));
    log("签到结果:", sign);
    if(sign.code===0) notifyBody+=`🎉 签到成功 +${sign.data?.nCoin||sign.data?.score||0} N币`;
    else if(sign.code===540004) notifyBody+="⚠️ 今日已签到";
    else notifyBody+=`❌ 签到失败: ${sign.msg||JSON.stringify(sign)}`;

    // 2) 状态
    const status = await retry(()=>httpGet({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status", headers}));
    log("当前连续签到天数:", status.data?.consecutiveDays);
    notifyBody+=`\n🗓 连续签到: ${status.data?.consecutiveDays||0} 天\n🎫 补签卡: ${status.data?.signCardsNum||0} 张`;

    // 3) 余额
    const balance = await retry(()=>httpGet({url:`https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606`, headers}));
    log("N币余额:", balance.data?.balance);
    notifyBody+=`\n💰 N币余额: ${balance.data?.balance||0}`;

    // 4) 盲盒
    const box = await retry(()=>httpGet({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list", headers}));
    log("获取盲盒任务列表...");
    notifyBody+="\n📦 盲盒任务:";
    (box.data?.notOpenedBoxes||[]).forEach(b=>{
      notifyBody+=`\n- ${b.awardDays}天盲盒，还需${b.leftDaysToOpen}天`;
      if(cfg.autoOpenBox && b.leftDaysToOpen===0){
        retry(()=>httpPost({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive", headers, body:"{}"}))
          .then(r=>log(`${b.awardDays}天盲盒领取结果:`, r))
          .catch(e=>log(`${b.awardDays}天盲盒领取异常:`, e));
      }
    });

    // 5) 补签
    if(cfg.autoRepair && status.data?.signCardsNum>0){
      const rep = await retry(()=>httpPost({url:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair", headers, body:"{}"}));
      log("自动补签返回:", rep);
      notifyBody+=`\n🔧 自动补签: ${rep.code===0?"成功":"失败"}`;
    }

    // 6) 内测
    if(cfg.autoApplyBeta){
      const beta = await retry(()=>httpGet({url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status", headers}));
      log("内测状态:", beta);
      if(!beta.data?.qualified){
        const apply = await retry(()=>httpPost({url:"https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration", headers, body: JSON.stringify({deviceId:cfg.DeviceId})}));
        log("内测申请返回:", apply);
      }
    }

    // ✅ 通知
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);

    log("脚本执行完成.");
  }catch(e){
    log("脚本异常:", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }

  $done();
})();})();