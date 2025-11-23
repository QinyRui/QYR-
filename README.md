# 九号智能电动车 · 单号自动签到 v2.6

📱 **插件类型**：Loon/iOS Cron Script  
👤 **作者**：QinyRui & ❥﹒﹏非我不可  
🔗 **主页 / Telegram**：[https://t.me/JiuHaoAPP](https://t.me/JiuHaoAPP)  
🆕 **版本**：2.6  
📅 **更新时间**：2025-11-23  

---

## 功能

- ✅ 自动签到、补签、盲盒领取  
- ✅ 内测资格检测 + 自动申请  
- ✅ 支持抓包自动写入 Authorization、DeviceId、User-Agent  
- ✅ CRON 定时执行签到  
- ✅ 控制台日志打印，带时间戳和日志等级  
- ✅ BoxJS 配置读取，支持自定义通知标题和通知开关  

---

## 插件安装与订阅

- **Loon 插件**  
  - 文件名：`Ninebot_Sign_Single_v2.6.plugin`  
  - 订阅地址：`https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.6.plugin`  
  - 插件包含：
    1. 抓包写入（可选，只抓指定链接）
    2. 自动签到（由用户 CRON 控制）
  - **插件配置**：
    - `notify`：通知开关  
    - `capture`：抓包写入开关  
    - `titlePrefix`：自定义通知标题（BoxJS 主控）  
    - `cron_time`：签到时间 CRON  

- **BoxJS 配置**  
  - 文件名：`Ninebot_BoxJS_Single_v2.6.json`  
  - 订阅地址：`https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_BoxJS_Single_v2.6.json`  
  - BoxJS 仅保留自动写入数据功能（Authorization / DeviceId / User-Agent）  
  - 可修改自定义通知标题和通知开关，控制最终通知显示  

---

## 抓包写入说明

- **触发条件**：访问九号 App 签到状态接口  https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status?t=xxx- **写入 BoxJS**：
- Authorization  
- DeviceId  
- User-Agent  
- **抓包通知**：
- 成功写入时会弹出通知：“抓包成功 ✓ Authorization / DeviceId / User-Agent 已写入 BoxJS”  
- 不会执行签到，避免全局抓包通知过多  

---

## 使用方法

1. 打开 Loon，导入插件 `Ninebot_Sign_Single_v2.6.plugin`  
2. 在 BoxJS 中导入 `Ninebot_BoxJS_Single_v2.6.json`  
3. 确认 BoxJS 中写入了 Authorization / DeviceId / User-Agent  
4. 在插件中设置：
 - 是否启用通知  
 - 是否启用抓包写入  
 - CRON 定时  
5. 打开抓包开关，访问指定接口完成抓包写入  
6. CRON 定时将自动执行签到任务  

---

## 日志输出

- **开始与结束标记**：---

## 注意事项

- **通知控制**：
- 插件内通知开关只控制抓包写入和日志通知  
- 自定义通知标题请在 BoxJS 中设置（插件内修改无效）  
- **抓包限制**：
- 请仅抓取指定接口，避免全局抓包导致上百条通知  
- **签到失败**：
- 如出现“系统错误”或“未获得内测资格”，可查看日志或手动重试  
- **BoxJS 缓存**：
- BoxJS 可清除指定 Key 以重写 Authorization / DeviceId / User-Agent  

---

## 文件列表

| 文件名 | 说明 |
|--------|------|
| `Ninebot_Sign_Single_v2.6.plugin` | Loon 插件，包含抓包与自动签到脚本 |
| `Ninebot_BoxJS_Single_v2.6.json` | BoxJS 配置，仅用于自动写入数据 |
| `README.md` | 使用说明文档 |

---

## 联系与更新

- Telegram 群：[https://t.me/JiuHaoAPP](https://t.me/JiuHaoAPP)  
- 最新版本可在 GitHub 根目录 `jiuhao` 查看  
- 保持 BoxJS 与插件同步更新，确保抓包和自动签到正常执行  