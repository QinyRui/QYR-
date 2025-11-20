/*
📱 九号智能电动车 · 单号自动签到（v2.6）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签
  - 自动领取盲盒（奖励包括 N币/经验等）
  - 内测资格检测 + 自动申请
  - 日志打印 + 通知
  - BoxJS / Loon 插件配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = k => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v, k) => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); };
const notify = (title, sub, body) => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

const cfg = {
    debug: read("ninebot.debug") !== "false",
    notify: read("ninebot.notify") !== "false",
    autoOpenBox: read("ninebot.autoOpenBox") === "true",
    autoRepair: read("ninebot.autoRepair") === "true",
    autoApplyBeta: read("ninebot.autoApplyBeta") === "true",
    notifyFail: read("ninebot.notifyFail") !== "false",
    titlePrefix: read("ninebot.titlePrefix") || "九号签到",
    Authorization: read("ninebot.authorization") || "",
    DeviceId: read("ninebot.deviceId") || "",
    userAgent: read("ninebot.userAgent") || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
    enableCapture: read("enable_capture") === "true", // 是否开启抓包
};

// ---------- HTTP helpers ----------
function httpPost({ url, headers, body = "{}" }) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
            }
        });
    });
}
function httpGet({ url, headers }) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err, resp, data) => {
            if (err) reject(err);
            else {
                try { resolve(JSON.parse(data || "{}")); } catch { resolve({ raw: data }); }
            }
        });
    });
}

// ---------- 辅助函数 ----------
function log(...args){ if(cfg.debug) console.log("[Ninebot]", ...args); }
function safeStr(v){ try{ return JSON.stringify(v); } catch { return String(v); } }

// ---------- 主流程 ----------
!(async () => {
    let notifyBody = "";

    try {
        log("开始执行九号签到脚本...");

        // 1) 如果启用了抓包，直接从请求中提取数据，并保存
        if (cfg.enableCapture && isReq) {
            const authorization = $request.headers["Authorization"];
            const deviceId = $request.headers["DeviceId"];
            const userAgent = $request.headers["User-Agent"];
            
            if (authorization && deviceId && userAgent) {
                write(authorization, "ninebot.authorization");
                write(deviceId, "ninebot.deviceId");
                write(userAgent, "ninebot.userAgent");

                notifyBody += "📡 抓包成功：数据已自动写入\n";
                log("抓包成功，数据已写入：", { authorization, deviceId, userAgent });
            } else {
                notifyBody += "⚠️ 抓包失败：未能获取完整数据\n";
                log("抓包失败：未能获取完整数据");
            }

            // 如果仅执行抓包操作，不进行签到等操作，结束脚本
            if (cfg.enableCapture) {
                if (cfg.notify) notify(cfg.titlePrefix, "抓包完成", notifyBody);
                return;
            }
        }

        // 2) 签到
        log("开始签到...");
        const sign = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
        log("签到返回原始数据：", sign);
        if(sign && sign.code === 0) notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
        else if(sign && sign.code === 540004) notifyBody += `⚠️ 已签到,不能重复签到`;
        else notifyBody += `❌ 签到失败: ${sign?.msg || safeStr(sign)}`;

        // 3) 状态
        const st = await httpGet({ url: END.status, headers });
        log("状态返回原始数据：", st);
        if(st && st.code === 0){
            const data = st.data || {};
            const days = data.consecutiveDays || data.continuousDays || 0;
            const cards = data.signCardsNum || data.remedyCard || 0;
            notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
        }

        // 4) 余额
        const bal = await httpGet({ url: END.balance, headers });
        log("余额返回原始数据：", bal);
        if(bal && bal.code === 0) notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;

        // 5) 盲盒
        const box = await httpGet({ url: END.blindBoxList, headers });
        log("盲盒列表返回原始数据：", box);
        const notOpened = box?.data?.notOpenedBoxes || [];
        if(notOpened.length>0){
            notifyBody += `\n📦 盲盒任务：`;
            notOpened.forEach(b => {
                const left = b.leftDaysToOpen ?? b.diffDays ?? "?";
                notifyBody += `\n- ${b.awardDays}天盲盒，还需 ${left} 天`;
            });

            if(cfg.autoOpenBox){
                const ready = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
                for(const b of ready){
                    try{
                        const r = await httpPost({ url: END.blindBoxReceive, headers, body: JSON.stringify({awardDays: b.awardDays}) });
                        log("盲盒领取返回：", r);

                        if(r && r.code === 0 && r.data?.rewards){
                            const rewardsText = r.data.rewards.map(item => `${item.value || "未知"} ${item.type || ""}`).join("，");
                            notifyBody += `\n🎁 ${b.awardDays}天盲盒获得：${rewardsText}`;
                        }else{
                            notifyBody += `\n❌ ${b.awardDays}天盲盒领取失败: ${r?.msg || "未知"}`;
                        }
                    }catch(e){
                        log("盲盒领取异常：", e);
                        notifyBody += `\n❌ ${b.awardDays}天盲盒领取异常`;
                    }
                }
            }
        }

        // ✅ 最终通知
        if(cfg.notify) notify(cfg.titlePrefix, "签到结果", notifyBody);
        log("脚本执行完成.");
    } catch(e){
        log("主流程异常：", e);
        if(cfg.notify) notify(cfg.titlePrefix, "脚本异常", String(e));
    }

    $done();
})();