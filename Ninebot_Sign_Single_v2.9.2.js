#!name = 九号智能电动车 · 单号自动签到（极简可调日志版）
#!desc = 抓包写入 BoxJS + 自动签到/盲盒开箱，插件UI可调日志等级
#!openUrl = https://t.me/JiuHaoAPP
#!author = QinyRui
#!homepage = https://t.me/JiuHaoAPP
#!tag = 九号智能电动车
#!system = iOS,iPadOS,macOS
#!date = 2025-12-05 16:30:00
#!version = 2.9.2
#!system_version = 15

[Argument]
notify = switch, "true", "false", tag=通知开关
capture = switch, "false", "true", tag=抓包写入开关
cron_time = input, "1 0 * * *", tag=签到时间（CRON）
logLevel = select, "debug", "info", "warn", "error", tag=脚本日志等级（插件UI可调）

[Script]
# 抓包写入（依赖抓包开关）
http-request ^https:\/\/cn-cbu-gateway\.ninebot\.com\/portal\/api\/user-sign\/v2\/status script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.9.2_LOG.js, timeout=10, tag=九号-抓包写入, enable={capture}

# 自动签到 + 盲盒开箱（依赖CRON调度）
cron {cron_time} script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.9.2_LOG.js, timeout=120, tag=九号-自动签到

[Mitm]
hostname = cn-cbu-gateway.ninebot.com