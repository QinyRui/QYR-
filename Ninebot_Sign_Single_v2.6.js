/*
Ninebot_Sign_Single_v2.6.js
最终整合版（含 8 种进度条样式切换 + 美化通知）
更新：2025-11-26

功能要点：
- 抓包写入（/status, /sign, /service/2/app_log/）
- 自动签到、盲盒查询、余额/经验查询
- 可重放分享（若你有 share body 存储）
- 8 种进度条样式可切换（通过 BoxJS key `ninebot.progressStyle` 或 Loon 插件参数）
- 通知为美化版（去掉分享动作显示）
- 兼容 Loon/Surge/QuanX 环境（尽量避免 $argument 依赖导致错误）
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k) => { if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k); return false; };
const notify = (title,sub,body) => { if(typeof $notification!=="undefined") $notification.post(title,sub,body); };
const nowStr = () => new Date().toLocaleString();

// BoxJS keys (增加 progressStyle)
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
const KEY_PROGRESS="ninebot.progressStyle";

// Endpoints
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList:"https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = { openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

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

// POST base64 (用于分享重放，如果你存有 base64 body)
function postBase64(url, headers = {}, bodyBase64 = "", timeout = REQUEST_TIMEOUT){
  return new Promise((resolve,reject)=>{
    const opts = { url, headers, timeout, body: bodyBase64 };
    opts["body-base64"] = true;
    $httpClient.post(opts, (err, resp, data) => {
      if(err) return reject(err);
      try{ resolve(JSON.parse(data||"{}")); }catch(e){ resolve({raw:data}); }
    });
  });
}

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

// ---------- 抓包写入（status/sign/app_log） ----------
const captureUrls = [
  "/portal/api/user-sign/v2/status",
  "/portal/api/user-sign/v2/sign",
  "/service/2/app_log/"
];
const isCaptureRequest = isRequest && $request.url && captureUrls.some(u => $request.url.includes(u));
if(isCaptureRequest){
  try{
    logStart("进入抓包写入流程");
    const h=$request.headers||{};
    const auth = h["Authorization"]||h["authorization"]||"";
    const dev = h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    const captureUrl = $request.url || "";

    log("info","抓包 URL：", captureUrl);
    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){ write(auth,KEY_AUTH); changed=true; }
    if(dev && read(KEY_DEV)!==dev){ write(dev,KEY_DEV); changed=true; }
    if(ua && read(KEY_UA)!==ua){ write(ua,KEY_UA); changed=true; }

    if(captureUrl.includes("/service/2/app_log/")){
      const baseShareUrl = captureUrl.split("?")[0];
      if(read(KEY_SHARE_URL)!==baseShareUrl){ write(baseShareUrl,KEY_SHARE_URL); changed=true; }
    }

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS");
      log("info","抓包写入成功",{auth:mask(auth),deviceId:mask(dev),shareTaskUrl:read(KEY_SHARE_URL)});
    } else log("info","抓包数据无变化");
  }catch(e){log("error","抓包异常：", e);}
  $done({});
}

// ---------- 读取配置 ----------
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
  titlePrefix: read(KEY_TITLE)||"九号签到",
  // progress style from BoxJS if set
  boxjsProgress: read(KEY_PROGRESS) || ""
};

logStart("九号自动签到开始");
log("info","当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, progressStyleBox: cfg.boxjsProgress });

// 基本检查
if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix,"未配置 Token","请先抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn","终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

// ---------- 工具函数 ----------
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d=new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// ---------- 进度条渲染模块（8 种样式） ----------
function renderProgressByStyle(opened, total, style){
  const pct = total>0? (opened/total) : 0;
  const percent = Math.round(pct*100);
  // map style labels to keys (allow either Chinese label or index)
  const s = (style||"①条形").toString();

  // choose visual length depending on total: but keep stable length for notifications
  const LEN = 20;

  const filledCount = Math.round(pct*LEN);
  const emptyCount = Math.max(0, LEN-filledCount);

  switch(true){
    // ① 标准条形
    case /①|条形/.test(s):
      return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${opened} / ${total} 天`;
    // ② 圆角条形
    case /②|圆角/.test(s):
      return `⟦${'█'.repeat(filledCount)}${'─'.repeat(emptyCount)}⟧ ${opened} / ${total} 天`;
    // ③ 斜纹条形
    case /③|斜纹/.test(s):
      // interleave slashes to give slanted effect
      return `[${'█'.repeat(Math.ceil(filledCount/2))}${'/'.repeat(Math.floor(filledCount/2))}${'-'.repeat(emptyCount)}] ${opened} / ${total} 天`;
    // ④ 渐变风格
    case /④|渐变/.test(s):
      return `[${'■'.repeat(Math.round(filledCount*1.2))}${'▒'.repeat(Math.max(0, LEN-Math.round(filledCount*1.2)))}] ${opened} / ${total} 天`;
    // ⑤ Emoji 条形
    case /⑤|Emoji|表情/.test(s):
      const emojiFilled = '🍀'.repeat(Math.round(filledCount/2));
      const emojiEmpty = '⬜'.repeat(Math.round(emptyCount/2));
      return `${emojiFilled}${emojiEmpty} ${opened} / ${total} 天`;
    // ⑥ 块状等宽
    case /⑥|块状|等宽/.test(s):
      return `${'█ '.repeat(filledCount)}${'░ '.repeat(emptyCount)} ${opened} / ${total} 天`;
    // ⑦ 超细极简
    case /⑦|超细|极简/.test(s):
      return `${'|'.repeat(filledCount)}${'.'.repeat(emptyCount)} ${percent}%`;
    // ⑧ 双层进度
    case /⑧|双层/.test(s):
      return `［${'■'.repeat(filledCount)}${'□'.repeat(emptyCount)}］ ${opened} / ${total} 天`;
    default:
      return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${opened} / ${total} 天`;
  }
}

// ---------- 主流程 ----------
(async()=>{
  try{
    const headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json;charset=UTF-8",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // Attempt obtain progress style from multiple sources:
    // 1) Loon plugin argument (if present)
    // 2) global variable $argument.progressStyle (some runtimes)
    // 3) BoxJS stored key (cfg.boxjsProgress)
    let progressStyle = "①条形";
    try{
      if(typeof $argument !== "undefined" && $argument && $argument.progressStyle) progressStyle = $argument.progressStyle;
      else if(typeof $arguments !== "undefined" && $arguments && $arguments.progressStyle) progressStyle = $arguments.progressStyle;
    }catch(e){}
    if(cfg.boxjsProgress) progressStyle = cfg.boxjsProgress || progressStyle;

    log("info","选用进度条样式：", progressStyle);

    // 1) 查询状态（先查，避免重复签到）
    log("info","查询签到状态...");
    let stResp = null;
    try{ stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }catch(e){ log("warn","状态请求异常：", String(e)); }
    const statusData = stResp?.data || {};
    const consecutiveDays = statusData?.consecutiveDays ?? statusData?.continuousDays ?? 0;
    const signCards = statusData?.signCardsNum ?? statusData?.remedyCard ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null;

    // 2) 执行签到（若未签到）
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      log("info","检测到今日未签到，尝试执行签到...");
      try{
        const signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
        if(signResp?.code===0 || signResp?.code===1){
          const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `✨ 今日签到：成功\n🎁 奖励领取：未领取\n+${score} 经验\n+${nCoin} N 币`;
        } else if(signResp?.code===540004 || (signResp?.msg && /已签到/.test(signResp.msg))){
          signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`;
          log("info","签到接口返回：已签到");
        } else {
          signMsg = `❌ 今日签到失败`;
          log("warn","签到返回：", signResp);
        }
      }catch(e){ log("warn","签到请求异常：", String(e)); signMsg = `❌ 签到异常`; }
    } else {
      signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`;
    }

    // 3) 查询经验/等级
    let exp=0, level=0, needExp=0;
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      const data = creditInfo?.data || {};
      exp = Number(data.credit ?? 0);
      level = data.level ?? 0;
      if(data.credit_upgrade){ const m=String(data.credit_upgrade).match(/还需\s*([0-9]+)\s*/); if(m && m[1]) needExp = Number(m[1]); }
      else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){ needExp = data.credit_range[1] - exp; }
    }catch(e){ log("warn","经验查询异常：", String(e)); }

    // 4) 余额
    let coin = 0;
    try{ const bal = await httpGet(END.balance, headers); if(bal?.code===0) coin = bal.data?.balance ?? bal.data?.coin ?? 0; }catch(e){ log("warn","余额查询异常：", String(e)); }

    // 5) 盲盒 & 进度条
    let blindLines = [];
    try{
      let box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      // standard cycles prefer 7/30/66 else include all
      const cycles = [7,30,66];
      cycles.forEach(cycle=>{
        const b = (notOpened||[]).find(x=>Number(x.awardDays)===cycle);
        if(b){
          const target = Number(b.awardDays);
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindLines.push(`${target} 天盲盒：\n${renderProgressByStyle(opened, target, progressStyle)}`);
        }
      });
      // other boxes
      (notOpened||[]).forEach(b=>{
        const target = Number(b.awardDays);
        if(![7,30,66].includes(target)){
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindLines.push(`${target} 天盲盒：\n${renderProgressByStyle(opened, target, progressStyle)}`);
        }
      });
    }catch(e){ log("warn","盲盒查询异常：", String(e)); }

    // 6) 汇总通知（美化版，去掉分享动作）
    const title = `${cfg.titlePrefix || "九号智能电动车"} · 今日签到结果`;
    const notifyLines = [];
    notifyLines.push(signMsg);
    // rewards line was embedded in signMsg; if none, we still allow separate reward placeholder
    notifyLines.push("");
    notifyLines.push("📊 账户状态");
    notifyLines.push(`- 当前经验：${exp}（LV.${level}）`);
    notifyLines.push(`- 距离升级：${needExp} 经验`);
    notifyLines.push(`- 当前 N 币：${coin}`);
    notifyLines.push(`- 补签卡：${signCards} 张`);
    notifyLines.push(`- 连续签到：${consecutiveDays} 天`);
    if(blindLines.length>0){
      notifyLines.push("");
      notifyLines.push("📦 盲盒进度");
      notifyLines.push(...blindLines);
    }

    const body = notifyLines.join("\n");

    if(cfg.notify) {
      notify(title, "", body);
      log("info","发送通知：", title, body);
    } else log("info","通知已禁用，跳过发送。");

  }catch(e){
    log("error","主流程未捕获异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号智能电动车","脚本异常",String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();