/*
九号消息监控 · 专业版
作者：QinyRui & ❥﹒﹏非我不可
版本：1.0
更新：2025/11/25

功能：
- 自动抓包写入 Authorization / DeviceId / UA
- 拉取未读消息数 (get-unread-num)
- 自动拉取消息列表 (get-msg)
- 消息分类：奖励到账 / 车辆异常 / 系统消息 / 账单 / 内测资格
- 去重推送（记录最后消息ID）
- BoxJS 可配置通知开关
- Loon / Surge / QX 通用 JS
*/

const isRequest = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v,k) => { if(typeof $persistentStore!=="undefined") return $persistentStore.write(v,k); return false; };
const notify = (title,sub,body) => { if(typeof $notification!=="undefined") $notification.post(title,sub,body); };

// BoxJS Keys
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";

const KEY_NOTIFY="ninebot.msg_notify";
const KEY_NOTIFY_ALERT="ninebot.msg_notify_alert";
const KEY_NOTIFY_REWARD="ninebot.msg_notify_reward";
const KEY_LASTID="ninebot.msg_last_id";
const KEY_DEBUG="ninebot.msg_debug";

// --------------- 抓包写入 ---------------
const capture = isRequest && $request.url.includes("/user/message/get-msg");
if(capture){
  const h=$request.headers||{};
  const auth=h["Authorization"]||h["authorization"]||"";
  const dev=h["DeviceId"]||h["deviceid"]||"";
  const ua=h["User-Agent"]||h["user-agent"]||"";

  let changed=false;
  if(auth && read(KEY_AUTH)!==auth){ write(auth,KEY_AUTH); changed=true; }
  if(dev && read(KEY_DEV)!==dev){ write(dev,KEY_DEV); changed=true; }
  if(ua && read(KEY_UA)!==ua){ write(ua,KEY_UA); changed=true; }

  if(changed) notify("九号消息监控","抓包成功 ✓","Token 写入成功");
  $done({});
}

// --------------- 配置 ---------------
const cfg={
  Authorization: read(KEY_AUTH)||"",
  DeviceId: read(KEY_DEV)||"",
  UA: read(KEY_UA)||"",
  notify: read(KEY_NOTIFY)!=="false",
  alert: read(KEY_NOTIFY_ALERT)!=="false",
  reward: read(KEY_NOTIFY_REWARD)!=="false",
  debug: read(KEY_DEBUG)==="true"
};

function log(...a){ if(cfg.debug) console.log(...a); }

// --------------- 网络请求封装 ---------------
function httpGet(url,headers){
  return new Promise((res,rej)=>{
    $httpClient.get({url,headers},(e,r,d)=>{
      if(e) return rej(e);
      try{ res(JSON.parse(d)); }catch{ res({raw:d}); }
    });
  });
}

// --------------- 主逻辑 ---------------
(async()=>{
  if(!cfg.Authorization || !cfg.DeviceId){
    notify("九号消息监控","未配置 Token","请在九号 App 打开消息中心抓包写入");
    return $done();
  }

  const headers={
    "Authorization": cfg.Authorization,
    "DeviceId": cfg.DeviceId,
    "User-Agent": cfg.UA||"Mozilla/5.0 (iPhone) Ninebot/6",
    "Content-Type":"application/json"
  };

  // 1) 获取未读数
  let unread=0;
  try{
    const r=await httpGet("https://api-jhcx-v6-bj.ninebot.com/user/message/get-unread-num",headers);
    unread = Number(r?.data?.unreadNum ?? 0);
    log("未读数:",unread);
  }catch(e){ log("未读接口异常",e); }

  if(unread<=0){
    log("无未读消息，结束");
    return $done();
  }

  // 2) 获取消息
  let msgList=[];
  try{
    const r=await httpGet("https://api-jhcx-v6-bj.ninebot.com/user/message/get-msg?start_index=0&count=20",headers);
    msgList = r?.data?.list ?? [];
  }catch(e){ log("消息获取异常",e); }

  if(msgList.length===0) return $done();

  // 去重：比较 last_id
  const lastID = read(KEY_LASTID) || "";
  let newList = [];

  if(lastID){
    let idx = msgList.findIndex(i=>String(i.id)===String(lastID));
    if(idx>0) newList = msgList.slice(0,idx);
    else if(idx===-1) newList = msgList; // 全是新消息
  }else{
    // 首次运行，不推送，只记录
    write(String(msgList[0].id),KEY_LASTID);
    return $done();
  }

  if(newList.length===0) return $done();

  // 更新 lastID（永远写最新）
  write(String(msgList[0].id),KEY_LASTID);

  // 分类推送
  let pushArr=[];

  for(const m of newList){
    const t = m.title || "";
    const c = m.content || "";

    // 奖励到账
    if(cfg.reward && /(奖励|积分|发放|到账|N币)/.test(t+c)){
      pushArr.push(`🎁【奖励到账】\n${t}\n${c}`);
      continue;
    }

    // 车辆异常
    if(cfg.alert && /(异常|维保|电池|固件|故障)/.test(t+c)){
      pushArr.push(`⚠️【车辆异常】\n${t}\n${c}`);
      continue;
    }

    // 内测资格
    if(/(内测|资格|体验)/.test(t+c)){
      pushArr.push(`🧪【内测消息】\n${t}\n${c}`);
      continue;
    }

    // 默认系统消息
    pushArr.push(`📩【系统消息】\n${t}\n${c}`);
  }

  if(cfg.notify && pushArr.length>0){
    notify("九号消息监控","收到新消息",pushArr.join("\n\n"));
  }

  $done();
})();