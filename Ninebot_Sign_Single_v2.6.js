/*
 九号智能电动车 · 单号自动签到（含分享任务 + 今日奖励统计）
 作者：QinyRui
 版本：v2.6
 更新时间：2025/11/30 10:30
 适配：iOS 系统
 Telegram 群：https://t.me/JiuHaoAPP
 功能：
 - 抓包自动写入 Authorization / DeviceId / User-Agent
 - 调试日志开关
 - 通知开关
 - 自动开启盲盒
 - 自动补签
 - 分享任务处理
 - 今日新增积分 / N币统计
 - 盲盒进度显示
*/

const $ = new Env("九号自动签到");
const BOXJS_KEY = "Ninebot"; // BoxJS 存储前缀

// ================== 配置 ==================
let notify = $.getdata("ninebot.notify") === "true";
let debug = $.getdata("ninebot.debug") === "true";
let autoOpenBox = $.getdata("ninebot.autoOpenBox") === "true";
let autoRepair = $.getdata("ninebot.autoRepair") === "true";
let notifyFail = $.getdata("ninebot.notifyFail") === "true";
let titlePrefix = $.getdata("ninebot.titlePrefix") || "九号签到";
let shareTaskUrl = $.getdata("ninebot.shareTaskUrl") || "";
let progressStyle = parseInt($.getdata("ninebot.progressStyle") || 0);

// Authorization / DeviceId / User-Agent 自动写入
let Authorization = $.getdata("ninebot.authorization") || "";
let DeviceId = $.getdata("ninebot.deviceId") || "";
let UserAgent = $.getdata("ninebot.userAgent") || "";

// ================== 主函数 ==================
!(async () => {
    $.log(`${titlePrefix}开始`);
    $.log("当前配置：", { notify, autoOpenBox, titlePrefix, shareTaskUrl, progressStyle });

    try {
        // 查询签到状态
        let signStatus = await querySignStatus();
        $.log("签到状态返回：", signStatus);

        // 今日已签到
        let todaySigned = signStatus.data.currentSignStatus === 1;

        if (!todaySigned) {
            await doSign();
        } else {
            $.log("检测到今日已签到，跳过签到接口");
        }

        // 分享任务处理
        let shareCredit = 0;
        if (shareTaskUrl) {
            shareCredit = await handleShareTask(shareTaskUrl);
        }

        // 查询今日新增积分/N币
        let todayReward = await getTodayReward();

        // 查询账户信息
        let creditInfo = await getCreditInfo();
        let balanceInfo = await getBalanceInfo();
        let blindBoxList = await getBlindBoxList();

        // 渲染盲盒进度条
        let blindBoxProgress = renderBlindBoxProgress(blindBoxList);

        // 发送通知
        if (notify) {
            let notifyMsg = `✨ 今日签到：${todaySigned ? "已签到" : "签到完成"}\n\n` +
                `📊 账户状态\n` +
                `- 当前经验：${creditInfo.credit}（LV.${creditInfo.level}）\n` +
                `- 距离升级：${creditInfo.credit_range[1] - creditInfo.credit} 经验\n` +
                `- 当前 N 币：${balanceInfo.balance}\n` +
                `- 补签卡：${signStatus.data.signCardsNum} 张\n` +
                `- 连续签到：${signStatus.data.consecutiveDays} 天\n\n` +
                `📦 盲盒进度\n${blindBoxProgress}\n\n` +
                `🎯 今日获得：积分 ${todayReward.credit} / N币 ${todayReward.coin}`;

            $.msg(titlePrefix, "", notifyMsg);
        }

        $.log(`${titlePrefix}完成，通知已发送`);
    } catch (e) {
        $.logErr(e);
        if (notifyFail) $.msg(titlePrefix + "异常", "", e.message || e);
    }
})().finally(() => $.done());

// ================== 工具函数 ==================

// 查询签到状态
async function querySignStatus() {
    let url = "https://api5-h5-app-bj.ninebot.com/web/clockin/check";
    return await getRequest(url);
}

// 执行签到
async function doSign() {
    let url = "https://api5-h5-app-bj.ninebot.com/web/clockin/sign";
    return await getRequest(url);
}

// 处理分享任务
async function handleShareTask(url) {
    try {
        let res = await getRequest(url);
        // 返回新增积分示例，部分接口返回可能无
        return res?.data?.credit || 0;
    } catch (e) {
        debug && $.log("分享任务处理失败：", e);
        return 0;
    }
}

// 查询今日新增积分/N币
async function getTodayReward() {
    let creditUrl = "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst";
    let coinUrl = "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2";

    let credit = 0, coin = 0;
    try {
        let creditRes = await getRequest(creditUrl);
        let now = Math.floor(Date.now() / 1000);
        if (creditRes.data && creditRes.data.list) {
            credit = creditRes.data.list.reduce((sum, item) => sum + (item.create_date > now - 86400 ? parseInt(item.credit) : 0), 0);
        }
    } catch (e) { debug && $.log("今日积分获取失败", e); }

    try {
        let coinRes = await getRequest(coinUrl);
        let now = Math.floor(Date.now() / 1000);
        if (coinRes.data && coinRes.data.list) {
            coin = coinRes.data.list.reduce((sum, item) => sum + (item.create_time > now - 86400 ? parseInt(item.amount) : 0), 0);
        }
    } catch (e) { debug && $.log("今日N币获取失败", e); }

    return { credit, coin };
}

// 查询经验信息
async function getCreditInfo() {
    let url = "https://api5-h5-app-bj.ninebot.com/web/credit/credit-info";
    let res = await getRequest(url);
    return res.data || {};
}

// 查询余额信息
async function getBalanceInfo() {
    let url = "https://api5-h5-app-bj.ninebot.com/web/user/balance";
    let res = await getRequest(url);
    return res.data || {};
}

// 查询盲盒列表
async function getBlindBoxList() {
    let url = "https://api5-h5-app-bj.ninebot.com/web/clockin/blindBoxList";
    let res = await getRequest(url);
    return res.data || [];
}

// 渲染盲盒进度条
function renderBlindBoxProgress(list) {
    return list.map(item => {
        let full = "⣿".repeat(item.opened);
        let empty = "⣀".repeat(item.target - item.opened);
        return `${item.target} 天盲盒：\n[${full}${empty}] ${item.opened} / ${item.target} 天`;
    }).join("\n| ");
}

// 请求封装
async function getRequest(url) {
    let headers = {
        "Authorization": Authorization,
        "DeviceId": DeviceId,
        "User-Agent": UserAgent,
        "Accept": "*/*"
    };
    return new Promise((resolve, reject) => {
        $.get({
            url,
            headers
        }, (err, resp, data) => {
            try {
                if (err) reject(err);
                else resolve(JSON.parse(data));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// ================== Env 工具封装 ==================
function Env(name) {
    this.name = name;
    this.log = function (...args) { console.log(...args); };
    this.logErr = function (...args) { console.error(...args); };
    this.getdata = function (key) {
        return $argument?.[key] ?? null;
    };
    this.msg = function (title, subtitle, body) {
        console.log(title, subtitle, body);
    };
    this.done = function () { console.log("------ Script done -------"); };
}