{
  "id": "Mihoyo.SimpleSign",
  "name": "米游社极简签到",
  "author": "@QinyRui",
  "version": "1.0.0",
  "apps": [
    {
      "id": "Mihoyo.Config",
      "name": "米游社配置",
      "settings": [
        {
          "id": "mihoyo.captureEnable",
          "name": "自动抓包开关",
          "val": "true",
          "type": "select",
          "items": [{"key":"true","label":"开"},{"key":"false","label":"关"}]
        },
        {
          "id": "mihoyo.cookie",
          "name": "Cookie",
          "val": "",
          "type": "text",
          "isSecret": true
        },
        {
          "id": "mihoyo.stoken",
          "name": "SToken",
          "val": "",
          "type": "text",
          "isSecret": true
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
    "match": "https://raw.githubusercontent.com/QinyRui/QYR-/main/Mihoyo.boxjs.json",
    "script": "const res={headers:{...$response.headers,\"Access-Control-Allow-Origin\":\"*\"},body:$response.body};$done(res);",
    "type": "response"
  }
}