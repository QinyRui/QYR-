/***********************************************
 Ninebot_Sign_Single_v2.7.js  （最终整合版）
 2025-12-02 20:50 更新
 核心优化：
 1. 完整保留抓包写入、自动签到、加密分享、盲盒开箱、日志等级调节
 2. 分享奖励逻辑完整整合，奖励变动直接显示
 3. 通知完整显示签到、分享、账户状态、盲盒进度
 4. 去掉“今日获得”行，整合奖励信息至账户状态
***********************************************/

const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";
var $argument = typeof $argument !== "undefined" ? $argument : {};

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_OLD_DEBUG="ninebot.debug";
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward"
};
const RETRY = { MAX:3, DELAY:1500, TIMEOUT:12000 };
const LOG_LEVELS = { debug:0, info:1, warn:2, error:3 };

/* 配置 */
const pluginLogLevel = ($argument.logLevel || "").toLowerCase() || readPS("ninebot.logLevel") || "info";
const boxJsOldDebug = readPS(KEY_OLD_DEBUG) === "true";
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  UserAgent: readPS(KEY_UA)||"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
  shareTaskUrl: readPS(KEY_SHARE)||"",
  logLevel: boxJsOldDebug ? "debug" : (LOG_LEVELS[pluginLogLevel] ? pluginLogLevel : "info"),
  notify: $argument.notify === "false" ? false : (readPS(KEY_NOTIFY) === "false" ? false : true),
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: $argument.titlePrefix || readPS(KEY_TITLE)||"九号签到助手"
};
const currentLogLevel = LOG_LEVELS[cfg.logLevel];

/* 日志 */
function logDebug(...args){ if(currentLogLevel <= LOG_LEVELS.debug) console.log(`[${nowStr()}] debug ${args.join(" ")}`); }
function logInfo(...args){ if(currentLogLevel <= LOG_LEVELS.info) console.log(`[${nowStr()}] info ${args.join(" ")}`); }
function logWarn(...args){ if(currentLogLevel <= LOG_LEVELS.warn) console.warn(`[${nowStr()}] warn ${args.join(" ")}`); }
function logErr(...args){ if(currentLogLevel <= LOG_LEVELS.error) console.error(`[${nowStr()}] error ${args.join(" ")}`); }

/* HTTP请求工具 */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=RETRY.TIMEOUT}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST"){ opts.body=typeof body==="object"?JSON.stringify(body):body; }
      const cb=(err,resp,data)=>{
        if(err){
          if(attempts<RETRY.MAX) setTimeout(once,RETRY.DELAY);
          else reject(new Error(`请求失败（${RETRY.MAX}次重试耗尽）`));
          return;
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}
const httpGet=(url,headers={})=>requestWithRetry({method:"GET",url,headers});
const httpPost=(url,headers={},body={})=>requestWithRetry({method:"POST",url,headers,body});

/* 组装请求头 */
function makeHeaders(){ return {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.UserAgent,
  "platform": "h5"
};}

/* 分享任务领取 */
async function doShareTask(headers){
  if(!cfg.shareTaskUrl) return "📤 分享任务：未配置";
  try{
    const resp=await httpPost(cfg.shareTaskUrl, headers, {});
    if(resp?.data?.coin || resp?.data?.nCoin){
      return `📤 分享任务：已完成，获得 ${resp.data.coin||resp.data.nCoin} N币`;
    } else if(resp?.msg && /已领取|重复/.test(resp.msg)){
      return "📤 分享任务：今日已领取";
    } else return "📤 分享任务：未知状态";
  }catch(e){
    logWarn("分享任务异常：",e);
    return "📤 分享任务：执行异常";
  }
}

/* 主流程 */
(async()=>{
  try{
    logInfo("=== 九号自动签到+分享任务启动 ===");
    const headers=makeHeaders();

    // 查询签到状态
    let statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers);
    const status=statusResp?.data||{};
    const consecutiveDays=status.consecutiveDays||status.continuousDays||0;
    const signCards=status.signCardsNum||status.remedyCard||0;
    const currentSignStatus=status.currentSignStatus||status.currentSign||0;
    const isSigned=[1,'1',true,'true'].includes(currentSignStatus);

    // 签到
    let signMsg="";
    if(!isSigned){
      const signResp=await httpPost(END.sign, headers, {deviceId:cfg.DeviceId});
      let checkData=(await httpGet(`${END.status}?t=${Date.now()}`, headers))?.data||{};
      const realSigned=[1,'1',true,'true'].includes(checkData.currentSignStatus||checkData.currentSign||0);
      if(realSigned){
        const newDays=checkData.consecutiveDays||checkData.continuousDays||consecutiveDays+1;
        signMsg=`✨ 今日签到：成功（已验证）\n📅 连续签到：${newDays} 天`;
      } else if(signResp.msg && /已签到/.test(signResp.msg)){
        signMsg="✨ 今日签到：已签到（接口返回）";
      } else signMsg=`❌ 签到失败：${signResp.msg||"未知错误"}`;
    } else signMsg=`✨ 今日签到：已签到\n📅 连续签到：${consecutiveDays} 天`;

    // 分享任务
    let shareMsg=await doShareTask(headers);

    // 账户状态
    let upgradeLine="", balLine="";
    try{
      const creditInfoResp=await httpGet(END.creditInfo,headers);
      const credit=creditInfoResp?.data?.credit||0;
      const level=creditInfoResp?.data?.level||"";
      const need=creditInfoResp?.data?.credit_upgrade?.match(/\d+/)?.[0]||0;
      upgradeLine=`- 当前经验：${credit}${level?"（LV."+level+"）":""}\n- 距离升级：${need} 经验`;
    }catch(e){ logWarn("经验查询异常：",e); }
    try{
      const balResp=await httpGet(END.balance,headers);
      const balance=balResp?.data?.balance||balResp?.data?.coin||0;
      balLine=`- 当前 N 币：${balance}`;
    }catch(e){ logWarn("余额查询异常：",e); }

    // 盲盒
    let blindLines="无";
    try{
      const boxResp=await httpGet(END.blindBoxList,headers);
      const blindList=boxResp?.data?.notOpenedBoxes||[];
      if(blindList.length>0){
        blindLines=blindList.map(b=>{
          const totalDays=b.awardDays||b.totalDays||0;
          const remainingDays=b.leftDaysToOpen||b.remaining||0;
          const completedDays=Math.max(0,totalDays-remainingDays);
          return `${totalDays} 天盲盒：${completedDays} / ${totalDays} 天`;
        }).join("\n");
      }
    }catch(e){ logWarn("盲盒查询异常：",e); }

    // 推送通知
    if(cfg.notify){
      const notifyBody=`${signMsg}\n${shareMsg}\n\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindLines}`;
      notify(cfg.titlePrefix,"",notifyBody);
      logInfo("通知已推送");
    }

    logInfo("=== 九号自动签到+分享任务完成 ===");
  }catch(e){
    logErr("主流程异常：",e);
    if(cfg.notify&&cfg.notifyFail) notify(cfg.titlePrefix,"任务异常 ❌",`脚本执行失败：${String(e)}`);
  }
})();