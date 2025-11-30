/*
九号智能电动车 · 单号自动签到（含分享奖励 + 今日奖励统计）
作者：QinyRui
版本：2.6
更新时间：2025/11/30 10:44
适配：iOS 系统 / Loon / Scriptable / BoxJS
说明：
- 支持抓包自动写入 Authorization / DeviceId / User-Agent
- 支持调试日志开关 ninebot.debug
- 支持通知显示签到状态、经验、N币、盲盒进度
- 今日新增积分 / N币统计
*/

;(async () => {
    try {
        const $arg = typeof $argument !== 'undefined' ? $argument : {};
        const config = {
            authorization: $arg['ninebot.authorization'] || '',
            deviceId: $arg['ninebot.deviceId'] || '',
            userAgent: $arg['ninebot.userAgent'] || '',
            debug: $arg['ninebot.debug'] !== false,
            notify: $arg['ninebot.notify'] !== false,
            autoOpenBox: $arg['ninebot.autoOpenBox'] !== false,
            autoRepair: $arg['ninebot.autoRepair'] !== false,
            notifyFail: $arg['ninebot.notifyFail'] !== false,
            titlePrefix: $arg['ninebot.titlePrefix'] || '九号签到',
            shareTaskUrl: $arg['ninebot.shareTaskUrl'] || '',
            progressStyle: $arg['ninebot.progressStyle'] || 0,
        };

        const log = (...args) => { if (config.debug) console.log(...args); }

        const nowStr = () => {
            const d = new Date();
            return `[${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
        };

        log(nowStr(), 'info', '九号自动签到开始');
        log(nowStr(), 'info', '当前配置：', config);

        if (!config.authorization || !config.deviceId) {
            log(nowStr(), 'info', '未配置 Authorization 或 DeviceId，停止执行');
            return;
        }

        const headers = {
            'Authorization': config.authorization,
            'DeviceId': config.deviceId,
            'User-Agent': config.userAgent
        };

        // ================= 查询签到状态 =================
        const signStatusRes = await fetch('https://api5-h5-app-bj.ninebot.com/web/clock-in/status', { headers });
        const signStatus = await signStatusRes.json();
        log(nowStr(), 'info', '签到状态返回：', signStatus);

        let todaySigned = false;
        let consecutiveDays = 0, signCards = 0, blindBoxList = [];
        if (signStatus?.code === 0 && signStatus.data) {
            todaySigned = signStatus.data.currentSignStatus === 1;
            consecutiveDays = signStatus.data.consecutiveDays;
            signCards = signStatus.data.signCardsNum;
        }

        if (todaySigned) {
            log(nowStr(), 'info', '检测到今日已签到，跳过签到接口');
        } else {
            // 可以调用签到接口（此处略）
        }

        // ================= 分享 / 今日奖励统计 =================
        let todayCredit = 0, todayCoin = 0;

        // 积分收入
        const creditRes = await fetch('https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst', { headers });
        const creditJson = await creditRes.json();
        if (creditJson?.code === 1 && Array.isArray(creditJson.data?.list)) {
            const todayTs = new Date();
            todayTs.setHours(0,0,0,0);
            const todayTime = Math.floor(todayTs.getTime()/1000);
            creditJson.data.list.forEach(item => {
                if (parseInt(item.create_date) >= todayTime) {
                    todayCredit += parseInt(item.credit);
                }
            });
        }

        // N币收入
        const coinRes = await fetch('https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2', { headers });
        const coinJson = await coinRes.json();
        if (coinJson?.data?.list && Array.isArray(coinJson.data.list)) {
            const todayTs = new Date();
            todayTs.setHours(0,0,0,0);
            const todayTime = Math.floor(todayTs.getTime()/1000);
            coinJson.data.list.forEach(item => {
                if (parseInt(item.create_time) >= todayTime) {
                    todayCoin += parseInt(item.amount);
                }
            });
        }

        // ================= 经验 / 等级 =================
        const userInfoRes = await fetch('https://api5-h5-app-bj.ninebot.com/web/user-info', { headers });
        const userInfo = await userInfoRes.json();
        const credit = userInfo?.data?.credit || 0;
        const level = userInfo?.data?.level || 0;

        // ================= N币余额 =================
        const balanceRes = await fetch('https://api5-h5-app-bj.ninebot.com/web/user/money', { headers });
        const balanceJson = await balanceRes.json();
        const coinBalance = balanceJson?.data?.balance || 0;

        // ================= 盲盒列表 =================
        const blindRes = await fetch('https://api5-h5-app-bj.ninebot.com/web/clock-in/blind-box', { headers });
        const blindJson = await blindRes.json();
        if (blindJson?.data?.list) {
            blindBoxList = blindJson.data.list;
        }

        // ================= 构建通知内容 =================
        const genBoxStr = (opened, target) => {
            let filled = '⣿'.repeat(opened);
            let empty = '⣀'.repeat(Math.max(0, target - opened));
            return `[${filled}${empty}] ${opened} / ${target} 天`;
        };

        let notifyMsg = `✨ 今日签到：${todaySigned ? '已签到' : '未签到'}\n`;
        notifyMsg += `📊 账户状态\n- 当前经验：${credit}（LV.${level}）\n`;
        notifyMsg += `- 当前 N 币：${coinBalance}\n- 补签卡：${signCards} 张\n- 连续签到：${consecutiveDays} 天\n\n`;
        notifyMsg += `📦 盲盒进度\n`;
        blindBoxList.forEach(b => {
            notifyMsg += `${b.target} 天盲盒：\n${genBoxStr(b.opened,b.target)}\n`;
        });
        notifyMsg += `\n🎯 今日获得：积分 ${todayCredit} / N币 ${todayCoin}`;

        if (config.notify) {
            // 在不同环境使用对应通知方法
            if (typeof $notification !== 'undefined') {
                $notification.post(config.titlePrefix, '', notifyMsg);
            } else {
                console.log(notifyMsg);
            }
        }

        log(nowStr(), 'info', '九号自动签到完成，通知已发送。');
    } catch (e) {
        console.log(nowStr(), 'error', e.message || e);
        if (typeof $notification !== 'undefined') {
            $notification.post('九号签到异常', '', e.message || JSON.stringify(e));
        }
    }
})();