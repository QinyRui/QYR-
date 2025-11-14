/*
📱 九号智能电动车自动签到插件（v2.3）
=========================================
👤 作者：❥﹒﹏非我不可
✈️ Telegram群：https://t.me/JiuHaoAPP
📆 更新日期：2025/11/15
💬 功能：
- 自动签到 + 自动抓取 Authorization/DeviceId
- 自动领取可开启盲盒
- 显示签到经验、N币、补签卡数量
- 支持 BoxJS 配置变量
*/

// ====== Token 捕获逻辑 ======
if (typeof $request !== "undefined" && $request.headers) {
  const auth = $request.headers["Authorization"] || $request.headers["authorization"];
  const deviceId = $request.headers["deviceId"] || $request.headers["device_id"];
  if (auth) $persistentStore.write(auth, "Ninebot_Authorization");
  if (deviceId) $persistentStore.write(deviceId, "Ninebot_DeviceId");
  if (auth || deviceId) $notification.post("🎯 九号 Token 捕获成功", "", "Authorization 与 DeviceId 已保存");
  $done({});
  return;
}

// ====== HTTP 请求封装 ======
function httpClientPost(request){return new Promise((res, rej)=>{$httpClient.post(request,(e,r,d)=>e?rej(e.toString()):res({resp:r,data:d}))});}
function httpClientGet(request){return new Promise((res, rej)=>{$httpClient.get(request,(e,r,d)=>e?rej(e.toString()):res({resp:r,data:d}))});}

// ====== 主执行函数 ======
async function run(){
  const authorization = $persistentStore.read("Ninebot_Authorization")||"";
  const deviceId = $persistentStore.read("Ninebot_DeviceId")||"";
  if(!authorization||!deviceId){$notification.post("九号签到","","⚠️ 请先登录九号 App 抓取 Token");return $done();}

  const headers={"Content-Type":"application/json","Accept":"application/json, text/plain, */*","Authorization":authorization,"platform":"h5","Origin":"https://h5-bj.ninebot.com","language":"zh","User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609103606","Referer":"https://h5-bj.ninebot.com/","device_id":deviceId};

  const urls={sign:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",status:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",blindBoxList:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",blindBoxReceive:"https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",balance:"https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606"};

  let message="",newSignDays=0,title="九号签到";

  try{
    console.log("🚀 开始执行九号签到...");
    const signRes=await httpClientPost({url:urls.sign,headers,body:JSON.stringify({deviceId})});
    const signData=JSON.parse(signRes.data||"{}");
    if(signData.code===0){const {score=0,nCoin=0}=signData.data;message+=`✅ 签到成功 🎉\n🎁 获得 ${score} 经验 + ${nCoin} N币`;}
    else if(signData.code===540004) message+="⚠️ 今日已签到";
    else message+=`❌ 签到失败：${signData.msg||"未知错误"}`;

    const statusRes=await httpClientGet({url:urls.status,headers});
    const statusData=JSON.parse(statusRes.data||"{}");
    if(statusData.code===0 && statusData.data){newSignDays=statusData.data.consecutiveDays||0;const signCardsNum=statusData.data.signCardsNum||0;message+=`\n🗓️ 连续签到：${newSignDays} 天\n🎫 补签卡：${signCardsNum} 张`; }

    const balanceRes=await httpClientGet({url:urls.balance,headers});
    const balanceData=JSON.parse(balanceRes.data||"{}");
    if(balanceData.code===0 && balanceData.data){const nBalance=balanceData.data.balance||0;message+=`\n💰 当前 N币余额：${nBalance}`;}

    const boxRes=await httpClientGet({url:urls.blindBoxList,headers});
    const boxData=JSON.parse(boxRes.data||"{}");
    if(boxData.code===0 && boxData.data?.notOpenedBoxes?.length>0){message+="\n\n📦 盲盒领取：";
      for(let box of boxData.data.notOpenedBoxes){
        if(box.leftDaysToOpen<=0 || box.rewardStatus===1){
          const receiveRes=await httpClientPost({url:urls.blindBoxReceive,headers,body:JSON.stringify({awardDays:box.awardDays})});
          const receiveData=JSON.parse(receiveRes.data||"{}");
          if(receiveData.code===0) message+=`\n  - ${box.awardDays}天盲盒已开启 🎁 奖励 ${receiveData.data.rewardValue} N币`;
          else message+=`\n  - ${box.awardDays}天盲盒领取失败`;
        }else message+=`\n  - ${box.awardDays}天盲盒，还需 ${box.leftDaysToOpen} 天`;
      }
    }
  }catch(err){message=`❌ 脚本执行出错：${err.message}`;}
  finally{if(message.includes("今日已签到")) $notification.post(title,`已签到 · 连续 ${newSignDays} 天`,"");else $notification.post(title,`连续 ${newSignDays} 天`,message);console.log("✅ 九号签到插件执行完成");$done();}
}
run();