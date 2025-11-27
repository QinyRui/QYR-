/*
Ninebot_Sign_Single_v2.6.js
最终整合版（保留全部功能 + 支持 BoxJS 进度条样式 8 种）
- 自动重试、签到状态检测
- 自动完成分享任务
- 今日已签到隐藏无新增奖励
- 显示今日获得经验/积分/N币
- 盲盒进度条，支持 8 种样式
- 抓包写入 Authorization / DeviceId / User-Agent
- 日志带时间戳
- 文件名保持：Ninebot_Sign_Single_v2.6.js
*/

const MAX_RETRY = 3;
const RETRY_DELAY = 1500; 
const REQUEST_TIMEOUT = 12000;

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
const KEY_PROGRESS="ninebot.progressStyle"; // 0~7

// Endpoints
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  shareTask:"https://snssdk.ninebot.com/service/2/app_log/?aid=10000004"
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

// ---------- 抓包写入 ----------
const captureOnlyStatus=isRequest&&$request.url&&$request.url.includes("/portal/api/user-sign/v2/status");
if(captureOnlyStatus){
  try{
    logStart("进入抓包写入流程");
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    let changed=false;
    if(auth&&read(KEY_AUTH)!==auth){write(auth,KEY_AUTH);changed=true;}
    if(dev&&read(KEY_DEV)!==dev){write(dev,KEY_DEV);changed=true;}
    if(ua&&read(KEY_UA)!==ua){write(ua,KEY_UA);changed=true;}
    if(changed){
      notify("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info","抓包写入成功",{auth:mask(auth),deviceId:mask(dev)});
    }else{ log("info","抓包数据无变化"); }
  }catch(e){log("error","抓包异常：",e);}
  $done({});
}

// ---------- 读取配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  userAgent: read(KEY_UA)||"",
  debug: read(KEY_DEBUG)==="false"?false:true,
  notify: read(KEY_NOTIFY)==="false"?false:true,
  autoOpenBox: read(KEY_AUTOBOX)==="true",
  autoRepair: read(KEY_AUTOREPAIR)==="true",
  notifyFail: read(KEY_NOTIFYFAIL)==="false"?false:true,
  titlePrefix: read(KEY_TITLE)||"九号签到",
  progressStyle: Number(read(KEY_PROGRESS)||0) // 0~7
};

// ---------- 工具函数 ----------
function mask(s){if(!s)return"";return s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s;}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function toDateKeyFromSec(sec){const d=new Date(sec*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

// ---------- 进度条 8 种样式 ----------
function renderProgressBar(opened,total,style){
  const pct = total>0 ? opened/total : 0;
  const width = 12; // 固定宽度
  let bar="";
  const blocks = [
    ["█","░"],["▓","░"],["■","-"],["▇","-"],
    ["█"," "],["▉","-"],["▓","."],["#","-"]
  ];
  const b = blocks[style]||blocks[0];
  const filled = Math.round(pct*width);
  bar = b[0].repeat(filled) + b[1].repeat(width-filled);
  return bar;
}

// ---------- 主流程 ----------
(async()=>{
  try{
    logStart("九号自动签到开始");
    log("info","当前配置：",cfg);

    if(!cfg.Authorization||!cfg.DeviceId){
      notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
      log("warn","终止：未读取到账号信息");
      $done();
    }

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
    const st = await httpGet(`${END.status}?t=${Date.now()}`,headers);
    const consecutiveDays = st?.data?.consecutiveDays??0;
    const signCards = st?.data?.signCardsNum??0;
    const currentSignStatus = st?.data?.currentSignStatus??0;

    // 2) 签到
    let signMsg="", todayExp=0, todayNcoin=0;
    if(currentSignStatus===0){
      log("info","今日未签到，尝试执行签到...");
      try{
        const sr = await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));
        if(sr?.code===0){ todayNcoin=sr.data?.nCoin??0; todayExp=sr.data?.score??0; signMsg="✨ 今日签到：成功"; }
        else if(sr?.code===1) signMsg="⚠️ 今日已签到"; else signMsg=`❌ 签到失败：${sr.msg??JSON.stringify(sr)}`;
      }catch(e){ signMsg=`❌ 签到异常：${String(e)}`; }
    }else{ signMsg="✨ 今日签到：已签到"; }

    // 3) 查询分享任务
    let shareGain=0, shareLine="";
    try{
      const shareResp = await httpPost(END.shareTask,headers,JSON.stringify({page:1,size:10,tranType:1}));
      const todayShares=(Array.isArray(shareResp.data?.list)?shareResp.data.list:[]).filter(it=>toDateKeyFromSec(it.occurrenceTime)===todayKey());
      shareGain = todayShares.reduce((a,b)=>a+(b.count??0),0);
      if(shareGain>0) shareLine=`🎁 今日分享任务获得 积分: ${shareGain}`;
    }catch(e){ log("warn","分享任务异常：",String(e)); }

    // 4) 积分/经验
    let upgradeLine="";
    try{
      const credit = await httpGet(END.creditInfo,headers);
      if(credit?.code===0){
        const cdata = credit.data||{};
        const creditVal = cdata.credit??0;
        const level = cdata.level??0;
        let need = 0;
        if(cdata.credit_upgrade){ const m=String(cdata.credit_upgrade).match(/还需\s*([0-9]+)/); if(m&&m[1]) need=Number(m[1]); }
        upgradeLine=`📊 当前经验：${creditVal}（LV.${level}）\n距离升级还需 ${need}`;
      }
    }catch(e){ log("warn","经验查询异常：",String(e)); }

    // 5) 余额
    let balLine="";
    try{ const b = await httpGet(END.balance,headers); if(b?.code===0) balLine=`💰 N币余额：${b.data?.balance??0}`; }catch(e){log("warn","余额查询异常",String(e));}

    // 6) 盲盒
    let blindLines="";
    try{
      const box = await httpGet(END.blindBoxList,headers);
      const boxes = box?.data?.notOpenedBoxes??[];
      boxes.forEach(b=>{
        const target = b.awardDays??0;
        const left = b.leftDaysToOpen??0;
        const opened = target-left;
        const bar = renderProgressBar(opened,target,cfg.progressStyle);
        blindLines+=`\n📦 ${target}天盲盒：[${bar}] ${opened}/${target} 天`;
      });
    }catch(e){log("warn","盲盒异常",String(e));}

    // 7) 连续签到 & 补签卡
    const consLine = `🗓 连续签到：${consecutiveDays} 天\n🎫 补签卡：${signCards} 张`;

    // 8) 汇总通知
    const notifyArr=[signMsg];
    if(shareLine) notifyArr.push(shareLine);
    if(upgradeLine) notifyArr.push(upgradeLine);
    if(balLine) notifyArr.push(balLine);
    notifyArr.push(consLine);
    if(blindLines) notifyArr.push(blindLines);
    if(todayExp) notifyArr.push(`🎯 今日总积分：${todayExp+shareGain}`);
    if(todayNcoin) notifyArr.push(`🎯 今日获得 N币：${todayNcoin}`);

    if(cfg.notify) notify(cfg.titlePrefix,"签到总结",notifyArr.join("\n"));
    log("info","通知内容：",notifyArr.join(" | "));

  }catch(e){
    log("error","主流程异常：",e);
    if(cfg.notify) notify(cfg.titlePrefix,"脚本异常",String(e));
  }finally{
    logStart("九号自动签到结束");
    $done();
  }
})();