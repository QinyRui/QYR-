/*
Ninebot_Sign_Single_v2.6.js
最终整合版（自动抓包写入 shareTaskUrl + 自动签到 + 自动完成分享 + 自动盲盒开启）
更新：2025-11-25（整合版）
说明：
- 抓包写入匹配：/status, /sign, /service/2/app_log/
- 自动写入 BoxJS keys: ninebot.authorization, ninebot.deviceId, ninebot.userAgent, ninebot.shareTaskUrl
- 运行时读取 BoxJS 配置，执行签到/分享/盲盒逻辑
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

// Endpoints (常用)
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};
// 盲盒开箱（7天）端点 — 常见命名，若不正确可按抓包改为实际返回路径
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

// ---------- 抓包写入（增强日志：总是输出捕获的 URL & Header） ----------
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

    // 总是打印抓到的信息，便于调试
    log("info","抓包捕获 URL：", captureUrl);
    log("info","抓包捕获 Header（部分隐藏）：", { Authorization: mask(auth), DeviceId: mask(dev), "User-Agent": ua?("[present]"):("[missing]") });

    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){ write(auth,KEY_AUTH); changed=true; }
    if(dev && read(KEY_DEV)!==dev){ write(dev,KEY_DEV); changed=true; }
    if(ua && read(KEY_UA)!==ua){ write(ua,KEY_UA); changed=true; }

    // 若匹配到分享接口则写入 shareTaskUrl（写入不带参数部分）
    if(captureUrl.includes("/service/2/app_log/")){
      const baseShareUrl = captureUrl.split("?")[0];
      if(read(KEY_SHARE_URL)!==baseShareUrl){ write(baseShareUrl,KEY_SHARE_URL); changed=true; }
      log("info","捕获分享接口 URL（写入候选）：", baseShareUrl);
    }

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS");
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
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到"
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
function progressBarSimple(progress,total,width){ const pct=total>0?progress/total:0; const filled=Math.round(pct*width); return '█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled)); }

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

    // 1) 查询状态（一定要先查，避免重复签到）
    log("info","查询签到状态...");
    let stResp = null;
    try{ stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }catch(e){ log("warn","状态请求异常：", String(e)); }
    const statusData = stResp?.data || {};
    const consecutiveDays = (statusData?.consecutiveDays ?? statusData?.continuousDays) ?? 0;
    const signCards = (statusData?.signCardsNum ?? statusData?.remedyCard) ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null; // 0 未签到 / 1 已签到
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    log("info","签到状态：", { consecutiveDays, signCards, currentSignStatus, blindBoxStatus });

    // 2) 根据状态决定是否执行签到
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0, signResp = null;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      // currentSignStatus === 0 -> 未签到 -> 执行签到
      log("info","检测到今日未签到，尝试执行签到...");
      try{
        signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      }catch(e){
        log("warn","签到请求异常：", String(e));
      }

      if(signResp){
        // 常见返回 code 0 成功, 1 也可能表示成功，按之前逻辑保留
        if(signResp.code===0 || signResp.code===1){
          const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `🎁 今日签到获得 N币: ${nCoin} / 积分: ${score}`;
          log("info","签到成功：", signMsg);
        } else if(signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `⚠️ 今日已签到（接口返回）`;
          log("info","签到接口返回：今日已签到");
        } else {
          signMsg = `❌ 签到失败：${signResp.msg ?? JSON.stringify(signResp)}`;
          log("warn","签到失败：", signResp);
          if(!cfg.notifyFail) signMsg = "";
        }
      } else {
        signMsg = `❌ 签到请求异常（网络/超时）`;
        log("warn","签到未获得响应或解析失败");
        if(!cfg.notifyFail) signMsg = "";
      }
    } else if(currentSignStatus === 1){
      signMsg = `⚠️ 今日已签到`;
      log("info","检测到今日已签到，跳过签到接口调用");
    } else {
      // 未知状态，仍尝试签到（保险）
      log("warn","签到状态未知，尝试执行签到以确保成功");
      try{
        signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
        if(signResp?.code===0 || signResp?.code===1){
          const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `🎁 今日签到获得 N币: ${nCoin} / 积分: ${score}`;
          log("info","签到成功（未知状态下）：", signMsg);
        } else {
          log("warn","未知状态签到返回：", signResp);
        }
      }catch(e){ log("warn","未知状态签到请求异常：", String(e)); }
    }

    // 3) 自动完成分享任务（如果配置了 shareTaskUrl）
    let shareGain = 0, shareTaskLine = "";
    if(cfg.shareTaskUrl){
      try{
        log("info","尝试查询分享任务（可配置接口）:", cfg.shareTaskUrl);
        // 请求获取分享任务/流水（具体返回结构依接口而定）
        const shareListResp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({ page: 1, size: 20 }));
        log("info","分享任务列表原始数据：", shareListResp);
        // 尝试解析通用结构：data.list 或 data
        const listArr = Array.isArray(shareListResp.data?.list) ? shareListResp.data.list : (Array.isArray(shareListResp.data) ? shareListResp.data : []);
        const today = todayKey();

        // 如果接口是历史流水（occurrenceTime），统计今天的分享获得
        const todayShares = listArr.filter(item => {
          try{
            const t = Number(item?.occurrenceTime || item?.time || item?.ts || 0);
            if(!t) return false;
            return toDateKeyFromSec(t) === today;
          }catch(e){ return false; }
        });

        // 如果列表项有 count/score 字段则累计，否则尝试完成未完成任务
        if(todayShares.length > 0){
          todayShares.forEach(it => { shareGain += Number(it.count ?? it.score ?? 0); });
          if(shareGain>0) shareTaskLine = `🎁 今日分享任务获得 积分: ${shareGain}`;
          todayGainExp += shareGain;
          log("info","已统计今日分享流水积分：", shareGain);
        } else {
          // 若列表没有流水但存在任务结构（含 completed/type/id/score），尝试自动完成未完成的分享任务
          const tasks = Array.isArray(shareListResp.data?.tasks) ? shareListResp.data.tasks : listArr;
          const unfinished = (tasks || []).filter(item=>{
            const type = String(item?.type || item?.taskType || "").toLowerCase();
            const completed = (item?.completed===0 || item?.completed===false) ? false : Boolean(item?.completed);
            // 依据时间或默认认为今日任务（有些接口没有时间）
            return type.includes("share") && !completed;
          });

          log("info","尝试匹配未完成分享任务数：", unfinished.length);
          for(const t of unfinished){
            try{
              const taskId = t.id || t.taskId || t.task_id;
              if(!taskId) continue;
              // 完成分享动作的通用请求（接口可能与查询不同，使用相同 URL 尝试）
              const resp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({ taskId, action: "complete" }));
              log("info","尝试完成分享任务返回：", resp);
              if(resp?.code===0){
                shareGain += Number(t.score || t.reward || 0);
                log("info","自动完成分享任务成功", taskId, t.score || 0);
              } else {
                log("warn","自动完成分享任务返回非成功：", resp);
              }
            }catch(e){
              log("warn","自动完成单条分享任务异常：", String(e));
            }
          }
          if(shareGain>0) { shareTaskLine = `🎁 今日分享任务获得 积分: ${shareGain}`; todayGainExp += shareGain; }
        }
      }catch(e){
        log("warn","分享任务处理异常：", String(e));
      }
    } else {
      log("info","未配置分享任务接口 shareTaskUrl，跳过分享任务处理");
    }

    // 4) 查询积分/经验信息
    let upgradeLine = "";
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      if(creditInfo && creditInfo.code !== undefined){
        const data = creditInfo.data || {};
        const credit = Number(data.credit ?? 0);
        const level = data.level ?? null;
        let need = 0;
        if(data.credit_upgrade){
          const m = String(data.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
          if(m && m[1]) need = Number(m[1]);
        } else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){
          need = data.credit_range[1] - credit;
        }
        upgradeLine = `📈 当前经验：${credit}${level?`（LV.${level}）`:''}，\n距离升级还需 ${need}`;
      } else log("warn","积分/经验接口返回格式异常或空");
    }catch(e){ log("warn","经验信息查询异常：", String(e)); }

    // 5) 余额
    let balMsg = "";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balMsg = `💰 N币余额：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
    }catch(e){ log("warn","余额查询异常：", String(e)); }

    // 6) 盲盒（查询 & 自动开启）
    let blindMsg = "", blindProgressInfo = [];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b => {
          const target = Number(b.awardDays), left = Number(b.leftDaysToOpen), opened = Math.max(0, target - left);
          blindProgressInfo.push({ target, left, opened });
        });
      }
      blindProgressInfo.forEach(info => {
        const width = (info.target===7?5:(info.target===666?12:12));
        const bar = progressBarSimple(info.opened,info.target,width);
        blindMsg += `\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });

      // 自动开启逻辑：若 autoOpenBox 开启并存在 leftDaysToOpen == 0 的盲盒，尝试开启
      if(cfg.autoOpenBox && Array.isArray(notOpened) && notOpened.length>0){
        for(const b of notOpened){
          try{
            if(Number(b.leftDaysToOpen) === 0 && Number(b.awardDays) === 7){
              log("info","检测到 7 天盲盒可开启，尝试调用开箱接口...");
              try{
                const openResp = await httpPost(END_OPEN.openSeven, headers, JSON.stringify({})); // body 可能需要调整
                log("info","7天盲盒开箱接口返回：", openResp);
                if(openResp?.code===0){
                  notify(cfg.titlePrefix||"九号签到","盲盒开启","7天盲盒已自动开启并领取奖励");
                }
              }catch(e){ log("warn","7天盲盒开箱请求异常：", String(e)); }
            }
            // 如果存在其他周期的自动开启逻辑，可在此扩展
          }catch(e){ log("warn","盲盒自动开启处理单项异常：", String(e)); }
        }
      }
    }catch(e){ log("warn","盲盒列表查询异常：", String(e)); }

    // 7) 连续签到 & 补签卡
    const consecutiveLine = `🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;

    // 8) 汇总通知内容（按通知顺序）
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
      notify(cfg.titlePrefix||"九号签到","签到结果", notifyBodyArr.join("\n"));
      log("info","发送通知：", cfg.titlePrefix, notifyBodyArr.join(" | "));
    } else log("info","通知已禁用或无内容，跳过发送。");

  }catch(e){
    log("error","主流程未捕获异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常", String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();