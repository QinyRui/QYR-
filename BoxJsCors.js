// 跨域重写脚本（和你提供的一致）
const match = $request.url.indexOf("boxjs.com/api/boxjs/get") > -1;
if (match) {
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
} else {
    $done($response);
}