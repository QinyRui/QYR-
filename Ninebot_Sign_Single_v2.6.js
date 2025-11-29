/***********************************************
 Ninebot_Sign_Single_v2.6.js  （日志写死 · 最终整合版）
 功能：抓包写入、自动签到、分享任务、盲盒、经验/N币查询
 日志：固定格式 console.log 输出，不依赖 BoxJS
 通知：仅显示签到结果（不显示日志）
***********************************************/

/* ENV */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

/* 时间格式 */
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `[${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}
function log(s, o) {
  if (o !== undefined) console.log(`${ts()} info ${s}`, o);
  else console.log(`${ts()} info ${s}`);
}

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_SHARE="ninebot.shareTaskUrl";

/* 读写 */
function read(k){ try{ return $persistentStore.read(k);}catch{} return null; }
function write(v,k){ try{ return $persistentStore.write(v,k);}catch{} return false; }

/* 抓包逻辑 */
const CAP = ["/portal/api/user-sign/v2/status","/portal/api/user-sign/v2/sign","/service/2/app_log/"];

if (IS_REQUEST && CAP.some(p => ($request.url || "").includes(p))) {
  try {
    const h = $request.headers || {};
    const auth = h.Authorization || h.authorization || "";
    const dev = h.DeviceId || h.deviceid || h.device_id || "";
    const ua = h["User-Agent"] || h["user-agent"] || "";

    let changed = false;
    if (auth && read(KEY_AUTH) !== auth){ write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev){ write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua){ write(ua, KEY_UA); changed = true; }

    if ($request.url.includes("/service/2/app_log/")) {
      const base = $request.url.split("?")[0];
      if (read(KEY_SHARE) !== base) { write(base, KEY_SHARE); changed = true; }
    }

    if (changed)
      $notification.post("九号智能电动车","抓包成功 ✓","Authorization / DeviceId / User-Agent / shareTaskUrl 已写入");

  } catch(e){}
  return $done({});
}

/* 请求封装 */
const MAX_RETRY=3, RETRY_DELAY=1500, TIMEOUT=12000;
function req({method="GET",url,headers={},body=null}){
  return new Promise((resolve,reject)=>{
    let count=0;
    function once(){
      count++;
      const opt={url,headers,timeout:TIMEOUT};
      if(method==="POST") opt.body=body===null?"{}":body;

      const cb=(err,resp,data)=>{
        if(err){
          const msg=String(err.error||err.message||err);
          const retry=/timeout|timed out|ECONNRESET|network|Socket closed/i.test(msg);
          if(count<MAX_RETRY && retry) return setTimeout(once, RETRY_DELAY);
          return resolve({error:msg});
        }
        try{ resolve(JSON.parse(data||"{}")); }
        catch{ resolve({raw:data}); }
      };

      if(method==="POST") $httpClient.post(opt,cb);
      else $httpClient.get(opt,cb);
    }
    once();
  });
}

function GET(url,h){ return req({method:"GET",url,headers:h}); }
function POST(url,h,b){ return req({method:"POST",url,headers:h,body:b}); }

/* 读取配置 */
const cfg = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  shareTaskUrl: read(KEY_SHARE) || ""
};

log("当前配置：", cfg);

if(!cfg.Authorization || !cfg.DeviceId){
  $notification.post("九号签到","未配置 Token","请开启抓包写入 Authorization / DeviceId");
  log("缺少 Authorization / DeviceId，任务终止");
  return $done();
}

/* Headers */
function headers(){
  return {
    "Authorization": cfg.Authorization,
    "Content-Type":"application/json;charset=UTF-8",
    "device_id": cfg.DeviceId,
    "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone) Segway/6",
    "platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh"
  };
}

/* 接口 */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:"https://api5-h5-app-bj.ninebot.com/web/credit/get-msg"
};

/* 日期工具 */
function today(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function toDate(s){
  const d=new Date(s*1000);
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/* MAIN */
(async()=>{

try{
  const h = headers();

  /* 1. 状态 */
  log("查询签到状态...");
  const st = await GET(`${END.status}?t=${Date.now()}`, h);
  log("签到状态：", st);

  const sd = st.data || {};
  const signedToday = sd.currentSignStatus===1;
  let expGain=0, ncGain=0;
  let signMsg="";

  /* 2. 签到 */
  if(!signedToday){
    const r = await POST(END.sign, h, JSON.stringify({deviceId:cfg.DeviceId}));
    log("签到接口返回：", r);

    if(r.code===0 || r.code===1){
      const n = Number(r.data?.nCoin || r.data?.coin || 0);
      const sc = Number(r.data?.score || 0);
      expGain+=sc;
      ncGain+=n;
      signMsg="🎉 今日签到：成功";
    }else{
      signMsg="❌ 今日签到失败";
    }
  }else{
    log("今日已签到，跳过签到接口调用");
    signMsg="🎉 今日签到：已签到";
  }

  /* 3. 分享任务 */
  let shareGain=0;
  if(cfg.shareTaskUrl){
    let share=await POST(cfg.shareTaskUrl, h, JSON.stringify({page:1,size:20}));
    if(!share || !share.data){
      log("分享任务接口返回无列表或格式不支持：", share);
    }else{
      const list = Array.isArray(share.data.list)?share.data.list:[];
      for(const it of list){
        const t = Number(it.occurrenceTime || it.time || it.ts || 0);
        if(t && toDate(t)===today()){
          shareGain += Number(it.count || it.score || 0);
        }
      }
      ncGain += shareGain;
    }
  }

  /* 4. 经验 */
  const cr = await GET(END.creditInfo, h);
  log("经验信息：", cr);

  const cd = cr.data || {};
  const level = cd.level || "";
  const credit = Number(cd.credit || 0);
  let need=0;
  if(cd.credit_upgrade){
    const m = String(cd.credit_upgrade).match(/([0-9]+)/);
    if(m) need=Number(m[1]);
  }

  /* 5. N 币余额 */
  const b = await GET(END.balance, h);
  log("余额查询：", b);

  const balance = b?.data?.balance ?? 0;

  /* 通知内容 */
  let lines = [];
  lines.push(signMsg);
  if(shareGain>0) lines.push(`🎁 今日分享：+${shareGain} N币`);
  lines.push("");
  lines.push("📊 账户状态");
  lines.push(`- 经验：${credit}（LV.${level}）`);
  lines.push(`- 距离升级：${need} XP`);
  lines.push(`- 当前 N币：${balance}`);

  if(expGain || ncGain){
    lines.push("");
    lines.push(`🎯 今日获得：经验 ${expGain} / N币 ${ncGain}`);
  }

  /* 通知（不显示日志） */
  $notification.post("九号签到 · 今日结果","",lines.join("\n"));

} catch(e){
  log("脚本异常：", e);
  $notification.post("九号签到","脚本异常",String(e));
}

finally{
  log("九号自动签到结束，不需要 boxjs 设置");
  $done();
}

})();