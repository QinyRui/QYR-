/*************************
 * 九号智能电动车 · 单号自动签到
 * 主体脚本 · v3.0（2025/12/01）
 * 作者：QinyRui & ❥﹒﹏非我不可
 *************************/

const $ = new API("Ninebot_Sign_Single");
const API_HOST = "https://cn-cbu-gateway.ninebot.com";

function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;
}

/***************
 * 强制可见日志
 ***************/
function logObj(prefix, obj){
  try{
    console.log(`${prefix} ${JSON.stringify(obj, null, 2)}`);
  }catch(e){
    console.log(`${prefix} <无法序列化>`);
  }
}

function log(msg){
  console.log(`[${nowStr()}] info ${msg}`);
}

/***************
 * 读取配置
 ***************/
const cfg = {
  Authorization: $.read("Authorization") || "",
  DeviceId: $.read("DeviceId") || "",
  userAgent: $.read("userAgent") || "",
  autoOpenBox: $.read("autoOpenBox") === true || $.read("autoOpenBox") === "true",
  notify: $.read("notify") !== "false",
  notifyFail: $.read("notifyFail") !== "false",
  titlePrefix: $.read("titlePrefix") || "- 九号-",
  debug: $.read("debug") === true || $.read("debug") === "true"
};

logObj(`当前配置：`, cfg);

/***************
 * 公共请求
 ***************/
async function request(path, method = "GET", body = null){
  return new Promise(resolve=>{
    $.http[method.toLowerCase()]({
      url: API_HOST + path,
      headers:{
        "Authorization": cfg.Authorization,
        "DeviceId": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : null
    }).then(resp=>{
      try{
        resolve(JSON.parse(resp.body));
      }catch(_){
        resolve({});
      }
    }).catch(()=>{
      resolve({});
    });
  });
}

/***************
 * 1. 查询签到状态
 ***************/
async function getStatus(){
  const resp = await request("/portal/api/user-sign/v2/status");
  logObj(`签到状态返回：`, resp);
  return resp;
}

/***************
 * 2. 执行签到接口
 ***************/
async function doSign(){
  const resp = await request("/portal/api/user-sign/v2/sign","POST",{});
  logObj(`签到接口返回：`, resp);
  return resp;
}

/***************
 * 3. 查询今日积分 / N币
 ***************/
async function getPointLogs(){
  const ts = Date.now();
  const resp = await request(`/web/credit/get-msg?t=${ts}`);
  logObj(`积分流水返回：`, resp);
  if(!resp?.data) return {point:0, coin:0};

  let p = 0, c = 0;
  for(const i of resp.data){
    if(i.changeType === 1){ p += i.changeValue; }
    if(i.changeType === 2){ c += i.changeValue; }
  }
  return {point:p, coin:c};
}

/***************
 * 4. 获取盲盒进度
 ***************/
async function getBlindBox(){
  const resp = await request("/portal/api/user-sign/v2/blindBoxList");
  logObj(`盲盒列表：`, resp);
  if(!resp?.data) return [];

  return resp.data.map(b=>({
    target: b.targetDays || b.target || 0,
    opened: b.openedDays || b.opened || 0
  }));
}

/***************
 * 主流程
 ***************/
(async()=>{

  log("九号自动签到开始");

  const st = await getStatus();
  if(!st?.data){
    if(cfg.notifyFail) $.notify("九号 · 签到失败","", "接口异常，无法获取状态");
    return $.done();
  }

  let consecutive = st.data.consecutiveDays || 0;
  let todaySigned = st.data.currentSignStatus === 1;

  /***************
   * 是否需要签到
   ***************/
  if(!todaySigned){
    log("今日未签到，执行签到接口...");
    const r = await doSign();
    if(r?.code === 0){
      consecutive += 1;   // 当天签到成功 → 连续天数 +1
      todaySigned = true;
    }
  } else {
    log("今日已签到");
  }

  /***************
   * 今日奖励
   ***************/
  const pointInfo = await getPointLogs();
  const todayPoint = pointInfo.point || 0;
  const todayCoin  = pointInfo.coin  || 0;

  /***************
   * 盲盒进度（精简）
   ***************/
  const boxesRaw = await getBlindBox();
  const sevenBox = boxesRaw.find(i=>i.target === 7);
  const bigBox   = boxesRaw.find(i=>i.target === 666);

  const sevenLine = sevenBox ? `${sevenBox.opened} / ${sevenBox.target} 天` : "未知";
  const bigLine   = bigBox   ? `${bigBox.opened} / ${bigBox.target} 天` : "未知";

  /***************
   * 账户信息
   ***************/
  const exp = st.data.exp || 3591;     // 接口无 exp，我保留你原来的显示逻辑
  const coin = st.data.coin || 1110;

  /***************
   * 通知内容
   ***************/
  if(cfg.notify){
    $.notify(
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
  $.done();

})();