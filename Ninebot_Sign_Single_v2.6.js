/***********************************************
 Ninebot_Sign_Single_v2.6_test.js
 2025-11-29 测试版（保证日志输出和通知）
***********************************************/

const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";
const IS_ARG = typeof $argument !== "undefined";

function readPS(k){try{if(HAS_PERSIST)return $persistentStore.read(k)}catch(e){}return null}
function writePS(v,k){try{if(HAS_PERSIST)return $persistentStore.write(v,k)}catch(e){}return false}
function notify(title,sub,body){if(HAS_NOTIFY)$notification.post(title,sub,body)}
function nowStr(){return new Date().toLocaleString()}

// BoxJS keys
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_DEBUG="ninebot.debugLevel";
const KEY_NOTIFY="ninebot.notify";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_AUTOBOX="ninebot.autoOpenBox";

// HTTP
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN={openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box"};

function makeHeaders(cfg){
  return {
    "Authorization":cfg.Authorization,
    "Content-Type":"application/json;charset=UTF-8",
    "device_id":cfg.DeviceId,
    "User-Agent":cfg.userAgent||"Mozilla/5.0 (iPhone) Segway/6",
    "platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"
  };
}

function log(level,...msg){
  const lvl=Number(readPS(KEY_DEBUG)||1); // 默认 1-INFO
  if(level<=lvl) console.log(`[${nowStr()}]`,...msg);
}

// 抓包写入
if(IS_REQUEST && $request?.url){
  try{
    const h=$request.headers||{};
    const auth=h.Authorization||h.authorization||"";
    const dev=h.DeviceId||h.deviceid||h.device_id||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true}
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true}
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true}
    if($request.url.includes("/service/2/app_log/")){
      const base=$request.url.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true}
    }
    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入");
  }catch(e){log(3,"抓包异常",e)}
  $done({});
}

// 配置
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debugLevel: Number(readPS(KEY_DEBUG)||1),
  notify: readPS(KEY_NOTIFY)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true"
};

if(!cfg.Authorization||!cfg.DeviceId){
  if(cfg.notify) notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId");
  $done();
}

async function requestWithRetry({method="GET",url,headers={},body=null}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout:12000};
      if(method==="POST") opts.body=body||"{}";
      const cb=(err,resp,data)=>{
        if(err){
          if(attempts<3 && /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(err.message||"")) return setTimeout(once,1500);
          return reject(err);
        }
        try{resolve(JSON.parse(data||"{}"))}catch(e){resolve({raw:data})}
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}

function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function toDate(sec){const d=new Date(Number(sec)*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

// MAIN
(async ()=>{
  try{
    const headers=makeHeaders(cfg);

    log(2,"开始查询签到状态...");
    let statusResp=await requestWithRetry({url:`${END.status}?t=${Date.now()}`,headers});
    let statusData=statusResp?.data||{};
    let consecutiveDays=statusData.consecutiveDays||0;
    let signCards=statusData.signCardsNum||0;
    let currentSignStatus=statusData.currentSignStatus;

    let signMsg="", todayGainExp=0, todayGainNcoin=0;

    if(currentSignStatus===0||currentSignStatus==null){
      log(2,"未签到，执行签到...");
      const signResp=await requestWithRetry({method:"POST",url:END.sign,headers,body:JSON.stringify({deviceId:cfg.DeviceId})});
      if(signResp?.code===0||signResp?.code===1){
        const nCoin=Number(signResp.data?.nCoin||0);
        const score=Number(signResp.data?.score||0);
        todayGainNcoin+=nCoin;
        todayGainExp+=score;
        signMsg=`✨ 今日签到成功：+${score} 经验 +${nCoin} N币`;
        // 刷新状态
        const newStatus=await requestWithRetry({url:`${END.status}?t=${Date.now()}`,headers});
        if(newStatus?.data?.consecutiveDays) consecutiveDays=newStatus.data.consecutiveDays;
      }else signMsg=`❌ 签到失败：${signResp?.msg||"未知错误"}`;
    }else signMsg="✨ 今日已签到";

    // 分享奖励
    let shareLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      let share=null;
      try{ share=await requestWithRetry({method:"POST",url:cfg.shareTaskUrl,headers,body:JSON.stringify({page:1,size:20})}) }catch(e){log(3,"分享接口请求失败",e);}
      const list=Array.isArray(share?.data?.list)?share.data.list:[];
      const today=todayKey();
      list.forEach(it=>{
        const t=Number(it.occurrenceTime||it.time||it.ts||0);
        if(toDate(t)===today) shareGain+=Number(it.count||it.score||0);
      });
      if(shareGain>0){ todayGainNcoin+=shareGain; shareLine=`🎁 今日分享奖励：+${shareGain} N币`; }
    }

    // 经验/升级
    let upgradeLine="";
    try{
      const cr=await requestWithRetry({url:END.creditInfo,headers});
      const d=cr?.data||{};
      const credit=Number(d.credit||0);
      const level=d.level||"";
      let need=0;
      if(d.credit_upgrade){ const m=String(d.credit_upgrade).match(/([0-9]+)/); if(m) need=Number(m[1]); }
      upgradeLine=`- 当前经验：${credit}（LV.${level}）\n- 距离升级：${need} 经验`;
    }catch(e){log(3,"经验查询失败",e);}

    // N币
    let balLine="";
    try{
      const b=await requestWithRetry({url:END.balance,headers});
      if(b?.code===0) balLine=`- 当前 N币：${b.data?.balance||0}`;
    }catch(e){log(3,"N币查询失败",e);}

    // 盲盒
    let blindInfo=[];
    try{
      const box=await requestWithRetry({url:END.blindBoxList,headers});
      const notOpened=box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{ blindInfo.push({target:Number(b.awardDays),left:Number(b.leftDaysToOpen),opened:Number(b.awardDays)-Number(b.leftDaysToOpen)})});
    }catch(e){log(3,"盲盒查询失败",e);}

    // 自动开7天盲盒
    if(cfg.autoOpenBox){
      for(const b of blindInfo){
        if(b.target===7 && b.left===0){
          try{
            const r=await requestWithRetry({method:"POST",url:END_OPEN.openSeven,headers,body:"{}"});
            if(r?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒奖励已领取");
          }catch(e){log(3,"开盲盒失败",e);}
        }
      }
    }

    // 输出通知
    let lines=[signMsg];
    if(shareLine) lines.push(shareLine);
    lines.push("");
    lines.push("📊 账户状态");
    if(upgradeLine) lines.push(upgradeLine);
    if(balLine) lines.push(balLine);
    lines.push(`- 补签卡：${signCards} 张`);
    lines.push(`- 连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      lines.push("");
      lines.push("📦 盲盒进度");
      blindInfo.forEach(b=>{
        const f=Math.round((b.opened/b.target)*20);
        const bar="█".repeat(f)+"░".repeat(20-f);
        lines.push(`${b.target} 天盲盒：`);
        lines.push(`[${bar}] ${b.opened} / ${b.target} 天`);
      });
    }

    if(todayGainExp||todayGainNcoin) lines.push("",`🎯 今日获得：经验 ${todayGainExp} / N币 ${todayGainNcoin}`);

    if(cfg.notify) notify(`${cfg.titlePrefix} · 今日签到结果`,"",lines.join("\n"));

  }catch(e){
    log(3,"脚本异常",e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }finally{$done();}
})();