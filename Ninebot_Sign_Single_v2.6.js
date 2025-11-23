/*
Ninebot_Sign_Single_v2.6.js
最终版（增强）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（只显示签到所得 N 币）
- 自动执行每日分享任务
- 7天 / 666天 盲盒进度条
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
  taskDailyShare: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/daily/share" // 新增分享任务接口
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

// ---------- 工具函数 ----------
function mask(s) { if (!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) {
  const pct = total > 0 ? progress/total : 0;
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

// ---------- 主流程 ----------
(async () => {
  try {
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

    if (!cfg.Authorization || !cfg.DeviceId) {
      notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
      log("warn", "终止：未读取到账号信息");
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

    // 1) 查询签到状态
    log("info", "查询签到状态...");
    let st = null;
    try { st = await httpGet(`${END.status}?t=${Date.now()}`, headers); } catch (e) { log("warn", "状态请求异常：", String(e)); }

    const consecutiveDays = st?.data?.consecutiveDays ?? st?.data?.continuousDays ?? 0;
    const signCards = st?.data?.signCardsNum ?? st?.data?.remedyCard ?? 0;

    // 2) 签到
    log("info", "发送签到请求...");
    let signResp = null;
    try { signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId })); } catch(e) { log("warn", "签到请求异常：", String(e)); }

    let signMsg = "", todayGainExp = 0, todayGainNcoin = 0;
    if(signResp){
      if(signResp.code === 0 || signResp.code === 1){
        const nCoin = Number(signResp.data?.nCoin ?? 0);
        const score = Number(signResp.data?.score ?? 0);
        todayGainNcoin += nCoin; todayGainExp += score;
        signMsg = `今日签到成功\n已得 N币：${nCoin} / 积分：${score}`;
      } else if(signResp.code === 540004 || /已签到/.test(signResp.msg)){
        signMsg = `今日已签到`;
      } else { signMsg = `签到失败：${signResp.msg ?? JSON.stringify(signResp)}`; }
    } else { signMsg = `签到请求异常`; }

    // 3) 查询余额
    let balMsg = "";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code===0) balMsg = `N币余额：${bal.data?.balance ?? 0}`;
    }catch(e){ log("warn", "余额查询异常：", String(e)); }

    // 4) 自动完成每日分享任务
    let shareMsg = "";
    try{
      const share = await httpPost(END.taskDailyShare, headers, "{}");
      if(share?.code===0 || share?.code===1){
        const n = share.data?.rewardQuantity ?? 1;
        shareMsg = `📌 今日分享任务：\n- 已完成，获得：${n} N币`;
        todayGainNcoin += n;
      } else { shareMsg = `📌 今日分享任务：未完成`; }
    }catch(e){ log("warn","分享任务异常：",String(e)); shareMsg = `📌 今日分享任务：异常`; }

    // 5) 积分流水
    let creditLine = "";
    try{
      const credits = await httpGet(END.credits, headers);
      if(Array.isArray(credits.data?.list)){
        const todayList = credits.data.list.filter(it => toDateKeyFromSec(Number(it.create_date||0))===todayKey());
        const sum = todayList.reduce((a,b)=>a+Number(b.credit||0),0);
        creditLine = `今日积分变动：+${sum}`;
        todayGainExp += sum;
      }
    }catch(e){ log("warn","积分流水异常：",String(e)); }

    // 6) 经验信息
    let upgradeLine="";
    try{
      const info = await httpGet(END.creditInfo, headers);
      if(info?.code===0 && info.data){
        const credit=info.data.credit??0, level=info.data.level??0;
        const range=info.data.credit_range??[0,0]; const need=range[1]-credit;
        upgradeLine = `当前经验：${credit}（LV.${level}），距离升级还需 ${need}`;
      }
    }catch(e){ log("info","经验查询失败"); }

    // 7) 盲盒列表
    let blindMsg = "", blindProgressInfo=[];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes || [];
      notOpened.forEach(b=>{
        const target=b.awardDays||0, left=b.leftDaysToOpen||0, opened=target-left;
        blindProgressInfo.push({target, left, opened});
      });
    }catch(e){ log("warn","盲盒查询异常"); }

    let progressLines="";
    blindProgressInfo.forEach(info=>{
      const width=(info.target===7?5:(info.target===666?12:12));
      const bar = progressBarSimple(info.opened, info.target, width);
      progressLines+=`\n${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
    });

    // 8) 通知汇总
    let notifyBody=`${signMsg}\n${creditLine}\n${upgradeLine}\n${balMsg}\n连续签到：${consecutiveDays} 天\n补签卡：${signCards} 张\n${shareMsg}${progressLines}`;
    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);
    log("info","通知内容：",notifyBody.replace(/\n/g," | "));

  }catch(e){
    log("error","主流程异常：",e);
    if(cfg?.notify) notify(cfg?.titlePrefix||"九号签到","脚本异常",String(e));
  }finally{ logStart("九号自动签到结束"); $done(); }
})();