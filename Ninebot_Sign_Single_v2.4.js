/*
📱 九号智能电动车 · 全功能签到（单号版 v2.4）
👤 作者：QinyRui & ❥﹒﹏非我不可
📆 功能：
  - 自动签到、补签、盲盒领取
  - 内测资格检测 + 自动申请
  - 控制台日志 + 通知
  - BoxJS 配置读取
*/

const isReq = typeof $request !== "undefined" && $request.headers;
const read = (k: string): string | null => (typeof $persistentStore !== "undefined" ? $persistentStore.read(k) : null);
const write = (v: string, k: string): boolean => { if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k); return false; };
const notify = (title: string, sub: string, body: string): void => { if (typeof $notification !== "undefined") $notification.post(title, sub, body); };

// ---------- BoxJS keys ----------
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_AUTOREPAIR = "ninebot.autoRepair";
const KEY_AUTOAPPLYBETA = "ninebot.autoApplyBeta";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";

// ---------- 辅助函数 (日志函数已修改为无条件打印) ----------
type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, ...args: any[]): void {
  const timestamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const prefix = `[Ninebot][${timestamp}]`;
  const formattedArgs = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2); // 格式化输出 JSON 对象
      } catch (e) {
        return String(arg); // 处理循环引用或其他 JSON.stringify 错误
      }
    }
    return arg;
  });

  switch (level) {
    case "info":
      console.info(prefix, ...formattedArgs);
      break;
    case "warn":
      console.warn(prefix, ...formattedArgs);
      break;
    case "error":
      console.error(prefix, ...formattedArgs);
      break;
    default:
      console.log(prefix, ...formattedArgs); // 默认使用 console.log
  }
}

log("info", "--- 脚本开始执行 ---");

// ---------- 抓包写入 ----------
if (isReq) {
  log("info", "--- 检测到抓包请求，开始处理 ---");
  try {
    const h: Record<string, string> = $request.headers || {};
    const auth: string = h["Authorization"] || h["authorization"] || "";
    const dev: string = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
    const ua: string = h["User-Agent"] || h["user-agent"] || "";

    let changed: boolean = false;
    if (auth && read(KEY_AUTH) !== auth) { write(auth, KEY_AUTH); changed = true; }
    if (dev && read(KEY_DEV) !== dev) { write(dev, KEY_DEV); changed = true; }
    if (ua && read(KEY_UA) !== ua) { write(ua, KEY_UA); changed = true; }

    if (changed) {
      notify("九号智能电动车", "抓包成功 ✓", "Authorization / DeviceId / User-Agent 已写入 BoxJS");
      log("info", "抓包写入成功:", {auth, dev, ua});
    } else {
      log("info", "抓包数据无变化，无需写入。");
    }
  } catch (e: any) {
    log("error", "抓包写入异常：", e);
  }
  log("info", "--- 抓包请求处理完毕 ---");
  $done({});
}

// ---------- 读取配置 ----------
log("info", "--- 读取配置 ---");
interface Config {
  Authorization: string;
  DeviceId: string;
  userAgent: string;
  debug: boolean;
  notify: boolean;
  autoOpenBox: boolean;
  autoRepair: boolean;
  autoApplyBeta: boolean;
  notifyFail: boolean;
  titlePrefix: string;
}

const cfg: Config = {
  Authorization: read(KEY_AUTH) || "",
  DeviceId: read(KEY_DEV) || "",
  userAgent: read(KEY_UA) || "",
  debug: read(KEY_DEBUG) === "false" ? false : true,
  notify: read(KEY_NOTIFY) === "false" ? false : true,
  autoOpenBox: read(KEY_AUTOBOX) === "true",
  autoRepair: read(KEY_AUTOREPAIR) === "true",
  autoApplyBeta: read(KEY_AUTOAPPLYBETA) === "true",
  notifyFail: read(KEY_NOTIFYFAIL) === "false" ? false : true,
  titlePrefix: read(KEY_TITLE) || "九号签到"
};

log("info", "当前配置:", cfg);

if (!cfg.Authorization || !cfg.DeviceId) {
  notify(cfg.titlePrefix, "未配置 Token", "请先开启抓包并在九号 App 里操作以写入 Authorization 与 DeviceId");
  log("warn", "配置缺失：Authorization 或 DeviceId 未设置。脚本终止。");
  $done();
}

// ---------- HTTP helpers ----------
interface HttpResponse {
  code?: number;
  msg?: string;
  data?: any;
  raw?: string;
  success?: boolean; // For beta registration
}

