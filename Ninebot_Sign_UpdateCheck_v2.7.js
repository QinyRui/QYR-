/*
 九号签到助手 · 更新检测脚本（增强日志版本）
*/

console.log("====== 九号签到助手 · 更新检测脚本开始 ======");

(async () => {
    const TITLE = "九号签到助手 · 更新检测";
    const LOGO_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/logo_128.png";

    const forceCheck = $argument?.forceCheck === "true";
    console.log("forceCheck =", forceCheck);

    const SCRIPTS = [
        {
            name: "单号签到脚本",
            js_url: "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.7.js"
        }
    ];

    console.log("开始检查脚本数量:", SCRIPTS.length);

    for (const sc of SCRIPTS) {
        console.log(`▶ 正在检查：${sc.name} ...`);

        try {
            const data = await new Promise((resolve, reject) => {
                $httpClient.get(sc.js_url, (err, resp, body) => {
                    if (err || resp.status !== 200) reject(err || resp.status);
                    else resolve(body);
                });
            });

            console.log(`✔ ${sc.name} 下载成功，计算 SHA256...`);

            const newHash = typeof $crypto !== "undefined" ? $crypto.sha256(data).toUpperCase() : "UNKNOWN_HASH";
            const oldHash = $persistentStore.read("Ninebot_Sign_JS_Hash_" + sc.name);

            console.log(`旧 Hash: ${oldHash}`);
            console.log(`新 Hash: ${newHash}`);

            if (forceCheck || !oldHash || oldHash !== newHash) {
                console.log(`⚡ 检测到更新 → 写入新 Hash`);
                $persistentStore.write(newHash, "Ninebot_Sign_JS_Hash_" + sc.name);

                $notification.post(
                    TITLE,
                    "🚀 检测到脚本更新",
                    `${sc.name} 更新检测到！\n点击查看详细更新`,
                    {
                        "open-url": `https://github.com/QinyRui/QYR-/compare/main...HEAD`,
                        "media-url": LOGO_URL
                    }
                );
            } else {
                console.log(`ℹ️ ${sc.name} 已是最新版本`);
            }

        } catch (e) {
            console.error(`❌ ${sc.name} 下载失败`, e);
            $notification.post(TITLE, `${sc.name} 下载失败 ⚠️`, String(e), { "media-url": LOGO_URL });
        }
    }

    console.log("====== 九号签到助手 · 更新检测脚本结束 ======");
})();