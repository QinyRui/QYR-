#!name = 九号智能电动车 · 单号自动签到（含分享奖励）
#!desc = 支持抓包自动写入 Authorization / DeviceId / User-Agent，日志等级可选，盲盒进度条样式可选，手动签到与自动签到共存
#!openUrl = https://t.me/JiuHaoAPP
#!author = QinyRui
#!homepage = https://t.me/JiuHaoAPP
#!tag = 九号智能电动车
#!system = iOS,iPadOS,macOS
#!date = 2025-11-30 12:00:00
#!version = 2.6
#!system_version = 15

[Argument]
notify = switch, "true", "false", tag=通知开关
debugLevel = select, "1", "0|关闭日志", "1|信息级日志", "2|警告级日志", "3|详细调试日志", tag=日志等级
capture = switch, "false", "true", tag=抓包写入开关
autoRepair = switch, "true", "false", tag=自动修复分享任务开关
autoOpenBox = switch, "true", "false", tag=自动开启盲盒
titlePrefix = input, "九号签到助手", tag=自定义通知标题
cron_time = input, "1 0 * * *", tag=签到时间（CRON）
barStyle = select, "0", "0|样式①（标准方块）", "1|样式②（细线）", "2|样式③（分段条）", "3|样式④（粗条）", "4|样式⑤（Emoji）", "5|样式⑥（圆角）", "6|样式⑦（边框）", "7|样式⑧（双层）", tag=盲盒进度条样式

[Script]
#（1）抓包写入：签到状态 + 分享动作 app_log
http-request ^https:\/\/(cn-cbu-gateway\.ninebot\.com\/portal\/api\/user-sign\/v2\/status|snssdk\.ninebot\.com\/service\/2\/app_log\/) script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.js, timeout=10, tag=九号-抓包写入, enable={capture}

#（2）自动签到 + 自动修复分享任务 + 自动领取 + 盲盒进度 + 通知
cron {cron_time} script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.js, timeout=120, tag=九号-自动签到

#（3）手动运行（立即执行签到/状态）—— 供在插件里点“运行”时使用
# 注意：Loon 会把 $argument 作为字符串传入，插件 UI 会把 debugLevel/barStyle 等带入
task manual script-path=https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.js, tag=九号-手动签到