interface HttpRequestOptions {
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function httpPost({ url, headers, body = "{}" }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body }, (err: any, resp: any, data: string) => {
      if (err) {
        reject(err);
      } else {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch (e) {
          resolve({ raw: data });
        }
      }
    });
  });
}

function httpGet({ url, headers }: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err: any, resp: any, data: string) => {
      if (err) {
        reject(err);
      } else {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch (e) {
          resolve({ raw: data });
        }
      }
    });
  });
}

// ---------- Endpoints ----------
const headers: Record<string, string> = {
  "Authorization": cfg.Authorization,
  "Content-Type": "application/json",
  "device_id": cfg.DeviceId,
  "User-Agent": cfg.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Mobile/15E148 Segway v6",
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh"
};

const END = {
  sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  repair: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
  balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  betaStatus: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration/status",
  betaApply: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration"
};


// ---------- 主流程 ----------
!(async (): Promise<void> => {
  let notifyBody: string = "";

  try {
    // 1) 签到
    log("info", "--- 开始执行签到流程 ---");
    log("info", "发送签到请求...");
    const sign: HttpResponse = await httpPost({ url: END.sign, headers, body: JSON.stringify({deviceId: cfg.DeviceId}) });
    log("info", "签到返回：", sign);
    if (sign && sign.code === 0) {
      notifyBody += `🎉 签到成功\n🎁 +${sign.data?.nCoin || sign.data?.score || 0} N币`;
      log("info", `签到成功，获得 ${sign.data?.nCoin || sign.data?.score || 0} N币`);
    } else if (sign && sign.code === 540004) {
      notifyBody += `⚠️ 今日已签到`;
      log("warn", "今日已签到，无需重复操作。");
    } else {
      const errorMessage: string = (sign && (sign.msg || String(sign))) || "未知错误";
      notifyBody += `❌ 签到失败：${errorMessage}`;
      log("error", `签到失败：${errorMessage}`, sign);
      if(!cfg.notifyFail) notifyBody = "";
    }

    // 2) 状态
    log("info", "--- 查询签到状态 ---");
    const st: HttpResponse = await httpGet({ url: END.status, headers });
    log("info", "状态返回：", st);
    if (st && st.code === 0) {
      const data: any = st.data || {};
      const days: number = data.consecutiveDays || data.continuousDays || 0;
      const cards: number = data.signCardsNum || data.remedyCard || 0;
      notifyBody += `\n🗓 连续签到：${days} 天\n🎫 补签卡：${cards} 张`;
      log("info", `连续签到：${days} 天，补签卡：${cards} 张`);
    } else {
      log("warn", "获取签到状态失败或无数据。", st);
    }

    // 3) 余额
    log("info", "--- 查询N币余额 ---");
    const bal: HttpResponse = await httpGet({ url: END.balance, headers });
    log("info", "余额返回：", bal);
    if (bal && bal.code === 0) {
      notifyBody += `\n💰 N币余额：${bal.data?.balance || 0}`;
      log("info", `N币余额：${bal.data?.balance || 0}`);
    } else {
      log("warn", "获取N币余额失败或无数据。", bal);
    }

    // 4) 盲盒
    log("info", "--- 查询盲盒列表 ---");
    const box: HttpResponse = await httpGet({ url: END.blindBoxList, headers });
    log("info", "盲盒返回：", box);
    const notOpened: any[] = box?.data?.notOpenedBoxes || box?.data || [];
    if (Array.isArray(notOpened) && notOpened.length > 0) {
      notifyBody += `\n\n📦 盲盒任务：`;
      log("info", `发现 ${notOpened.length} 个未开启盲盒。`);
      notOpened.forEach(b => {
        const days: string | number = b.awardDays || b.boxDays || b.days || "?";
        const left: string | number = b.leftDaysToOpen || b.diffDays || "?";
        notifyBody += `\n- ${days}天盲盒，还需 ${left} 天`;
        log("info", `- ${days}天盲盒，还需 ${left} 天`);
      });

      if (cfg.autoOpenBox) {
        log("info", "--- 尝试自动开启盲盒 ---");
        const ready: any[] = notOpened.filter(b => (b.leftDaysToOpen === 0 || b.diffDays === 0) && (b.rewardStatus === 2 || b.status === 2));
        if (ready.length > 0) {
          notifyBody += `\n\n🎉 自动开启盲盒：`;
          log("info", `发现 ${ready.length} 个可开启盲盒。`);
          for (const b of ready) {
            try {
              log("info", `尝试领取 ${b.awardDays || b.boxDays}天盲盒...`);
              const r: HttpResponse = await httpPost({ url: END.blindBoxReceive, headers, body: "{}" });
              log("info", "盲盒领取返回：", r);
              if (r && r.code === 0) {
                notifyBody += `\n🎁 ${b.awardDays || b.boxDays}天盲盒获得：${r.data?.rewardValue || r.data?.score || "未知"}`;
                log("info", `${b.awardDays || b.boxDays}天盲盒领取成功，获得：${r.data?.rewardValue || r.data?.score || "未知"}`);
              } else {
                notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取失败`;
                log("warn", `${b.awardDays || b.boxDays}天盲盒领取失败。`, r);
              }
            } catch (e: any) {
              log("error", `盲盒领取异常 (${b.awardDays || b.boxDays}天盲盒)：`, e);
              notifyBody += `\n❌ ${b.awardDays || b.boxDays}天盲盒领取异常`;
            }
          }
        } else {
          log("info", "没有可立即开启的盲盒。");
        }
      } else {
        log("info", "未开启自动开启盲盒功能。");
      }
    } else {
      log("info", "未发现未开启盲盒。");
    }

    // 5) 自动补签
    log("info", "--- 尝试自动补签 ---");
    if (cfg.autoRepair) {
      try {
        if (st && st.code === 0) {
          const cards: number = st.data?.signCardsNum || st.data?.remedyCard || 0;
          const days: number = st.data?.consecutiveDays || st.data?.continuousDays || 0;
          if (cards > 0 && days === 0) {
            log("info", "检测到有补签卡且连续签到天数为0，触发自动补签。");
            const rep: HttpResponse = await httpPost({ url: END.repair, headers, body: "{}" });
            log("info", "补签返回：", rep);
            if (rep && rep.code === 0) {
              notifyBody += `\n🔧 自动补签成功`;
              log("info", "自动补签成功。");
            } else {
              const repairErrorMessage: string = (rep && rep.msg) ? rep.msg : "未知错误";
              notifyBody += `\n🔧 自动补签失败：${repairErrorMessage}`;
              log("warn", `自动补签失败：${repairErrorMessage}`, rep);
            }
          } else {
            log("info", `不满足自动补签条件：补签卡 ${cards} 张，连续签到 ${days} 天。`);
          }
        } else {
          log("warn", "无法获取签到状态，跳过自动补签。");
        }
      } catch (e: any) {
        log("error", "自动补签异常：", e);
      }
    } else {
      log("info", "未开启自动补签功能。");
    }

    // 6) 内测资格检测 & 自动申请
    log("info", "--- 内测资格检测与自动申请 ---");
    try{
      const beta: HttpResponse = await httpGet({url:END.betaStatus, headers});
      log("info", "内测状态返回：", beta);

      if(beta?.data?.qualified){
        notifyBody+="\n🚀 已获得内测资格";
        log("info", "已获得内测资格。");
      }else{
        notifyBody+="\n⚠️ 未获得内测资格";
        log("warn", "未获得内测资格。");
        if(cfg.autoApplyBeta){
          log("info", "已开启自动申请内测资格，尝试申请...");
          try{
            const applyResp: HttpResponse = await httpPost({
              url: END.betaApply,
              headers,
              body: JSON.stringify({deviceId: cfg.DeviceId})
            });
            log("info", "内测申请返回：", applyResp);
            if(applyResp?.success){
              notifyBody+=" → 自动申请成功 🎉";
              log("info", "自动申请内测资格成功。");
            }else{
              notifyBody+=" → 自动申请失败 ❌";
              log("warn", "自动申请内测资格失败。", applyResp);
            }
          }catch(e: any){
            log("error", "内测自动申请异常：", e);
            notifyBody+=" → 自动申请异常 ❌";
          }
        } else {
          log("info", "未开启自动申请内测资格功能。");
        }
      }
    }catch(e: any){
      log("error", "内测检测异常：", e);
    }

    // ✅ 最终通知
    log("info", "--- 脚本主流程执行完毕 ---");
    if(cfg.notify) {
      notify(cfg.titlePrefix,"签到结果",notifyBody);
      log("info", "发送通知：", { title: cfg.titlePrefix, sub: "签到结果", body: notifyBody });
    } else {
      log("info", "通知功能未开启，跳过发送通知。");
    }

  } catch (e: any) {
    log("error", "主流程发生未捕获异常：", e);
    if(cfg.notify) {
      notify(cfg.titlePrefix,"脚本异常",String(e));
      log("error", "发送异常通知：", { title: cfg.titlePrefix, sub: "脚本异常", body: String(e) });
    } else {
      log("error", "通知功能未开启，但主流程发生异常，请检查日志。");
    }
  }

  log("info", "--- 脚本执行结束 ---");
  $done();
})();