{
  "id": "ByteValley.MihoyoDataCollection",
  "name": "米游社·签到配置",
  "author": "@QinyRui",
  "version": "1.5.0",
  "description": "米游社Cookie/SToken管理+有效性校验",
  "homepage": "https://t.me/JiuHaoAPP",
  "icon": "https://upload-bbs.mihoyo.com/upload/2022/04/19/127810332/42a860a883808d8073a3621575d96675.png",
  "apps": [
    {
      "id": "DataCollection.Mihoyo",
      "name": "米游社签到",
      "descs_html": [
        "保存米游社 <code>Cookie</code> 和 <code>SToken</code>，供自动签到脚本调用"
      ],
      "icons": [
        "https://upload-bbs.mihoyo.com/upload/2022/04/19/127810332/42a860a883808d8073a3621575d96675.png"
      ],
      "settings": [
        {
          "id": "mihoyo.cookie",
          "name": "米游社Cookie",
          "val": "",
          "type": "text",
          "isSecret": true,
          "desc": "格式：cookie_token=xxx; account_id=xxx;"
        },
        {
          "id": "mihoyo.stoken",
          "name": "米游社SToken",
          "val": "",
          "type": "text",
          "isSecret": true,
          "desc": "与Cookie强关联，抓包获取"
        },
        {
          "id": "mihoyo.captureEnable",
          "name": "自动抓包开关",
          "val": "true",
          "type": "select",
          "items": [
            {"key": "true", "label": "开启"},
            {"key": "false", "label": "关闭"}
          ]
        },
        {
          "id": "mihoyo.notify",
          "name": "通知开关",
          "val": "true",
          "type": "select",
          "items": [
            {"key": "true", "label": "开启"},
            {"key": "false", "label": "关闭"}
          ]
        },
        {
          "id": "mihoyo.titlePrefix",
          "name": "通知标题",
          "val": "米游社签到助手",
          "type": "text"
        },
        {
          "id": "mihoyo.lastCaptureAt",
          "name": "最后抓包时间",
          "val": "",
          "type": "text",
          "isReadonly": true
        }
      ]
    }
  ],
  "rewrite": {
    "name": "米游社配置跨域",
    "script": "const res={headers:{...$response.headers,\"Access-Control-Allow-Origin\":\"*\"},body:$response.body};$done(res);",
    "match": "https://raw.githubusercontent.com/QinyRui/QYR-/main/BoxJS_Mihoyo.json",
    "type": "response"
  }
}