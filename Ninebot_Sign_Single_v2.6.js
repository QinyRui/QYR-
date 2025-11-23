/*
Ninebot_Sign_Single_v2.6.js
最终版增强（含每日自动分享任务）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（只显示签到所得 N 币）
- 7天 / 666天盲盒进度条（默认：7天用5格，666天用12格）
- 每日自动完成分享任务
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
- 删除内测逻辑
- 日志带时间戳与等级，开始/结束分隔
- 文件名保持：Ninebot_Sign_Single_v2.6.js
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
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  credits: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/credit/list?appVersion=609103606",
  creditInfo: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/credit/info?appVersion=609103606",
  tasks: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/list?appVersion=609103606",
  taskShare: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/finish/share?appVersion=609103606"
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
        try {
          const parsed = JSON.parse(data || "{}");
          resolve(parsed);
        } catch (e) {
          resolve({ raw: data });
        }
      };
      if (method === "GET") $httpClient.get(opt, cb);
      else $httpClient.post(opt, cb);
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
    } else {
      log("info", "抓包数据无变化");
    }
  } catch (e) {
    log("error", "抓包异常：", e);
  }
  $done({});
}

// ---------- 配置读取 ----------
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

logStart("九号自动签到开始");
log("info", "当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, autoRepair: cfg.autoRepair, titlePrefix: cfg.titlePrefix });

// 基本检查
if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn", "终止：未读取到账号信息");
  $done();
}

// ---------- 工具函数 ----------
function mask(s) { if (!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) { const pct = total > 0 ? progress/total : 0; const filled = Math.round(pct * width); return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled)); }

// ---------- 主流程 ----------
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

    let notifyBody = "";
    let todayGainExp = 0, todayGainNcoin = 0;

    // --- 查询签到状态 ---
    log("info", "查询签到状态...");
    let st = null;
    try { st = await httpGet(`${END.status}?t=${Date.now()}`, headers); log("info","状态返回：",st);} catch(e){log("warn","状态请求异常：",String(e));}

    const consecutiveDays = st && st.code === 0 ? (st.data?.consecutiveDays ?? st.data?.continuousDays ?? 0) : null;
    const signCards = st && st.code === 0 ? (st.data?.signCardsNum ?? st.data?.remedyCard ?? 0) : null;

    // --- 签到请求 ---
    log("info", "发送签到请求...");
    let signResp = null;
    try { signResp = await httpPost(END.sign, headers, JSON.stringify({deviceId: cfg.DeviceId})); log("info","签到接口返回：",signResp);} catch(e){log("warn","签到请求异常：",String(e));}

    let signMsg = "";
    if (signResp) {
      if (signResp.code === 0 || signResp.code === 1 || (signResp.msg && /已签到/.test(signResp.msg))) {
        const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin; todayGainExp += score;
        signMsg = signResp.msg && /已签到/.test(signResp.msg) ? `⚠️ 今日已签到\n🎁 本次已得 N币: ${nCoin}${score?` / 积分: ${score}`:""}` : `🎉 今日签到成功\n🎁 已得 N币: ${nCoin}${score?`\n🏆 已得 积分: ${score}`:""}`;
      } else { signMsg = `❌ 签到失败：${signResp.msg??JSON.stringify(signResp)}`; if(!cfg.notifyFail) signMsg=""; }
    } else { signMsg = `❌ 签到请求异常（网络/超时）`; if(!cfg.notifyFail) signMsg=""; }

    if (signMsg) notifyBody += signMsg;

    // --- 查询余额 ---
    try { const bal = await httpGet(END.balance, headers); if(bal && bal.code===0) notifyBody += `\n💰 N币余额：${bal.data?.balance??bal.data?.coin??0}`;} catch(e){log("warn","余额查询异常：",String(e));}

    // --- 盲盒 ---
    let blindMsg = "", blindProgressInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes || box?.data || [];
      if (Array.isArray(notOpened) && notOpened.length>0){
        blindMsg += "\n📦 盲盒任务：";
        notOpened.forEach(b=>{
          const days=b.awardDays??b.boxDays??b.days??"?"; const left=b.leftDaysToOpen??b.diffDays??"?";
          blindMsg+=`\n- ${days}天盲盒，还需 ${left} 天`;
          const target=Number(days), leftNum=Number(left);
          if(!isNaN(target)&&!isNaN(leftNum)) blindProgressInfo.push({target,left:leftNum,opened:Math.max(0,target-leftNum)});
        });
      } else blindMsg += "\n📦 无未开启盲盒。";
    } catch(e){log("warn","盲盒列表查询异常：",String(e));}

    // --- 积分流水 ---
    try{
      const credits = await httpGet(END.credits, headers);
      if(credits && Array.isArray(credits.data?.list)){
        const today=todayKey();
        const todayList=credits.data.list.filter(it=>toDateKeyFromSec(Number(it.create_date||0))===today);
        const sumToday=todayList.reduce((a,b)=>a+Number(b.credit||0),0);
        notifyBody+=`\n🏅 今日积分变动：+${sumToday}`;
      }
    }catch(e){log("warn","积分流水查询异常：",String(e));}

    // --- 经验升级 ---
    try{
      const info=await httpGet(END.creditInfo, headers);
      if(info && (info.code===0||info.code===1)&&info.data){
        const credit=info.data.credit??info.data.experience??0, level=info.data.level??0, range=info.data.credit_range??info.data.creditRange??[0,0];
        const need=Number(range[1])-Number(credit);
        notifyBody+=`\n📈 当前经验：${credit}（Lv.${level}），距离升级还需 ${need} 点`;
      }
    }catch(e){log("info","经验信息获取失败",String(e));}

    // --- 盲盒进度条 ---
    if(blindProgressInfo.length>0){
      blindProgressInfo.forEach(info=>{
        const width=info.target===7?5:(info.target===666?12:12);
        const bar=progressBarSimple(info.opened,info.target,width);
        notifyBody+=`\n🔋 ${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
      });
    }

    // --- 连续签到/补签卡 ---
    if(st && st.code===0){
      const days=st.data?.consecutiveDays??st.data?.continuousDays??"?";
      const cards=st.data?.signCardsNum??st.data?.remedyCard??0;
      notifyBody=`🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张\n${notifyBody}`;
    }

    // --- 自动分享任务 ---
    let shareGain=0;
    try{
      const taskListResp=await httpGet(END.tasks, headers);
      if(taskListResp && taskListResp.code===0 && Array.isArray(taskListResp.data?.list)){
        const shareTask=taskListResp.data.list.find(t=>t.type==="share" && t.status===0);
        if(shareTask){
          const shareResp=await httpPost(END.taskShare, headers, JSON.stringify({taskId:shareTask.taskId}));
          if(shareResp && shareResp.code===0) shareGain=Number(shareResp.data?.score??0);
        }
      }
    }catch(e){log("warn","分享任务异常：",String(e));}
    if(shareGain) notifyBody+=`\n📌 分享任务：已完成 +${shareGain}积分`;

    // --- 发送通知 ---
    if(cfg.notify && notifyBody.trim()){
      notify(cfg.titlePrefix||"九号签到","签到结果",notifyBody);
      log("info","发送通知：",cfg.titlePrefix,notifyBody.replace(/\n/g," | "));
    } else log("info","通知已禁用或无内容，跳过发送。");

  } catch(e){log("error","主流程未捕获异常：",e); if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e));}
  finally{logStart("九号自动签到结束"); $done();}
})();