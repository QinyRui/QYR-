<div align="center">

# 🛵 九号智能电动车自动签到脚本  
**Ninebot Smart Scooter Auto Sign-In Script**

![Platform](https://img.shields.io/badge/platform-Loon%20%7C%20Surge%20%7C%20QX%20%7C%20Stash%20%7C%20Shadowrocket-blue)
![Version](https://img.shields.io/badge/version-v2.0--Share--Edition-green)
![Author](https://img.shields.io/badge/author-%E2%9D%A5%EF%B8%92%E2%9F%92%E2%9C%8F%EF%B8%8E%E9%9D%9E%E6%88%91%E4%B8%8D%E5%8F%AF-pink)
![Update](https://img.shields.io/badge/update-2025--11--09-yellow)

---

</div>

## ✨ 功能简介
✅ 自动签到九号智能电动车账户  
💰 显示签到奖励（经验值 / N币）  
🗓️ 自动记录连续签到天数  
🎫 显示补签卡数量  
📦 支持盲盒任务列表（如「惊喜盲盒赚不停」）  
🧩 支持 BoxJS 配置，无需修改脚本  
远程订阅链接 https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_AutoSign.conf
---

## ⚙️ 使用方法

### 🧩 一、BoxJS 配置（推荐）
> 可视化填写 Token 与设备 ID，最方便、最安全的方式。

1️⃣ 在 BoxJS 中添加以下订阅地址：  https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot.boxjs.json
2️⃣ 打开 BoxJS → 选择「九号签到」模块 → 填写并保存：
| 字段 | 说明 |
| :---- | :---- |
| `Ninebot_Authorization` | App 抓包请求头中的 Authorization（JWT Token） |
| `Ninebot_DeviceId` | App「我的 → 设置 → 关于」中的设备 ID |

💡 BoxJS 保存后会自动同步给脚本，无需再次修改。

---

### ⚙️ 二、脚本配置示例

#### 🧰 Loon / Surge / Quantumult X / Stash

```ini
[Script]
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_Sign_Share_v2.0.js, tag=九号签到
⏰ 建议每天上午 8:00 自动执行签到
⚠️ 若首次运行提示“未配置 Authorization”，请先完成 BoxJS 设置
脚本远程订阅链接 https://raw.githubusercontent.com/QinyRui/QYR-/main/Ninebot_AutoSign.conf
<div align="center">
</div>
```
