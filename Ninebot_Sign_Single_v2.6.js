/*************************
 * 九号自动签到——Loon 修复版
 * 修复：读取 BoxJS 正确字段
 *************************/

function nowStr(){
  const d=new Date();
  return `${d.getFullYear()}/${(d.getMonth()+1+"").padStart(2,"0")}/${(d.getDate()+"").padStart(2,"0")} `+
         `${(d.getHours()+"").padStart(2,"0")}:${(d.getMinutes()+"").padStart(2,"0")}:${(d.getSeconds()+"").padStart(2,"0")}`;
}
const log = (msg)=>console.log(`[${nowStr()}] info ${msg}`);
const logObj=(tag,obj)=>{try{console.log(`${tag} ${JSON.stringify(obj,null,2)}`)}catch{}};

const read = k=>$persistentStore.read(k);
const write=(v,k)=>$persistentStore.write(v,k);

/**********************
 * 修复读取 BoxJS 参数
 **********************/
const cfg = {
  Authorization: read("ninebot.authorization") || "",
  DeviceId: read("ninebot.deviceId") || "",
  userAgent: read("ninebot.userAgent") || "",

  titlePrefix: read("ninebot.titlePrefix") || "- 九号-",
  autoOpenBox: read("ninebot.autoOpenBox") === "true",
  notify: read("ninebot.notify") !== "false",
  notifyFail: read("ninebot.notifyFail") !== "false",
  debug: read("ninebot.debug") === "true"
};

logObj("当前配置：", cfg);

const HOST = "https://cn-cbu-gateway.ninebot.com";

function req(path,method="GET",body=null){
  return new Promise(res=>{
    const opt={
      url:HOST+path,
      method,
      headers:{
        "Authorization": cfg.Authorization,
        "DeviceId": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "Content-Type":"application/json"
      }
    };
    if(body) opt.body = JSON.stringify(body);
    $httpClient.request(opt,(e,r,d)=>{
      if(e){res({});return;}
      try{res(JSON.parse(d));}catch{res({});}
    });
  });
}

async function getStatus(){ return await req("/portal/api/user-sign/v2/status"); }
async function doSign(){ return await req("/portal/api/user-sign/v2/sign","POST",{}); }
async function getPoint(){
  const r = await req(`/web/credit/get-msg?t=${Date.now()}`);
  if(!r?.data) return {p:0,c:0};
  let p=0,c=0;
  for(const i of r.data){
    if(i.changeType===1) p+=i.changeValue;
    if(i.changeType===2) c+=i.changeValue;
  }
  return {p,c};
}
async function getBlind(){
  const r = await req("/portal/api/user-sign/v2/blindBoxList");
  if(!r?.data) return [];
  return r.data.map(v=>({target:v.targetDays||v.target,opened:v.openedDays||v.opened}));
}

(async()=>{
  log("九号自动签到开始");

  const st = await getStatus();
  if(!st?.data){
    if(cfg.notifyFail) $notification.post("九号签到失败","","无法获取签到状态");
    return $done();
  }

  let signed = st.data.currentSignStatus===1;
  let consecutive = st.data.consecutiveDays || 0;

  if(!signed){
    log("今日未签到，执行签到接口...");
    const r = await doSign();
    if(r?.code===0){
      signed=true;
      consecutive += 1;
    }
  } else log("今日已签到");

  const point = await getPoint();
  const boxes = await getBlind();
  const b7 = boxes.find(i=>i.target===7);
  const b666 = boxes.find(i=>i.target===666);

  if(cfg.notify){
    $notification.post(
      `${cfg.titlePrefix} 今日签到：${signed?"已签到":"失败"}`,
      "",
`📊 账户状态
- 当前 N币：${st.data.coin || "-"}
- 补签卡：${st.data.signCardsNum} 张
- 连续签到：${consecutive} 天

📦 盲盒进度
- 7 天：${b7?`${b7.opened}/${b7.target}`:"未知"}
- 666 天：${b666?`${b666.opened}/${b666.target}`:"未知"}

🎯 今日获得：积分 ${point.p} / N币 ${point.c}`
    );
  }

  log("九号自动签到完成。");
  $done();
})();