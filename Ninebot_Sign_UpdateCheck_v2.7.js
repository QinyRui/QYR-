(async () => {
    const TITLE = "九号签到助手 · 更新检测";
    const LOGO_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/logo_128.png";

    const forceCheck = $argument?.forceCheck === "true";

    const SCRIPTS = [
        {
            name: "单号签到脚本",
            js_url: "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.7.js"
        }
    ];

    console.log(`${TITLE} 开始执行, forceCheck=${forceCheck}`);

    for (const sc of SCRIPTS) {
        try {
            const data = await new Promise((resolve, reject) => {
                $httpClient.get(sc.js_url, (err, resp, body) => {
                    if (err || resp.status !== 200) reject(err || resp.status);
                    else resolve(body);
                });
            });

            const newHash = typeof $crypto !== "undefined" ? $crypto.sha256(data).toUpperCase() : "UNKNOWN_HASH";
            const oldHash = $persistentStore.read("Ninebot_Sign_JS_Hash_" + sc.name);

            if (forceCheck || !oldHash || oldHash !== newHash) {
                $persistentStore.write(newHash, "Ninebot_Sign_JS_Hash_" + sc.name);
                const notifyBody = `${sc.name} 更新检测到！\n点击查看详细更新`;
                $notification.post(TITLE, "🚀 检测到脚本更新", notifyBody, {
                    "open-url": `https://github.com/QinyRui/QYR-/compare/main...HEAD`,
                    "media-url": LOGO_URL
                });
                console.log(`${sc.name} 已检测到更新`);
            } else {
                console.log(`${sc.name} 已是最新，无需更新`);
            }
        } catch (e) {
            console.error(`${sc.name} 下载失败`, e);
            $notification.post(TITLE, `${sc.name} 下载失败 ⚠️`, String(e), { "media-url": LOGO_URL });
        }
    }

    console.log(`${TITLE} 执行完成`);
})();