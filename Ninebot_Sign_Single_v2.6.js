/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 C · BoxJS版）
 功能：自动签到、分享任务领取、盲盒进箱/开箱、经验/N币统计
 BoxJS 控制：日志等级、通知标题、盲盒样式、自动开箱
***********************************************/

const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(k){ try{ if(HAS_PERSIST) return $persistentStore.read(k); }catch(e){} return null; }
function writePS(v,k){ try{ if(HAS_PERSIST) return $persistentStore.write(v,k); }catch(e){} return false; }
function notify(title, sub, body){ if(HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr(){ return new Date().toLocaleString(); }

// BoxJS keys
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_PROGRESS="ninebot.progressStyle";
const KEY_DEBUG="ninebot.debugLevel";

// Endpoints
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS"
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

// Logging based on BoxJS debugLevel
const DEBUG_LEVELS=["OFF","WARN","ERROR","INFO","DEBUG","ALL"];
function log(level,...args){
  const lv=DEBUG_LEVELS.indexOf(readPS(KEY_DEBUG)||"INFO");
  const cur=DEBUG_LEVELS.indexOf(level);
  if(cur<=lv) console.log(`[${nowStr()}][${level}]`,...args);
}

/* Capture requests */
if(IS_REQUEST){
  try{
    const h=$request.headers||{};
    const auth=h.Authorization||h.authorization||"";
    const dev=h.DeviceId||h.deviceid||h.device_id||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const url=$request.url||"";
    let changed=false;

    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }

    if(url.includes("/service/2/app_log/")){
      const base=url.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; }
    }

    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入");
  }catch(e){ log("ERROR","抓包异常",e); }
  $done({});
}

/* Config */
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  notify: readPS(KEY_NOTIFY)!=="false",
  autoRepair: readPS(KEY_AUTOREPAIR)==="true",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  notifyFail: readPS(KEY_NOTIFYFAIL)!=="false",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle: Number(readPS(KEY_PROGRESS)||0)
};

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并执行签到/分享动作写入数据");
  $done();
}

/* HTTP helpers */
function request({method="GET",url,headers={},body=null,timeout=12000}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          if(attempts<3 && /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(String(err?.error||err?.message||err))) return setTimeout(once,1500);
          return reject(err);
        }
        try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); }
      };
      method==="GET"?$httpClient.get(opts,cb):$httpClient.post(opts,cb);
    };
    once();
  });
}

function makeHeaders(){ return {"Authorization":cfg.Authorization,"Content-Type":"application/json;charset=UTF-8","device_id":cfg.DeviceId,"User-Agent":cfg.userAgent || "Mozilla/5.0 (iPhone) Segway/6","platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"}; }

