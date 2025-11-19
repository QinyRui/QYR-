#!name=九号智能电动车 · 单账号自动签到
#!desc=支持调试日志、通知、盲盒、补签、内测开关；可手动/自动抓包写入 Authorization、DeviceId、User-Agent；支持手动签到及自定义 CRON。
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
EnableCapture = switch, "false", "true", tag = 自动抓包写入开关, desc = 此开关开启后，APP操作时自动抓包写入账号信息
enable_debug = switch, "false", "true", tag = 调试日志开关, desc = 输出调试信息到控制台
enable_notify = switch, "true", "false", tag = 通知开关, desc = 签到完成是否发送通知
enable_openbox = switch, "true", "false", tag = 自动盲盒开关, desc = 自动开启可领取的盲盒
enable_supplement = switch, "true", "false", tag = 自动补签开关, desc = 自动使用补签卡补签
enable_internal_test = switch, "false", "true", tag = 内测申请开关, desc = 自动申请内测资格
RunManualSign = switch, "false", "true", tag = 手动执行签到, desc = 点击此开关可手动执行签到脚本

notify_title = input, "九号签到助手", tag = 自定义通知标题, desc = 修改签到通知标题
cron_time = input, "10 8 * * *", tag = 签到时间CRON（修改此项改变执行时间）, desc = 定时执行签到时间设置

Authorization = input, "", tag = Authorization（可手动输入或自动写入）, desc = 抓包或手动填写Authorization
DeviceId = input, "", tag = DeviceId（可手动输入或自动写入）, desc = 抓包或手动填写DeviceId
UserAgent = input, "", tag = User-Agent（可手动输入或自动写入）, desc = 抓包或手动填写User-Agent

####################################
#            Script
####################################
# 自动抓包写入（开关控制）
http-request ^https:\/\/.+ninebot\.com\/.+ script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-抓包写入, timeout = 10, enable = {EnableCapture}

# 定时执行签到（由用户 CRON 控制）
cron {cron_time} script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-自动签到, timeout = 120

# 手动执行签到
cron 0 0 0 1 1 ? script-path = https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js, tag = 九号-手动签到, timeout = 120, enable = {RunManualSign}