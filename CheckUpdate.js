/*
 * 版本更新检查脚本（初始名: CheckUpdate.js）
 * 适配米游社 Loon 插件
 */
const updateConfig = {
    localVersion: "1.0.0",
    remoteVersionUrl: "https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.version",
    downloadUrl: "https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.plugin",
    titlePrefix: $argument?.[0] || "米游社签到助手"
};

// 版本对比
function compareVersion(local, remote) {
    const localArr = local.split(".").map(Number);
    const remoteArr = remote.split(".").map(Number);
    const len = Math.max(localArr.length, remoteArr.length);
    for (let i = 0; i < len; i++) {
        const l = localArr[i] || 0, r = remoteArr[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

// 主逻辑
(async function() {
    try {
        const response = await $httpClient.get(updateConfig.remoteVersionUrl);
        if (response.status !== 200) {
            $done({});
            return;
        }
        const remoteVersion = response.data.trim();
        if (compareVersion(updateConfig.localVersion, remoteVersion)) {
            $notification.post(
                `${updateConfig.titlePrefix} - 版本更新`,
                `发现新版本 ${remoteVersion}`,
                "点击下载",
                { "open-url": updateConfig.downloadUrl }
            );
        }
    } catch (e) {
        console.error(`[更新检查] 错误: ${e.message}`);
    }
    $done({});
})();