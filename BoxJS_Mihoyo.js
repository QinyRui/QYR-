{
  "id": "Mihoyo.IndependentSign",
  "name": "米游社独立签到",
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
          "items": [{"key":"true","label":"开"},{"key":"false","label":"关"}],
          "desc": "关闭后仅停止抓包，不影响签到"
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
        },
        {
          "id": "mihoyo.logLevel",
          "name": "日志等级",
          "val": "simple",
          "type": "select",
          "items": [
            {"key":"silent","label":"静默"},
            {"key":"simple","label":"简洁"},
            {"key":"full","label":"完整"}
          ]
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