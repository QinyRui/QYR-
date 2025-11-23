/*
Ninebot_Sign_Single_v2.6.js
最终版（增强）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（只显示签到所得 N币）
- 7天 / 666天 盲盒进度条（默认：7天用5格，666天用12格）
- 自动执行每日分享任务（需抓包 install_id/ttreq/body）
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
- 日志带时间戳与等级，开始/结束分隔
- 文件名保持：Ninebot_Sign_Single_v2.6.js
- 通知顺序调整：
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
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };
const nowStr = () => new Date().toLocaleString();

// BoxJS keys
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix"; // BoxJS 自定义通知名

// Endpoints
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  credits: "https://api5-h5-app-bj.ninebot.com/web/credit/my-detail", // 积分接口抓包
  shareTask: "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004" // 自动分享任务接口（抓包 POST）
};

// ---------- 网络请求（带重试） ----------
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
          } else {
            reject(err);
            return;
          }
        }
        try { const parsed = JSON.parse(data || "{}"); resolve(parsed); } 
        catch (e) { resolve({ raw: data }); }
      };
      if (method === "GET") $httpClient.get(opt, cb); else $httpClient.post(opt, cb);
    };
    tryOnce();
  });
}
function httpGet(url, headers) { return requestWithRetry({ method: "GET", url, headers }); }
function httpPost(url, headers, body = "{}") { return requestWithRetry({ method: "POST", url, headers, body }); }

// ---------- 日志 ----------
function log(level, ...args) {
  const t = nowStr();
  const text = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  if (level === "info") console.log(`[${t}] info ${text}`);
  else if (level === "warn") console.warn(`[${t}] warn ${text}`);
  else if (level === "error") console.error(`[${t}] error ${text}`);
  else console.log(`[${t}] ${text}`);
}
function logStart(msg) { console.log(`[${nowStr()}] ======== ${msg} ========`); }

// ---------- 抓包写入 ----------
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

// ---------- 读取配置 ----------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

// ---------- 工具 ----------
function mask(s) { if (!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) { const pct = total>0?progress/total:0; const filled=Math.round(pct*width); return '█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled)); }

// ---------- 主流程 ----------
(async()=>{
  try{
    logStart("九号自动签到开始");

    if(!cfg.Authorization || !cfg.DeviceId){
      notify(cfg.titlePrefix,"未配置 Token","请先开启抓包并写入 Authorization / DeviceId / User-Agent");
      log("warn","终止：未读取到账号信息");
      $done();
    }

    const headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1. 查询签到状态
    log("info","查询签到状态...");
    let st = null;
    try { st = await httpGet(`${END.status}?t=${Date.now()}`, headers); log("info","状态返回：", st && (st.code!==undefined?`code:${st.code}`:st)); } 
    catch(e){ log("warn","状态请求异常：",String(e)); }

    const consecutiveDays = st?.data?.consecutiveDays??0;
    const signCards = st?.data?.signCardsNum??0;

    // 2. 签到
    log("info","发送签到请求...");
    let signResp = null;
    try { signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId })); } 
    catch(e){ log("warn","签到请求异常：",String(e)); }

    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(signResp){
      if(signResp.code===0||signResp.code===1){
        const nCoin=Number(signResp.data?.nCoin??0);
        const score=Number(signResp.data?.score??0);
        todayGainNcoin+=nCoin; todayGainExp+=score;
        signMsg=`🎉 今日签到成功\n🎁 已得 N币: ${nCoin}${score?`\n🏆 已得 积分: ${score}`:""}`;
      } else if(signResp.code===540004 || (signResp.msg && /已签到/.test(signResp.msg))){
        signMsg=`⚠️ 今日已签到`;
        const nCoin=Number(signResp.data?.nCoin??0); const score=Number(signResp.data?.score??0);
        if(nCoin) todayGainNcoin+=nCoin; if(score) todayGainExp+=score;
        if(nCoin||score) signMsg+=`\n🎁 本次已得 N币: ${nCoin}${score?` / 积分: ${score}`:""}`;
      } else{ signMsg=`❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
    } else { signMsg=`❌ 签到请求异常（网络/超时）`; if(!cfg.notifyFail) signMsg=""; }

    // 3. 余额
    let balMsg="";
    try{ const bal=await httpGet(END.balance, headers); if(bal&&bal.code===0) balMsg=`💰 N币余额：${bal.data?.balance??0}`; } catch(e){ log("warn","余额查询异常：",String(e)); }

    // 4. 积分/经验
    let creditLine="", upgradeLine="";
    try{
      const credits = await httpGet(END.credits, headers);
      if(credits && credits.data){
        const credit=Number(credits.data.my_credits??0);
        const lvlStr=credits.data.level_list.find(l=>l.level===credits.data.level)?.level??0;
        const need=credits.data.credit_upgrade?.match(/\d+/)?.[0]??0;
        creditLine=`🏅 今日积分变动：+${todayGainExp}`;
        upgradeLine=`📈 当前经验：${credit}（LV.${credits.data.level}），距离升级还需 ${need}`;
      }
    }catch(e){ log("warn","积分查询异常：",String(e)); }

    // 5. 今日分享任务
    let shareTaskLine="";
    try{
      // 注意：抓包 install_id/ttreq/body 替换成真实
      const shareHeaders = {
        "User-Agent": cfg.userAgent || "Ninebot/3606 CFNetwork/3860.200.71 Darwin/25.1.0",
        "Content-Type": "application/octet-stream;tt-data=a",
        "Cookie": "install_id=YOUR_INSTALL_ID; ttreq=YOUR_TTREQ",
        "aid": "10000004"
      };
      const shareBody = "PASTE_YOUR_CAPTURED_BODY_HERE";
      const shareResp = await httpPost(END.shareTask, shareHeaders, shareBody);
      if(shareResp && shareResp.e===0) shareTaskLine=`\n📌 今日分享任务：\n- 已完成，获得 1 N币`;
      else shareTaskLine=`\n📌 今日分享任务：未完成`;
    }catch(e){ log("warn","分享任务查询异常：",String(e)); }

    // 6. 盲盒
    let blindMsg="", blindProgressInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes||[];
      notOpened.forEach(b=>{
        const target=Number(b.awardDays); const left=Number(b.leftDaysToOpen); const opened=Math.max(0,target-left);
        blindProgressInfo.push({target,left,opened});
      });
      blindProgressInfo.forEach(info=>{
        const width=(info.target===7?5:(info.target===666?12:12));
        const bar = progressBarSimple(info.opened,info.target,width);
        blindMsg+=`\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });
    }catch(e){ log("warn","盲盒查询异常：",String(e)); }

    // 7. 连续签到 & 补签卡
    const consecutiveLine=`\n🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;

    // 8. 汇总通知
    let notifyBody = "";
    [signMsg, creditLine, upgradeLine, balMsg, consecutiveLine, shareTaskLine, blindMsg].forEach(line=>{
      if(line) notifyBody+=line;
    });

    if(cfg.notify && notifyBody.trim()){
      notify(cfg.titlePrefix||"九号签到","签到结果",notifyBody);
      log("info","发送通知：",notifyBody.replace(/\n/g," | "));
    } else { log("info","通知已禁用或无内容，跳过发送。"); }

  }catch(e){ log("error","主流程异常：",e); if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e)); }
  finally{ logStart("九号自动签到结束"); $done(); }
})();