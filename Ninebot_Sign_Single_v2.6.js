/* Ninebot_Sign_Single_v2.6.js
   增强调试版（支持插件 UI 优先 progressStyle、8 样式、自动签到/分享/领取/盲盒）
   版本：2025-11-27 修复版
   说明：
     - 优先读取 $argument.progressStyle（Loon 插件），若不存在则读取 BoxJS ninebot.progressStyle
     - 增强调试日志（可通过 BoxJS ninebot.debug 关闭）
     - 抓包写入支持 /status /sign /service/2/app_log/
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500; // ms
const REQUEST_TIMEOUT = 12000; // ms

const isRequest = typeof $request !== "undefined" && $request && $request.headers;
const hasPersistent = typeof $persistentStore !== "undefined";
const hasNotification = typeof $notification !== "undefined";
const hasHttp = typeof $httpClient !== "undefined";

const read = k => (hasPersistent ? $persistentStore.read(k) : null);
const write = (v,k) => { if(hasPersistent) return $persistentStore.write(v,k); return false; };
const notify = (title,sub,body) => { if(hasNotification) $notification.post(title,sub,body); };
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
const KEY_PROGRESS="ninebot.progressStyle";

// Endpoints used
const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list?typeCode=2&appVersion=609103606&platformType=iOS",
  reward: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward"
};
const END_OPEN = {
  openSeven: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box"
};

// ---------------- network with retry ----------------
function requestWithRetry({method="GET", url, headers={}, body=null, timeout=REQUEST_TIMEOUT}) {
  return new Promise((resolve,reject)=>{
    let attempts = 0;
    const tryOnce = () => {
      attempts++;
      const opt = { url, headers, timeout };
      if(method === "POST") opt.body = body===null ? "{}" : body;
      const cb = (err, resp, data) => {
        if(err){
          const msg = String(err && (err.error || err.message || err));
          const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed)/i.test(msg);
          if(attempts < MAX_RETRY && shouldRetry){
            console.warn(`[${nowStr()}] warn 请求失败：${msg}，${RETRY_DELAY}ms 后重试 (${attempts}/${MAX_RETRY})`);
            setTimeout(tryOnce, RETRY_DELAY);
            return;
          } else {
            reject(err);
            return;
          }
        }
        try { resolve(JSON.parse(data||"{}")); }
        catch(e) { resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opt, cb);
      else $httpClient.post(opt, cb);
    };
    tryOnce();
  });
}
function httpGet(url, headers={}) { return requestWithRetry({method:"GET", url, headers}); }
function httpPost(url, headers={}, body="{}") { return requestWithRetry({method:"POST", url, headers, body}); }

// POST base64 helper (for replaying share body when provided as base64)
function postBase64(url, headers={}, bodyBase64="", timeout=REQUEST_TIMEOUT){
  return new Promise((resolve,reject)=>{
    const opts = { url, headers, timeout, body: bodyBase64 };
    opts["body-base64"] = true;
    $httpClient.post(opts, (err, resp, data) => {
      if(err) return reject(err);
      try { resolve(JSON.parse(data||"{}")); } catch(e) { resolve({raw:data}); }
    });
  });
}

// ---------------- logging ----------------
function log(level, ...args){
  const t = nowStr();
  const text = args.map(a => (typeof a==="object" ? JSON.stringify(a) : String(a))).join(" ");
  if(read(KEY_DEBUG) === "false" && level === "info") return; // debug off -> suppress info logs
  if(level === "info") console.log(`[${t}] info ${text}`);
  else if(level === "warn") console.warn(`[${t}] warn ${text}`);
  else if(level === "error") console.error(`[${t}] error ${text}`);
  else console.log(`[${t}] ${text}`);
}
function logStart(msg){ console.log(`[${nowStr()}] ======== ${msg} ========`); }

// ---------------- progress styles ----------------
// 8 styles, index 0..7
const PROGRESS_STYLES = [
  ["█","░"],  // 0 solid / light
  ["▓","░"],  // 1 heavy / light
  ["▰","▱"],  // 2 block pair
  ["●","○"],  // 3 dot pair
  ["■","□"],  // 4 square pair
  ["➤","·"],  // 5 arrow/point
  ["▮","▯"],  // 6 vertical bars
  ["⣿","⣀"]  // 7 dense/empty (visual heavy)
];

function renderProgressBar(current, total, styleIndex=0, length=20){
  try{
    styleIndex = Number(styleIndex) || 0;
    if(styleIndex < 0 || styleIndex > PROGRESS_STYLES.length-1) styleIndex = 0;
    const [FULL, EMPTY] = PROGRESS_STYLES[styleIndex];
    const ratio = total>0 ? current/total : 0;
    const filled = Math.round(ratio * length);
    const empty = Math.max(0, length - filled);
    return FULL.repeat(filled) + EMPTY.repeat(empty);
  } catch(e){
    return "████████████--------";
  }
}

// ---------------- capture handling ----------------
const captureUrls = [
  "/portal/api/user-sign/v2/status",
  "/portal/api/user-sign/v2/sign",
  "/service/2/app_log/"
];
const isCaptureRequest = isRequest && $request.url && captureUrls.some(u => $request.url.includes(u));

if(isCaptureRequest){
  try{
    logStart("进入抓包写入流程（增强版）");
    const h = $request.headers || {};
    const auth = h["Authorization"] || h["authorization"] || "";
    const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";
    const captureUrl = $request.url || "";

    log("info", "抓包捕获 URL：", captureUrl);
    log("info", "抓包 Header（部分隐藏）：", { Authorization: auth ? (auth.slice(0,6)+"..."+auth.slice(-4)) : "", DeviceId: dev ? (dev.slice(0,6)+"..."+dev.slice(-4)) : "", UA: ua ? "[present]" : "[missing]" });

    let changed = false;
    if(auth && read(KEY_AUTH) !== auth){ write(auth, KEY_AUTH); changed = true; }
    if(dev && read(KEY_DEV) !== dev){ write(dev, KEY_DEV); changed = true; }
    if(ua && read(KEY_UA) !== ua){ write(ua, KEY_UA); changed = true; }

    if(captureUrl.includes("/service/2/app_log/")){
      const base = captureUrl.split("?")[0];
      if(read(KEY_SHARE_URL) !== base){ write(base, KEY_SHARE_URL); changed = true; log("info","捕获分享接口 URL 写入：", base); }
    }

    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl（若捕获）已写入 BoxJS");
      log("info","抓包写入成功");
    } else {
      log("info","抓包数据无变化");
    }
  } catch(e){
    log("error", "抓包写入异常：", e);
  }
  $done({});
}

// ---------------- config read (BoxJS + Loon arg priority) ----------------
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  shareTaskUrl: read(KEY_SHARE_URL) || "",
  debug: (read(KEY_DEBUG) !== "false"),
  notify: (read(KEY_NOTIFY) !== "false"),
  autoOpenBox: (read(KEY_AUTOBOX) === "true"),
  autoRepair: (read(KEY_AUTOREPAIR) === "true"),
  notifyFail: (read(KEY_NOTIFYFAIL) !== "false"),
  titlePrefix: read(KEY_TITLE) || "九号签到",
  // progressStyle: plugin argument has priority; fallback to BoxJS read(KEY_PROGRESS)
  progressStyle: (typeof $argument !== "undefined" && $argument && $argument.progressStyle !== undefined)
                  ? Number($argument.progressStyle)
                  : Number(read(KEY_PROGRESS) || 0)
};

logStart("九号自动签到开始");
log("info", "当前配置：", { notify: cfg.notify, autoOpenBox: cfg.autoOpenBox, titlePrefix: cfg.titlePrefix, shareTaskUrl: cfg.shareTaskUrl, progressStyle: cfg.progressStyle });

if(!cfg.Authorization || !cfg.DeviceId){
  notify(cfg.titlePrefix, "未配置 Token", "请先抓包并在九号 App 里操作以写入 Authorization / DeviceId / User-Agent");
  log("warn", "终止：未读取到账号信息（Authorization/DeviceId）");
  $done();
}

// ---------------- small helpers ----------------
function mask(s){ if(!s) return ""; return s.length>8 ? (s.slice(0,6)+"..."+s.slice(-4)) : s; }
function toDateKeyFromSec(sec){ const d = new Date(Number(sec)*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
// ---------------- 2/5 主流程：状态查询 -> 签到 -> 分享任务处理 -> 领取奖励尝试 ----------------
(async ()=>{
  try{
    const headers = {
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json;charset=UTF-8",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS) Segway v6",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1) 查询签到状态（避免重复签到）
    log("info", "查询签到状态...");
    let stResp = null;
    try { stResp = await httpGet(`${END.status}?t=${Date.now()}`, headers); }
    catch(e){ log("warn", "状态请求异常：", String(e)); }

    const statusData = stResp?.data || {};
    const consecutiveDays = statusData?.consecutiveDays ?? statusData?.continuousDays ?? 0;
    const signCards = statusData?.signCardsNum ?? statusData?.remedyCard ?? 0;
    const currentSignStatus = statusData?.currentSignStatus ?? null; // 0 未签到 / 1 已签到
    const blindBoxStatus = statusData?.blindBoxStatus ?? null;

    log("info", "签到状态：", { consecutiveDays, signCards, currentSignStatus, blindBoxStatus });

    // 2) 签到
    let signMsg = "", signResp = null, todayGainExp = 0, todayGainNcoin = 0;
    if(currentSignStatus === 0 || currentSignStatus === undefined || currentSignStatus === null){
      log("info", "今日未签到，尝试执行签到...");
      try { signResp = await httpPost(END.sign, headers, JSON.stringify({ deviceId: cfg.DeviceId })); }
      catch(e){ log("warn", "签到请求异常：", String(e)); }

      if(signResp){
        log("info", "签到接口返回：", signResp);
        if(signResp.code === 0 || signResp.code === 1){
          const nCoin = Number(signResp.data?.nCoin ?? signResp.data?.coin ?? 0);
          const score = Number(signResp.data?.score ?? 0);
          todayGainNcoin += nCoin;
          todayGainExp += score;
          signMsg = `✨ 今日签到：成功\n🎁 签到奖励：+${score} 经验、+${nCoin} N 币`;
        } else if(signResp.code === 540004 || (signResp.msg && /已签到/.test(signResp.msg))){
          signMsg = `✨ 今日签到：已签到（接口返回）`;
        } else {
          signMsg = `❌ 签到失败：${signResp.msg ?? JSON.stringify(signResp)}`;
          if(!cfg.notifyFail) signMsg = "";
        }
      } else {
        signMsg = `❌ 签到请求无响应或解析失败`;
        if(!cfg.notifyFail) signMsg = "";
      }
    } else {
      signMsg = `✨ 今日签到：已签到`;
      log("info", "检测到今日已签到，跳过签到接口调用");
    }

    // 3) 分享任务处理（如果 BoxJS 有写入 shareTaskUrl）
    let shareTaskLine = "", shareGain = 0;
    if(cfg.shareTaskUrl){
      try{
        log("info", "尝试查询分享任务/流水：", cfg.shareTaskUrl);
        // 有些接口为 POST 查询，有些为 GET；先尝试 POST({page,size})
        let shareListResp = null;
        try{ shareListResp = await httpPost(cfg.shareTaskUrl, headers, JSON.stringify({ page:1, size:20 })); }
        catch(e){ log("warn", "分享接口 POST 查询异常，尝试 GET：", String(e)); try{ shareListResp = await httpGet(cfg.shareTaskUrl, headers); }catch(e2){ log("warn","分享接口 GET 失败：",String(e2)); } }

        log("info","分享任务列表原始数据：", shareListResp);

        // 通用解析：data.list 或 data
        const arr = Array.isArray(shareListResp?.data?.list) ? shareListResp.data.list : (Array.isArray(shareListResp?.data) ? shareListResp.data : []);

        // 如果是流水结构（occurrenceTime）则统计今日积分
        if(Array.isArray(arr) && arr.length>0){
          const today = todayKey();
          const todayArr = arr.filter(it => {
            try{
              const t = Number(it?.occurrenceTime || it?.time || it?.ts || 0);
              if(!t) return false;
              return toDateKeyFromSec(t) === today;
            }catch(e){ return false; }
          });
          todayArr.forEach(it => { shareGain += Number(it.count ?? it.score ?? 0); });
          if(shareGain>0) shareTaskLine = `🎁 今日分享奖励：+${shareGain} 积分（已统计流水）`;
          todayGainExp += shareGain;
        } else {
          // 若不是流水，则尝试查 tasks 结构并完成未完成的分享任务
          const tasks = Array.isArray(shareListResp?.data?.tasks) ? shareListResp.data.tasks : (Array.isArray(shareListResp) ? shareListResp : []);
          const unfinished = (tasks||[]).filter(item=>{
            const type = String(item?.type || item?.taskType || "").toLowerCase();
            const completed = (item?.completed===0 || item?.completed===false) ? false : Boolean(item?.completed);
            return type.includes("share") && !completed;
          });
          log("info","匹配到未完成分享任务数：", unfinished.length);
          for(const t of unfinished){
            try{
              const taskId = t.id || t.taskId || t.task_id;
              if(!taskId) continue;
              // 常见领取接口为 reward，尝试调用领取（body 可能不同）
              const claimResp = await httpPost(END.reward, headers, JSON.stringify({ taskId }));
              log("info","尝试领取分享任务奖励返回：", claimResp);
              if(claimResp?.code === 0){
                shareGain += Number(t.score || t.reward || 0);
                log("info","自动领取成功：", taskId);
              } else {
                log("warn","自动领取返回非成功：", claimResp);
              }
            }catch(e){
              log("warn","自动完成单条分享任务异常：", String(e));
            }
          }
          if(shareGain>0) shareTaskLine = `🎁 今日分享奖励：+${shareGain} 积分（已自动领取）`;
          todayGainExp += shareGain;
        }

      }catch(e){
        log("warn","分享任务处理异常：", String(e));
      }
    } else {
      log("info","未配置分享任务接口 shareTaskUrl，跳过分享任务处理");
    }

    // 4) 尝试从 taskList 查询可领取任务（一般用于手动领取页面）
    let taskListRaw = null;
    try{
      log("info","查询任务中心 taskList...");
      taskListRaw = await httpGet(END.taskList, headers);
      log("info","任务中心列表：", taskListRaw);
    }catch(e){ log("warn","任务中心查询异常：", String(e)); }

    // 5) 积分/经验信息查询
    let creditLine = "", creditData = null;
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      creditData = creditInfo?.data || {};
      const credit = Number(creditData.credit ?? 0);
      const level = creditData.level ?? null;
      let need = 0;
      if(creditData.credit_upgrade){
        const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
        if(m && m[1]) need = Number(m[1]);
      } else if(creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length>=2){
        need = creditData.credit_range[1] - credit;
      }
      creditLine = `- 当前经验：${credit}${level?`（LV.${level}）`:''}\n- 距离升级：${need} 经验`;
      log("info","经验信息：", creditData);
    }catch(e){ log("warn","经验信息查询异常：", String(e)); }

    // 6) 余额查询
    let balLine = "";
    try{
      const bal = await httpGet(END.balance, headers);
      if(bal?.code === 0) balLine = `- 当前 N 币：${bal.data?.balance ?? bal.data?.coin ?? 0}`;
      log("info","余额查询结果：", bal);
    }catch(e){ log("warn","余额查询异常：", String(e)); }

    // 7) 盲盒查询
    let blindLines = [];
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const notOpened = box?.data?.notOpenedBoxes ?? [];
      if(Array.isArray(notOpened) && notOpened.length>0){
        notOpened.forEach(b=>{
          const target = Number(b.awardDays);
          const left = Number(b.leftDaysToOpen);
          const opened = Math.max(0, target - left);
          blindLines.push({ target, left, opened });
        });
      }
      log("info","盲盒数据：", blindLines);
    }catch(e){ log("warn","盲盒查询异常：", String(e)); }

    // 8) 自动开启盲盒（若开启并到期）
    if(cfg.autoOpenBox && Array.isArray(blindLines) && blindLines.length>0){
      for(const b of blindLines){
        try{
          if(Number(b.left) === 0 && Number(b.target) === 7){
            log("info","检测到 7 天盲盒可开启，尝试开启...");
            try{
              const openResp = await httpPost(END_OPEN.openSeven, headers, JSON.stringify({}));
              log("info","7天盲盒开箱返回：", openResp);
              if(openResp?.code === 0){
                notify(cfg.titlePrefix, "盲盒开启", "7天盲盒已自动开启并领取奖励");
              }
            }catch(e){ log("warn","7天盲盒开箱请求异常：", String(e)); }
          }
        }catch(e){ log("warn","盲盒自动开启处理单项异常：", String(e)); }
      }
    }

    // 9) 构建通知内容（按你要求的美化格式）
    let lines = [];
    //签到结果
    if(signMsg) lines.push(signMsg);
    //分享任务行
    if(shareTaskLine) lines.push(shareTaskLine);
    //经验/等级
    if(creditLine) { lines.push(""); lines.push("📊 账户状态"); lines.push(creditLine); }
    //余额与补签/连续签到
    if(balLine) lines.push(balLine);
    lines.push(`- 补签卡：${signCards} 张`);
    lines.push(`- 连续签到：${consecutiveDays} 天`);

    //盲盒进度（使用 cfg.progressStyle）
    if(blindLines.length>0){
      lines.push("");
      lines.push("📦 盲盒进度");
      blindLines.forEach(info=>{
        const width = info.target === 7 ? 18 : (info.target === 30 ? 22 : 30);
        const bar = renderProgressBar(info.opened, info.target, cfg.progressStyle, width);
        lines.push(`${info.target} 天盲盒：`);
        lines.push(`[${bar}] ${info.opened} / ${info.target} 天`);
      });
    }

    // 今日总积分 / N币统计
    if(todayGainExp || todayGainNcoin) {
      lines.push("");
      lines.push(`🎯 今日获得： 积分 ${todayGainExp} / N币 ${todayGainNcoin}`);
    }

    const title = `${cfg.titlePrefix || "九号智能电动车"} · 今日签到结果`;
    const body = lines.join("\n");

    if(cfg.notify){
      notify(title, "", body);
      log("info","发送通知：", title, body);
    } else log("info","通知已禁用，跳过发送。");

    // end main try
  }catch(e){
    log("error","主流程未捕获异常：", e);
    if(cfg.notify) notify(cfg.titlePrefix || "九号签到", "脚本异常", String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();
// ==========================
// 生成盲盒进度文本
// ==========================
function genBlindBoxText(blind7, blind30, blind66) {
    let text = "";

    if (blind7) {
        text += `7 天盲盒：\n${renderProgressBar(progressStyle, blind7.days, 7)} ${blind7.days} / 7 天\n\n`;
    }
    if (blind30) {
        text += `30 天盲盒：\n${renderProgressBar(progressStyle, blind30.days, 30)} ${blind30.days} / 30 天\n\n`;
    }
    if (blind66) {
        text += `66 天盲盒：\n${renderProgressBar(progressStyle, blind66.days, 66)} ${blind66.days} / 66 天\n\n`;
    }

    return text.trim();
}

// ==========================
// 整合通知内容
// ==========================
function buildNotifyMessage(info, signResult, rewardResult, expInfo, coinInfo, blindInfo) {
    const statusText = signResult === 1 ? "已签到" : "成功";
    const rewardText = rewardResult === 1 ? "已领取" : "未领取";

    let msg = `✨ 今日签到：${statusText}\n` +
              `🎁 奖励领取：${rewardText}\n\n` +
              `📊 账户状态\n` +
              `- 当前经验：${expInfo.exp}（LV.${expInfo.level}）\n` +
              `- 距离升级：${expInfo.toNext} 经验\n` +
              `- 当前 N 币：${coinInfo.coin}\n` +
              `- 补签卡：${info.signCards} 张\n` +
              `- 连续签到：${info.consecutiveDays} 天\n\n`;

    msg += "📦 盲盒进度\n";
    msg += genBlindBoxText(blindInfo.b7, blindInfo.b30, blindInfo.b66);

    return msg;
}

// ==========================
// 主流程 - 自动签到
// ==========================
async function autoSign() {
    log(" ======== 九号自动签到开始 ======== ");

    const cfg = {
        notify: $.getdata('notify') !== "false",
        titlePrefix: $.getdata('titlePrefix') || "九号签到助手",
        progressStyle: Number($.getdata('progressStyle') || 0),
        autoOpenBox: true
    };

    log(`info 当前配置： ${JSON.stringify(cfg)}`);

    // 1. 查询今日状态
    log("info 查询签到状态...");
    const status = await api_querySignStatus();
    if (!status) return finish("今日签到状态获取失败");

    log(`info 签到状态： ${JSON.stringify(status)}`);

    let signResult = status.currentSignStatus;

    // 2. 如果未签到 → 执行签到
    if (signResult === 0) {
        log("info 今日未签到，尝试执行签到...");
        const s = await api_doSign();
        if (s && s.code === 0) {
            log("info 签到成功： ✨ 今日签到：成功\n🎁 奖励领取：未领取");
            signResult = 1;
        }
    }

    // 3. 查询经验 & N 币
    const expInfo = await api_getExp();
    const coinInfo = await api_getCoin();

    // 4. 查询盲盒进度
    const blindInfo = await api_getBlindBox();

    // 5. 组装通知
    const notifyMsg = buildNotifyMessage(
        status,
        signResult,
        0,
        expInfo,
        coinInfo,
        blindInfo
    );

    log(`info 发送通知： ${notifyMsg.replace(/\n/g, " | ")}`);

    if (cfg.notify) {
        $.notify(cfg.titlePrefix, "", notifyMsg);
    }

    log(" ======== 九号自动签到结束 ======== ");
}

// ==========================
// 执行入口
// ==========================
!(async () => {
    if (isRequest && captureMode) {
        await captureToken();
    } else {
        await autoSign();
    }
})().catch((e) => log(`❌ 脚本执行异常: ${e.message}`))
.finally(() => $.done());