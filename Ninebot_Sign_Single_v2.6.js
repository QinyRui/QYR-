/***********************************************
 Ninebot_Sign_Single_v2.6.js  （版本 D · 日志修复版）
 功能：抓包写入、自动签到、分享任务、盲盒、经验/N币查询、通知美化
 说明：优先读取 $argument.progressStyle -> 回退 BoxJS ninebot.progressStyle
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const IS_ARG = typeof $argument !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

function readPS(key) { try { if(HAS_PERSIST) return $persistentStore.read(key); } catch{} return null; }
function writePS(val, key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); }catch{} return false; }
function notify(title, sub, body){ if(HAS_NOTIFY) $notification.post(title, sub, body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_PROGRESS="ninebot.progressStyle";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* Retry helpers */
const MAX_RETRY=3, RETRY_DELAY=1500, REQUEST_TIMEOUT=12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST") opts.body=body===null?"{}":body;
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err?.error||err?.message||err);
          const shouldRetry=/(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts<MAX_RETRY && shouldRetry) {
            logWarn(`请求错误：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            return setTimeout(once,RETRY_DELAY);
          }
          return reject(err);
        }
        try{ resolve(JSON.parse(data||"{}")); }catch{ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb);
      else $httpClient.post(opts,cb);
    };
    once();
  });
}
function httpGet(url,headers={}){ return requestWithRetry({method:"GET",url,headers}); }
function httpPost(url,headers={},body="{}"){ return requestWithRetry({method:"POST",url,headers,body}); }

/* Logging (改为 C 版本方式，确保对象能打印) */
function logInfo(...args) {
  const dbg = readPS(KEY_DEBUG);
  if(dbg==="false") return;
  console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
}
function logWarn(...args){ console.warn(`[${nowStr()}] warn ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }
function logErr(...args){ console.error(`[${nowStr()}] error ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`); }

/* Progress bar */
const PROGRESS_STYLES = [
  ["█","░"],["▓","░"],["▰","▱"],["●","○"],
  ["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]
];
function renderProgressBar(cur,total,style=0,len=20){
  try{
    style=Number(style)||0;
    const [F,E] = PROGRESS_STYLES[style]||PROGRESS_STYLES[0];
    const ratio = total>0 ? cur/total : 0;
    const f = Math.round(ratio*len);
    return F.repeat(f)+E.repeat(Math.max(0,len-f));
  }catch{return "██████------";}
}

/* Capture */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest = IS_REQUEST && CAPTURE_PATTERNS.some(p=>($request?.url||"").includes(p));
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程（增强版）");
    const h=$request.headers||{};
    const auth=h.Authorization||h.authorization||"";
    const dev=h.DeviceId||h.deviceid||h.device_id||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";

    logInfo("抓包 URL：", capUrl);
    logInfo("抓包 Header（部分隐藏）", { Authorization: auth?auth.slice(0,6)+"..."+auth.slice(-4):"", DeviceId: dev?dev.slice(0,6)+"..."+dev.slice(-4):"", UA: ua?"[present]":"[missing]" });

    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logInfo("捕获分享接口写入：", base); }
    }

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入");
      logInfo("抓包写入成功");
    }else logInfo("抓包数据无变化");
  }catch(e){ logErr("抓包异常",e);}
  return $done({});
}

/* Config */
const argProgressStyle = IS_ARG && $argument.progressStyle!==undefined ? Number($argument.progressStyle):null;
const boxProgressStyle = Number(readPS(KEY_PROGRESS)||0);
const progressStyle = argProgressStyle!==null ? argProgressStyle : boxProgressStyle;

const cfg = {
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  userAgent: readPS(KEY_UA)||"",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  debug: readPS(KEY_DEBUG)!=="false",
  notify: readPS(KEY_NOTIFY)!=="false",
  autoOpenBox: readPS(KEY_AUTOBOX)==="true",
  titlePrefix: readPS(KEY_TITLE)||"九号签到",
  progressStyle
};

logInfo("九号自动签到开始");
logInfo("当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle });

if(!cfg.Authorization||!cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并执行签到/分享动作写入数据");
  logWarn("终止：未读取到账号信息（Authorization/DeviceId）");
  return $done();
}

/* Headers */
function makeHeaders(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type":"application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone) Segway/6",
    "platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"
  };
}