/* Progress bar */
const PROGRESS_STYLES=[["█","░"],["▓","░"],["▰","▱"],["●","○"],["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]];
function renderProgress(cur,total,style,len=20){ const [F,E]=PROGRESS_STYLES[style]||PROGRESS_STYLES[0]; const f=Math.round((total>0?cur/total:0)*len); return F.repeat(f)+E.repeat(Math.max(0,len-f)); }

/* Main */
(async()=>{
  try{
    const headers=makeHeaders();

    // 查询签到状态
    let status=await request({url:`https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status?t=${Date.now()}`,headers});
    let consecutiveDays=status?.data?.consecutiveDays||0;
    let signCards=status?.data?.signCardsNum||0;
    let currentSignStatus=status?.data?.currentSignStatus||null;

    let signMsg="",todayExp=0,todayNcoin=0;

    // 签到
    if(currentSignStatus===0||currentSignStatus==null){
      const signResp=await request({method:"POST",url:END.sign,headers,body:JSON.stringify({deviceId:cfg.DeviceId})});
      if(signResp?.code===0 || signResp?.code===1){
        const nCoin=Number(signResp.data?.nCoin||0);
        const score=Number(signResp.data?.score||0);
        todayNcoin+=nCoin; todayExp+=score;
        signMsg=`✨ 今日签到：成功\n🎁 奖励：+${score} 经验 +${nCoin} N 币`;
        // 刷新最新连续签到天数
        try{ const s=await request({url:`${END.status}?t=${Date.now()}`,headers}); consecutiveDays=s?.data?.consecutiveDays||consecutiveDays; signCards=s?.data?.signCardsNum||signCards; }catch(e){ log("WARN","刷新状态失败",e); }
      }else signMsg=`❌ 签到失败：${signResp?.msg||"未知错误"}`;
    }else signMsg="✨ 今日签到：已签到";

    // 分享奖励
    let shareLine="",shareGain=0;
    if(cfg.shareTaskUrl){
      try{
        const share=await request({method:"POST",url:cfg.shareTaskUrl,headers,body:JSON.stringify({page:1,size:20})});
        const list=Array.isArray(share?.data?.list)?share.data.list:[];
        const todayKey=(d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)(new Date());
        list.forEach(it=>{ const t=Number(it.occurrenceTime||it.time||it.ts||0); if(t && (new Date(t*1000)).toISOString().slice(0,10)===todayKey) shareGain+=Number(it.count||it.score||0); });
      }catch(e){}
      if(shareGain>0){ todayNcoin+=shareGain; shareLine=`🎁 今日分享奖励：+${shareGain} N 币`; }
    }

    // 经验
    let upgradeLine="";
    try{ const cr=await request({url:END.creditInfo,headers}); const d=cr?.data||{}; const credit=Number(d.credit||0); const level=d.level||""; let need=0; if(d.credit_upgrade){ const m=String(d.credit_upgrade).match(/([0-9]+)/); if(m) need=Number(m[1]); } upgradeLine=`- 当前经验：${credit}（LV.${level}）\n- 距离升级：${need} 经验`; }catch(e){}

    // N币
    let balLine="";
    try{ const b=await request({url:END.balance,headers}); if(b?.code===0) balLine=`- 当前 N 币：${b.data?.balance||0}`; }catch(e){}

    // 盲盒
    let blindInfo=[];
    try{ const box=await request({url:END.blindBoxList,headers}); const notOpened=box?.data?.notOpenedBoxes||[]; notOpened.forEach(b=>{ const target=Number(b.awardDays); const left=Number(b.leftDaysToOpen); blindInfo.push({target,left,opened:target-left}); }); }catch(e){}

    // 自动开 7 天盲盒
    if(cfg.autoOpenBox) for(const b of blindInfo){ if(b.target===7 && b.left===0){ try{ await request({method:"POST",url:END_OPEN.openSeven,headers,body:"{}"}); notify(cfg.titlePrefix,"盲盒开启","7天盲盒奖励已领取"); }catch(e){} } }

    // 通知
    let lines=[signMsg]; if(shareLine) lines.push(shareLine); lines.push(""); lines.push("📊 账户状态"); if(upgradeLine) lines.push(upgradeLine); if(balLine) lines.push(balLine); lines.push(`- 补签卡：${signCards} 张`); lines.push(`- 连续签到：${consecutiveDays} 天`);
    if(blindInfo.length>0){ lines.push(""); lines.push("📦 盲盒进度"); blindInfo.forEach(b=>{ const w=b.target===7?18:22; const bar=renderProgress(b.opened,b.target,cfg.progressStyle,w); lines.push(`${b.target} 天盲盒：`); lines.push(`[${bar}] ${b.opened} / ${b.target} 天`); }); }
    if(todayExp||todayNcoin){ lines.push(""); lines.push(`🎯 今日获得：经验 ${todayExp} / N币 ${todayNcoin}`); }

    if(cfg.notify) notify(cfg.titlePrefix+" · 今日签到结果","",lines.join("\n"));
  }catch(e){ notify(readPS(KEY_TITLE)||"九号签到","脚本异常",String(e)); }
  finally{ $done(); }
})();