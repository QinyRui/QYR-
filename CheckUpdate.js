/*
 * 米游社签到插件 更新检查脚本
 * 适配 Loon 插件定时任务
 * 功能: 对比本地与远程版本号，推送更新提示
 */
const updateConfig = {
    // 本地插件版本 (需与插件 [General] 中的 version 保持一致)
    localVersion: "1.0.0",
    // 远程版本信息接口 (建议放在你的 GitHub/Gitee 仓库)
    remoteVersionUrl: "https://raw.githubusercontent.com/your-repo/mihoyo/MihoyoSign.version",
    // 远程插件下载地址
    downloadUrl: "https://raw.githubusercontent.com/your-repo/mihoyo/MihoyoSign.plugin",
    // 通知标题前缀 (读取插件 Argument 配置)
    titlePrefix: $argument?.titlePrefix || "米游社签到助手"
};

// 版本号对比函数 (支持 x.y.z 格式)
function compareVersion(local, remote) {
    const localArr = local.split(".").map(Number);
    const remoteArr = remote.split(".").map(Number);
    const len = Math.max(localArr.length, remoteArr.length);

    for (let i = 0; i < len; i++) {
        const l = localArr[i] || 0;
        const r = remoteArr[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

// 主逻辑
(async function() {
    try {
        // 1. 请求远程版本信息
        const response = await $httpClient.get(updateConfig.remoteVersionUrl);
        if (response.status !== 200) {
            console.log("[更新检查] 远程版本信息获取失败");
            $done({});
            return;
        }

        // 2. 解析远程版本号 (远程文件内容仅需一行: 1.1.0)
        const remoteVersion = response.data.trim();
        console.log(`[更新检查] 本地版本: ${updateConfig.localVersion} | 远程版本: ${remoteVersion}`);

        // 3. 对比版本并推送通知
        if (compareVersion(updateConfig.localVersion, remoteVersion)) {
            $notification.post(
                `${updateConfig.titlePrefix} - 版本更新`,
                `发现新版本 ${remoteVersion}`,
                "点击前往下载",
                { "open-url": updateConfig.downloadUrl }
            );
        } else {
            console.log("[更新检查] 当前为最新版本");
        }
    } catch (e) {
        console.log(`[更新检查] 异常: ${e.message}`);
    }
    $done({});
})();