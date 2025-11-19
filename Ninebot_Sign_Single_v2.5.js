#!name=九号智能电动车 · 单账号自动签到
#!desc=支持抓包自动写入 Authorization、DeviceId、User-Agent；调试日志、通知、盲盒、补签、内测开关；手动签到 + CRON 控制。
#!author=❥﹒﹏非我不可 & QinyRui
#!version=2.5
#!homepage=https://t.me/JiuHaoAPP
#!icon=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/icon/ninebot_128.png
#!system=ios
#!icon-color=#0A84FF

####################################
#             UI 设置
####################################
[Argument]
enable_debug = switch, "false", "true", tag = 调试日志开关
enable_notify = switch, "true", "false", tag = 通知开关
enable_openbox = switch, "true", "false", tag = 自动盲盒开关
enable_supplement = switch, "true", "false", tag = 自动补签开关
enable_internal_test = switch, "false", "true", tag = 内测申请开关

notify_title = input, "九号签到助手", tag = 自定义通知标题
cron_time = input, "10 8 * * *", tag = 签到时间 CRON（修改此项改变执行时间）

Authorization = input, "", tag = Authorization（手动或抓包）
DeviceId = input, "", tag = DeviceId（手动或抓包）
UserAgent = input, "", tag = User-Agent（手动或抓包）

enable_manual_sign = switch, "false", "true", tag = 手动签到开关
enable_capture = switch, "false", "true", tag = 抓包写入开关

####################################
#            Script
####################################
[Script]

// ① 抓包写入（可选）
http-request ^https:\/\/.+ninebot\.com\/.+ script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-抓包写入, timeout = 10, enable = {enable_capture}

// ② 自动签到（由用户 CRON 控制）
cron {cron_time} script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-自动签到, timeout = 120

// ③ 手动签到（开关控制）
cron 0 0 * * * script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-手动签到, enable = {enable_manual_sign}, timeout = 120


// 下面是主体代码

// 假设我们提供了一个按钮或开关来触发手动配置
function saveConfiguration() {
    const auth = prompt("请输入 Authorization:");
    const deviceId = prompt("请输入 DeviceId:");

    // 检查输入是否有效
    if (auth && deviceId) {
        // 保存到本地存储
        write(auth, "Authorization");
        write(deviceId, "DeviceId");

        // 输出日志确认写入成功
        log("手动保存成功：", { Authorization: auth, DeviceId: deviceId });

        // 提示用户已成功保存
        notify("九号签到助手", "配置保存成功", "Authorization 和 DeviceId 已成功保存！");
    } else {
        // 输入无效时的提示
        notify("九号签到助手", "配置保存失败", "请确保填写了有效的 Authorization 和 DeviceId！");
    }
}

// 手动保存配置
saveConfiguration();

// 自动读取并输出保存的配置
const auth = read("Authorization");
const deviceId = read("DeviceId");
log("已保存的配置：", { Authorization: auth, DeviceId: deviceId });

// 运行主逻辑部分
class NinebotSign {
    constructor() {
        this.Authorization = read("Authorization");
        this.DeviceId = read("DeviceId");
        this.UserAgent = read("UserAgent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
    }

    // 执行签到操作
    async signIn() {
        if (!this.Authorization || !this.DeviceId) {
            notify("九号签到助手", "未配置 Authorization 或 DeviceId", "请确保已手动配置这两个值。");
            return;
        }

        const requestHeaders = {
            "Authorization": this.Authorization,
            "Device-Id": this.DeviceId,
            "User-Agent": this.UserAgent,
        };

        const response = await fetch("https://api.ninebot.com/v2/signin", {
            method: "POST",
            headers: requestHeaders,
        });

        const result = await response.json();

        if (result.success) {
            notify("九号签到助手", "签到成功", `今日已签到，连续签到天数：${result.continuousDays}`);
        } else {
            notify("九号签到助手", "签到失败", `错误信息：${result.error}`);
        }
    }

    // 自动签到（根据 CRON 时间控制）
    async autoSignIn() {
        if (!this.Authorization || !this.DeviceId) {
            notify("九号签到助手", "未配置 Authorization 或 DeviceId", "请确保已手动配置这两个值。");
            return;
        }

        await this.signIn();
    }
}

// 创建一个 NinebotSign 实例并运行自动签到
const signIn = new NinebotSign();
signIn.autoSignIn();