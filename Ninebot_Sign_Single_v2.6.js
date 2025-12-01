/***********************************************
 Ninebot_Sign_Single_v2.6.js  （动态盲盒 + 今日奖励版）
***********************************************/

/* ENV wrapper */
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";

function readPS(key){ try{ if(HAS_PERSIST) return $persistentStore.read(key); return null; } catch(e){return null;} }
function writePS(val,key){ try{ if(HAS_PERSIST) return $persistentStore.write(val,key); return false;}catch(e){return false;} }
function notify(title,sub,body){ if(HAS_NOTIFY) $notification.post(title,sub,body); }
function nowStr(){ return new Date().toLocaleString(); }

/* BoxJS keys */
const KEY_AUTH="ninebot.authorization";
const KEY_DEV="ninebot.deviceId";
const KEY_UA="ninebot.userAgent";
const KEY_TITLE="ninebot.titlePrefix";

/* Endpoints */
const END={
  sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  boxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box-list"
};

/* HTTP with retry */
function request({method="GET",url,headers={},body=null}) {
  return new Promise((resolve,reject)=>{
    const opts={url,headers,timeout:12000};
    if(method==="POST") opts.body=typeof body==="string"?body:JSON.stringify(body||{});
    const cb=(err,resp,data)=>{
      if(err){ reject(err); return; }
      try{ resolve(JSON.parse(data||"{}")); } catch(e){ resolve({raw:data}); }
    };
    if(method==="GET") $httpClient.get(opts,cb);
    else $httpClient.post(opts,cb);
  });
}

/* Main flow */
(async()=>{
  try{
    const headers={
      "Authorization": readPS(KEY_AUTH)||"",
      "device_id": readPS(KEY_DEV)||"",
      "User-Agent": readPS(KEY_UA)||"",
      "Content-Type":"application/json;charset=UTF-8"
    };

    console.log(`[${nowStr()}] info 九号自动签到开始`);

    // 查询签到状态
    const statusResp=await request({url:`${END.status}?t=${Date.now()}`,headers});
    const statusData=statusResp?.data||{};
    let consecutiveDays=statusData?.consecutiveDays||0;
    const signCards=statusData?.signCardsNum||0;
    const currentSignStatus=statusData?.currentSignStatus;
    const isSigned=[1,'1',true,'true'].includes(currentSignStatus);
    console.log(`[${nowStr()}] info 签到状态返回：`,statusResp);

    // 今日奖励
    let todayExp=0,todayCoin=0,signMsg="";
    if(!isSigned){
      console.log(`[${nowStr()}] info 今日未签到，执行签到接口...`);
      const signResp=await request({method:"POST",url:END.sign,headers,body:{deviceId:readPS(KEY_DEV)||""}});
      console.log(`[${nowStr()}] info 签到接口返回：`,signResp);
      if(signResp.code===0 || signResp.success===true){
        consecutiveDays+=1;
        const rewardList=signResp.data?.rewardList||[];
        for(const r of rewardList){
          const value=Number(r.rewardValue||0);
          const type=Number(r.rewardType||0);
          if(type===1) todayExp+=value;
          else todayCoin+=value;
        }
        signMsg=`✨ 今日签到：成功\n🎁 签到奖励：+${todayExp} 经验、+${todayCoin} N 币`;
      }else{
        signMsg=`❌ 签到失败：${signResp.msg||signResp.message||JSON.stringify(signResp)}`;
      }
    }else{
      signMsg=`✨ 今日签到：已签到`;
    }

    // 动态获取盲盒列表
    let blindStr="";
    try{
      const boxResp=await request({url:END.boxList,headers});
      const boxList=boxResp?.data?.list||[];
      if(boxList.length>0){
        blindStr=boxList.map(b=>`${b.target} 天盲盒：${b.opened} / ${b.target} 天`).join("\n| ");
      }
    }catch(e){
      console.warn("获取盲盒列表失败:",e);
    }

    // 发送通知
    const cfgTitle=readPS(KEY_TITLE)||"九号签到助手";
    let notifyBody=`${signMsg}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n📦 盲盒进度\n${blindStr}\n\n🎯 今日获得：积分 ${todayExp} / N币 ${todayCoin}`;
    notify(cfgTitle,"",notifyBody);
    console.log(`[${nowStr()}] info 发送通知：`,notifyBody);
    console.log(`[${nowStr()}] info 九号自动签到完成。`);

  }catch(e){
    console.error(`[${nowStr()}] error 自动签到异常：`,e);
  }
})();