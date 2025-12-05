/**
 * 脚本 1: 提交分享完成报告
 * 功能: 使用特定的 Base64 Body 向日志接口发送“任务完成”指令。
 */
const TASK_COMPLETE_BODY_A = "EjkgIAIDn46Cep3Gllh7a+ZAZZ8l8dWPEqkgDwSVIPvff7N4u/wGrLtiUpc96hu4MmGRGikBX7LU7FA4WpkAt+9lNd+AwrflxcNDWOxS8AgRja0zOCBYsM8lwE+3hrdfIB/PWV6qmLUM2OvxwSKdiYIpMnOm0ggV1eivxQXHgw7g0an32ht5AriIyignyMvBzf+Jcql7b/FL5KKSAHclhKClCJttOo3CL95NMNCBb6dTV/iHF4ffTpmXDk4upB8d0aByv7gVvk+pus1rzM5c4t8EqVma91ppdPkkuLcgA8GTPoX8/p4A47Ayh5nb89NETy+kwwwvQqq9OfTxhRjYtnVI26ta/fho18wAneSkQWfVHwkDWde4QldIeDb6czS4QrrixdN+31XrLP6YjwDXgwFEv3bEkzEqdHlfl2lNEuQ2VE7OOO9AJQ2ljofROa908VUk7Quuf1yYYs/Ou6e6jgWMh1XmG4qfhD2dJ5aOBc/9MqXlnSTu5G27UViL0YmjjPlX0gwhocLKPdL1VqwI3zJquPi0uSNPKgiALJRWSiek9rhiHBuBEhmCBd2t6X15jr+NDqzZtQnb+ZAgakOYdzwVUbLeaeCDWvh5srTrEsSUgrcU00MyYLvELyTfwZ0e9K4JbOHwkup8ZJ9tBjQkv4jsFbXgMDNw8d3u5h/zloZtuweiyYfa/ZCl7WwK1n7I2/BGcGQ7HrI41394OJFjaEY7mlg6WDKQNjAmFpQYWyFz5WsU5U+rzB3/skZRFZSLbr3cIghppOj/Fgv+rMijCItXTxBClPBMh9T3dYgtDHh37Y/5REjjtKOK60CJof7hlF+kd7oelbNG0rKoGlgJ43I8ehZT14Ys8yVrI+Xz6iMv3trf32WaxAOro0zhDL6G6GFK0z3Td+QbM64EohpHDrcBlrfF971KRhfeaZqIug/7dMCtTw1Y1t9dVd0llgJ0KjTEm7gYKd3JGqAAmdzNjI6BrKVQ4gkzYS8TgUGe1wzw3yNYssj0qKv6J2Mbod/Q9RMlECVZH+Zm2VxYWfqp4JgMlG25bcl8Q3hL2FD2RzCjCzH9nmnpS7eNL+OaRnOaAzxYfsaWF0rES2pqeBp8yk8Bh5VZEoKmm08Ngh5XtLa4Vr+z9NgD8DrfEtDVQeZpJhrxmoIVA8hZaVGxXee431eYhAWwdFNlev0quJZ/sJXPLd+g6qkuzCCmYMqUMrrdkmFxCrtTP1aqMrNtqdOCuqlh89tRz4yd/rKCpO+r+JNTeMPnrt8XKccPbQtxfz7Ezcs5Qvk9J2IN8JtnI4yY1Wmfv54sp6L+JZFz5ABbgTyC/TgW9OrlOLg7X4Ryg3MHyDtzBx9M68ZbTXJ6O7lKcIFur/K9Ydzyjq+OzNR+AB/XAh/VewNNqcGUPwSLoJ7yeQKA0AXMqFTSOeykBScS3BDnVeK26Fw3wqYXJJS5x6yMzpYSN22ePIgC7pe7l/PZAJXwvRHcxJgVB6mvT+ElfsWJJbbemTl1FuMSs8jcRH1SJrSxfAOr5uI8S8Fdc2OgUCADjXuM4UTYEr0Ytk8Q1vWOY9FNcOtyFv/AkhpGD5TLMocaYkflZj4CKesLhJ0ALnXLBNJ5GTnrF9oZmPHF1zqR/L5eh043smg2o6tGYvwxXJHgbChr9xE1LISM3sbPs0KQi8zCno0qehrRYhCJv0/nShM3CHLTyTRdyOyt+OaydRAdr/itpWg2tiGxYZ2EiQIa35beMUs9F/JO9iU6mxvBG4C3JAPGtp1YE1UisvezJ64305TvF2Kor20AqI8164ZtpYlK1/iMd93PPIu+/aJ+4Vj8E+c/qNawFfm/CARwCIJTe4r725mDJl4l0teH385ZqikfppHyZkj+l1/DvaZTUXeYJv22yy2FrD2e250pDPVTxAMjoGaNE6RRMXJ9YR0mA6Uq94QqawaMRHbeT7V9aD7iIwB1mAzWqM8JlTGnmZbgx+Q=";

