// BoxJS跨域重写通用脚本 | 美团插件专用
const res = {
    headers: {
        ...$response.headers,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    },
    body: $response.body
};
$done(res);