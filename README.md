# 📱 九号智能电动车 · 单号自动签到（Single Account）

![九号 Logo](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/icon/ninebot_128.png)

## 👤 作者
- ❥﹒﹏非我不可  
- QinyRui  
- Telegram 群：[https://t.me/JiuHaoAPP](https://t.me/JiuHaoAPP)

## 📆 版本
- v2.3 (2025/11/18)

## 🧰 功能
- 自动签到、查询状态、N币余额  
- 自动补签（可关闭）  
- 自动开启 & 自动领取盲盒奖励（可关闭）  
- 完整日志输出（控制台 + 通知）  
- 支持 BoxJS 配置读取写入（抓包信息）  
- Loon 插件支持 Cron 和 http-request 自动触发  

---

## 🔗 文件 & 订阅链接

| 类型 | 文件名 | Raw 链接 |
| ---- | ---- | ---- |
| JS 脚本（主体） | `Ninebot_Sign_Single_v2.3.js` | [Raw 链接](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.3.js) |
| Loon 插件 | `Ninebot_Sign_Single_v2.3.plugin` | [Raw 链接](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.3.plugin) |
| BoxJS 配置 JSON | `Ninebot_Loon_BoxJS_single.json` | [Raw 链接](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Loon_BoxJS_single.json) |

---

## ⚙️ 安装方法

### 1️⃣ BoxJS 订阅
1. 打开 BoxJS  
2. 点击 **添加订阅**  
3. 填入 JSON Raw 链接：  https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Loon_BoxJS_single.json
4. 配置抓包信息：
- Authorization  
- DeviceId  
- User-Agent（可自动写入）

### 2️⃣ Loon 插件安装
1. 打开 Loon  
2. 添加插件订阅：  https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.3.plugin
3. 插件 Cron 和 http-request 已配置，脚本会自动执行  

---

## 📦 功能示意

| 功能 | 描述 |
| ---- | ---- |
| 自动签到 | 每天自动签到 N币 |
| 自动补签 | 有补签卡时自动使用（可关闭） |
| 自动开启盲盒 | 满足条件自动领取盲盒奖励（可关闭） |
| 日志输出 | 控制台 + 通知完整显示 |
| BoxJS 配置 | 可修改开关、抓包信息、通知标题 |

---

## 🔍 抓包说明
1. 打开九号智能电动车 App  
2. 进行签到操作  
3. 使用抓包工具（Quantumult X / Surge / Loon 等）抓取请求  
4. BoxJS 会自动写入 **Authorization / DeviceId / User-Agent**  
5. 成功抓包后，BoxJS 会弹出通知  

---

## 📊 图标库

| 尺寸 | 图标 |
| ---- | ---- |
| 64×64 | ![九号 Logo 64](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/icon/ninebot_64.png) |
| 128×128 | ![九号 Logo 128](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/icon/ninebot_128.png) |
| 256×256 | ![九号 Logo 256](https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/icon/ninebot_256.png) |

---

## 💬 联系与支持
- Telegram 群：[https://t.me/JiuHaoAPP](https://t.me/JiuHaoAPP)  
- 任何问题可以在群里讨论或提交 Issue  

---

## ⚠️ 注意事项
- BoxJS 配置必须是 **Apps JSON 格式**  
- 布尔开关为 true/false  
- JS 脚本不要直接写入插件文件，插件只引用 Raw 链接  
- 确保抓包信息写入 BoxJS 后再执行签到脚本