let url1 = "https://snssdk.ninebot.com/service/2/app_log/?aid=10000004";
let headers1 = {
    'Host': 'snssdk.ninebot.com',
    'Content-Type': 'application/octet-stream;tt-data=a',
    'Cookie': 'install_id=7387027437663600641; ttreq=1$b5f546fbb02eadcb22e472a5b203b899b5c4048e',
    'User-Agent': 'Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0',
    'aid': '10000004',
    'Accept': 'application/json',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    // Content-Length 1478 由脚本运行时自动计算，这里仅作参考
    'Connection': 'keep-alive'
};

var params1 = {
    url: url1,
    method: "POST",
    timeout: 5000,
    headers: headers1,
    body: TASK_COMPLETE_BODY_A
};

params1["body-base64"] = true; // 告知 Loon 这是一个 Base64 编码的二进制体

// 定义下一步 (领取奖励)
function claimReward() {
    // 假设您已经获取了最新的 Authorization Token (JWT)
    // 您需要替换成您最新抓包到的有效 Token 和 device_id
    const authorization_token = "替换为您最新的 JWT Token"; 
    const device_id = "替换为您最新的 device_id"; 
    const TASK_ID = "1823622692036079618"; 
    
    let url2 = "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/reward";
    let headers2 = {
        'Host':'cn-cbu-gateway.ninebot.com',
        'Content-Type':'application/json',
        'Authorization': authorization_token, 
        'User-Agent': headers1['User-Agent'], // 沿用 App UA
        'device_id': device_id,
        // 其他必要的 Header...
    };

    let body2 = JSON.stringify({"taskId": TASK_ID});

    var params2 = {
        url: url2,
        method: "POST",
        timeout: 5000,
        headers: headers2,
        body: body2,
    };

    $httpClient.post(params2, function(errormsg, response, data) {
        if (errormsg) {
            console.log("❌ 领取奖励失败: " + errormsg);
        } else {
            let res = JSON.parse(data);
            if (res.code === 0 && res.msg === "Success") {
                console.log(`✅ 每日分享任务完成并领取奖励成功! 获得 ${TASK_ID}`);
            } else {
                console.log(`❌ 领取奖励失败 (Code: ${res.code}): ${res.msg}`);
            }
        }
        $done();
    });
}

// 执行第一步
$httpClient.post(params1, function(errormsg, response, data) {
    if (errormsg) {
        console.log("❌ 提交完成报告失败: " + errormsg);
        $done();
        return;
    }
    
    // 理论上日志上传返回成功即可，不需要检查 Body 内容
    console.log("✅ 提交完成报告成功 (日志上传)");
    
    // 等待 1 秒，确保服务器处理完任务状态 (状态 1->3 转换)
    setTimeout(claimReward, 1000); 
});
