/* BoxJS跨域通用脚本（米游社/九号共用） */
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