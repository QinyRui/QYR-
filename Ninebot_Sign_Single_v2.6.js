/*
Ninebot_Sign_Single_v2.6.js
最终版（增强 + 自动分享任务）
更新日期：2025/11/24 04:01
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化，含分享任务）
- 自动完成分享任务
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（只显示签到所得 N 币）
- 7天 / 666天 盲盒进度条（默认：7天用5格，666天用12格）
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
- 删除内测逻辑
- 日志带时间戳与等级，开始/结束分隔
- 文件名保持：Ninebot_Sign_Single_v2.6.js
- 通知顺序：
  1. 签到结果
  2. 今日积分变动
  3. 当前经验/升级信息
  4. N币余额
  5. 连续签到 & 补签卡
  6. 今日分享任务
  7. 盲盒进度条
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500; // ms
const REQUEST_TIMEOUT = 12000; // ms

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

// Endpoints
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/my-detail", // 积分信息
  creditList:"https://api5-h5-app-bj.ninebot.com/web/credit/list", // 积分流水 (备用)
  shareTask:"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004" // 分享任务（使用你抓包的接口）
};

// ---------- 网络请求（带重试） ----------
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

// ---------- 抓包写入（仅匹配 status 链接） ----------
const captureOnlyStatus=isRequest&&$request.url&&$request.url.includes("/portal/api/user-sign/v2/status");
if(captureOnlyStatus){
  try{
    logStart("进入抓包写入流程");
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

// ---------- 读取配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到"
};

logStart("九号自动签到开始");
log("info","当前配置：",{notify:cfg.notify,autoOpenBox:cfg.autoOpenBox,autoRepair:cfg.autoRepair,titlePrefix:cfg.titlePrefix});

// 基本检查
if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn","终止：未读取到账号信息");
  $done();
}

// ---------- 工具函数 ----------
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

    // 1) 查询状态
    log("info","查询签到状态...");
    let st=null;
    try{st=await httpGet(`${END.status}?t=${Date.now()}`,headers);}catch(e){log("warn","状态请求异常：",String(e));}
    const consecutiveDays=st?.data?.consecutiveDays??st?.data?.continuousDays??0;
    const signCards=st?.data?.signCardsNum??st?.data?.remedyCard??0;

    // 2) 签到
    log("info","发送签到请求...");
    let signResp=null;
    try{signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));}catch(e){log("warn","签到请求异常：",String(e));}
    let signMsg="", signPoint=0, todayGainExp=0, todayGainNcoin=0;
    if(signResp){
      if(signResp.code===0||signResp.code===1){
        const nCoin=Number(signResp.data?.nCoin??signResp.data?.coin??0);
        const score=Number(signResp.data?.score??0);
        todayGainNcoin+=nCoin; signPoint = score; todayGainExp+=score;
        signMsg=`🎉 今日签到成功\n🎁 已得 N币: ${nCoin}${score?`\n🏆 已得 积分: ${score}`:""}`;
      }else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))){
        signMsg=`⚠️ 今日已签到`;
        const nCoin=Number(signResp.data?.nCoin??signResp.data?.coin??0);
        const score=Number(signResp.data?.score??0);
        if(nCoin) todayGainNcoin+=nCoin; if(score) signPoint=score;
        if(nCoin||score) signMsg+=`\n🎁 本次已得 N币: ${nCoin}${score?` / 积分: ${score}`:""}`;
      }else{ signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
    }else{ signMsg=`❌ 签到请求异常（网络/超时）`; if(!cfg.notifyFail) signMsg=""; }

    // 3) 自动分享任务（查询并统计今日分享积分）
    let shareGain=0, shareCountToday=0, shareTaskLine="";
    try{
      // 你给的分享流水格式里包含 occurrenceTime（秒）和 source: "分享"
      // 这里我们 POST 固定体 {page:1,size:10,tranType:1}（你之前指定）
      const shareResp = await httpPost(END.shareTask, headers, JSON.stringify({page:1,size:10,tranType:1}));
      // The snssdk endpoint may return different shape; handle defensively
      if(shareResp && Array.isArray(shareResp.data)){
        // If endpoint returns array directly as data
        const list = shareResp.data;
        const today = todayKey();
        const todayShares = list.filter(item => {
          const ts = Number(item.occurrenceTime || item.create_date || item.createDate || 0);
          return ts > 0 && toDateKeyFromSec(ts) === today && (String(item.source || "").includes("分享") || item.source==="" || true);
        });
        todayShares.forEach(it => { shareGain += Number(it.count ?? 0); });
        shareCountToday = todayShares.length;
      } else if(shareResp && Array.isArray(shareResp.data?.list)) {
        const list = shareResp.data.list;
        const today = todayKey();
        const todayShares = list.filter(item => {
          const ts = Number(item.occurrenceTime || item.create_date || item.createDate || 0);
          return ts > 0 && toDateKeyFromSec(ts) === today && (String(item.source || "").includes("分享") || item.source==="" || true);
        });
        todayShares.forEach(it => { shareGain += Number(it.count ?? 0); });
        shareCountToday = todayShares.length;
      } else if (shareResp && Array.isArray(shareResp.data?.list || shareResp.data)) {
        // fallback handled above, but keep safe
      } else {
        // some responses are like {e:0,...} that you showed earlier; try to parse elsewhere
        // If none, ignore silently
      }

      if(shareGain>0 || shareCountToday>0){
        shareTaskLine = `\n📌 今日分享任务：${shareCountToday>0?'已完成':'未完成'}，获得 ${shareGain} 积分`;
        todayGainExp += shareGain;
      } else {
        // If no shares found, still show '未完成' line to be explicit
        shareTaskLine = `\n📌 今日分享任务：未完成`;
      }
    }catch(e){ log("warn","分享任务查询异常：",String(e)); shareTaskLine = `\n📌 今日分享任务：查询异常`; }

    // 4) 积分/经验信息
    let upgradeLine = "";
    let currentExp = 0, currentLevel = 0, expToNext = 0;
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      if(creditInfo && (creditInfo.code === 1 || creditInfo.code === 0) && creditInfo.data){
        currentExp = Number(creditInfo.data.my_credits ?? creditInfo.data.credit ?? 0);
        currentLevel = creditInfo.data.level ?? (creditInfo.data.level_list?.find(l=>Array.isArray(l.credit_range) && Number(l.credit_range[0]) <= currentExp && Number(l.credit_range[1]) >= currentExp)?.level ?? 0);
        const levelList = creditInfo.data.level_list || [];
        const levelInfo = Array.isArray(levelList) ? levelList.find(l => l.level === currentLevel) : null;
        if (levelInfo && Array.isArray(levelInfo.credit_range) && levelInfo.credit_range.length >= 2) {
          expToNext = Number(levelInfo.credit_range[1]) - currentExp;
          if (expToNext < 0) expToNext = 0;
        } else if (creditInfo.data.msg && typeof creditInfo.data.msg === "object" && creditInfo.data.msg.credit_upgrade) {
          // try parse fallback string like "当前3437经验值，还需1563可升级"
          const m = String(creditInfo.data.msg.credit_upgrade).match(/还需\s*(\d+)/);
          if (m) expToNext = Number(m[1]);
        }
      } else {
        // try alternative shape your provided earlier (code:1 with data.my_credits)
        if (creditInfo && creditInfo.data && creditInfo.data.my_credits) {
          currentExp = Number(creditInfo.data.my_credits);
          currentLevel = creditInfo.data.level ?? currentLevel;
          const levelList = creditInfo.data.level_list || [];
          const levelInfo = Array.isArray(levelList) ? levelList.find(l => l.level === currentLevel) : null;
          if (levelInfo && Array.isArray(levelInfo.credit_range) && levelInfo.credit_range.length >= 2) {
            expToNext = Number(levelInfo.credit_range[1]) - currentExp;
            if (expToNext < 0) expToNext = 0;
          }
        }
      }
      // build upgradeLine in two-line style later when composing notification
    }catch(e){ log("warn","经验信息查询异常：",String(e)); }

    // 5) 余额
    let balMsg="";
    try{ const bal = await httpGet(END.balance, headers); if(bal?.code===0) balMsg=`💰 N币余额：${bal.data?.balance??bal.data?.coin??0}`; }catch(e){log("warn","余额查询异常：",String(e));}

    // 6) 盲盒
    let blindMsg="", blindProgressInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes??[];
      if(Array.isArray(notOpened)&&notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays || b.boxDays || b.days || 0);
          const left=Number(b.leftDaysToOpen ?? b.diffDays ?? 0);
          const opened=Math.max(0, target - left);
          blindProgressInfo.push({target,left,opened});
        });
      }
      // Sort to put 7-day first then 666 if present (for stable mapping)
      blindProgressInfo.sort((a,b)=>{
        if(a.target===7) return -1;
        if(b.target===7) return 1;
        if(a.target===666) return -1;
        if(b.target===666) return 1;
        return a.target - b.target;
      });
    }catch(e){log("warn","盲盒列表查询异常：",String(e));}

    // Build box7 and box666 objects for notify (guarantee structure even if missing)
    const defaultBox = { bar: '░░░░░', current: 0, total: 0, left: '?' };
    let box7 = Object.assign({}, defaultBox);
    let box666 = Object.assign({}, defaultBox);
    if (blindProgressInfo.length > 0) {
      for (const info of blindProgressInfo) {
        const width = (info.target === 7 ? 5 : (info.target === 666 ? 12 : 12));
        const bar = progressBarSimple(info.opened, info.target, width);
        const obj = { bar, current: info.opened, total: info.target, left: info.left };
        if (info.target === 7) box7 = obj;
        else if (info.target === 666) box666 = obj;
        else {
          // if different target, assign to box666 if empty, else to box7
          if (box666.current === 0 && box666.total === 0) box666 = obj;
          else if (box7.current === 0 && box7.total === 0) box7 = obj;
        }
      }
    }

    // 7) 连续签到 & 补签卡
    const consecutiveLine = `\n🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;

    // 8) 汇总通知 - using the EXACT aligned format you requested
    const todayCoin = todayGainNcoin;
    const todayPoint = signPoint;
    const sharePoint = shareGain;
    const totalPoint = (todayPoint || 0) + (sharePoint || 0);

    // Build the exact aligned message:
    const titlePrefix = cfg.titlePrefix || "九号 APP";
    const line1 = signMsg || `⚠️ 今日签到状态未知`;
    const line2 = `🎁 今日签到获得 N币: ${todayCoin} / 积分: ${todayPoint}`;
    const line3 = `🎁 今日分享任务获得 积分: ${sharePoint}`;
    const line4 = `📈 当前经验：${currentExp}（LV.${currentLevel}），`;
    const line5 = `   距离升级还需 ${expToNext}`;
    const line6 = balMsg || `💰 N币余额：?`;
    const line7 = `🗓 连续签到：${consecutiveDays} 天`;
    const line8 = `🎫 补签卡：${signCards} 张`;
    const line9 = `🔋 7天盲盒进度：${box7.bar} (${box7.current}/${box7.total})   还需 ${box7.left} 天`;
    const line10 = `🔋 666天盲盒进度：${box666.bar} (${box666.current}/${box666.total})   还需 ${box666.left} 天`;
    const line11 = `🎯 今日总积分（签到 + 分享）：${totalPoint}`;

    const notifyMsg = [
      line1,
      line2,
      line3,
      line4,
      line5,
      line6,
      line7,
      line8,
      line9,
      line10,
      line11
    ].join('\n');

    if(cfg.notify && notifyMsg.trim()){
      notify(titlePrefix,"签到结果",notifyMsg);
      log("info","发送通知：", titlePrefix, notifyMsg.replace(/\n/g," | "));
    } else {
      log("info","通知已禁用或无内容，跳过发送。");
    }

  }catch(e){
    log("error","主流程未捕获异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();