// 95598_request.js（含 Token 检测+自动重试）
const loginScript = require("95598_login_sms.js");

function getTimestamp() {
    return Date.now().toString();
}

function generateT() {
    return "99ttee" + Math.random().toString(16).substr(2, 10);
}

// 构造请求头
function buildHeaders() {
    const token = $persistentStore.read("95598_TOKEN");
    const jsessionid = $persistentStore.read("95598_JSESSIONID");
    return {
        "content-type": "application/json;charset=UTF-8",
        "accept": "application/json;charset=UTF-8",
        "version": "1.0",
        "timestamp": getTimestamp(),
        "authorization": "Bearer " + token,
        "keycode": "112071910778033931390300076343455",
        "source": "0901",
        "retrycount": "1",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
        "wsgwtype": "web",
        "t": generateT(),
        "appkey": "7e5b5e84ddad4994b0ebc68dedca4962",
        "origin": "https://www.95598.cn",
        "referer": "https://www.95598.cn/osgweb/electricityCharge?partNo=P02021703",
        "accept-language": "zh-CN,zh-Hans;q=0.9",
        "priority": "u=3, i",
        "cookie": `JSESSIONID=${jsessionid}; ariaDefaultTheme=default; acw_tc=ac110001${getTimestamp().substr(0, 10)}2792806e1f0942194be9c7318999227575c890bf33b4`
    };
}

// 处理请求头注入
loginScript.checkAndLogin((loginSuccess) => {
    if (loginSuccess) {
        $done({ headers: buildHeaders() });
    } else {
        console.log("登录失败，无法继续请求");
        $done({});
    }
});

// 响应错误处理（401/403 自动重登）
$httpClient.on("response", (resp) => {
    const status = resp.status;
    if (status === 401 || status === 403) {
        console.log("接口返回 401/403，Token 失效，执行强制登录");
        loginScript.checkAndLogin(() => {
            // 登录成功后重新发起请求
            $httpClient.request({
                method: $request.method,
                url: $request.url,
                headers: buildHeaders(),
                body: $request.body
            }, (err, newResp, data) => {
                if (err) {
                    console.log("重试请求失败：" + err);
                    $done(resp);
                } else {
                    $done(newResp);
                }
            });
        });
    } else {
        $done(resp);
    }
});