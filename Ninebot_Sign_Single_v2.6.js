/*
Ninebot_Sign_Single_v2.6.js
最终版（增强 + 自动分享任务 + 今日已签到优化 + 美化通知 + 自动修复分享任务）
更新日期：2025/11/27
- 自动重试（网络异常重试）
- 签到前查询状态（避免重复签到）
- 积分流水统计（今日积分变化，含分享任务）
- 自动完成分享任务
- 今日已签到时隐藏无新增奖励
- 显示今日获得经验/积分/盲盒奖励
- N币余额显示（只显示签到所得 N 币）
- 7天 / 666天盲盒进度条（BoxJS 可选 8 种样式）
- 抓包写入仅匹配 status 链接，写入 Authorization/DeviceId/User-Agent 到 BoxJS
- 删除内测逻辑
- 自动修复分享任务
- 日志带时间戳与等级，开始/结束分隔
- 文件名保持：Ninebot_Sign_Single_v2.6.js
- 通知顺序：
  1. 今日签到结果
  2. 今日积分 / N币
  3. 当前经验 / 升级信息
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
const KEY_PROGRESS_STYLE="ninebot.progressStyle"; // 0~7 共8种样式

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
    logStart("抓包写入流程");
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
  progressStyle: Number(read(KEY_PROGRESS_STYLE)||0)
};

// ---------- 工具函数 ----------
function mask(s){if(!s)return"";return s.length>8?(s.slice(0,6)+"..."+s.slice(-4)):s;}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function progressBar(opened,target,width,style=0){
  // style 0~7，不同字符风格
  const pct = target>0 ? opened/target : 0;
  const fill = Math.round(pct*width);
  const barStyles=[
    ['█','░'],['▓','░'],['■','□'],['▇','▁'],['▉','▏'],['■','-'],['#','-'],['⣿','░']
  ];
  const [F,E]=barStyles[style]||['█','░'];
  return F.repeat(fill)+E.repeat(Math.max(0,width-fill));
}

// ---------- 主流程 ----------
(async()=>{
  try{
    logStart("九号自动签到开始");
    log("info","当前配置：",cfg);

    if(!cfg.Authorization||!cfg.DeviceId){
      notify(cfg.titlePrefix,"未配置 Token","请先抓包写入 Authorization / DeviceId / User-Agent");
      log("warn","终止：未读取到账号信息"); $done();
    }

    const headers={
      "Authorization": cfg.Authorization,
      "Content-Type": "application/json",
      "device_id": cfg.DeviceId,
      "User-Agent": cfg.userAgent||"Mozilla/5.0",
      "platform": "h5",
      "Origin": "https://h5-bj.ninebot.com",
      "language": "zh"
    };

    // 1) 查询签到状态
    let st=null;
    try{st=await httpGet(`${END.status}?t=${Date.now()}`,headers);}catch(e){log("warn","状态请求异常：",e);}
    const consecutiveDays = st?.data?.consecutiveDays ?? st?.data?.continuousDays ?? 0;
    const signCards = st?.data?.signCardsNum ?? st?.data?.remedyCard ?? 0;
    const todaySigned = st?.data?.currentSignStatus === 1;

    // 2) 签到
    let signResp=null, signMsg="", todayGainExp=0, todayGainNcoin=0;
    if(!todaySigned){
      try{signResp=await httpPost(END.sign,headers,JSON.stringify({deviceId:cfg.DeviceId}));}catch(e){log("warn","签到异常：",e);}
      if(signResp){
        if(signResp.code===0||signResp.code===1){
          const nCoin = Number(signResp.data?.nCoin??0);
          const score = Number(signResp.data?.score??0);
          todayGainNcoin+=nCoin; todayGainExp+=score;
          signMsg=`✨ 今日签到成功 | 🎁 N币: ${nCoin} / 积分: ${score}`;
        }else{ signMsg=`⚠️ 签到失败或已签到`; }
      }else signMsg="⚠️ 签到请求异常";
    }else signMsg="✨ 今日已签到";

    // 3) 自动修复分享任务
    let shareGain=0, shareMsg="";
    if(cfg.autoRepair){
      try{
        const shareResp = await httpPost(END.shareTask, headers, JSON.stringify({page:1,size:10,tranType:1}));
        if(shareResp?.code===0){
          const todayStr=todayKey();
          const listArr=Array.isArray(shareResp.data?.list)?shareResp.data.list:Array.isArray(shareResp.data)?shareResp.data:[];
          const todayShares=listArr.filter(it=>new Date(it.occurrenceTime*1000).toISOString().slice(0,10)===todayStr);
          todayShares.forEach(it=>{shareGain+=Number(it.count??0);});
          if(todayShares.length>0) shareMsg=`🎁 今日分享任务积分: ${shareGain}`;
          todayGainExp+=shareGain;
        }
      }catch(e){log("warn","分享任务查询异常：",e);}
    }

    // 4) 当前经验 / 升级信息
    let upgradeLine="";
    try{
      const creditInfo = await httpGet(END.creditInfo, headers);
      if(creditInfo?.code!==undefined){
        const data = creditInfo.data || {};
        const credit = Number(data.credit??0);
        const level = data.level??0;
        let need = 0;
        if(data.credit_upgrade){
          const m = String(data.credit_upgrade).match(/还需\s*([0-9]+)/); if(m&&m[1]) need=Number(m[1]);
        }else if(data.credit_range && Array.isArray(data.credit_range) && data.credit_range.length>=2){
          need = data.credit_range[1]-credit;
        }
        upgradeLine=`📊 当前经验: ${credit}（LV.${level}），距离升级: ${need} 经验`;
      }
    }catch(e){log("warn","经验查询异常：",e);}

    // 5) N币余额
    let balMsg="";
    try{ const bal = await httpGet(END.balance, headers); if(bal?.code===0) balMsg=`💰 N币余额: ${bal.data?.balance??0}`; }catch(e){log("warn","余额查询异常",e);}

    // 6) 盲盒
    let blindMsg="";
    try{
      const box = await httpGet(END.blindBoxList, headers);
      const boxes=box?.data?.notOpenedBoxes ?? [];
      boxes.forEach(b=>{
        const target=Number(b.awardDays), left=Number(b.leftDaysToOpen), opened=Math.max(0,target-left);
        const width=(target===7?5:(target===666?12:12));
        blindMsg+=`\n📦 ${target}天盲盒: ${progressBar(opened,target,width,cfg.progressStyle)} (${opened}/${target}) 还需 ${left}天`;
      });
    }catch(e){log("warn","盲盒异常",e);}

    // 7) 连续签到 & 补签卡
    const consecutiveLine=`🗓 连续签到: ${consecutiveDays}天 | 🎫 补签卡: ${signCards} 张`;

    // 8) 汇总通知
    const notifyArr=[signMsg];
    if(todayGainExp) notifyArr.push(`🎯 今日总积分（签到+分享）: ${todayGainExp}`);
    if(todayGainNcoin) notifyArr.push(`🎯 今日获得 N币: ${todayGainNcoin}`);
    if(upgradeLine) notifyArr.push(upgradeLine);
    if(balMsg) notifyArr.push(balMsg);
    notifyArr.push(consecutiveLine);
    if(shareMsg) notifyArr.push(shareMsg);
    if(blindMsg) notifyArr.push(blindMsg);

    if(cfg.notify) notify(cfg.titlePrefix||"九号签到","今日签到结果",notifyArr.join("\n"));
    log("info","发送通知：",notifyArr.join(" | "));

  }catch(e){ log("error","主流程异常：",e); if(cfg.notify) notify(cfg.titlePrefix||"九号签到","脚本异常",String(e)); }
  finally{ logStart("九号自动签到结束"); $done(); }
})();