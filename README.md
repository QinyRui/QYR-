# 📱 九号智能电动车自动签到脚本（分享版）

> 🚀 支持自动签到 + 自动捕获 Token + 精美通知排版  
> 🧩 适用于 Loon / Surge / Quantumult X / Stash / Shadowrocket 等平台

---

## 🧾 脚本信息

| 项目 | 内容 |
|------|------|
| **脚本名称** | 九号智能电动车自动签到 |
| **作者** | ❥﹒﹏非我不可 |
| **版本** | v2.2 Share Edition |
| **更新日期** | 2025-11-13 |
| **Telegram 群** | [@JiuHaoAPP](https://t.me/JiuHaoAPP) |
| **Raw 地址** | https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2.js |

---

## ✨ 功能简介

- 🔁 自动签到九号智能电动车账户  
- 🧠 自动捕获 `Authorization` 与 `deviceId`  
- 📅 显示连续签到天数、补签卡数量、当前 N币 余额  
- 🎁 展示盲盒任务进度（如“7天盲盒”、“666天盲盒”等）  
- 🔔 已签到时自动简化通知（例如：`已签到 · 连续 408 天`）  
- ⚙️ 支持 BoxJS 自定义变量  

---

## ⚙️ 使用方法

### ① 安装脚本

在 Loon / Surge / Quantumult X / Stash / Shadowrocket 配置文件中加入以下内容：

```ini
[Script]
# 每日 8:00 自动签到
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2.js, tag=九号签到

# 自动捕获 Token（首次运行必加）
http-request ^https:\/\/cn-cbu-gateway\.ninebot\.com\/ requires-body=0, script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.2.js, tag=九号Token捕获
② 获取 Token（自动）
	1.	打开 九号 App 并保持登录状态
	2.	执行一次操作（如刷新签到页或任务页）
	3.	脚本会自动捕获并保存 Authorization 与 deviceId
🎯 九号 Token 捕获成功
Authorization 与 DeviceId 已保存
③ BoxJS 配置（可选）
变量名
说明
Ninebot_Authorization
登录后的 Authorization Token
Ninebot_DeviceId
设备唯一标识（deviceId）
🧩 支持平台
	•	✅ Loon
	•	✅ Surge
	•	✅ Quantumult X
	•	✅ Stash
	•	✅ Shadowrocket

⸻

🛠️ 更新日志

v2.2（2025/11/13）
	•	🎨 优化通知排版，更加美观
	•	🧠 自动捕获 Token（无需手动填写）
	•	⚙️ 兼容多环境执行（Loon / QX / Surge）

v2.1（2025/11/13）
	•	✨ 增加自动捕获 Authorization 与 DeviceId 功能
	•	💬 支持 BoxJS 环境变量配置
⚠️ 注意事项
	•	请勿公开分享包含个人 Token 的版本。
	•	本脚本仅供学习与研究使用，禁止用于商业用途。
	•	若 Token 过期，请重新打开九号 App 以自动更新。

⸻

❤️ 鸣谢

感谢所有为九号 App 自动化研究做出贡献的开发者。
如果你喜欢此脚本，欢迎 Star ⭐ 支持本项目
