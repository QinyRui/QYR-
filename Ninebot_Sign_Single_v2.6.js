/*
Ninebot_Sign_Single_v2.6.js
最终整合版（自动抓包写入 shareTaskUrl + 自动签到 + 自动完成分享 + 自动盲盒开启
更新：2025-11-26
说明：
- 抓包写入匹配：/status, /sign, /service/2/app_log/
- 自动写入 BoxJS keys: ninebot.authorization, ninebot.deviceId, ninebot.userAgent, ninebot.shareTaskUrl
- 支持 8 种进度条样式（插件 UI 可选）
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
const KEY_PROGRESS_STYLE="ninebot.progressStyle"; // 新增插件 UI 控制进度条样式

// Endpoints (常用)
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

// ---------- 进度条样式（8 种） ----------
const PROGRESS_STYLES = [
  {name:"默认█░", bar:["█","░"]},
  {name:"方块■□", bar:["■","□"]},
  {name:"圆圈●○", bar:["●","○"]},
  {name:"星星★☆", bar:["★","☆"]},
  {name:"菱形◆◇", bar:["◆","◇"]},
  {name:"波浪≈∿", bar:["≈","∿"]},
  {name:"方形▇▢", bar:["▇","▢"]},
  {name:"细线▮▯", bar:["▮","▯"]}
];

function progressBar(progress,total,width=12,styleIndex=0){
  const style = PROGRESS_STYLES[styleIndex]?.bar || ["█","░"];
  const pct = total>0?progress/total:0;
  const filled = Math.round(pct*width);
  return style[0].repeat(filled)+style[1].repeat(Math.max(0,width-filled));
}
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
  titlePrefix: read(KEY_TITLE)||"九号签到",
  progressStyle: Number(read(KEY_PROGRESS_STYLE)||0)
};

logStart("九号自动签到开始");
log("info","当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle });

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

    // ---------- 1) 查询签到状态 ----------
    log("info","查询签到状态...");
    let stResp = null;
    try{ stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }catch(e){ log("warn","状态请求异常：", String(e)); }
    const statusData = stResp?.data || {};
    const consecutiveDays = (statusData?.consecutiveDays ?? statusData?.continuousDays) ?? 0;
    const signCards = (statusData?.signCardsNum ?? statusData?.remedyCard) ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null;
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    log("info","签到状态：", { consecutiveDays, signCards, currentSignStatus, blindBoxStatus });

    // ---------- 2) 执行签到 ----------
    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0, signResp = null;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      log("info","今日未签到，尝试执行签到...");
      try{
        signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
      }catch(e){ log("warn","签到请求异常：", String(e)); }

      if(signResp){
        if(signResp.code===0 || signResp.code===1){
          const nCoin = Number((signResp.data?.nCoin ?? signResp.data?.coin) ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `✨ 今日签到：成功\n🎁 奖励领取：未领取`;
          log("info","签到成功：", signMsg);
        } else if(signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`;
        } else {
          signMsg = `❌ 签到失败：${signResp.msg ?? JSON.stringify(signResp)}`;
          if(!cfg.notifyFail) signMsg = "";
        }
      } else {
        signMsg = `❌ 签到请求异常`;
        if(!cfg.notifyFail) signMsg = "";
      }
    } else {
      signMsg = `✨ 今日签到：已签到\n🎁 奖励领取：未领取`;
    }

    // ---------- 3) 查询积分 / 经验 ----------
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
        upgradeLine = `📊 账户状态\n- 当前经验：${credit}${level?`（LV.${level}）`:''}\n- 距离升级：${need} 经验`;
      }
    }catch(e){ log("warn","经验信息查询异常：", String(e)); }

    // ---------- 4) 查询 N币 / 补签卡 ----------
    let balMsg = "", consecutiveLine = "";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balMsg = `- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
    }catch(e){ log("warn","余额查询异常：", String(e)); }
    consecutiveLine = `- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天`;

    // ---------- 5) 查询盲盒 ----------
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

      // ---------- 6) 生成进度条 ----------
      const progressStyles = [
        ['█','░'], ['■','□'], ['▓','░'], ['▒','░'], ['█','-'], ['#','-'], ['■','-'], ['▓','-']
      ];
      const [full,empty] = progressStyles[cfg.progressStyle % progressStyles.length];

      const genBar = (opened,total,width=20)=>{
        const filled = Math.round(opened/total*width);
        return full.repeat(filled)+empty.repeat(Math.max(0,width-filled));
      };

      blindProgressInfo.forEach(info=>{
        const width = info.target===7?15:(info.target===30?20:25);
        const bar = genBar(info.opened, info.target, width);
        blindMsg += `\n${info.target} 天盲盒：\n[${bar}] ${info.opened} / ${info.target} 天`;
      });

    }catch(e){ log("warn","盲盒查询异常：", String(e)); }

    // ---------- 7) 汇总通知 ----------
    let notifyBodyArr = [];
    if(signMsg) notifyBodyArr.push(signMsg);
    if(upgradeLine) notifyBodyArr.push(upgradeLine);
    if(balMsg) notifyBodyArr.push(balMsg);
    if(consecutiveLine) notifyBodyArr.push(consecutiveLine);
    if(blindMsg) notifyBodyArr.push(`📦 盲盒进度${blindMsg}`);

    if(cfg.notify && notifyBodyArr.length>0){
      notify(cfg.titlePrefix||"九号签到","今日签到结果", notifyBodyArr.join("\n"));
      log("info","发送通知：", notifyBodyArr.join(" | "));
    }

  }catch(e){
    log("error","主流程未捕获异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常", String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();