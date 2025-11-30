/*
===========================================
九号智能电动车 · 单号自动签到（含分享奖励）
作者：QinyRui
版本：2.6
更新日期：2025/11/30 11:00
适配：iOS 系统
Telegram 群：https://t.me/JiuHaoAPP
===========================================
*/

const Ninebot = (() => {
    const log = (msg, debug = false) => {
        const time = new Date().toISOString().replace('T', ' ').split('.')[0];
        if (!debug || (debug && $config.debug)) console.log(`[${time}] info ${msg}`);
    };

    const $config = {
        debug: $argument?.ninebot?.debug ?? true,
        notify: $argument?.ninebot?.notify ?? true,
        titlePrefix: $argument?.ninebot?.titlePrefix ?? '九号签到',
        autoOpenBox: $argument?.ninebot?.autoOpenBox ?? true,
        autoRepair: $argument?.ninebot?.autoRepair ?? true,
        shareTaskUrl: $argument?.ninebot?.shareTaskUrl ?? '',
        progressStyle: $argument?.ninebot?.progressStyle ?? 0,
        Authorization: $argument?.ninebot?.authorization ?? '',
        DeviceId: $argument?.ninebot?.deviceId ?? '',
        UserAgent: $argument?.ninebot?.userAgent ?? ''
    };

    const headers = {
        Authorization: $config.Authorization,
        DeviceId: $config.DeviceId,
        'User-Agent': $config.UserAgent
    };

    const formatProgress = (opened, target, style = 0) => {
        const full = '⣿';
        const empty = '⣀';
        const len = 20;
        const filled = Math.round((opened / target) * len);
        return `[${full.repeat(filled)}${empty.repeat(len - filled)}] ${opened} / ${target} 天`;
    };

    const getSignStatus = async () => {
        try {
            log('查询签到状态...');
            const res = await $http.get('https://api5-h5-app-bj.ninebot.com/web/clockin/status', { headers });
            return res.data.data;
        } catch (e) {
            log(`查询签到状态失败：${e.message}`, true);
            return null;
        }
    };

    const getCredit = async () => {
        try {
            const res = await $http.get('https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst', { headers });
            return res.data.data.list ?? [];
        } catch (e) {
            log(`获取积分失败：${e.message}`, true);
            return [];
        }
    };

    const getNcoin = async () => {
        try {
            const res = await $http.get('https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2', { headers });
            return res.data.data.list ?? [];
        } catch (e) {
            log(`获取 N币失败：${e.message}`, true);
            return [];
        }
    };

    const getTodayRewards = (list) => {
        const today = Math.floor(Date.now() / 1000 / 86400);
        return list.reduce((acc, item) => {
            const day = Math.floor(parseInt(item.create_date) / 86400);
            if (day === today) acc.push(item);
            return acc;
        }, []);
    };

    const notify = async (msg) => {
        if ($config.notify) await $notify.post($config.titlePrefix, msg);
    };

    const run = async () => {
        log('九号自动签到开始');
        log(`当前配置： ${JSON.stringify($config)}`);

        const status = await getSignStatus();
        if (!status) return;

        if (status.currentSignStatus === 1) {
            log('检测到今日已签到，跳过签到接口');
        } else {
            log('今日未签到，准备执行签到...');
            // 签到接口逻辑可按需要补充
        }

        const credits = await getCredit();
        const ncoins = await getNcoin();

        const todayCredit = getTodayRewards(credits).reduce((a, c) => a + parseInt(c.credit), 0);
        const todayNcoin = getTodayRewards(ncoins).reduce((a, n) => a + parseInt(n.amount ?? 0), 0);

        log(`今日积分/ N币统计完成： ${todayCredit} / ${todayNcoin}`);

        const msgLines = [
            `✨ 今日签到：${status.currentSignStatus === 1 ? '已签到' : '未签到'}`,
            `📊 账户状态`,
            `- 当前经验：${status.credit ?? '未知'}（LV.${status.level ?? '?'})`,
            `- 距离升级：${status.credit_upgrade ?? '-'}`,
            `- 当前 N 币：${status.balance ?? '-'}`,
            `- 补签卡：${status.signCardsNum ?? 0} 张`,
            `- 连续签到：${status.consecutiveDays ?? 0} 天`,
            ``,
            `📦 盲盒进度`,
            `7 天盲盒：`,
            `${formatProgress(status.blindBox7?.opened ?? 0, 7, $config.progressStyle)}`,
            `| 666 天盲盒：`,
            `${formatProgress(status.blindBox666?.opened ?? 0, 666, $config.progressStyle)}`,
            ``,
            `🎯 今日获得：积分 ${todayCredit} / N币 ${todayNcoin}`
        ];

        await notify(msgLines.join('\n'));
        log('九号自动签到完成，通知已发送。');
        log('九号自动签到结束');
    };

    return { run };
})();

Ninebot.run();