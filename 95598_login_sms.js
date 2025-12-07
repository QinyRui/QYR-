// 95598_login_sms.js（含过期检测+自动重登）
const sendSmsUrl = "https://www.95598.cn/api/osg-web0004/member/sendSmsCode";
const loginUrl = "https://www.95598.cn/api/osg-web0004/member/loginBySms";

// 读取环境变量
const username = $environment.get("95598_USERNAME");
const password = $environment.get("95598_PASSWORD");
const phone = $environment.get("95598_PHONE");

function getTimestamp() {
    return Date.now().toString();
}

// 解析 JWT exp 过期时间（提前30分钟重登）
function isTokenExpired(token) {
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const expTime = payload.exp * 1000; // 转为毫秒
        const now = Date.now();
        return expTime - now < 30*60*1000; // 剩余时间<30分钟判定为即将过期
    } catch (e) {
        return true; // 解析失败视为过期
    }
}

// 发送验证码
function sendSmsCode(callback) {
    $httpClient.post({
        url: sendSmsUrl,
        headers: {
            "content-type": "application/json;charset=UTF-8",
            "version": "1.0",
            "timestamp": getTimestamp(),
            "appkey": "7e5b5e84ddad4994b0ebc68dedca4962",
            "keycode": "112071910778033931390300076343455",
            "source": "0901",
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1"
        },
        body: JSON.stringify({ userName: username, phone, region: "99" })
    }, (err, resp, data) => {
        if (err || !JSON.parse(data).success) {
            console.log("发送验证码失败：" + (err || JSON.parse(data).message));
            return;
        }
        console.log("验证码已发送，等待输入...");
        $input.text({ title: "输入95598验证码" }, (code) => {
            code ? callback(code) : console.log("未输入验证码，登录终止");
        });
    });
}

// 短信登录（核心）
function loginBySms(code, callback) {
    $httpClient.post({
        url: loginUrl,
        headers: { "content-type": "application/json;charset=UTF-8", "version": "1.0", "timestamp": getTimestamp(), "appkey": "7e5b5e84ddad4994b0ebc68dedca4962", "keycode": "112071910778033931390300076343455", "source": "0901", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1" },
        body: JSON.stringify({ userName: username, password, phone, smsCode: code, region: "99" })
    }, (err, resp, data) => {
        if (err) {
            console.log("登录失败：" + err);
            return;
        }
        const res = JSON.parse(data);
        if (resp.status === 200 && res.success) {
            const token = res.data.token;
            const jsessionid = resp.headers["Set-Cookie"].match(/JSESSIONID=([^;]+)/)[1];
            $persistentStore.write(token, "95598_TOKEN");
            $persistentStore.write(jsessionid, "95598_JSESSIONID");
            console.log("短信登录成功，Token 已更新");
            callback && callback(true);
        } else {
            console.log("登录失败：" + res.message);
            callback && callback(false);
        }
    });
}

// 对外暴露登录入口（支持回调）
function login(callback) {
    sendSmsCode((code) => loginBySms(code, callback));
}

// 检测 Token 并自动登录（被请求脚本调用）
function checkAndLogin(callback) {
    const token = $persistentStore.read("95598_TOKEN");
    if (!token || isTokenExpired(token)) {
        console.log("Token 缺失/即将过期，执行自动登录");
        login(callback);
    } else {
        callback && callback(true);
    }
}

// 脚本独立执行时启动登录
if ($trigger === "script") {
    login();
}

// 暴露方法供其他脚本调用
module.exports = { checkAndLogin };