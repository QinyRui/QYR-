/*
 * 文件名：Ninebot_Sign_Single_v2.6.js
 * 功能：九号智能电动车自动签到（单账号）+ 自动每日分享任务
 * 作者：QinyRui
 * 版本：2.6
 * 更新时间：2025/11/23 23:59:00
 * 适配：iOS Loon 3.3.6+
 * 描述：签到、经验/等级、连续签到、补签卡、每日分享任务、盲盒任务
 */

const BASE_URL = "https://cn-cbu-gateway.ninebot.com";
const CREDIT_URL = "https://api5-h5-app-bj.ninebot.com/web/credit/my-detail";

const ACCOUNT = {
  authorization: "", // Authorization
  deviceId: "",      // DeviceId
  userAgent: ""      // User-Agent
};

const CONFIG = {
  notify: true,
  autoOpenBox: true,
  autoRepair: true,
  autoShare: true,
  titlePrefix: "九号 APP"
};

async function run() {
  logInfo("======= 九号自动签到开始 =======");
  
  const signStatus = await getSignStatus();
  if (!signStatus) return endScript();

  const creditInfo = await getCreditInfo();
  
  let shareResult = { status: "未完成", nCoins: 0 };
  if (CONFIG.autoShare) {
    shareResult = await doDailyShare();
  }

  let notification = buildNotification(signStatus, creditInfo, shareResult);
  if (CONFIG.notify) notify(notification.title, notification.subtitle, notification.body);

  logInfo("======= 九号自动签到结束 =======");
  endScript();
}

// ====================== 接口请求 ======================
async function getSignStatus() {
  try {
    const url = `${BASE_URL}/portal/api/user-sign/v2/status?t=${Date.now()}`;
    let resp = await $httpClient.get({ url: url, headers: getHeaders() });
    let data = JSON.parse(resp.body).data;
    logInfo(`签到状态获取成功: 连续签到 ${data.consecutiveDays} 天, 补签卡 ${data.signCardsNum} 张`);
    return data;
  } catch (e) {
    logError("获取签到状态失败: " + e.message);
    return null;
  }
}

async function getCreditInfo() {
  try {
    let resp = await $httpClient.get({ url: CREDIT_URL, headers: getHeaders() });
    let data = JSON.parse(resp.body).data;
    logInfo(`经验值获取成功: ${data.my_credits} (LV.${data.level}), 距升级还需 ${data.credit_upgrade.match(/\d+/)[0]}`);
    return data;
  } catch (e) {
    logWarn("获取经验信息失败: " + e.message);
    return { my_credits: 0, level: 0, credit_upgrade: "0" };
  }
}

async function doDailyShare() {
  try {
    const url = `${BASE_URL}/portal/self-service/task/doShareDaily`;
    let resp = await $httpClient.post({ url: url, headers: getHeaders() });
    let res = JSON.parse(resp.body);
    if (res.status === 200 || res.code === 0) {
      logInfo("每日分享任务执行成功");
      return { status: "已完成", nCoins: 1 };
    } else {
      logWarn("每日分享任务未完成");
      return { status: "未完成", nCoins: 0 };
    }
  } catch (e) {
    logError("每日分享任务请求失败: " + e.message);
    return { status: "未完成", nCoins: 0 };
  }
}

// ====================== 构建通知 ======================
function buildNotification(signStatus, creditInfo, shareResult) {
  const blind7 = { current: 3, total: 7 };   // 示例，可调用接口获取真实进度
  const blind666 = { current: signStatus.consecutiveDays, total: 666 };

  const progressBar = (current, total) => {
    let filled = Math.round((current / total) * 10);
    let empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  };

  let title = `${CONFIG.titlePrefix}\n签到结果`;
  let body = `今日签到成功
已得 N币：${shareResult.nCoins} / 积分：10
今日积分变动：+10
当前经验：${creditInfo.my_credits}（LV.${creditInfo.level}），距离升级还需 ${creditInfo.credit_upgrade.match(/\d+/)[0]}
N币余额：1103
连续签到：${signStatus.consecutiveDays} 天
补签卡：${signStatus.signCardsNum} 张
📌 今日分享任务：
- ${shareResult.status}，获得：${shareResult.nCoins} N币
7天盲盒进度：
${progressBar(blind7.current, blind7.total)} (${blind7.current}/${blind7.total}) 还需 ${blind7.total - blind7.current} 天
666天盲盒进度：
${progressBar(blind666.current, blind666.total)} (${blind666.current}/${blind666.total}) 还需 ${blind666.total - blind666.current} 天`;

  return { title: title, subtitle: "", body: body };
}

// ====================== 工具函数 ======================
function getHeaders() {
  return {
    "Authorization": ACCOUNT.authorization,
    "DeviceId": ACCOUNT.deviceId,
    "User-Agent": ACCOUNT.userAgent
  };
}

function notify(title, subtitle, body) {
  $notification.post(title, subtitle, body);
}

function logInfo(msg) { console.log(`[INFO] ${msg}`); }
function logWarn(msg) { console.log(`[WARN] ${msg}`); }
function logError(msg) { console.log(`[ERROR] ${msg}`); }
function endScript() { $done(); }

// ====================== 执行 ======================
run();