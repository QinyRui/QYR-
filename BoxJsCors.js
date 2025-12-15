// BoxJs 跨域重写脚本
const res = {
    headers: {
        ...$response.headers,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    },
    body: $response.body
};
$done(res);