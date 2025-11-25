/*
Ninebot_Sign_Single_v2.6_AutoShare_GrabConfig.js
最终版（增强 + 可配置分享任务接口 + 自动抓包写入分享接口 Header）
更新日期：2025/11/25
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
          if(attempts<MAX_RETRY && shouldRetry){
            console.warn(`[${nowStr()}] warn 请求失败：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(tryOnce,RETRY_DELAY);
            return;
          }else{ reject(err); return; }
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
function logStart(msg){console.log(`[${nowStr()}] ======== ${msg} ========`);}

// ---------- 抓包写入（支持 status 和分享接口） ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到",
  shareTaskUrl: read(KEY_SHARE_URL) || ""
};

const captureShareOrStatus = isRequest && $request.url && (
    $request.url.includes("/portal/api/user-sign/v2/status") ||
    (cfg.shareTaskUrl && $request.url.includes(cfg.shareTaskUrl))
);

if(captureShareOrStatus){
  try{
    logStart("进入抓包写入流程（支持分享任务接口）");
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    let changed=false;
    if(auth&&read(KEY_AUTH)!==auth){write(auth,KEY_AUTH);changed=true;}
    if(dev&&read(KEY_DEV)!==dev){write(dev,KEY_DEV);changed=true;}
    if(ua&&read(KEY_UA)!==ua){write(ua,KEY_UA);changed=true;}
    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info","抓包写入成功",{auth:mask(auth),deviceId:mask(dev)});
    }else{ log("info","抓包数据无变化"); }
  }catch(e){log("error","抓包异常：",e);}
  $done({});
}

// ---------- 基本检查 ----------
logStart("九号自动签到开始");
log("info","当前配置：",{notify:cfg.notify,autoOpenBox:cfg.autoOpenBox,autoRepair:cfg.autoRepair,titlePrefix:cfg.titlePrefix, shareTaskUrl:cfg.shareTaskUrl});

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
  log("warn","终止：未读取到账号信息");
  $done();
}

// ---------- 工具 ----------
function mask(s){if(!s)return"";return s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s;}
function toDateKeyFromSec(sec){const d=new Date(sec*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function progressBarSimple(progress,total,width){const pct=total>0?progress/total:0;const filled=Math.round(pct*width);return'█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled));}

// ---------- 主流程 ----------
(async()=>{
  try{
    const headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1. 查询状态
    log("info","查询签到状态...");
    let st=null;
    try{st=await httpGet(`${END.status}?t=${Date.now()}`,headers);}catch(e){log("warn","状态请求异常：",String(e));}
    const consecutiveDays = (st?.data?.consecutiveDays ?? st?.data?.continuousDays) ?? 0;
    const signCards = (st?.data?.signCardsNum ?? st?.data?.remedyCard) ?? 0;

    // 2. 签到
    log("info","发送签到请求...");
    let signResp=null, signMsg="", todayGainExp=0, todayGainNcoin=0;
    try{signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));}catch(e){log("warn","签到请求异常：",String(e));}
    if(signResp){
      if(signResp.code===0||signResp.code===1){
        const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin+=nCoin; todayGainExp+=score;
        signMsg=`🎁 今日签到获得 N币: ${nCoin} / 积分: ${score}`;
      }else if(signResp.code===540004||(signResp.msg && /已签到/.test(signResp.msg))){
        signMsg=`⚠️ 今日已签到`;
      }else{ signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
    }else{ signMsg=`❌ 签到请求异常（网络/超时）`; if(!cfg.notifyFail) signMsg=""; }

    // 3. 自动完成分享任务（可配置接口）
    let shareGain=0, shareTaskLine="";
    if(cfg.shareTaskUrl){
      try{
        const shareListResp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({page:1,size:20}));
        log("info","分享任务列表原始数据：",shareListResp);

        const listArr = Array.isArray(shareListResp.data?.list) ? shareListResp.data.list : [];
        const today=todayKey();

        const todayUnfinished = listArr.filter(item=>{
          const taskType = String(item?.type||"").toLowerCase();
          const taskDate = toDateKeyFromSec(Number(item.occurrenceTime||0));
          const completed = (item?.completed===0 || item?.completed===false) ? false : true;
          return taskType.includes("share") && taskDate===today && !completed;
        });

        log("info","匹配到今日未完成分享任务数：", todayUnfinished.length);

        for(const t of todayUnfinished){
          try{
            const taskId = t.id;
            if(!taskId) continue;
            const resp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({taskId, action:"complete"}));
            if(resp?.code===0){
              shareGain += Number(t.score || 0);
              log("info","自动完成分享任务成功",t.id,t.score);
            } else log("warn","自动完成分享任务失败",resp);
          }catch(e){ log("warn","自动分享请求异常",e); }
        }
        if(shareGain>0) shareTaskLine=`🎁 今日分享任务获得 积分: ${shareGain}`;
        todayGainExp += shareGain;

      }catch(e){ log("warn","分享任务自动完成异常：",String(e)); }
    } else log("warn","未配置分享任务接口 URL，跳过自动分享。");

    // 4. 积分/经验
    let upgradeLine="";
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      if(creditInfo && creditInfo.code!==undefined){
        const data = creditInfo.data || {};
        const credit = Number(data.credit ?? 0);
        const level = data.level ?? null;
        let need = 0;
        if(data.credit_upgrade){
          const m = String(data.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
          if(m && m[1]) need = Number(m[1]);
        } else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){
          need = data.credit_range[1]-credit;
        }
        upgradeLine = `📈 当前经验：${credit}${level?`（LV.${level}）`:''}，\n距离升级还需 ${need}`;
      }
    }catch(e){log("warn","经验信息查询异常：",String(e));}

    // 5. 余额
    let balMsg="";
    try{ const bal = await httpGet(END.balance, headers); if(bal?.code===0) balMsg=`💰 N币余额：${bal.data?.balance??bal.data?.coin??0}`; }catch(e){log("warn","余额查询异常：",String(e));}

    // 6. 盲盒
    let blindMsg="", blindProgressInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if(Array.isArray(notOpened)&&notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays), left=Number(b.leftDaysToOpen), opened=Math.max(0,target-left);
          blindProgressInfo.push({target,left,opened});
        });
      }
      blindProgressInfo.forEach(info=>{
        const width=(info.target===7?5:(info.target===666?12:12));
        const bar = progressBarSimple(info.opened,info.target,width);
        blindMsg+=`\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });
    }catch(e){log("warn","盲盒列表查询异常：",String(e));}

    // 连续签到 & 补签卡
    const consecutiveLine = `🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;

    // 汇总通知
    let notifyBodyArr = [];
    if(signMsg) notifyBodyArr.push(signMsg);
    if(shareTaskLine) notifyBodyArr.push(shareTaskLine);
    if(upgradeLine) notifyBodyArr.push(upgradeLine);
    if(balMsg) notifyBodyArr.push(balMsg);
    notifyBodyArr.push(consecutiveLine);
    if(blindMsg) notifyBodyArr.push(blindMsg);
    if(todayGainExp) notifyBodyArr.push(`🎯 今日总积分（签到 + 分享）：${todayGainExp}`);
    if(todayGainNcoin) notifyBodyArr.push(`🎯 今日获得 N币（签到）：${todayGainNcoin}`);

    if(cfg.notify && notifyBodyArr.length>0){
      notify(cfg.titlePrefix||"九号签到","签到结果",notifyBodyArr.join("\n"));
      log("info","发送通知：",cfg.titlePrefix,notifyBodyArr.join(" | "));
    } else log("info","通知已禁用或无内容，跳过发送。");

  }catch(e){
    log("error","主流程未捕获异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();