/* Utilities */
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
  try{
    const headers=makeHeaders();

    logInfo("查询签到状态...");
    let statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    logInfo("签到状态返回：", statusResp);

    const statusData = statusResp?.data||{};
    const consecutiveDays = statusData.consecutiveDays??0;
    const signCards = statusData.signCardsNum??0;
    const currentSignStatus = statusData.currentSignStatus??null;

    let signMsg="", todayGainExp=0, todayGainNcoin=0;

    if(currentSignStatus===0||currentSignStatus==null){
      logInfo("今日未签到，尝试执行签到...");
      const signResp = await httpPost(END.sign, headers, JSON.stringify({deviceId:cfg.DeviceId}));
      logInfo("签到接口返回：", signResp);
      if(signResp?.code===0 || signResp?.code===1){
        const nCoin = Number(signResp.data?.nCoin??signResp.data?.coin??0);
        const score = Number(signResp.data?.score??0);
        todayGainNcoin+=nCoin;
        todayGainExp+=score;
        signMsg=`🎉 今日签到：成功`;
      }else signMsg=`❌ 今日签到失败：${signResp?.msg||"未知错误"}`;
    }else {
      signMsg="🎉 今日签到：已签到";
      logInfo("检测到今日已签到，跳过签到接口");
    }

    /* 分享任务 */
    let shareTaskLine="", shareGain=0;
    if(cfg.shareTaskUrl){
      let share=null;
      try{ share = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({page:1,size:20})); }
      catch(e){ try{ share = await httpGet(cfg.shareTaskUrl, headers); }catch{} }
      const list = Array.isArray(share?.data?.list)?share.data.list:[];
      const today = todayKey();
      list.forEach(it=>{
        const t=Number(it.occurrenceTime||it.time||it.ts||0);
        if(t && toDate(t)===today){
          shareGain += Number(it.count??it.score??0);
        }
      });
      if(shareGain>0){
        todayGainNcoin+=shareGain;
        shareTaskLine = `🎁 今日分享奖励：+${shareGain} N币`;
      }
      logInfo("分享任务处理完成，获得 N币：", shareGain);
    }

    /* 查询经验等级 */
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
      logInfo("经验信息：", d);
    }catch(e){ logWarn("经验查询异常：", String(e)); }

    /* 查询 N 币余额 */
    let balLine="";
    try{
      const b=await httpGet(END.balance, headers);
      if(b?.code===0) balLine=`- 当前 N币：${b.data?.balance??0}`;
      logInfo("余额查询：", b);
    }catch(e){ logWarn("余额查询异常：", String(e)); }

    /* 盲盒 */
    let blindInfo=[];
    try{
      const box=await httpGet(END.blindBoxList, headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{
        const target=Number(b.awardDays);
        const left=Number(b.leftDaysToOpen);
        blindInfo.push({target,left,opened:target-left});
      });
      logInfo("盲盒列表：", blindInfo);
    }catch(e){ logWarn("盲盒查询异常：", String(e)); }

    /* 自动开 7 天盲盒 */
    if(cfg.autoOpenBox){
      for(const b of blindInfo){
        if(b.target===7 && b.left===0){
          try{
            const r=await httpPost(END_OPEN.openSeven, headers, JSON.stringify({}));
            if(r?.code===0) notify(cfg.titlePrefix,"盲盒开启","7天盲盒奖励已领取");
            logInfo("自动开启 7 天盲盒返回：", r);
          }catch(e){ logWarn("7天盲盒开箱异常：", String(e)); }
        }
      }
    }

    /* 构建通知 */
    let lines=[];
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
        const w=b.target===7?18:22;
        const bar=renderProgressBar(b.opened,b.target,cfg.progressStyle,w);
        lines.push(`${b.target} 天盲盒：`);
        lines.push(`${bar} ${b.opened} / ${b.target} 天`);
      }
    }

    if(todayGainExp||todayGainNcoin){
      lines.push("");
      lines.push(`🎯 今日获得：经验 ${todayGainExp} / N币 ${todayGainNcoin}`);
    }

    if(cfg.notify) notify(cfg.titlePrefix+" · 今日签到结果","",lines.join("\n"));
    logInfo("九号自动签到完成，通知已发送。");

  }catch(e){
    logErr("主流程异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }finally{
    logInfo("九号自动签到结束");
    $done();
  }
})();