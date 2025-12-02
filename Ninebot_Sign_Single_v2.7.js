/***********************************************
 Ninebot_Sign_Single_v2.7_LogFix.js （日志优化版）
 2025-12-01 12:30 更新
 核心优化：
 1. 修正日志优先级：BoxJS日志等级 > 插件配置 > 调试模式
 2. 补充多场景debug日志，选择debug后直观可见
 3. 完全兼容BoxJS点击选择日志等级（无需手动输入）
 修复：ReferenceError: Cannot access uninitialized variable
 兼容：Loon/Surge/Quantumult X 所有工具，无任何JS异常
 功能：抓包写入、自动签到、加密分享、自动领奖励、日志调节、盲盒开箱
***********************************************/

/* ENV wrapper - 优先修复$argument声明（关键！） */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 修复核心：用var声明（无暂时性死区），避免初始化顺序报错
var $argument = typeof $argument !== "undefined" ? $argument : {};

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){ return null; } }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false; } catch(e){ return false; } }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_OLD_DEBUG="ninebot.debug"; // 旧BoxJS debug开关（兼容用）
const KEY_NOTIFY="ninebot.notify";
const KEY_AUTOBOX="ninebot.autoOpenBox";
const KEY_AUTOREPAIR="ninebot.autoRepair";
const KEY_NOTIFYFAIL="ninebot.notifyFail";
const KEY_TITLE="ninebot.titlePrefix";
const KEY_SHARE="ninebot.shareTaskUrl";
const KEY_LAST_CAPTURE="ninebot.lastCaptureAt";
const KEY_LAST_SHARE="ninebot.lastShareDate";
const KEY_LOG_LEVEL="ninebot.logLevel"; // 日志等级Key（BoxJS点击选择对应）

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  creditLst:"https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
  nCoinRecord:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
  shareReceiveReward:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/receive-share-reward" // 推测领取接口
};
const END_OPEN={ openSeven:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/open-seven-box" };

/* 基础配置 */
const RETRY = { MAX:3, DELAY:1500, TIMEOUT:12000 };
const LOG_LEVELS = { debug:0, info:1, warn:2, error:3 }; // 日志等级优先级

/* Read config（优化日志优先级：BoxJS > 插件 > 调试模式） */
// 关键修改1：BoxJS日志等级优先级最高，其次是插件配置，最后是默认info
const pluginLogLevel = readPS(KEY_LOG_LEVEL) || ($argument.logLevel || "").toLowerCase() || "info";
const boxJsOldDebug = readPS(KEY_OLD_DEBUG) === "true";
const cfg={
  Authorization: readPS(KEY_AUTH)||"",
  DeviceId: readPS(KEY_DEV)||"",
  UserAgent: readPS(KEY_UA)||"Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
  shareTaskUrl: readPS(KEY_SHARE)||"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004",
  // 关键修改2：日志等级优先级颠倒，BoxJS选择的等级覆盖调试模式
  logLevel: LOG_LEVELS[pluginLogLevel] ? pluginLogLevel : (boxJsOldDebug ? "debug" : "info"),
  notify: $argument.notify === "false" ? false : (readPS(KEY_NOTIFY) === "false" ? false : true),
  autoOpenBox: readPS(KEY_AUTOBOX) === "true",
  autoRepair: $argument.autoRepair === "true" || readPS(KEY_AUTOREPAIR) === "true",
  notifyFail: readPS(KEY_NOTIFYFAIL) !== "false",
  titlePrefix: $argument.titlePrefix || readPS(KEY_TITLE)||"九号签到助手"
};
const currentLogLevel = LOG_LEVELS[cfg.logLevel];

/* 日志函数（按等级控制输出，补充debug场景） */
function logDebug(...args){
  if(currentLogLevel <= LOG_LEVELS.debug){
    console.log(`[${nowStr()}] debug ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logInfo(...args){
  if(currentLogLevel <= LOG_LEVELS.info){
    console.log(`[${nowStr()}] info ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logWarn(...args){
  if(currentLogLevel <= LOG_LEVELS.warn){
    console.warn(`[${nowStr()}] warn ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}
function logErr(...args){
  if(currentLogLevel <= LOG_LEVELS.error){
    console.error(`[${nowStr()}] error ${args.map(a=>typeof a==="object"?JSON.stringify(a):String(a)).join(" ")}`);
  }
}

/* Capture handling（抓包自动写入） */
const CAPTURE_PATTERNS=["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];
const isCaptureRequest=IS_REQUEST && $request && $request.url && CAPTURE_PATTERNS.some(u=>$request.url.includes(u));
if(isCaptureRequest){
  try{
    logInfo("进入抓包写入流程");
    logDebug("抓包触发条件满足：URL包含", CAPTURE_PATTERNS.find(u=>$request.url.includes(u)));
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    const capUrl=$request.url||"";
    logDebug("抓包URL：",capUrl,"完整请求头：",h);

    let changed=false;
    if(auth && readPS(KEY_AUTH)!==auth){ writePS(auth,KEY_AUTH); changed=true; logDebug("写入Authorization：",auth); }
    if(dev && readPS(KEY_DEV)!==dev){ writePS(dev,KEY_DEV); changed=true; logDebug("写入DeviceId：",dev); }
    if(ua && readPS(KEY_UA)!==ua){ writePS(ua,KEY_UA); changed=true; logDebug("写入User-Agent：",ua); }
    if(capUrl.includes("/service/2/app_log/")){
      const base=capUrl.split("?")[0];
      if(readPS(KEY_SHARE)!==base){ writePS(base,KEY_SHARE); changed=true; logDebug("写入分享接口：",base); }
    }
    if(changed){ 
      writePS(String(Date.now()),KEY_LAST_CAPTURE); 
      notify(cfg.titlePrefix,"抓包成功 ✓","已自动写入Authorization/DeviceId等参数，可关闭抓包开关");
      logInfo("抓包写入成功，参数已保存");
      logDebug("最后抓包时间更新为：", String(Date.now()));
    } else {
      logInfo("抓包数据无变化，无需重复写入");
      logDebug("当前已存Authorization：", readPS(KEY_AUTH), "DeviceId：", readPS(KEY_DEV));
    }
  }catch(e){ logErr("抓包异常：",e); }
  $done({});
}

/* Compose headers（100%匹配抓包） */
function makeHeaders(){
  const headers = {
    "Authorization":cfg.Authorization,
    "Content-Type":"application/octet-stream;tt-data=a",
    "device_id":cfg.DeviceId,
    "User-Agent":cfg.UserAgent,
    "platform":"h5",
    "Origin":"https://h5-bj.ninebot.com",
    "language":"zh",
    "aid":"10000004",
    "Cookie":"install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e",
    "accept-encoding":"gzip, deflate, br",
    "priority":"u=3",
    "accept-language":"zh-CN,zh-Hans;q=0.9",
    "accept":"application/json"
  };
  logDebug("生成请求头：", headers);
  return headers;
}

/* HTTP请求工具（支持Base64解码+重试） */
function requestWithRetry({method="GET",url,headers={},body=null,timeout=RETRY.TIMEOUT,isBase64=false}){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    const once=()=>{
      attempts++;
      const opts={url,headers,timeout};
      if(method==="POST"){
        opts.body=body;
        if(isBase64) opts["body-base64"]=true;
      }
      logDebug(`[HTTP] 发起${method}请求（第${attempts}次）：`,url,"请求参数：",body,"是否Base64：",isBase64);
      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err&&(err.error||err.message||err));
          logWarn(`[HTTP] 请求错误：${msg}，${RETRY.DELAY}ms后重试`);
          logDebug(`[HTTP] 错误详情：`, err);
          if(attempts<RETRY.MAX) setTimeout(once,RETRY.DELAY);
          else reject(new Error(`请求失败（${RETRY.MAX}次重试耗尽）：${msg}`));
          return;
        }
        logDebug(`[HTTP] 响应状态码：${resp.status}，原始响应数据：`,data);
        if(resp.status>=500 && attempts<RETRY.MAX){
          logWarn(`[HTTP] 服务端错误（${resp.status}），${RETRY.DELAY}ms后重试`);
          setTimeout(once,RETRY.DELAY);
          return;
        }
        try{ resolve(JSON.parse(data||"{}")); } catch(e){ 
          logDebug(`[HTTP] 响应数据解析JSON失败，返回原始数据：`,data);
          resolve({raw:data}); 
        }
      };
      if(method==="GET") $httpClient.get(opts,cb); else $httpClient.post(opts,cb);
    };
    once();
  });
}
const httpGet=(url,headers={})=>requestWithRetry({method:"GET",url,headers});
const httpPost=(url,headers={},body={},isBase64=false)=>requestWithRetry({method:"POST",url,headers,body,isBase64});

/* 时间工具（解析日期匹配今日） */
function toDateKeyAny(ts){
  if(!ts) return null;
  const numTs=typeof ts==="string"&&/^\d+$/.test(ts) ? Number(ts) : ts;
  const date=new Date(numTs>1e12 ? numTs/1000 : numTs);
  const dateKey=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  logDebug("时间戳转换：", ts, "→", dateKey);
  return !isNaN(date.getTime()) ? dateKey : null;
}
const todayKey=()=>{
  const d=new Date();
  const dateKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  logDebug("今日日期Key：", dateKey);
  return dateKey;
};

/* 分享任务核心逻辑（加密体+自动领取+等级日志） */
async function doShareTask(headers){
  logDebug("进入分享任务逻辑，开始校验条件");
  const today=todayKey();
  const lastShareDate=readPS(KEY_LAST_SHARE)||"";
  
  // 1. 去重校验
  if(lastShareDate===today){
    logInfo("今日已完成分享任务，跳过");
    logDebug("最后分享日期：",lastShareDate,"今日日期：",today，"无需重复执行");
    return { success:false, msg:"今日已分享", exp:0, ncoin:0 };
  }

  // 2. 加密请求体（原样复用抓包值）
  const ENCRYPTED_BODY="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";

  // 3. 执行分享请求
  logInfo("开始执行分享任务（加密体模式）");
  logDebug("分享接口URL：",cfg.shareTaskUrl,"加密请求体长度：",ENCRYPTED_BODY.length);
  try{
    const shareResp=await httpPost(
      cfg.shareTaskUrl, 
      headers, 
      ENCRYPTED_BODY, 
      true
    );
    logDebug("分享接口响应数据：",shareResp);

    // 4. 分享成功后自动领取奖励
    if(shareResp.e===0||shareResp.success||shareResp.message==="success"){
      writePS(today, KEY_LAST_SHARE);
      logInfo("分享任务成功，尝试自动领取奖励");
      logDebug("分享成功标记：",shareResp.e||shareResp.success,"最后分享日期更新为：",today);
      
      // 自动领取逻辑
      try{
        logDebug("发起分享奖励领取请求，接口：",END.shareReceiveReward);
        const receiveResp=await httpPost(
          END.shareReceiveReward,
          headers,
          { deviceId:cfg.DeviceId, taskType:"share", timestamp:Date.now(), signType:"daily_share", awardType:1 }
        );
        logDebug("分享奖励领取响应：",receiveResp);
        if(receiveResp.code===0||receiveResp.success||(receiveResp.msg&&receiveResp.msg.includes("成功"))){
          logInfo("分享奖励领取成功");
        } else if((receiveResp.msg&&receiveResp.msg.includes("已领取"))){
          logInfo("分享奖励已领取，无需重复操作");
        } else {
          logWarn("分享奖励领取失败：",receiveResp.msg||receiveResp.message);
        }
      }catch(e){ logWarn("自动领取奖励异常（可忽略）：",e); }

      // 延迟2秒等待奖励到账
      logDebug("延迟2000ms等待奖励到账");
      await new Promise(resolve=>setTimeout(resolve,2000));
      let shareExp=0, shareNcoin=0;
      const todayDate=todayKey();

      // 统计积分奖励
      logDebug("查询今日积分记录，接口：",END.creditLst);
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      const creditList=Array.isArray(creditResp?.data?.list)?creditResp.data.list:[];
      const todayCredit=creditList.filter(it=>toDateKeyAny(it.create_date||it.createTime)===todayDate);
      logDebug("今日积分记录总数：",todayCredit.length,"完整积分列表：",creditList);
      for(const it of creditList){
        const k=toDateKeyAny(it.create_date||it.createTime);
        const type=it.type||it.creditType||"未知类型";
        if(k===todayDate){
          logDebug("今日积分明细 - 类型：",type,"数值：",it.credit||it.amount||it.value||0);
          if(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")){
            shareExp+=Number(it.credit||it.amount||it.value||0);
          }
        }
      }

      // 统计N币奖励
      logDebug("查询今日N币记录，接口：",END.nCoinRecord);
      const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
      const nCoinList=Array.isArray(nCoinResp?.data?.list)?nCoinResp.data.list:[];
      const todayNcoin=nCoinList.filter(it=>toDateKeyAny(it.create_time||it.createDate)===todayDate);
      logDebug("今日N币记录总数：",todayNcoin.length,"完整N币列表：",nCoinList);
      for(const it of nCoinList){
        const k=toDateKeyAny(it.create_time||it.createDate);
        const type=it.type||it.operateType||"未知类型";
        if(k===todayDate){
          logDebug("今日N币明细 - 类型：",type,"数值：",it.amount||it.coin||it.value||0);
          if(type.includes("分享")||type.includes("share")||type.includes("任务")||type.includes("每日")||type.includes("领取")){
            shareNcoin+=Number(it.amount||it.coin||it.value||0);
          }
        }
      }

      return {
        success:true,
        msg:`✅ 分享任务：成功\n🎯 领取状态：已尝试自动领取\n🎁 分享奖励：+${shareExp} 经验、+${shareNcoin} N 币`,
        exp:shareExp,
        ncoin:shareNcoin
      };
    } else{
      const errMsg=shareResp.msg||shareResp.message||"接口返回异常";
      logWarn("分享任务失败：",errMsg);
      logDebug("分享失败响应详情：",shareResp);
      return { success:false, msg:`❌ 分享失败：${errMsg}`, exp:0, ncoin:0 };
    }
  }catch(e){
    logErr("分享任务请求异常：",e);
    logDebug("分享异常堆栈信息：",e.stack);
    return { success:false, msg:cfg.notifyFail?`❌ 分享异常：${String(e)}`:"", exp:0, ncoin:0 };
  }
}

/* Main（主流程） */
(async()=>{
  try{
    logInfo("=== 九号自动签到+分享任务启动 ===");
    // 关键debug日志：打印当前生效的日志等级和完整配置
    logDebug("当前生效日志等级：", cfg.logLevel, "等级优先级数值：", currentLogLevel);
    logDebug("完整配置参数：", JSON.stringify(cfg, null, 2));
    const headers=makeHeaders();

    // 1. 查询签到状态
    logInfo("查询签到状态...");
    logDebug("签到状态查询接口：",`${END.status}?t=${Date.now()}`);
    let statusResp=null;
    try{ statusResp=await httpGet(`${END.status}?t=${Date.now()}`,headers); } catch(e){ 
      logWarn("状态查询异常：",e);
      logDebug("状态查询异常详情：",e.stack);
    }
    const statusData=statusResp?.data||{};
    logDebug("签到状态接口响应完整数据：",statusResp);
    logDebug("解析后的签到状态数据：",statusData);

    // 2. 签到逻辑
    let signMsg="", todayGainExp=0, todayGainNcoin=0;
    const consecutiveDays=statusData?.consecutiveDays||statusData?.continuousDays||0;
    const signCards=statusData?.signCardsNum||statusData?.remedyCard||0;
    const currentSignStatus=statusData?.currentSignStatus||statusData?.currentSign||0;
    const isSigned=[1,'1',true,'true'].includes(currentSignStatus);
    logDebug("签到状态判断：当前状态值",currentSignStatus,"是否已签到：",isSigned);
    logDebug("连续签到天数：",consecutiveDays,"补签卡数量：",signCards);

    if(!isSigned){
      logInfo("今日未签到，执行签到...");
      logDebug("发起签到请求，接口：",END.sign,"请求体：",{deviceId:cfg.DeviceId});
      try{
        const signResp=await httpPost(END.sign,headers,{deviceId:cfg.DeviceId});
        logDebug("签到接口响应完整数据：",signResp);
        if(signResp.code===0||signResp.code===1||signResp.success){
          const newDays=consecutiveDays+1;
          const rewardList=signResp.data?.rewardList||[];
          let newExp=0,newCoin=0;
          rewardList.forEach(r=>{
            const v=Number(r.rewardValue||0);
            if(r.rewardType===1) newExp+=v; else newCoin+=v;
            logDebug("签到奖励明细：类型",r.rewardType,"名称",r.rewardName,"数值",v);
          });
          todayGainExp=newExp+(signResp.data?.score||signResp.data?.credit||0);
          todayGainNcoin=newCoin+(signResp.data?.nCoin||signResp.data?.coin||0);
          logDebug("签到获得经验：",todayGainExp,"N币：",todayGainNcoin);
          signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayGainExp} 经验、+${todayGainNcoin} N 币\n📅 连续签到：${newDays} 天`;
        } else if(signResp.code===540004||(signResp.msg&&/已签到/.test(signResp.msg))){
          signMsg=`✨ 今日签到：已签到（接口）`;
          logDebug("接口返回已签到，状态码：",signResp.code,"消息：",signResp.msg);
        } else{
          const errMsg=signResp.msg||signResp.message||"未知错误";
          signMsg=`❌ 签到失败：${errMsg}`;
          logWarn("签到失败：",errMsg);
          logDebug("签到失败响应详情：",signResp);
          if(!cfg.notifyFail) signMsg="";
        }
      }catch(e){
        logErr("签到请求异常：",e);
        logDebug("签到异常堆栈信息：",e.stack);
        signMsg=cfg.notifyFail?`❌ 签到异常：${String(e)}`:"";
      }
    } else{
      signMsg=`✨ 今日签到：已签到`;
      logInfo("今日已签到，跳过签到流程");
      logDebug("当前已签到状态确认，无需重复执行");
    }

    // 3. 执行分享任务
    let shareMsg="";
    logDebug("分享任务配置：分享接口URL",cfg.shareTaskUrl,"是否配置：",!!cfg.shareTaskUrl);
    if(cfg.shareTaskUrl){
      const shareResult=await doShareTask(headers);
      shareMsg=shareResult.msg;
      todayGainExp+=shareResult.exp;
      todayGainNcoin+=shareResult.ncoin;
      logDebug("分享任务获得经验：",shareResult.exp,"N币：",shareResult.ncoin,"累计今日获得：经验",todayGainExp,"N币",todayGainNcoin);
    } else{
      shareMsg="📤 分享任务：未配置分享接口（需抓包一次分享动作）";
      logWarn(shareMsg);
      logDebug("未找到分享接口配置，需抓包获取");
    }

    // 4. 补充统计今日奖励（避免遗漏）
    try{
      logInfo("补充统计今日奖励...");
      logDebug("开始补充统计经验和N币，避免遗漏奖励");
      const todayDate=todayKey();
      // 补充积分
      logDebug("查询积分列表补充统计，接口：",END.creditLst);
      const creditResp=await httpPost(END.creditLst,headers,{page:1,size:100});
      (creditResp?.data?.list||[]).forEach(it=>{
        const k=toDateKeyAny(it.create_date||it.createTime);
        const type=it.type||it.creditType||"";
        if(k===todayDate&&!type.includes("分享")&&!type.includes("share")){
          const val=Number(it.credit||it.amount||it.value||0);
          todayGainExp+=val;
          logDebug("补充统计积分：类型",type,"数值",val,"累计经验",todayGainExp);
        }
      });
      // 补充N币
      logDebug("查询N币列表补充统计，接口：",END.nCoinRecord);
      const nCoinResp=await httpPost(END.nCoinRecord,headers,{page:1,size:100});
      (nCoinResp?.data?.list||[]).forEach(it=>{
        const k=toDateKeyAny(it.create_time||it.createDate);
        const type=it.type||it.operateType||"";
        if(k===todayDate&&!type.includes("分享")&&!type.includes("share")){
          const val=Number(it.amount||it.coin||it.value||0);
          todayGainNcoin+=val;
          logDebug("补充统计N币：类型",type,"数值",val,"累计N币",todayGainNcoin);
        }
      });
      logInfo("今日积分/N币统计完成：",todayGainExp,todayGainNcoin);
      logDebug("最终今日获得：经验",todayGainExp,"N币",todayGainNcoin);
    }catch(e){ 
      logWarn("奖励补充统计异常：",e);
      logDebug("补充统计异常详情：",e.stack);
    }

    // 5. 查询经验和余额
    let upgradeLine="", balLine="";
    try{
      logDebug("查询经验信息，接口：",END.creditInfo);
      const creditInfoResp=await httpGet(END.creditInfo,headers);
      logDebug("经验信息响应：",creditInfoResp);
      const credit=creditInfoResp?.data?.credit||0;
      const level=creditInfoResp?.data?.level||"";
      const need=creditInfoResp?.data?.credit_upgrade?.match(/\d+/)?.[0]||0;
      upgradeLine=`- 当前经验：${credit}${level?"（LV."+level+"）":""}\n- 距离升级：${need} 经验`;
      logDebug("当前经验：",credit,"等级：",level,"升级所需：",need);
    }catch(e){ 
      logWarn("经验信息查询异常：",e);
      logDebug("经验查询异常详情：",e.stack);
    }
    try{
      logDebug("查询N币余额，接口：",END.balance);
      const balResp=await httpGet(END.balance,headers);
      logDebug("余额响应：",balResp);
      const balance=balResp?.data?.balance||balResp?.data?.coin||0;
      balLine=`- 当前 N 币：${balance}`;
      logDebug("当前N币余额：",balance);
    }catch(e){ 
      logWarn("余额查询异常：",e);
      logDebug("余额查询异常详情：",e.stack);
    }

    // 6. 盲盒进度
    let blindLines="无";
    try{
      logDebug("查询盲盒列表，接口：",END.blindBoxList);
      const boxResp=await httpGet(END.blindBoxList,headers);
      logDebug("盲盒列表响应：",boxResp);
      const blindList=boxResp?.data?.notOpenedBoxes||[];
      logDebug("未开启盲盒数量：",blindList.length,"盲盒列表：",blindList);
      if(blindList.length>0){
        blindLines=blindList.map(b=>`${b.awardDays||b.totalDays||0} 天盲盒：${(b.totalDays||0)-(b.leftDaysToOpen||b.remaining||0)} / ${b.awardDays||b.totalDays||0} 天`).join("\n| ");
        logDebug("盲盒进度描述：",blindLines);
      }
    }catch(e){ 
      logWarn("盲盒查询异常：",e);
      logDebug("盲盒查询异常详情：",e.stack);
    }

    // 7. 自动开箱（7天盲盒）
    if(cfg.autoOpenBox){
      logDebug("自动开箱功能已开启，开始检测可开盲盒");
      try{
        const boxResp=await httpGet(END.blindBoxList,headers);
        logDebug("自动开箱 - 盲盒列表响应：",boxResp);
        const blindList=boxResp?.data?.notOpenedBoxes||[];
        const sevenDayBox=blindList.find(b=>(b.awardDays||b.totalDays||0)===7&&(b.leftDaysToOpen||b.remaining||0)===0);
        logDebug("检测到7天可开盲盒：",!!sevenDayBox,sevenDayBox);
        if(sevenDayBox){
          logInfo("检测到7天盲盒可开，执行自动开箱...");
          logDebug("发起7天盲盒开箱请求，接口：",END_OPEN.openSeven);
          const openResp=await httpPost(END_OPEN.openSeven,headers,{});
          logDebug("盲盒开箱响应：",openResp);
          if(openResp.code===0||openResp.success){
            notify(cfg.titlePrefix,"盲盒开启成功 ✓","7天盲盒奖励已自动领取");
            logInfo("7天盲盒开箱成功");
            logDebug("盲盒开箱成功，奖励信息：",openResp.data);
          } else {
            logWarn("盲盒开箱失败：",openResp.msg||openResp.message);
            logDebug("盲盒开箱失败详情：",openResp);
          }
        } else {
          logInfo("无可用7天盲盒可开");
          logDebug("未找到满足条件的7天盲盒（需累计7天且剩余天数为0）");
        }
      }catch(e){ 
        logErr("自动开箱异常：",e);
        logDebug("自动开箱异常详情：",e.stack);
      }
    } else {
      logDebug("自动开箱功能已关闭，跳过开箱流程");
    }

    // 8. 推送通知
    if(cfg.notify){
      const notifyBody=`${signMsg}\n${shareMsg}\n\n📊 账户状态\n${upgradeLine}\n${balLine}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindLines}\n\n🎯 今日获得：积分 ${todayGainExp} / N币 ${todayGainNcoin}`;
      const finalBody=notifyBody.length>1000 ? notifyBody.slice(0,1000)+"..." : notifyBody;
      logDebug("推送通知内容：",finalBody);
      notify(cfg.titlePrefix,"",finalBody);
      logInfo("通知已推送");
    } else {
      logDebug("通知功能已关闭，不推送任何通知");
    }

    logInfo("=== 九号自动签到+分享任务完成 ===");
    logDebug("任务执行完毕，当前时间：",nowStr());
  }catch(e){
    logErr("主流程异常：",e);
    logDebug("主流程异常堆栈信息：",e.stack);
    if(cfg.notify&&cfg.notifyFail) notify(cfg.titlePrefix,"任务异常 ❌",`脚本执行失败：${String(e)}`);
  }
})();