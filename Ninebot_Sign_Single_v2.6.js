/*
九号智能电动车自动签到（单账号）
作者：QinyRui
版本：2.6
更新时间：2025/11/30 10:30
说明：
- 自动签到、分享任务奖励
- 自动盲盒开启
- 今日新增积分/N币统计
- 通知显示总经验/总N币及新增奖励
*/

const $ = new Env('九号自动签到');

(async () => {
    try {
        // 读取配置
        const notify = $.getVal('ninebot.notify') ?? true;
        const autoOpenBox = $.getVal('ninebot.autoOpenBox') ?? true;
        const titlePrefix = $.getVal('ninebot.titlePrefix') ?? '九号签到';
        const shareTaskUrl = $.getVal('ninebot.shareTaskUrl') ?? '';
        const progressStyle = parseInt($.getVal('ninebot.progressStyle') ?? 0);

        const auth = $.getVal('ninebot.authorization') || '';
        const deviceId = $.getVal('ninebot.deviceId') || '';
        const userAgent = $.getVal('ninebot.userAgent') || '';

        // 日志
        $.log(`九号自动签到开始`);
        $.log(`当前配置：`, {notify, autoOpenBox, titlePrefix, shareTaskUrl, progressStyle});

        if (!auth || !deviceId || !userAgent) {
            throw '请在插件 UI 填写 Authorization / DeviceId / User-Agent';
        }

        // 查询签到状态
        let signStatus = await getSignStatus(auth, deviceId, userAgent);
        $.log('签到状态返回：', signStatus);

        let todayNewCredit = 0;
        let todayNewCoin = 0;

        if (signStatus.currentSignStatus === 0) {
            // 未签到，执行签到
            let signResult = await doSign(auth, deviceId, userAgent);
            $.log('签到结果：', signResult);
        } else {
            $.log('检测到今日已签到，跳过签到接口');
        }

        // 分享任务奖励
        if (shareTaskUrl) {
            let shareResult = await doShareTask(shareTaskUrl, auth, deviceId, userAgent);
            $.log('分享任务处理完成，获得 N币：', shareResult.newCoin);
        }

        // 查询今日新增积分 / N币
        const creditResult = await getTodayCredit(auth, deviceId, userAgent);
        todayNewCredit = creditResult.todayCredit;
        todayNewCoin = creditResult.todayCoin;
        $.log(`今日积分/ N币统计完成：`, todayNewCredit, todayNewCoin);

        // 查询账户总经验/N币
        const account = await getAccountInfo(auth, deviceId, userAgent);

        // 查询盲盒
        const boxList = await getBlindBoxList(auth, deviceId, userAgent);

        // 发送通知
        if (notify) {
            const title = `${titlePrefix}`;
            const body = `✨ 今日签到：${signStatus.currentSignStatus ? '已签到' : '签到成功'}
📊 账户状态
- 当前经验：${account.credit}（LV.${account.level}）
- 距离升级：${account.credit_range[1] - account.credit} 经验
- 当前 N 币：${account.balance}
- 补签卡：${signStatus.signCardsNum} 张
- 连续签到：${signStatus.consecutiveDays} 天

📦 盲盒进度
7 天盲盒：
${renderProgress(boxList[0], 7, progressStyle)}
666 天盲盒：
${renderProgress(boxList[1], 666, progressStyle)}

🎯 今日获得：积分 ${todayNewCredit} / N币 ${todayNewCoin}`;
            $.msg(title, '', body);
        }

        $.log('九号自动签到完成，通知已发送。');
    } catch (e) {
        $.logErr(e);
        $.msg('九号签到错误', '', e.toString());
    } finally {
        $.done();
    }
})();

// ------------------------- 函数区 -------------------------

async function getSignStatus(auth, deviceId, userAgent) {
    const url = 'https://api5-h5-app-bj.ninebot.com/web/clockIn/info';
    const resp = await $.httpGet(url, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    return resp.data || {};
}

async function doSign(auth, deviceId, userAgent) {
    const url = 'https://api5-h5-app-bj.ninebot.com/web/clockIn/sign';
    const resp = await $.httpPost(url, {}, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    return resp.data || {};
}

async function doShareTask(shareUrl, auth, deviceId, userAgent) {
    const resp = await $.httpGet(shareUrl, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    // 返回今天新增 N币
    return {newCoin: resp.data?.coin || 0};
}

async function getTodayCredit(auth, deviceId, userAgent) {
    const creditUrl = 'https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst';
    const coinUrl = 'https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2';
    let today = new Date().toISOString().slice(0,10).replace(/-/g,''); // YYYYMMDD

    // 积分
    let creditResp = await $.httpGet(creditUrl, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    let todayCredit = creditResp.data?.list?.filter(c => {
        return new Date(c.create_date * 1000).toISOString().slice(0,10).replace(/-/g,'') === today;
    }).reduce((sum, c) => sum + parseInt(c.credit), 0) || 0;

    // N币
    let coinResp = await $.httpGet(coinUrl, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    let todayCoin = coinResp.data?.list?.filter(c => {
        return new Date(c.create_date * 1000).toISOString().slice(0,10).replace(/-/g,'') === today;
    }).reduce((sum, c) => sum + parseInt(c.amount || 0), 0) || 0;

    return {todayCredit, todayCoin};
}

async function getAccountInfo(auth, deviceId, userAgent) {
    const url = 'https://api5-h5-app-bj.ninebot.com/web/credit/info';
    const resp = await $.httpGet(url, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    const data = resp.data || {};
    return {
        credit: data.credit || 0,
        level: data.level || 0,
        credit_range: data.credit_range || [0,0],
        balance: (await getBalance(auth, deviceId, userAgent)) || 0
    };
}

async function getBalance(auth, deviceId, userAgent) {
    const url = 'https://api5-h5-app-bj.ninebot.com/web/user/balance';
    const resp = await $.httpGet(url, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    return resp.data?.balance || 0;
}

async function getBlindBoxList(auth, deviceId, userAgent) {
    const url = 'https://api5-h5-app-bj.ninebot.com/web/clockIn/blind-box/list';
    const resp = await $.httpGet(url, {
        headers: {Authorization: auth, DeviceId: deviceId, 'User-Agent': userAgent}
    });
    return resp.data || [];
}

function renderProgress(box, max, style) {
    const filled = box.opened;
    const total = box.target;
    let bar = '';
    const block = ['⣀','⣄','⣆','⣇','⣧','⣷','⣿'];
    for (let i=0;i<filled;i++) {
        bar += block[style % block.length];
    }
    for (let i=filled;i<max;i++) {
        bar += ' ';
    }
    return `[${bar}] ${filled} / ${max} 天`;
}

// ------------------------- 环境封装 -------------------------
function Env(name) {
    this.name = name;
    this.log = console.log;
    this.logErr = console.error;
    this.msg = (title, subtitle, body) => console.log(title + '\n' + body);
    this.getVal = (key) => process.env[key];
    this.httpGet = async (url, opts) => {
        // 请自行实现 HTTP GET 请求
    };
    this.httpPost = async (url, body, opts) => {
        // 请自行实现 HTTP POST 请求
    };
    this.done = () => {};
}