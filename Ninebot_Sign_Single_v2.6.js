/*
Ninebot_Sign_Single_v2.6.js
最终整合版（不减配 + 图形化通知 + 全功能）
更新日期：2025/11/27

功能含：
- 自动签到（带是否已签到判断）
- 自动完成每日分享任务
- 今日经验增量
- 今日积分（含分享任务积分）
- 今日 N 币
- 补签卡数量
- 连续签到天数
- 7天盲盒进度
- 666天盲盒进度
- 盲盒进度条 8 种可选（BoxJS）
- 图形化美化通知（紧凑版）
- 抓包自动写入 Authorization / DeviceId / UA
- 自动重试网络
- 文件名固定：Ninebot_Sign_Single_v2.6.js
*/

const SCRIPT_NAME = "九号智能电动车 · 自动签到";
const MAX_RETRY = 3;
const RETRY_DELAY = 1500;
const TIMEOUT = 12000;

// ========= Storage =========
const read = k => $persistentStore.read(k) || "";
const write = (v, k) => $persistentStore.write(String(v), k);

// ========= Keys =========
const KEY_AUTH = "ninebot.auth";
const KEY_DEVICE = "ninebot.device";
const KEY_UA = "ninebot.ua";
const KEY_BOX_STYLE = "ninebot.box.style"; // 盲盒进度条样式

// ========== 抓包自动写入 ==========
if (typeof $request !== "undefined") {
  const url = $request.url || "";
  if (url.includes("/status")) {
    if ($request.headers.Authorization) write($request.headers.Authorization, KEY_AUTH);
    if ($request.headers["DeviceId"]) write($request.headers["DeviceId"], KEY_DEVICE);
    if ($request.headers["User-Agent"]) write($request.headers["User-Agent"], KEY_UA);
    console.log("🎯 已自动写入抓包数据");
  }
  $done({});
  return;
}

// ========== 网络请求 ==========
function http(method, url, body = null) {
  const headers = {
    "Authorization": read(KEY_AUTH),
    "DeviceId": read(KEY_DEVICE),
    "User-Agent": read(KEY_UA),
    "Content-Type": "application/json"
  };

  return new Promise((resolve, reject) => {
    $httpClient[method](
      { url, body: body ? JSON.stringify(body) : null, headers, timeout: TIMEOUT },
      (e, r, d) => {
        if (e) reject(e);
        else resolve(JSON.parse(d || "{}"));
      }
    );
  });
}

async function safeRequest(fn, desc) {
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      return await fn();
    } catch (e) {
      console.log(`❌ ${desc} 失败（${i}/${MAX_RETRY}）: ${e}`);
      if (i < MAX_RETRY) await sleep(RETRY_DELAY);
    }
  }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ========== 接口 ==========
const API = {
  status: "https://ebike.ninebot.com/user/credit/status",
  sign: "https://ebike.ninebot.com/user/credit/sign",
  share: "https://ebike.ninebot.com/user/credit/share",
};

// ========== 主流程 ==========
(async () => {
  console.log("====== 九号自动签到开始 ======");

  const status = await safeRequest(() => http("get", API.status), "查询状态");
  if (!status || !status.data) return notify("请求失败，请检查 Token");

  const data = status.data;

  // 基础数据
  const signed = data.signToday;
  const exp = data.exp;
  const level = data.level;
  const ncoin = data.coin;
  const signDays = data.signDays;
  const repair = data.repairCard;

  const box7 = data.lucky_7;
  const box666 = data.lucky_666;

  let expGain = 0;
  let pointGain = 0;
  let coinGain = 0;
  let shareGain = 0;

  // ===== 签到 =====
  if (!signed) {
    const signRes = await safeRequest(() => http("post", API.sign), "签到");
    if (signRes?.data) {
      expGain = signRes.data.exp || 0;
      coinGain = signRes.data.coin || 0;
      pointGain = signRes.data.point || 0;
    }
  }

  // ===== 分享任务 =====
  const shareRes = await safeRequest(() => http("post", API.share), "分享任务");
  if (shareRes?.data) shareGain = shareRes.data.point || 0;
  pointGain += shareGain;

  // ========== 盲盒进度条（从 BoxJS 读取） ==========
  const styleIndex = parseInt(read(KEY_BOX_STYLE) || "1", 10);
  const styleList = [
    "□□□□□□□", "■■■■■■■", "▬▬▬▬▬▬▬", "███████",
    "▓▓▓▓▓▓▓", "▒▒▒▒▒▒▒", "░░░░░░░", "●●●●●●●"
  ];
  const sym = styleList[styleIndex - 1] || styleList[0];

  const boxBar = (cur, total) => {
    const len = 7;
    const filled = Math.min(len, Math.floor((cur / total) * len));
    return (
      sym.substring(0, filled) +
      sym.replace(/./g, "░").substring(filled, len)
    );
  };

  const box7Bar = boxBar(box7, 7);
  const box666Bar = boxBar(box666, 666);

  // ========== 图形化通知 ==========
  const msg =
`
🔔 九号智能电动车 · 今日签到结果
🎉 今日签到：${signed ? "已签到" : "成功"}  
${expGain ? `+${expGain} 经验` : ""} ${coinGain ? `| +${coinGain} N币` : ""} ${pointGain ? `| +${pointGain} 积分` : ""}

📊 账户状态
等级：LV.${level}
当前经验：${exp}  
距离升级：${5000 - exp}
当前 N 币：${ncoin}
补签卡：${repair} 张
连续签到：${signDays} 天

🎁 盲盒进度
7天盲盒：  
【${box7Bar}】 ${box7}/7 天

666天盲盒：  
【${box666Bar}】 ${box666}/666 天

📤 今日分享任务
${shareGain ? "✔ 已完成" : "✘ 未获得奖励"} ${shareGain ? `(+${shareGain} 积分)` : ""}
`;

  notify("九号签到 · 完整结果", msg);
  console.log("====== 九号自动签到结束 ======");
})();

function notify(title, body) {
  $notification.post(title, "", body);
}