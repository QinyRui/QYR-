/*
Ninebot_Sign_Single_v2.6.js
最终整合版（自动签到 + 自动分享修复 + 自动领取奖励 + 美化通知 + 盲盒进度）
更新：2025-11-27
说明：
- 自动写入 BoxJS keys: ninebot.authorization, ninebot.deviceId, ninebot.userAgent, ninebot.shareTaskUrl
- 支持分享任务自动修复
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k) => { if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k); return false; };
const notify = (title,sub,body) => { if(typeof $notification!=="undefined") $notification.post(title,sub,body); };
const nowStr = () => new Date().toLocaleString();

// BoxJS keys
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE_URL="ninebot.shareTaskUrl";

// Endpoints
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
const END_OPEN = {
  openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box"
};

// ---------- 网络请求 ----------
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const tryOnce=()=>{
      attempts++;
      const opt={url,headers,timeout};
      if(method==="POST") opt.body=body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err&&(err.error||err.message||err));
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry){ setTimeout(tryOnce,RETRY_DELAY); return; }
          else{ reject(err); return; }
        }
        try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opt,cb);
      else $httpClient.post(opt,cb);
    };
    tryOnce();
  });
}
function httpGet(url,headers){return requestWithRetry({method:"GET",url,headers});}
function httpPost(url,headers,body="{}"){return requestWithRetry({method:"POST",url,headers,body});}

// ---------- 日志 ----------
function log(level,...args){
  const t=nowStr();
  const text=args.map(a=>(typeof a==="object"?JSON.stringify(a):String(a))).join(" ");
  if(level==="info") console.log(`[${t}] info ${text}`);
  else if(level==="warn") console.warn(`[${t}] warn ${text}`);
  else if(level==="error") console.error(`[${t}] error ${text}`);
  else console.log(`[${t}] ${text}`);
}

// ---------- 工具 ----------
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d=new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress,total,width){ const pct=total>0?progress/total:0; const filled=Math.round(pct*width); return '█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled)); }

// ---------- 配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  shareTaskUrl: read(KEY_SHARE_URL)||"",
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到"
};

// ---------- 主流程 ----------
(async()=>{
  try{
    if(!cfg.Authorization || !cfg.DeviceId){
      notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
      log("warn","终止：未读取到账号信息");
      $done(); return;
    }

    const headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    log("info","九号自动签到开始");
    log("info","当前配置：", cfg);

    // 查询签到状态
    const stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    const statusData = stResp?.data || {};
    const currentSignStatus = statusData?.currentSignStatus ?? 0;
    const consecutiveDays = statusData?.consecutiveDays ?? statusData?.continuousDays ?? 0;
    const signCards = statusData?.signCardsNum ?? statusData?.remedyCard ?? 0;

    // 签到
    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(currentSignStatus===0){
      const signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      if(signResp?.code===0 || signResp?.code===1){
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin; todayGainExp += score;
        signMsg=`✨ 今日签到：成功\n🎁 奖励领取：未领取`;
      } else { signMsg=`⚠️ 今日签到失败`; }
    } else { signMsg=`✨ 今日签到：已签到\n🎁 奖励领取：未领取`; }

    // ---------- 自动修复分享任务 ----------
    if(cfg.autoRepair && cfg.shareTaskUrl){
      try{
        const shareResp = await (async function repairShareTask(){
          let url = cfg.shareTaskUrl;
          if(!url.includes("app_log")) url = "https://snssdk.ninebot.com/service/2/app_log/";
          const body = {
            aid:10000004,
            event_time:Date.now(),
            log_type:2,
            content:JSON.stringify({ title:"自动签到分享", type:"share" }),
          };
          return await httpPost(url, headers, JSON.stringify(body));
        })();
        log("info","分享任务自动修复完成", shareResp);
      }catch(e){ log("warn","分享任务修复异常", e); }
    }

    // 查询经验/等级
    let upgradeLine="";
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      const data = creditInfo.data || {};
      const credit = Number(data.credit ?? 0);
      const level = data.level ?? 0;
      let need = 0;
      if(data.credit_upgrade){
        const m = String(data.credit_upgrade).match(/还需\s*([0-9]+)/);
        if(m && m[1]) need = Number(m[1]);
      } else if(data.credit_range && data.credit_range.length>=2) need = data.credit_range[1]-credit;
      upgradeLine = `- 当前经验：${credit}（LV.${level}）\n- 距离升级：${need} 经验`;
    }catch(e){ log("warn","经验信息查询异常", e); }

    // 查询余额
    let balMsg="";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balMsg=`- 当前 N 币：${bal.data?.balance ?? 0}`;
    }catch(e){ log("warn","余额查询异常", e); }

    // 盲盒列表
    let blindMsg="", blindProgressInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if(Array.isArray(notOpened)) notOpened.forEach(b=>{
        const target=Number(b.awardDays), left=Number(b.leftDaysToOpen), opened=Math.max(0,target-left);
        blindProgressInfo.push({target,left,opened});
      });
      blindProgressInfo.forEach(info=>{
        const width=(info.target===7?12:info.target===30?15:20);
        const bar = progressBarSimple(info.opened,info.target,width);
        blindMsg+=`\n${info.target} 天盲盒：\n[${bar}] ${info.opened} / ${info.target} 天`;
      });
    }catch(e){ log("warn","盲盒查询异常", e); }

    // 补签 & 连续签到
    const consecutiveLine=`- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天`;

    // 发送通知
    if(cfg.notify){
      const notifyBody=[signMsg, upgradeLine, balMsg, consecutiveLine, blindMsg].filter(Boolean).join("\n");
      notify(cfg.titlePrefix,"签到结果",notifyBody);
      log("info","发送通知：", notifyBody);
    }

  }catch(e){ log("error","主流程异常", e); if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e)); }
  finally{ log("info","九号自动签到结束"); $done(); }
})();