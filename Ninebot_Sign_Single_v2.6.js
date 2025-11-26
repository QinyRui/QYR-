/*
Ninebot_Sign_Single_v2.6.js
最终整合版（含图形化盲盒进度条 & 详细通知 A）
更新：2025-11-26（final）
说明：
- 抓包写入匹配：/status, /sign, /service/2/app_log/
- 写入 BoxJS keys:
    ninebot.authorization
    ninebot.deviceId
    ninebot.userAgent
    ninebot.shareTaskUrl
    ninebot.shareBodyBase64
    ninebot.shareHeadersBase64
- 运行时读取 BoxJS 配置，执行签到/分享/领取/盲盒逻辑
- 通知为详细 A 模板（多段落、包含图形化进度条）
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
const KEY_SHARE_URL="ninebot.shareTaskUrl";
const KEY_SHARE_BODY="ninebot.shareBodyBase64";
const KEY_SHARE_HDR="ninebot.shareHeadersBase64";

// Endpoints
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxListAlt:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/boxes", // alt names seen in captures
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList:"https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
// open box endpoint (may vary; adjust if capture shows different)
const END_OPEN = {
  openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box"
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

// POST base64 body (for binary share replays)
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

// ---------- 抓包写入（增强日志） ----------
const captureUrls = [
  "/portal/api/user-sign/v2/status",
  "/portal/api/user-sign/v2/sign",
  "/service/2/app_log/"
];

const isCaptureRequest = isRequest && $request.url && captureUrls.some(u => $request.url.includes(u));

if(isCaptureRequest){
  try{
    logStart("进入抓包写入流程（增强版）");
    const h=$request.headers||{};
    const auth = h["Authorization"]||h["authorization"]||"";
    const dev = h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    const captureUrl = $request.url || "";

    log("info","抓包捕获 URL：", captureUrl);
    log("info","抓包捕获 Header（部分隐藏）：", { Authorization: mask(auth), DeviceId: mask(dev), "User-Agent": ua?("[present]"):("[missing]") });

    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){ write(auth,KEY_AUTH); changed=true; }
    if(dev && read(KEY_DEV)!==dev){ write(dev,KEY_DEV); changed=true; }
    if(ua && read(KEY_UA)!==ua){ write(ua,KEY_UA); changed=true; }

    if(captureUrl.includes("/service/2/app_log/")){
      const baseShareUrl = captureUrl.split("?")[0];
      const existingShareUrl = read(KEY_SHARE_URL)||"";
      if(existingShareUrl !== baseShareUrl){ write(baseShareUrl,KEY_SHARE_URL); changed=true; }
      try{
        // body may be binary/base64/raw depending on environment
        const bodyRaw = $request.body || $request.rawBody || "";
        if(bodyRaw && read(KEY_SHARE_BODY)!==bodyRaw){ write(bodyRaw, KEY_SHARE_BODY); changed=true; }
      }catch(e){ log("warn","无法读取 request body：", String(e)); }
      try{
        const sh = JSON.stringify(h);
        if(sh && read(KEY_SHARE_HDR)!==sh){ write(sh, KEY_SHARE_HDR); changed=true; }
      }catch(e){}
      log("info","捕获分享接口 URL（写入候选）：", baseShareUrl);
    }

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl / shareBody 已写入 BoxJS");
      log("info","抓包写入成功",{auth:mask(auth),deviceId:mask(dev),shareTaskUrl:read(KEY_SHARE_URL)});
    } else {
      log("info","抓包数据无变化（已写入 BoxJS 的数据与当前抓到的相同）");
    }
  }catch(e){
    log("error","抓包写入异常：", e);
  }
  $done({});
}

// ---------- 读取配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  shareTaskUrl: read(KEY_SHARE_URL)||"",
  shareBodyBase64: read(KEY_SHARE_BODY)||"", // may be base64 or raw depending on capture
  shareHeadersRaw: read(KEY_SHARE_HDR)||"",   // raw headers JSON string
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号智能电动车"
};

logStart("九号自动签到开始");
log("info","当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, autoRepair: cfg.autoRepair, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl });

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
function progressBarSimple(current,total,width){
  const pct = total>0 ? (current/total) : 0;
  const filled = Math.round(pct * width);
  const empty = Math.max(0, width - filled);
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + `] ${current} / ${total} 天`;
}
function makeProgressBar(current,total){ return progressBarSimple(current,total,20); }

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

    // 1) 查询状态（先查，避免重复签到）
    log("info","查询签到状态...");
    let stResp = null;
    try{ stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }catch(e){ log("warn","状态请求异常：", String(e)); }
    const statusData = stResp?.data || {};
    const consecutiveDays = (statusData?.consecutiveDays ?? statusData?.continuousDays) ?? 0;
    const signCards = (statusData?.signCardsNum ?? statusData?.remedyCard) ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null; // 0 未签到 / 1 已签到

    // 2) 执行签到（若未签到）
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0, signResp = null;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      log("info","检测到今日未签到，尝试执行签到...");
      try{
        signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      }catch(e){ log("warn","签到请求异常：", String(e)); }
      if(signResp){
        if(signResp.code===0 || signResp.code===1){
          const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `+${score} 经验\n+${nCoin} N 币`;
          log("info","签到成功：", signMsg);
        } else if(signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `今日已签到`;
          log("info","签到接口返回：今日已签到");
        } else {
          signMsg = `签到失败`;
          log("warn","签到失败：", signResp);
          if(!cfg.notifyFail) signMsg = "";
        }
      } else {
        signMsg = `签到网络异常`;
        log("warn","签到未获得响应或解析失败");
        if(!cfg.notifyFail) signMsg = "";
      }
    } else if(currentSignStatus === 1){
      signMsg = `今日已签到`;
      log("info","检测到今日已签到，跳过签到接口调用");
    }

    // 3) 重放分享动作（重放最后一次捕获的 body）并领取 reward
    let shareGain = 0, shareTaskLine = "", shareStatusLine = "未执行";
    try{
      if(cfg.shareBodyBase64 && cfg.shareTaskUrl){
        log("info","检测到分享 body 与 shareTaskUrl，尝试重放分享动作...");
        let shareHdrs = {};
        try{ shareHdrs = cfg.shareHeadersRaw ? JSON.parse(cfg.shareHeadersRaw) : {}; }catch(e){}
        const replayHeaders = {
          "Content-Type": shareHdrs["content-type"] || "application/octet-stream;tt-data=a",
          "User-Agent": cfg.userAgent || shareHdrs["user-agent"] || "Ninebot/3606"
        };
        if(shareHdrs["cookie"]) replayHeaders["cookie"] = shareHdrs["cookie"];
        // attempt replay
        let replayResp = null;
        try{
          // cfg.shareBodyBase64 may be raw or base64 depending on environment; we attempt base64 post if looks like base64
          replayResp = await postBase64(cfg.shareTaskUrl, replayHeaders, cfg.shareBodyBase64);
          log("info","分享动作重放返回：", replayResp);
          shareStatusLine = (replayResp?.e === 0 || replayResp?.message === "success" || replayResp?.msg === "success") ? "重放成功" : `重放返回：${replayResp?.msg || replayResp?.message || JSON.stringify(replayResp)}`;
        }catch(e){
          log("warn","分享动作重放异常：", String(e));
          shareStatusLine = "重放异常";
        }

        // 查询任务列表并领取
        const taskList = await httpGet(END.taskList, headers);
        log("info","分享任务列表查询：", taskList);
        const tasksArr = Array.isArray(taskList?.data) ? taskList.data : (Array.isArray(taskList?.data?.list) ? taskList.data.list : []);
        for(const t of tasksArr){
          try{
            const finished = (typeof t.finished !== "undefined") ? t.finished : (typeof t.completed !== "undefined" ? t.completed : (t.status===1));
            if(finished) continue;
            const taskId = t.taskId || t.id || t.task_id;
            if(!taskId) continue;
            log("info","尝试领取任务奖励，taskId=", taskId);
            const claim = await httpPost(END.reward, headers, JSON.stringify({ taskId }));
            log("info","奖励领取返回：", claim);
            if(claim?.code===0){
              const inc = Number(claim.data?.score ?? claim.data?.coin ?? 0);
              shareGain += inc;
            }
          }catch(e){
            log("warn","单个任务领取异常：", String(e));
          }
        }
        if(shareGain>0){ shareTaskLine = `+${shareGain} 分享奖励积分（已领取）`; todayGainExp += shareGain; }
      } else {
        log("info","未检测到分享 body 或 shareTaskUrl，跳过分享重放/领取");
        shareStatusLine = "无分享抓包";
      }
    }catch(e){
      log("warn","分享任务处理异常：", String(e));
      shareStatusLine = "分享处理异常";
    }

    // 4) 经验/等级查询
    let expMsg = "", levelMsg = "";
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      const data = creditInfo?.data || {};
      const credit = Number(data.credit ?? 0);
      const level = data.level ?? null;
      let need = 0;
      if(data.credit_upgrade){
        const m = String(data.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
        if(m && m[1]) need = Number(m[1]);
      } else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){
        need = data.credit_range[1] - credit;
      }
      expMsg = `当前经验：${credit}${level?`（LV.${level}）`:''}`;
      levelMsg = `距离升级还需 ${need}`;
    }catch(e){
      log("warn","经验信息查询异常：", String(e));
    }

    // 5) 余额查询
    let balMsg = "";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balMsg = `当前 N 币余额：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
    }catch(e){ log("warn","余额查询异常：", String(e)); }

    // 6) 盲盒查询（并生成进度条）
    let blindMsgLines = [];
    try{
      // try primary endpoint, fallback to alt
      let box = await httpGet(END.blindBoxList, headers);
      if(!box || !box.data) box = await httpGet(END.blindBoxListAlt, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      // map known cycles: 7,30,66 (if present)
      const cycles = [7,30,66];
      cycles.forEach(cycle=>{
        const b = (notOpened || []).find(x => Number(x.awardDays)===cycle);
        if(b){
          const target = Number(b.awardDays);
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindMsgLines.push(`${target}天盲盒：\n${makeProgressBar(opened, target)}`);
        }
      });
      // include any other notOpenedBoxes not in cycles
      (notOpened || []).forEach(b=>{
        const target = Number(b.awardDays);
        if(![7,30,66].includes(target)){
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindMsgLines.push(`${target}天盲盒：\n${makeProgressBar(opened, target)}`);
        }
      });
    }catch(e){ log("warn","盲盒列表查询异常：", String(e)); }

    // 7) 连续签到 & 补签卡
    const consecutiveLine = `连续签到：${consecutiveDays} 天`;
    const signCardLine = `补签卡：${signCards} 张`;

    // 8) 汇总通知（A 详细模板）构造
    const title = `${cfg.titlePrefix || "九号智能电动车"} · 今日签到结果`;
    const lines = [];

    // header lines: status indicators
    const statusLine = `✔ ${ (currentSignStatus===1 || signMsg.includes("已签到")) ? "今日已签到" : "今日签到已尝试" }`;
    const shareStatus = `分享：${shareStatusLine}${shareTaskLine?(" | " + shareTaskLine):""}`;
    const rewardStatus = shareGain>0 ? `奖励领取：成功 | 获得：${shareGain}` : `奖励领取：${shareGain>0?"已领取": "无/未领取"}`;

    // gains summary: from sign and share
    const gainLines = [];
    if(todayGainExp) gainLines.push(`+${todayGainExp} 经验`);
    if(todayGainNcoin) gainLines.push(`+${todayGainNcoin} N 币`);
    if(shareGain) gainLines.push(`+${shareGain} 分享积分`);

    // compose body
    lines.push(statusLine + "    " + shareStatus + "    " + rewardStatus);
    if(gainLines.length>0) lines.push(gainLines.join("    "));
    if(expMsg) lines.push(expMsg + "    " + levelMsg);
    if(balMsg) lines.push(balMsg);
    lines.push("");
    lines.push(consecutiveLine + "    " + signCardLine);
    if(blindMsgLines.length>0){
      lines.push("");
      lines.push("📦 盲盒进度：");
      blindMsgLines.forEach(l => lines.push(l));
    }
    // final body text
    const body = lines.join("\n");

    // send notification
    if(cfg.notify){
      notify(title, "", body);
      log("info","发送通知：", title, body);
    } else {
      log("info","通知已禁用，跳过发送。");
    }

  }catch(e){
    log("error","主流程未捕获异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号智能电动车","脚本异常",String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();