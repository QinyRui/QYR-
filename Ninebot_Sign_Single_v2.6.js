/*
Ninebot_Sign_Single_v2.6.js
最终整合版（自动抓包写入 shareTaskUrl + 自动签到 + 自动领取奖励 + 美化通知）
更新：2025-11-26
说明：
- 抓包写入匹配：/status, /sign, /service/2/app_log/
- 自动写入 BoxJS keys: ninebot.authorization, ninebot.deviceId, ninebot.userAgent, ninebot.shareTaskUrl
- 运行时读取 BoxJS 配置，执行签到/领取奖励/盲盒逻辑
- 通知美化，去掉分享动作显示
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k) => { if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k); return false; };
const notifyFunc = (title,sub,body) => { if(typeof $notification!=="undefined") $notification.post(title,sub,body); };
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

// ---------- 抓包写入 ----------
const captureUrls = [
  "/portal/api/user-sign/v2/status",
  "/portal/api/user-sign/v2/sign",
  "/service/2/app_log/"
];

const isCaptureRequest = isRequest && $request.url && captureUrls.some(u => $request.url.includes(u));

if(isCaptureRequest){
  try{
    logStart("抓包写入流程");
    const h=$request.headers||{};
    const auth = h["Authorization"]||h["authorization"]||"";
    const dev = h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua = h["User-Agent"]||h["user-agent"]||"";
    const captureUrl = $request.url || "";

    log("info","抓包 URL：", captureUrl);
    log("info","抓包 Header：", { Authorization: mask(auth), DeviceId: mask(dev), "User-Agent": ua?("[present]"):("[missing]") });

    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){ write(auth,KEY_AUTH); changed=true; }
    if(dev && read(KEY_DEV)!==dev){ write(dev,KEY_DEV); changed=true; }
    if(ua && read(KEY_UA)!==ua){ write(ua,KEY_UA); changed=true; }

    if(captureUrl.includes("/service/2/app_log/")){
      const baseShareUrl = captureUrl.split("?")[0];
      if(read(KEY_SHARE_URL)!==baseShareUrl){ write(baseShareUrl,KEY_SHARE_URL); changed=true; }
      log("info","分享接口 URL（候选）：", baseShareUrl);
    }

    if(changed){
      notifyFunc("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl已写入 BoxJS");
      log("info","抓包写入成功",{auth:mask(auth),deviceId:mask(dev),shareTaskUrl:read(KEY_SHARE_URL)});
    } else log("info","抓包数据无变化");
  }catch(e){ log("error","抓包写入异常：", e); }
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
log("info","当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix });

// 基本检查
if(!cfg.Authorization || !cfg.DeviceId){
  notifyFunc(cfg.titlePrefix,"未配置 Token","请先抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn","终止：未读取到账号信息");
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

    // 1) 查询状态
    log("info","查询签到状态...");
    let stResp = null;
    try{ stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }catch(e){ log("warn","状态请求异常：", String(e)); }
    const statusData = stResp?.data || {};
    const consecutiveDays = (statusData?.consecutiveDays ?? statusData?.continuousDays) ?? 0;
    const signCards = (statusData?.signCardsNum ?? statusData?.remedyCard) ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null;
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    // 2) 执行签到
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      log("info","今日未签到，执行签到...");
      try{
        const signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
        if(signResp.code===0 || signResp.code===1){
          const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `✨ 今日签到：成功\n🎁 奖励领取：未领取`;
        } else if(signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`;
        } else { signMsg = `❌ 签到失败`; }
      }catch(e){ log("warn","签到异常：", String(e)); signMsg = `❌ 签到异常`; }
    } else { signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`; }

    // 3) 查询经验/积分
    let upgradeLine = "", exp=0, level=0, needExp=0;
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      if(creditInfo?.code!==undefined){
        const data = creditInfo.data || {};
        exp = Number(data.credit ?? 0);
        level = data.level ?? 0;
        if(data.credit_upgrade){ const m=String(data.credit_upgrade).match(/还需\s*([0-9]+)\s*/); needExp = m && m[1]?Number(m[1]):0; }
        else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){ needExp = data.credit_range[1]-exp; }
        upgradeLine = `📊 账户状态\n- 当前经验：${exp}（LV.${level}）\n- 距离升级：${needExp} 经验`;
      }
    }catch(e){ log("warn","经验信息查询异常：", String(e)); }

    // 4) 查询余额
    let coin = 0;
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) coin = bal.data?.balance ?? bal.data?.coin ?? 0;
    }catch(e){ log("warn","余额查询异常：", String(e)); }

    // 5) 查询盲盒
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
        const width = (info.target===7?16:(info.target===30?16:16));
        const bar = progressBarSimple(info.opened,info.target,width);
        blindMsg += `\n${info.target} 天盲盒：\n[${bar}] ${info.opened} / ${info.target} 天`;
      });
    }catch(e){ log("warn","盲盒查询异常：", String(e)); }

    // 6) 汇总通知
    const notifyBody = `${signMsg}\n${upgradeLine}\n- 当前 N 币：${coin}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n📦 盲盒进度${blindMsg}`;

    if(cfg.notify) notifyFunc(cfg.titlePrefix,"今日签到结果", notifyBody);

  }catch(e){ log("error","主流程异常：", e); if(cfg.notify) notifyFunc(cfg.titlePrefix,"脚本异常", String(e)); }
  finally{ logStart("九号自动签到结束"); $done(); }
})();