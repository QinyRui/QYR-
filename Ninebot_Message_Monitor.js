const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_NOTIFY="ninebot.msg_notify";
const KEY_ALERT="ninebot.msg_notify_alert";
const KEY_REWARD="ninebot.msg_notify_reward";
const KEY_DEBUG="ninebot.msg_debug";
const KEY_POLL="ninebot.msg_poll_interval";
const KEY_LASTID="ninebot.msg_last_id";
const KEY_AUTO_CAPTURE="ninebot.msg_auto_capture";

const read = k => (typeof $persistentStore!=="undefined"?$persistentStore.read(k):null);
const write = (v,k) => { if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k); return false; };
const notify = (title,sub,body) => { if(typeof $notification!=="undefined") $notification.post(title,sub,body); };
const nowStr = ()=>new Date().toLocaleString();

const isRequest = typeof $request !== "undefined" && $request.headers;
const captureOnlyStatus=isRequest && $request.url && $request.url.includes("/user/message/get-msg");
const autoCapture = read(KEY_AUTO_CAPTURE) === "false"?false:true;

// ---------- 抓包写入 ----------
if(captureOnlyStatus && autoCapture){
  try{
    const h=$request.headers||{};
    const auth=h["Authorization"]||h["authorization"]||"";
    const dev=h["DeviceId"]||h["deviceid"]||h["device_id"]||"";
    const ua=h["User-Agent"]||h["user-agent"]||"";
    let changed=false;
    if(auth && read(KEY_AUTH)!==auth){write(auth,KEY_AUTH);changed=true;}
    if(dev && read(KEY_DEV)!==dev){write(dev,KEY_DEV);changed=true;}
    if(ua && read(KEY_UA)!==ua){write(ua,KEY_UA);changed=true;}
    if(changed) notify("九号消息监控","抓包成功 ✓","Authorization / DeviceId / UA 已写入 BoxJS");
  }catch(e){console.log("抓包异常",e);}
  $done({});
}

// ---------- 读取配置 ----------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  UA: read(KEY_UA)||"",
  notify: read(KEY_NOTIFY)!=="false",
  alert: read(KEY_ALERT)!=="false",
  reward: read(KEY_REWARD)!=="false",
  debug: read(KEY_DEBUG)!=="false",
  poll: Number(read(KEY_POLL)||60)
};

// ---------- 网络请求 ----------
const REQUEST_TIMEOUT=12000;
function requestWithRetry({method="GET",url,headers={},body=null,timeout=REQUEST_TIMEOUT}){
  return new Promise((resolve,reject)=>{
    const opt={url,headers,timeout};
    if(method==="POST") opt.body=body===null?"{}":body;
    const cb=(err,resp,data)=>{
      if(err) reject(err);
      else try{resolve(JSON.parse(data||"{}"));}catch(e){resolve({raw:data});}
    };
    method==="GET"?$httpClient.get(opt,cb):$httpClient.post(opt,cb);
  });
}
const httpGet = (url,h)=>requestWithRetry({method:"GET",url,headers:h});
const httpPost = (url,h,b)=>requestWithRetry({method:"POST",url,headers:h,body:b});

// ---------- 主流程 ----------
(async()=>{
  if(!cfg.Authorization || !cfg.DeviceId){
    notify("九号消息监控","未配置 Token","请在九号 App 消息中心抓包写入");
    return $done();
  }

  const headers={
    "Authorization": cfg.Authorization,
    "DeviceId": cfg.DeviceId,
    "User-Agent": cfg.UA||"Mozilla/5.0 (iPhone) Ninebot/6",
    "Content-Type":"application/json"
  };

  // 获取未读数
  let unread=0;
  try{ const r=await httpGet("https://api-jhcx-v6-bj.ninebot.com/user/message/get-unread-num",headers); unread=Number(r?.data?.unreadNum??0); }catch(e){ if(cfg.debug) console.log("未读接口异常",e); }

  // 获取消息列表
  let msgList=[];
  try{ const r=await httpGet("https://api-jhcx-v6-bj.ninebot.com/user/message/get-msg?start_index=0&count=20",headers); msgList=r?.data?.list||[]; }catch(e){ if(cfg.debug) console.log("消息接口异常",e); }

  if(msgList.length===0){
    notify("九号消息监控","无消息","当前没有任何消息记录");
    return $done();
  }

  let pushList=[];
  if(unread===0){
    const m=msgList[0];
    pushList.push(`🔔【最近一条消息】\n标题: ${m.title||""}\n内容: ${m.content||""}`);
  }else{
    const lastID = read(KEY_LASTID)||"";
    let newList = [];
    if(lastID){
      let idx = msgList.findIndex(i=>String(i.id)===String(lastID));
      newList = idx>0 ? msgList.slice(0,idx) : (idx===-1 ? msgList : []);
    }else{ write(String(msgList[0].id),KEY_LASTID); return $done(); }

    if(newList.length>0){
      write(String(msgList[0].id),KEY_LASTID);
      for(const m of newList){
        const t=m.title||"", c=m.content||"";
        if(cfg.reward && /(奖励|积分|发放|到账|N币)/.test(t+c)){ pushList.push(`🎁【奖励到账】\n${t}\n${c}`); continue; }
        if(cfg.alert && /(异常|维保|电池|固件|故障)/.test(t+c)){ pushList.push(`⚠️【车辆异常】\n${t}\n${c}`); continue; }
        pushList.push(`📩【系统消息】\n${t}\n${c}`);
      }
    }
  }

  if(cfg.notify && pushList.length>0){
    notify("九号消息监控","消息提醒",pushList.join("\n\n"));
    if(cfg.debug) console.log("通知内容:",pushList);
  }

  $done();
})();