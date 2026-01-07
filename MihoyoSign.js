const $store = $persistentStore;
const $notify = $notification;

const config = {
  cookie: $store.read("mihoyo.cookie"),
  stoken: $store.read("mihoyo.stoken"),
  ua: $store.read("mihoyo.userAgent")||"miHoYoBBS",
  title: $store.read("mihoyo.titlePrefix")||"米游社签到",
  notify: $store.read("mihoyo.notify")!=="false",
  notifyFail: $store.read("mihoyo.notifyFail")!=="false",
  logLevel: $store.read("mihoyo.logLevel")||"simple"
};

const LEVEL = {silent:0,simple:1,full:2};
function log(msg,level="simple"){if((LEVEL[config.logLevel]??1)>=LEVEL[level]) console.log(`[Mihoyo] ${msg}`);}

if(typeof $request!=="undefined"){log("抓包环境，终止","simple");$done();return;}
log("脚本开始执行","full");

if(!config.cookie||!config.stoken){
  writeStatus("凭证缺失");log("未检测到 Cookie / SToken","simple");
  if(config.notifyFail) notify("❌ 凭证缺失","请打开米游社 App 重新抓包");
  $done();return;
}
log("凭证读取成功","full");

const request={
  url:"https://bbs-api.mihoyo.com/apihub/app/api/signIn",
  method:"POST",
  headers:{
    Cookie: config.cookie,
    "User-Agent": config.ua,
    Referer:"https://bbs.mihoyo.com/",
    "x-rpc-app_version":"2.50.1",
    "x-rpc-client_type":"2"
  }
};

log("发起签到请求","full");

$httpClient.post(request,(err,resp,data)=>{
  if(err){handleFail("请求异常",err);$done();return;}
  log(`HTTP状态码：${resp?.status}`,"full");
  if(!data||typeof data!=="string"){handleFail("接口无返回数据","Empty response");$done();return;}
  const text=data.trim();
  log(`响应前120字符：${text.slice(0,120)}`,"full");
  if(!text.startsWith("{")){
    let reason="接口返回非 JSON（疑似风控）";
    if(/403|forbidden/i.test(text)) reason="403 风控拦截";
    if(/login|sign in/i.test(text)) reason="登录态失效";
    writeStatus(reason);log(reason,"simple");
    if(config.notifyFail) notify("❌ 签到失败",reason+"，请重新抓包");
    $done();return;
  }
  let json;
  try{json=JSON.parse(text);}catch(e){handleFail("JSON解析失败",e);$done();return;}
  log(`解析成功：retcode=${json.retcode}`,"full");
  if(json.retcode===0) handleSuccess(json);
  else handleApiFail(json);
  $done();
});

function handleSuccess(res){writeStatus("签到成功");log("签到成功","simple");if(config.notify) notify("✅ 签到成功",res.message||"今日签到完成");}
function handleApiFail(res){let reason=res.message||"未知错误";if(res.retcode===-100) reason="登录失效（Cookie 过期）";if(res.retcode===-5003) reason="今日已签到";if(res.retcode===-10002) reason="SToken 失效";writeStatus(reason);log(`签到失败：${reason}`,"simple");if(config.notifyFail) notify("❌ 签到失败",reason);}
function handleFail(title,err){writeStatus(title);log(`${title}：${err}`,"simple");if(config.notifyFail) notify(`❌ ${title}`,String(err));}
function writeStatus(text){$store.write(text,"mihoyo.captureStatus");}
function notify(subtitle,body=""){$notify.post(config.title,subtitle,body);}