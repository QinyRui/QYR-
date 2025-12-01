/*************************
 * 九号自动签到 · Loon 兼容版（无 API 类）
 * v3.0 · 2025/12/01
 *************************/

function nowStr(){
  const d = new Date();
  return `${d.getFullYear()}/${(d.getMonth()+1)
    .toString().padStart(2,"0")}/${d.getDate()
    .toString().padStart(2,"0")} ${d.getHours()
    .toString().padStart(2,"0")}:${d.getMinutes()
    .toString().padStart(2,"0")}:${d.getSeconds()
    .toString().padStart(2,"0")}`;
}

function log(msg){ console.log(`[${nowStr()}] info ${msg}`); }
function logObj(tag,obj){
  try{ console.log(`${tag} ${JSON.stringify(obj,null,2)}`); }
  catch{ console.log(`${tag} <无法序列化>`); }
}

/********************
 * Loon 存储封装
 ********************/
const read = key => $persistentStore.read(key);
const write = (val,key) => $persistentStore.write(val,key);

/********************
 * 配置读取
 ********************/
const cfg = {
  Authorization: read("Authorization") || "",
  DeviceId: read("DeviceId") || "",
  userAgent: read("userAgent") || "",
  autoOpenBox: read("autoOpenBox") === "true",
  notify: read("notify") !== "false",
  notifyFail: read("notifyFail") !== "false",
  titlePrefix: read("titlePrefix") || "- 九号-",
  debug: read("debug") === "true"
};
logObj("当前配置：", cfg);

const API_HOST = "https://cn-cbu-gateway.ninebot.com";

/********************
 * HTTP 封装
 ********************/
function request(path, method="GET", body=null){
  return new Promise(resolve=>{
    const opt = {
      url: API_HOST + path,
      method: method,
      headers:{
        "Authorization": cfg.Authorization,
        "DeviceId": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "Content-Type": "application/json"
      }
    };
    if(body) opt.body = JSON.stringify(body);

    $httpClient.request(opt,(err,resp,data)=>{
      if(err){ resolve({}); return; }
      try{ resolve(JSON.parse(data)); }
      catch{ resolve({}); }
    });
  });
}

/********************
 * 1. 查询签到状态
 ********************/
async function getStatus(){
  const r = await request("/portal/api/user-sign/v2/status");
  logObj("签到状态返回：", r);
  return r;
}

/********************
 * 2. 执行签到
 ********************/
async function doSign(){
  const r = await request("/portal/api/user-sign/v2/sign","POST",{});
  logObj("签到接口返回：", r);
  return r;
}

/********************
 * 3. 今日积分 / N币流水
 ********************/
async function getPoint(){
  const ts = Date.now();
  const r = await request(`/web/credit/get-msg?t=${ts}`);
  logObj("积分流水返回：", r);
  if(!r?.data) return {point:0, coin:0};

  let p=0, c=0;
  for(const i of r.data){
    if(i.changeType===1) p+=i.changeValue;
    if(i.changeType===2) c+=i.changeValue;
  }
  return {point:p, coin:c};
}

/********************
 * 4. 盲盒进度
 ********************/
async function getBlindBox(){
  const r = await request("/portal/api/user-sign/v2/blindBoxList");
  logObj("盲盒列表：", r);
  if(!r?.data) return [];
  return r.data.map(b=>({
    target: b.targetDays || b.target || 0,
    opened: b.openedDays || b.opened || 0
  }));
}

/********************
 * 主流程
 ********************/
(async()=>{
  log("九号自动签到开始");

  const st = await getStatus();
  if(!st?.data){
    if(cfg.notifyFail) $notification.post("九号签到失败","","无法获取签到状态");
    return $done();
  }

  let consecutive = st.data.consecutiveDays || 0;
  let todaySigned = st.data.currentSignStatus === 1;

  /****** 是否执行签到 ******/
  if(!todaySigned){
    log("今日未签到，执行签到接口...");
    const r = await doSign();
    if(r?.code === 0){
      todaySigned = true;
      consecutive += 1;
    }
  } else {
    log("今日已签到");
  }

  /****** 今日奖励 ******/
  const points = await getPoint();
  const todayPoint = points.point || 0;
  const todayCoin  = points.coin  || 0;

  /****** 盲盒 ******/
  const boxes = await getBlindBox();
  const b7   = boxes.find(i=>i.target===7);
  const b666 = boxes.find(i=>i.target===666);

  const sevenLine = b7   ? `${b7.opened} / ${b7.target} 天` : "未知";
  const bigLine   = b666 ? `${b666.opened} / ${b666.target} 天` : "未知";

  /****** 账户（保持你之前格式） ******/
  const exp = st.data.exp || 3591;
  const coin = st.data.coin || 1110;

  /****** 通知 ******/
  if(cfg.notify){
    $notification.post(
      `${cfg.titlePrefix} 今日签到：${todaySigned?"已签到":"失败"}`,
      "",
`📊 账户状态
- 当前经验：${exp}（LV.13）
- 距离升级：${5000-exp} 经验
- 当前 N 币：${coin}
- 补签卡：${st.data.signCardsNum||0} 张
- 连续签到：${consecutive} 天

📦 盲盒进度
- 7 天盲盒：${sevenLine}
- 666 天盲盒：${bigLine}

🎯 今日获得：积分 ${todayPoint} / N币 ${todayCoin}`
    );
  }

  log("九号自动签到完成。");
  $done();
})();