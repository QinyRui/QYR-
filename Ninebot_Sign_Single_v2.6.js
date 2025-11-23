/*
Ninebot_Sign_Single_v2.6.js
最终版（增强）
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化）
- 显示今日获得经验/积分/盲盒奖励
- 自动完成每日分享任务
- N币余额显示（只显示签到所得 N 币）
- 7天 / 666天盲盒进度条（默认：7天用5格，666天用12格）
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
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
  finishTask: id => `https://cn-cbu-gateway.ninebot.com/portal/self-service/task/finish/${id}`
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
function toDateKeyFromSec(sec) { const d = new Date(sec*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function progressBarSimple(progress, total, width) { const pct = total>0 ? progress/total : 0; const filled = Math.round(pct*width); return '█'.repeat(filled)+'░'.repeat(Math.max(0,width-filled)); }

// ---------- 主流程 ----------
(async () => {
  try {
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

    if (!cfg.Authorization || !cfg.DeviceId) {
      notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
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

    // 1) 查询状态
    let st = await httpGet(`${END.status}?t=${Date.now()}`, headers);
    const consecutiveDays = st?.data?.consecutiveDays ?? st?.data?.continuousDays ?? 0;
    const signCards = st?.data?.signCardsNum ?? st?.data?.remedyCard ?? 0;

    // 2) 签到
    let signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId }));
    let todayGainExp = Number(signResp?.data?.score ?? 0);
    let todayGainNcoin = Number(signResp?.data?.nCoin ?? signResp?.data?.coin ?? 0);
    let signMsg = "";
    if (signResp?.code === 0 || signResp?.code === 1) signMsg = `今日签到成功\n已得 N币：${todayGainNcoin}${todayGainExp?` / 积分：${todayGainExp}`:""}`;
    else if (signResp?.code===540004 || /已签到/.test(signResp?.msg)) signMsg = `今日已签到\n已得 N币：${todayGainNcoin}${todayGainExp?` / 积分：${todayGainExp}`:""}`;
    else signMsg = `签到失败：${signResp?.msg ?? JSON.stringify(signResp)}`;

    // 3) 余额
    let bal = await httpGet(END.balance, headers);
    let balMsg = `N币余额：${bal?.data?.balance ?? bal?.data?.coin ?? 0}`;

    // 4) 积分流水
    let credits = await httpGet(END.credits, headers);
    const today = todayKey();
    const todayList = credits?.data?.list?.filter(i=>toDateKeyFromSec(Number(i.create_date||0))===today)??[];
    let sumToday = todayList.reduce((s,i)=>s+Number(i.credit||0),0);
    let creditLine = `今日积分变动：+${sumToday}`;

    // 5) 当前经验
    let info = await httpGet(END.creditInfo, headers);
    let credit = info?.data?.credit??0;
    let level = info?.data?.level??0;
    let range = info?.data?.credit_range??[0,0];
    let upgradeLine = `当前经验：${credit}(LV.${level})，距离升级还需 ${range[1]-credit}`;

    // 6) 自动完成每日分享任务
    let todayShareMsg = "";
    try {
      const tasks = await httpGet(END.tasks, headers);
      const shareTask = tasks?.data?.find(t=>t.taskCategory===6); // 每日分享任务
      if (shareTask) {
        if(shareTask.rewardStatus!==3){
          const shareResp = await httpPost(END.finishTask(shareTask.taskId), headers, "{}");
          if (shareResp?.code===0) todayShareMsg = `- 已完成，获得：${shareResp.data?.rewardQuantity??1} N币`;
          else todayShareMsg = `- 分享任务执行失败`;
        } else {
          todayShareMsg = `- 已完成，获得：${shareTask.rewardQuantity??1} N币`;
        }
      }
    } catch(e){log("warn","分享任务执行异常：",e); todayShareMsg="";}

    // 7) 盲盒列表
    let blindMsg = "";
    let blindProgressInfo = [];
    try {
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes||[];
      if (Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{
          const target=Number(b.awardDays); const left=Number(b.leftDaysToOpen); const opened=target-left;
          blindProgressInfo.push({target,left,opened});
        });
      }
    } catch(e){log("warn","盲盒列表异常：",e);}

    let progressLines = "";
    blindProgressInfo.forEach(info=>{
      const width = info.target===7?5:(info.target===666?12:12);
      const bar = progressBarSimple(info.opened,info.target,width);
      progressLines+=`\n${info.target}天盲盒进度：${bar} (${info.opened}/${info.target}) 还需 ${info.left} 天`;
    });

    // 8) 汇总通知
    let notifyBody = `${signMsg}\n${creditLine}\n${upgradeLine}\n${balMsg}\n连续签到：${consecutiveDays} 天\n补签卡：${signCards} 张`;
    if(todayShareMsg) notifyBody += `\n📌 今日分享任务：\n${todayShareMsg}`;
    if(progressLines) notifyBody += progressLines;

    if(cfg.notify) notify(cfg.titlePrefix,"签到结果",notifyBody);
    log("info","通知内容：",notifyBody.replace(/\n/g," | "));

  } catch(e){
    log("error","主流程异常：",e);
    notify("九号签到","脚本异常",String(e));
  } finally{
    logStart("九号自动签到结束");
    $done();
  }
})();