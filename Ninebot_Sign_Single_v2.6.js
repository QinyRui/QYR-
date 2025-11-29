// ===== Ninebot_Sign_Single_v2.6.js（最终版） =====

// 插件参数读取
const debugLevel = $argument.debugLevel || "1";  // 日志等级
const barStyle = $argument.barStyle || "1";      // 盲盒进度条样式
const notify = $argument.notify === "true";      // 通知开关
const titlePrefix = $argument.titlePrefix || "九号签到助手";

// ===== 日志函数 =====
function logInfo(msg) { if (["1","2","3"].includes(debugLevel)) console.log(`[INFO] ${msg}`); }
function logWarn(msg) { if (["2","3"].includes(debugLevel)) console.warn(`[WARN] ${msg}`); }
function logDebug(msg) { if (debugLevel === "3") console.debug(`[DEBUG] ${msg}`); }

// ===== 盲盒进度条渲染 =====
function renderBlindBox(current, total) {
    const styles = {
        "0": "■",
        "1": "─",
        "2": "▌",
        "3": "█",
        "4": "🎁",
        "5": "●",
        "6": "▢",
        "7": "▤"
    };
    const block = styles[barStyle] || "■";
    const filled = block.repeat(current);
    const empty = block.repeat(total - current).replace(/./g, '□');
    return `[${filled}${empty}] ${current}/${total} 天`;
}

// ===== 通知内容生成 =====
function buildNotifyContent(signData, nCoin, exp) {
    return `
🎉 今日签到：${signData.currentSignStatus ? "成功" : "已签到"}
+${exp} 经验（签到奖励）
+${nCoin} N币（分享奖励）

📊 账户状态
等级：LV.${signData.level}
当前经验：${signData.currentExp}
距离升级：${signData.nextExp}  
当前 N币：${signData.nCoin}
补签卡：${signData.signCard} 张
连续签到：${signData.consecutiveDays} 天

🎁 盲盒进度
7天盲盒：  ${renderBlindBox(signData.blindBox7, 7)}
666天盲盒：  ${renderBlindBox(signData.blindBox666, 666)}
`.trim();
}

// ===== 示例数据（抓包或接口获取后实际替换） =====
const signData = {
    currentSignStatus: 1,
    level: 13,
    currentExp: 3583,
    nextExp: 1417,
    nCoin: 1108,
    signCard: 5,
    consecutiveDays: 424,
    blindBox7: 1,
    blindBox666: 424
};
const nCoinToday = 10; // 分享任务奖励
const expToday = 25;   // 签到奖励

// ===== 执行逻辑 =====
logInfo(`当前日志等级: ${debugLevel}`);
logInfo(`当前盲盒进度条样式: ${barStyle}`);
logDebug(`签到状态数据: ${JSON.stringify(signData)}`);

// ===== 发送通知 =====
if (notify) {
    $notification.post(titlePrefix, "", buildNotifyContent(signData, nCoinToday, expToday));
}

// ===== TODO: 添加实际抓包 / 接口调用逻辑 =====
// 1. 查询签到状态
// 2. 判断是否已签到
// 3. 自动签到 + 分享任务领取
// 4. 更新盲盒进度
// 5. 输出日志，支持日志等级控制

logInfo("九号自动签到脚本执行完成");