// 九号智能电动车自动签到主体脚本 v2.6
// 作者：QinyRui
// 更新时间：2025-11-29
// 功能：签到、分享任务、盲盒进度、日志等级、通知
// 适配：iOS/iPadOS/macOS

(async () => {
    // 插件传参处理
    const capture = $argument?.capture === 'true';
    const notify = $argument?.notify !== 'false';
    const debugLevel = $argument?.debugLevel || "1";
    const barStyle = $argument?.barStyle || "1";
    const titlePrefix = $argument?.titlePrefix || "九号签到助手";

    function log(level, msg) {
        const levels = { "0": 0, "1": 1, "2": 2, "3": 3 };
        if (levels[debugLevel] >= levels[level]) console.log(`[${level}] ${msg}`);
    }

    // ---------- 查询签到状态 ----------
    log("1", "查询签到状态...");
    let status;
    try {
        status = await $http.get("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status");
        status = status.data || {};
        log("1", `签到状态：${JSON.stringify(status)}`);
    } catch (e) {
        log("2", `查询签到状态失败：${e.message}`);
        status = {};
    }

    // ---------- 判断今日是否已签到 ----------
    const todaySigned = status.currentSignStatus === 1;
    if (todaySigned) log("1", "今日已签到，跳过签到接口调用");
    else {
        log("1", "开始执行签到...");
        try {
            await $http.post("https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign", {});
            log("1", "签到成功 +25 经验");
        } catch (e) {
            log("3", `签到失败：${e.message}`);
        }
    }

    // ---------- 查询分享任务 ----------
    log("1", "查询分享任务...");
    let shareData = { count: 0, list: [] };
    try {
        const res = await $http.get("https://snssdk.ninebot.com/service/2/app_log/");
        shareData = res.data || { count: 0, list: [] };
        log("1", `分享任务返回：${JSON.stringify(shareData)}`);
    } catch (e) {
        log("2", `分享任务接口错误：${e.message}`);
    }

    // ---------- 查询账户经验与N币 ----------
    log("1", "查询账户经验与余额...");
    let account = { credit: 0, level: 0, balance: 0, signCards: 0, consecutiveDays: 0 };
    try {
        const res = await $http.get("https://cn-cbu-gateway.ninebot.com/portal/api/user/credit");
        const d = res.data || {};
        account.credit = d.credit || 0;
        account.level = d.level || 0;
        account.balance = d.balance || 0;
        account.signCards = status.signCards || 0;
        account.consecutiveDays = status.consecutiveDays || 0;
    } catch (e) {
        log("2", `查询账户失败：${e.message}`);
    }

    // ---------- 构建盲盒进度条 ----------
    function renderProgress(current, total, style) {
        const ratio = Math.min(current / total, 1);
        let bar = "";
        switch (style) {
            case "0": // 标准方块
                bar = "■".repeat(current) + "□".repeat(total - current);
                break;
            case "1": // 细线
                bar = "─".repeat(current) + " ".repeat(total - current);
                break;
            case "2": // 分段条
                bar = "▮".repeat(current) + "▯".repeat(total - current);
                break;
            case "3": // 粗条
                bar = "█".repeat(current) + "░".repeat(total - current);
                break;
            case "4": // Emoji
                bar = "🟩".repeat(current) + "⬜".repeat(total - current);
                break;
            case "5": // 圆角
                bar = "●".repeat(current) + "○".repeat(total - current);
                break;
            case "6": // 边框
                bar = "[" + "■".repeat(current) + "□".repeat(total - current) + "]";
                break;
            case "7": // 双层
                bar = "⣿".repeat(current) + "⣀".repeat(total - current);
                break;
            default:
                bar = "■".repeat(current) + "□".repeat(total - current);
        }
        return bar;
    }

    const progress7 = renderProgress(account.consecutiveDays % 7, 7, barStyle);
    const progress666 = renderProgress(account.consecutiveDays, 666, barStyle);

    // ---------- 构建通知内容 ----------
    const title = `${titlePrefix} · 今日签到结果`;
    const body = `
🎉 今日签到：${todaySigned ? "已签到" : "成功 +25 经验"}

📊 账户状态
等级：LV.${account.level}
当前经验：${account.credit}  
距离升级：${account.credit_upgrade || "未知"}
当前 N币：${account.balance}  
补签卡：${account.signCards} 张  
连续签到：${account.consecutiveDays} 天

🎁 盲盒进度
7天盲盒：
${progress7} ${account.consecutiveDays % 7}/7 天
666天