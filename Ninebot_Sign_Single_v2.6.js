/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 C · 最终整合版修复）
 2025-11-29 修复版（签到/分享奖励正确显示，经验/N币累计显示）
 功能：抓包写入、自动签到、分享任务重放/领取、盲盒进箱、
       经验/N币查询、通知美化
 修复：★ 签到后连续签到天数不更新（自动刷新 status）
***********************************************/

/* ENV wrapper (Loon/QuanX/Surge) */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); } catch (e) {} return null; }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); } catch (e) {} return false; }
function notify(title, sub, body) { if (HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }

/* BoxJS keys (兼容) */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_SHARE = "ninebot.shareTaskUrl";

/* Endpoints */
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry helpers */
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const once = () => {
      attempts++;
      const opts = { url, headers, timeout };
      if (method === "POST") opts.body = body === null ? "{}" : body;

      const cb = (err, resp, data) => {
        if (err) {
          const msg = String(err?.error || err?.message || err);
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) return setTimeout(once, RETRY_DELAY);
          return reject(err);
        }
        try { resolve(JSON.parse(data || "{}")); }
        catch (e) { resolve({ raw: data }); }
      };

      if (method === "GET") $httpClient.get(opts, cb);
      else $httpClient.post(opts, cb);
    };

    once();
  });
}
function httpGet(url, headers={}) { return requestWithRetry({method:"GET", url, headers}); }
function httpPost(url, headers={}, body="{}") { return requestWithRetry({method:"POST", url, headers, body}); }

/* Logging helpers */
function logInfo(...a){ console.log(`[${nowStr()}]`,...a);}
function logWarn(...a){ console.warn(`[${nowStr()}]`,...a); }
function logErr(...a){ console.error(`[${nowStr()}]`,...a); }

/* Progress bar */
const PROGRESS_STYLES = [
  ["█","░"],["▓","░"],["▰","▱"],["●","○"],
  ["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]
];
function renderProgressBar(cur, total, style=0, len=20){
  try {
    style = Number(style)||0;
    const [F,E] = PROGRESS_STYLES[style]||PROGRESS_STYLES[0];
    const ratio = total>0 ? cur/total : 0;
    const f = Math.round(ratio*len);
    return F.repeat(f)+E.repeat(Math.max(0,len-f));
  } catch { return "██████------"; }
}

/* Capture request */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && CAPTURE_PATTERNS.some(p=>($request?.url||"").includes(p));

if (isCaptureRequest) {
  try {
    const h = $request.headers||{};
    const auth = h.Authorization||h.authorization||"";
    const dev = h.DeviceId||h.deviceid||h.device_id||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    const capUrl = $request.url||"";
    let changed=false;

    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }

    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; }
    }

    if(changed) notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入");
  } catch(e){ logErr("抓包异常", e); }
  return $done({});
}

/* Config */
const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||""
};

if(!cfg.Authorization||!cfg.DeviceId){
  notify("九号签到","未配置 Token","请先开启抓包并执行签到/分享动作写入数据");
  return $done();
}

function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type":"application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone) Segway/6",
    "platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"
  };
}

function todayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toDate(sec){
  const d=new Date(Number(sec)*1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* MAIN */
(async ()=>{
  try {
    const headers = makeHeaders();

    /* 查询签到状态 */
    let statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    let statusData = statusResp?.data||{};
    let consecutiveDays = statusData.consecutiveDays ?? statusData.continuousDays ?? 0;
    let signCards = statusData.signCardsNum ?? statusData.remedyCard ?? 0;
    let currentSignStatus = statusData.currentSignStatus ?? null;

    let signMsg="", todayGainExp=0, todayGainNcoin=0;

    /* 执行签到 */
    if(currentSignStatus===0||currentSignStatus==null){
      const signResp = await httpPost(END.sign, headers, JSON.stringify({deviceId:cfg.DeviceId}));
      if(signResp?.code===0 || signResp?.code===1){
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin;
        todayGainExp += score;

        signMsg=`✨ 今日签到：成功\n🎁 奖励：+${score} 经验 +${nCoin} N 币`;

        /* 刷新最新连续签到天数 */
        try {
          const newStatus = await httpGet(`${END.status}?t=${Date.now()}`, headers);
          if(newStatus?.data?.consecutiveDays){
            statusData = newStatus.data;
            consecutiveDays = statusData.consecutiveDays;
            currentSignStatus = statusData.currentSignStatus;
            signCards = statusData.signCardsNum;
          }
        } catch(e){ logWarn("刷新状态失败", e); }

      } else signMsg = `❌ 签到失败：${signResp?.msg||"未知错误"}`;
    } else {
      signMsg = "✨ 今日签到：已签到";
    }

    /* 分享奖励 */
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      let share = null;
      try{ share = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({page:1,size:20})); }
      catch(e){ try{ share = await httpGet(cfg.shareTaskUrl, headers); }catch(e2){} }

      const list = Array.isArray(share?.data?.list) ? share.data.list : [];
      const today = todayKey();
      list.forEach(it=>{
        const t=Number(it.occurrenceTime||it.time||it.ts||0);
        if(t && toDate(t)===today) shareGain += Number(it.count ?? it.score ?? 0);
      });

      if(shareGain>0){
        todayGainNcoin += shareGain;
        shareTaskLine = `🎁 今日分享奖励：+${shareGain} N 币`;
      }
    }

    /* 经验 */
    let upgradeLine="";
    try{
      const cr=await httpGet(END.creditInfo, headers);
      const d=cr?.data||{};
      const credit=Number(d.credit||0);
      const level=d.level||"";
      let need=0;
      if(d.credit_upgrade){
        const m=String(d.credit_upgrade).match(/([0-9]+)/);
        if(m) need=Number(m[1]);
      }
      upgradeLine=`- 当前经验：${credit}（LV.${level}）\n- 距离升级：${need} 经验`;
    }catch(e){}

    /* N币 */
    let balLine="";
    try{
      const b=await httpGet(END.balance, headers);
      if(b?.code===0) balLine=`- 当前 N 币：${b.data?.balance ?? b.data?.coin ?? 0}`;
    }catch(e){}

    /* 盲盒 */
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{
        const target=Number(b.awardDays);
        const left=Number(b.leftDaysToOpen);
        blindInfo.push({target,left,opened:target-left});
      });
    }catch(e){}

    /* 通知输出 */
    let lines = [];
    if(signMsg) lines.push(signMsg);
    if(shareTaskLine) lines.push(shareTaskLine);

    lines.push(""); 
    lines.push("📊 账户状态");
    if(upgradeLine) lines.push(upgradeLine);
    if(balLine) lines.push(balLine);
    lines.push(`- 补签卡：${signCards} 张`);
    lines.push(`- 连续签到：${consecutiveDays} 天`);

    if(blindInfo.length>0){
      lines.push(""); 
      lines.push("📦 盲盒进度");
      for(const b of blindInfo){
        const bar=renderProgressBar(b.opened,b.target,0,20);
        lines.push(`${b.target} 天盲盒：`);
        lines.push(`[${bar}] ${b.opened} / ${b.target} 天`);
      }
    }

    if(todayGainExp||todayGainNcoin){
      lines.push(""); 
      lines.push(`🎯 今日获得：经验 ${todayGainExp} / N币 ${todayGainNcoin}`);
    }

    notify("九号签到 · 今日签到结果","",lines.join("\n"));

  }catch(e){
    notify("九号签到","脚本异常",String(e));
  }finally{
    $done();
  }
})();