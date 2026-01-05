{
  "id": "ByteValley.MihoyoDataCollection",
  "name": "米游社·签到",
  "author": "@QinyRui",
  "description": "米游社账号凭证采集与管理，供自动签到脚本复用，支持多游戏签到切换",
  "icon": "https://upload-bbs.mihoyo.com/upload/2022/04/19/127810332/42a860a883808d8073a3621575d96675.png",
  "repo": "https://t.me/JiuHaoAPP",
  "updateUrl": "https://raw.githubusercontent.com/QinyRui/QYR-/main/Mihoyo.boxjs.json",
  "apps": [
    {
      "id": "DataCollection.Mihoyo",
      "name": "米游社签到配置",
      "descs_html": [
        "用于保存米游社 App 抓取到的 <code>Cookie</code>、<code>SToken</code> 等核心凭证，支持原神、星穹铁道、崩坏3 多游戏签到。",
        "<b>凭证获取方式：</b><br/>1）确保客户端已配置米游社自动抓包脚本并开启开关；<br/>2）打开<b>米游社官方 App</b>，进入「社区」页面触发接口；<br/>3）脚本会自动将凭证写入以下字段，无需手动填写。",
        "<b>注意事项：</b><br/>• 凭证有效期约7天，若签到失败可重新进入社区页触发更新；<br/>• 字段不可随意修改，清空后需重新抓包获取；<br/>• 可通过 Loon 插件参数切换目标游戏。"
      ],
      "icons": [
        "https://upload-bbs.mihoyo.com/upload/2022/04/19/127810332/42a860a883808d8073a3621575d96675.png",
        "https://upload-bbs.mihoyo.com/upload/2022/04/19/127810332/42a860a883808d8073a3621575d96675.png"
      ],
      "keys": [
        "#ComponentService",
        "mihoyo.cookie",
        "mihoyo.stoken",
        "mihoyo.userAgent",
        "mihoyo.titlePrefix",
        "mihoyo.notify",
        "mihoyo.checkValid",
        "mihoyo.notifyFail",
        "mihoyo.logLevel",
        "mihoyo.lastCaptureAt",
        "mihoyo.captureEnable",
        "mihoyo.gameGid"
      ],
      "settings": [
        {
          "id": "mihoyo.captureEnable",
          "name": "自动抓包开关",
          "val": "true",
          "type": "select",
          "items": [
            { "key": "true", "label": "开启（自动抓取凭证）" },
            { "key": "false", "label": "关闭（仅手动填写）" }
          ],
          "desc": "开启后访问米游社社区页将自动写入凭证，无需手动抓包"
        },
        {
          "id": "mihoyo.cookie",
          "name": "米游社 Cookie",
          "val": "",
          "type": "text",
          "isSecret": true,
          "desc": "账号核心鉴权凭证，格式：cookie_token=xxx; account_id=xxx;"
        },
        {
          "id": "mihoyo.stoken",
          "name": "米游社 SToken",
          "val": "",
          "type": "text",
          "isSecret": true,
          "desc": "账号会话凭证，与Cookie强关联，自动抓包优先写入"
        },
        {
          "id": "mihoyo.userAgent",
          "name": "User-Agent 请求头",
          "val": "miHoYoBBS/2.50.1 CFNetwork/3860.200.71 Darwin/25.1.0",
          "type": "text",
          "desc": "请求UA标识，自动抓包会覆盖默认值，默认值可直接使用"
        },
        {
          "id": "mihoyo.titlePrefix",
          "name": "自定义通知标题",
          "val": "米游社签到助手",
          "type": "text",
          "desc": "签到结果通知的标题前缀，例如：我的米游社签到"
        },
        {
          "id": "mihoyo.notify",
          "name": "签到结果通知开关",
          "val": "true",
          "type": "select",
          "items": [
            { "key": "true", "label": "开启（推送签到结果）" },
            { "key": "false", "label": "关闭（不推送通知）" }
          ],
          "desc": "是否推送签到成功/失败的通知"
        },
        {
          "id": "mihoyo.checkValid",
          "name": "有效性校验开关",
          "val": "true",
          "type": "select",
          "items": [
            { "key": "true", "label": "开启（保存时自动校验）" },
            { "key": "false", "label": "关闭（仅手动校验）" }
          ],
          "desc": "保存配置时自动检查Cookie/SToken是否有效"
        },
        {
          "id": "mihoyo.gameGid",
          "name": "目标游戏GID",
          "val": "1",
          "type": "select",
          "items": [
            { "key": "1", "label": "原神" },
            { "key": "2", "label": "星穹铁道" },
            { "key": "3", "label": "崩坏3" }
          ],
          "desc": "选择需要签到的游戏，对应米游社社区ID"
        },
        {
          "id": "mihoyo.notifyFail",
          "name": "失败通知开关",
          "val": "true",
          "type": "select",
          "items": [
            { "key": "true", "label": "开启（仅失败时推送通知）" },
            { "key": "false", "label": "关闭（失败时不推送）" }
          ],
          "desc": "仅在签到或校验失败时推送通知，避免成功时打扰"
        },
        {
          "id": "mihoyo.logLevel",
          "name": "日志输出级别",
          "val": "simple",
          "type": "select",
          "items": [
            { "key": "silent", "label": "静默（无日志）" },
            { "key": "simple", "label": "简洁（仅错误日志）" },
            { "key": "full", "label": "完整（所有流程日志）" }
          ],
          "desc": "控制脚本日志的详细程度，调试时可选择完整"
        },
        {
          "id": "mihoyo.lastCaptureAt",
          "name": "最后抓包更新时间",
          "val": "",
          "type": "text",
          "isReadonly": true,
          "desc": "凭证最后更新时间，自动同步不可修改"
        }
      ]
    }
  ],
  "rewrite": {
    "name": "米游社配置跨域重写",
    "author": "@QinyRui",
    "script": "const res={headers:{...$response.headers,\"Access-Control-Allow-Origin\":\"*\",\"Access-Control-Allow-Methods\":\"GET,OPTIONS\"},body:$response.body};$done(res);",
    "match": "https://raw.githubusercontent.com/QinyRui/QYR-/main/mihoyo/Mihoyo.boxjs.json",
    "type": "response"
  }
}