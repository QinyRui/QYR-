/*
 九号签到脚本 · Hash 方式检查脚本更新
 原理：
 1. 下载远程主体 JS
 2. 计算 SHA256
 3. 与本地缓存对比
 4. 若不同 → 推送通知提示更新
*/

const REMOTE_JS = "https://raw.githubusercontent.com/QinyRui/QYR-/main/jiuhao/Ninebot_Sign_Single_v2.7.js";
const CACHE_KEY = "Ninebot_Sign_JS_Hash";
const TITLE = "九号签到助手 · 脚本更新提醒";

// 计算 SHA256（Loon/QX 原生支持）
function sha256(str) {
    return $crypto.sha256(str);
}

$httpClient.get(REMOTE_JS, (err, resp, data) => {
    if (err || resp.status !== 200) {
        console.log("❌ 更新检测失败：网络异常", err);
        return $done();
    }

    const remoteHash = sha256(data).toUpperCase();
    const localHash = $persistentStore.read(CACHE_KEY);

    console.log("远程 Hash:", remoteHash);
    console.log("本地 Hash:", localHash || "(无缓存)");

    if (!localHash) {
        // 第一次写入
        $persistentStore.write(remoteHash, CACHE_KEY);
        console.log("初始化 Hash 完成");
        return $done();
    }

    if (remoteHash !== localHash) {
        // 发现更新！
        $notification.post(
            TITLE,
            "检测到脚本有更新",
            "点击立即查看更新内容",
            { "open-url": "https://github.com/QinyRui/QYR-/tree/main/jiuhao" }
        );

        // 覆盖缓存
        $persistentStore.write(remoteHash, CACHE_KEY);
        console.log("Hash 已更新");
    } else {
        console.log("已是最新脚本，无需更新");
    }

    $done();
});