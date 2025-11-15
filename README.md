自动签到、自动盲盒、Token 捕获
支持 BoxJS / Loon / Surge / Quantumult X / Stash / Shadowrocket

⸻

🏆 功能亮点
	•	🟢 自动捕获 Token：Authorization 与 DeviceId（只需抓包一次）
	•	🟢 单账号每日自动签到
	•	🟢 连续签到天数 / 补签卡 / N币余额 自动查询
	•	🟢 盲盒任务：自动开启并领取奖励
	•	🟢 日志开关 / 通知开关：控制台信息可详细输出
	•	🟢 兼容主流脚本环境

⸻

🚀 快速开始

1️⃣ 抓包获取 Token

打开九号 App → 登录 → 抓包任意请求头 → 复制 Authorization 与 DeviceId

2️⃣ BoxJS 配置

导入 BoxJS 订阅：https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Single_BoxJS.json 填写字段：
	•	Authorization
	•	Device ID
	•	自定义显示名称
	•	日志开关 / 通知开关

3️⃣ Loon 插件订阅

导入 Loon 插件：https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2_Single.plugin	•	定时执行
https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2_Single_Auto.js	•	定时执行
	•	自动捕获 Token
	•	支持自动盲盒

4️⃣ 主脚本（可单独运行）https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2_Single_Auto.js
⸻

📦 BoxJS 配置示例[
  {
    "name": "主号",
    "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "DeviceId": "06965B02-DE89-45AB-9116-9B69923BF54C"
  }
]全局配置（可选）：{
  "debug": true,
  "notify": true,
  "titlePrefix": "九号签到",
  "logPrefix": "Ninebot-LOG",
  "autoOpenBox": true,
  "concurrentDelayMs": 600
}
图标
 我图标
文件名
功能
订阅 / Raw 链接
📝
Ninebot_Sign_Share_v2.2_Single_Auto.js
主脚本（单账号签到 / 自动盲盒 / Token 捕获）
Raw
📦
Ninebot_Sign_Single_BoxJS.json
BoxJS 配置订阅
Raw
🔌
Ninebot_Sign_Share_v2.2_Single.plugin
Loon 插件订阅
Raw
📖
README.md
本说明文档

⸻

⚠️ 注意事项
	•	❌ 请勿公开分享含个人 Authorization / DeviceId 的脚本
	•	🔄 建议每天定时抓包一次更新 Token
	•	⚙️ 日志开关：debug=true 可在控制台输出详细信息
	•	🔔 通知开关：notify=true 可弹出签到/盲盒状态

⸻

📬 联系方式
	•	作者：❥﹒﹏非我不可
	•	Telegram 群组：https://t.me/JiuHaoAPP￼

⸻

