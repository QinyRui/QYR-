九号智能电动车自动签到 v2.6

文件名：Ninebot_Sign_Single_v2.6.js
版本：v2.6
更新日期：2025/11/24
作者：QinyRui
功能说明
	•	自动查询签到状态，避免重复签到
	•	自动发送签到请求
	•	自动完成分享任务并统计今日积分
	•	显示今日签到/分享获得的 N币与积分
	•	显示当前经验值、等级及升级所需经验
	•	连续签到天数、补签卡数量显示
	•	7天/666天盲盒进度条显示
	•	自动抓包写入 Authorization / DeviceId / User-Agent 到 BoxJS
	•	日志带时间戳，开始/结束明显分隔
	•	网络异常自动重试
	•	支持开启/关闭通知、自动开盲盒、自动修复等功能
BoxJS 配置说明
	•	抓包匹配：仅匹配 /portal/api/user-sign/v2/status 链接
	•	写入内容：
	•	Authorization → ninebot.authorization
	•	DeviceId → ninebot.deviceId
	•	User-Agent → ninebot.userAgent
	•	通知：抓包成功会推送“Authorization / DeviceId / User-Agent 已写入 BoxJS”
	•	自动开盲盒、自动修复、通知失败提醒 等功能可在 BoxJS 开关控制
配置参数说明
参数
类型
默认
说明
notify
Boolean
true
是否发送签到通知
autoOpenBox
Boolean
true
是否自动开启盲盒
autoRepair
Boolean
true
是否自动修复
notifyFail
Boolean
true
签到失败是否发送通知
titlePrefix
String
“九号签到”
通知标题前缀
Authorization
String
“”
抓包写入，必填
DeviceId
String
“”
抓包写入，必填
userAgent
String
“”
抓包写入，可选

任务统计说明
	•	签到奖励：N币 + 积分
	•	分享任务：自动完成，积分统计在“今日总积分”中
	•	经验值 / 等级：从接口获取当前经验及升级需求
	•	盲盒进度条：
	•	7天盲盒 → 默认 5格
	•	666天盲盒 → 默认 12格
	•	连续签到 & 补签卡：显示最新状态
文件说明
	•	Ninebot_Sign_Single_v2.6.js → 主脚本
	•	README.md → 功能说明文档
	•	版本 v2.6 是最终增强版，整合自动分享任务及积分统计
使用方法
	1.	在 Loon / Quantumult X / Surge 等 iOS 自动化平台导入脚本
	2.	打开九号 APP 并操作签到页面
	3.	抓包写入 Authorization / DeviceId / User-Agent 至 BoxJS
	4.	配置 BoxJS 开关（通知、自动开盲盒等）
	5.	定时执行脚本即可

