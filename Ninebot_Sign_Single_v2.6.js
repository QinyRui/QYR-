/*
Ninebot_Sign_Single_v2.6.js
最终版（增强）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（来自余额接口）
- 7天 / 666天 盲盒进度条（默认：7天用5格，666天用12格）
- 今日分享任务状态
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
const RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 12000;

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };
const nowStr = () => new Date().toLocaleString();

const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";

const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004", // 新 N币余额接口
  credits: "https://api5-h5-app-bj.ninebot.com/web/credit/my-detail", // 新积分接口
  shareTask: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/share"
};

function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT }) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts++;
      const opt = { url, headers, timeout };
      if (method === "POST") opt.body = body === null ? "{}" : body;
      const cb = (err, resp, data) => {
        if (err) {
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if (attempts < MAX_RETRY && shouldRetry) {
            console.warn(`[${nowStr()}] warn 请求失败：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(tryOnce, RETRY_DELAY);
            return;
          } else { reject(err); return; }
        }
        try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({ raw: data }); }
      };
      if (method === "GET") $httpClient.get(opt, cb);
      else $httpClient.post(opt, cb);
    };
    tryOnce();
  });
}
function httpGet(url, headers) { return requestWithRetry({ method: "GET", url, headers }); }
function httpPost(url, headers, body = "{}") { return requestWithRetry({ method: "POST", url, headers, body }); }

function log(level, ...args) {
  const t = nowStr();
  const text = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  if (level === "info") console.log(`[${t}] info ${text}`);
  else if (level === "warn") console.warn(`[${t}] warn ${text}`);
  else if (level === "error") console.error(`[${t}] error ${text}`);
  else console.log(`[${t}] ${text}`);
}
function logStart(msg) { console.log(`[${nowStr()}] ======== ${msg} ========`); }

const captureOnlyStatus = isRequest && $request.url && $request.url.includes("/portal/api/user-sign/v2/status");
if (captureOnlyStatus) {
  try {
    logStart("进入抓包写入流程");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";
    let changed = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }
    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info", "抓包写入成功", { auth: mask(auth), deviceId: mask(dev) });
    } else { log("info", "抓包数据无变化"); }
  } catch (e) { log("error", "抓包异常：", e); }
  $done({});
}

const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) !== "false",
  notify: read(KEY_NOTIFY) !== "false",
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  notifyFail: read(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

logStart("九号自动签到开始");
log("info", "当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, autoRepair: cfg.autoRepair, titlePrefix: cfg.titlePrefix });

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn", "终止：未读取到账号信息");
  $done();
}

function mask(s) { if (!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) { const pct = total>0?progress/total:0; const filled = Math.round(pct*width); return '█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled)); }

(async () => {
  try {
    const headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    log("info", "查询签到状态...");
    let st = null;
    try { st = await httpGet(`${END.status}?t=${Date.now()}`, headers); log("info", "状态返回：", st && (st.code!==undefined ? `code:${st.code}` : st)); } 
    catch (e) { log("warn", "状态请求异常：", String(e)); }

    const consecutiveDays = st && st.code===0 ? (st.data?.consecutiveDays??0) : null;
    const signCards = st && st.code===0 ? (st.data?.signCardsNum??0) : null;

    log("info", "发送签到请求...");
    let signResp=null; try{signResp=await httpPost(END.sign, headers, JSON.stringify({deviceId:cfg.DeviceId}));} catch(e){log("warn","签到请求异常：",String(e));}

    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(signResp){
      if(signResp.code===0||signResp.code===1){
        const nCoin = Number(signResp.data?.nCoin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin; todayGainExp += score;
        signMsg=`🎉 今日签到成功\n🎁 已得 N币: ${nCoin}${score?`\n🏆 已得 积分: ${score}`:""}`;
      } else if(signResp.code===540004||/已签到/.test(signResp.msg??"")){
        signMsg=`⚠️ 今日已签到`;
        const nCoin = Number(signResp.data?.nCoin??0);
        const score = Number(signResp.data?.score??0);
        if(nCoin) todayGainNcoin+=nCoin; if(score) todayGainExp+=score;
        if(nCoin||score) signMsg+=`\n🎁 本次已得 N币: ${nCoin}${score?` / 积分: ${score}`:""}`;
      } else { signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
    } else { signMsg=`❌ 签到请求异常`; if(!cfg.notifyFail) signMsg=""; }

    let balMsg="";
    try{
      const bal=await httpGet(END.balance, headers);
      if(bal && bal.code===0) balMsg=`💰 N币余额：${bal.data?.balance??0}`;
    }catch(e){log("warn","余额查询异常：",String(e));}

    let creditLine="", upgradeLine="";
    try{
      const creditData=await httpGet(END.credits, headers);
      if(creditData && creditData.code===0 && creditData.data){
        const myCredits=Number(creditData.data?.my_credits??0);
        const level=Number(creditData.data?.level??0);
        const credit_upgrade=creditData.data?.msg?.credit_upgrade??"";
        creditLine=`\n🏅 当前积分：${myCredits}`;
        upgradeLine=`\n📈 当前经验：${myCredits}（LV.${level}），${credit_upgrade}`;
      }
    }catch(e){log("warn","积分/升级查询异常：",String(e));}

    let shareTaskLine="";
    try{
      const shareData=await httpGet(END.shareTask, headers);
      if(shareData && Array.isArray(shareData.data)){
        const todayShare = shareData.data.find(t=>t.title==="每日分享");
        if(todayShare) shareTaskLine=`\n📌 今日分享任务：\n- ${todayShare.rewardStatus===3?'已完成':'未完成'}，获得 ${todayShare.rewardQuantity} N币`;
      }
    }catch(e){log("warn","分享任务查询异常：",String(e));}

    let blindMsg="", blindProgressInfo=[];
    try{
      const box=await httpGet(END.blindBoxList, headers);
      const notOpened=box?.data?.notOpenedBoxes||[];
      if(Array.isArray(notOpened)&&notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays); const left=Number(b.leftDaysToOpen); const opened=Math.max(0,target-left);
          blindProgressInfo.push({target,left,opened});
        });
      }
      blindProgressInfo.forEach(info=>{
        const width=(info.target===7?5:(info.target===666?12:12));
        const bar=progressBarSimple(info.opened,info.target,width);
        blindMsg+=`\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });
    }catch(e){log("warn","盲盒列表查询异常：",String(e));}

    const consecutiveLine=`\n🗓 连续签到：${consecutiveDays??'?'} 天\n🎫 补签卡：${signCards??0} 张`;

    let notifyBody="";
    if(signMsg) notifyBody+=signMsg;
    if(creditLine) notifyBody+=creditLine;
    if(todayGainExp) notifyBody+=`\n🎯 今日获得经验/积分（合计）：${todayGainExp}`;
    if(todayGainNcoin) notifyBody+=`\n🎯 今日获得 N币（来自签到）：${todayGainNcoin}`;
    if(upgradeLine) notifyBody+=upgradeLine;
    if(balMsg) notifyBody+=`\n${balMsg}`;
    notifyBody+=consecutiveLine;
    if(shareTaskLine) notifyBody+=shareTaskLine;
    if(blindMsg) notifyBody+=blindMsg;

    if(cfg.notify && notifyBody.trim()){
      notify(cfg.titlePrefix || "九号签到","签到结果",notifyBody);
      log("info","发送通知：",cfg.titlePrefix,notifyBody.replace(/\n/g," | "));
    } else { log("info","通知已禁用或无内容，跳过发送。"); }

  } catch(e){
    log("error","主流程未捕获异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e));
  } finally{
    logStart("九号自动签到结束");
    $done();
  }
})();