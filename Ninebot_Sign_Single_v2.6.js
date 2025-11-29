#!name = 九号智能电动车 · 单号自动签到（含分享奖励）
#!desc = 抓包写入教程→打开 Loon 抓包开关→打开九号 APP 签到页或分享动作，会自动写入数据
#!openUrl = https://t.me/JiuHaoAPP
#!author = QinyRui
#!homepage = https://t.me/JiuHaoAPP
#!tag = 九号智能电动车
#!system = iOS,iPadOS,macOS
#!date = 2025-11-29 20:00:00
#!version = 2.6
#!system_version = 15

[Argument]
notify = switch, "true", "false", tag=通知开关
debugLevel = select, "0","1","2","3","4","5","6", tag=调试日志等级
autoRepair = switch, "true", "false", tag=自动修复分享任务开关
titlePrefix = input, "九号签到助手", tag=自定义通知标题
progressStyle = select, "0","1","2","3","4","5","6","7", tag=盲盒进度条样式
cron_time = input, "1 0 * * *", tag=签到时间（CRON）
autoOpenBox = switch, "true", "false", tag=自动开启盲盒
capture = switch, "false", "true", tag=抓包写入开关

[Script]
# 抓包写入
http-request ^https:\/\/(cn-cbu-gateway\.ninebot\.com\/portal\/api\/user-sign\/v2\/status|snssdk\.ninebot\.com\/service\/2\/app_log\/) script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.js, timeout=10, tag=九号-抓包写入, enable={capture}

# 自动签到 + 自动修复分享任务 + 自动开箱
cron {cron_time} script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.js, timeout=120, tag=九号-自动签到