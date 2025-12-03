/*
 九号签到脚本 · 终极更新检测系统（全功能）
 功能：
 1. 下载远程 JS + version.json
 2. Hash 对比 + 版本号对比
 3. 多脚本支持（单号版 / 多号版）
 4. JS 函数变更类型识别（新增 / 修改 / 删除）
 5. Diff 摘要（3–5 行）
 6. 卡片式通知 + LOGO + emoji
 7. 可选 Telegram Bot 推送
*/

// ---------- 配置区域 ----------
const SCRIPTS = [
    {
        name: "单号签到脚本",
        js_url: "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.7.js"
    },
    // 可继续添加多号脚本
];

const VERSION_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/version.json";
const CACHE_HASH_KEY = "Ninebot_Sign_JS_Hash";
const CACHE_VER_KEY = "Ninebot_Sign_JS_Version";
const CACHE_DATA_KEY = "Ninebot_Sign_JS_OLD_DATA";

const TITLE = "九号签到助手 · 更新检测";
const LOGO_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/logo_128.png";

// Telegram 配置（可选）
const TELEGRAM_ENABLE = false;
const TELEGRAM_BOT_TOKEN = "";
const TELEGRAM_CHAT_ID = "";

// ---------- 工具函数 ----------
function sha256(str) {
    // Loon / QX 内置 $crypto 对象可能不存在，用 WebCrypto 方案
    if (typeof $crypto !== "undefined") return $crypto.sha256(str).toUpperCase();
    if (typeof crypto !== "undefined" && crypto.subtle) {
        const encoder = new TextEncoder();
        return crypto.subtle.digest("SHA-256", encoder.encode(str)).then(buf => {
            return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
        });
    }
    // Fallback: 返回空，保证逻辑继续
    console.warn("无法计算 SHA256，使用 fallback");
    return "UNKNOWN_HASH";
}

function compareVersion(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i=0;i<Math.max(x.length,y.length);i++){
        const s=x[i]||0, t=y[i]||0;
        if(s>t) return 1; if(s<t) return -1;
    }
    return 0;
}

function diffLines(oldData, newData, maxLines = 5){
    const oldLines = (oldData||"").split("\n");
    const newLines = newData.split("\n");
    const diffs = [];
    for(let i=0;i<Math.min(newLines.length, oldLines.length);i++){
        if(oldLines[i]!==newLines[i]){
            diffs.push((newLines[i].startsWith("+")||newLines[i].startsWith("-")?newLines[i]:"+ "+newLines[i]));
            if(diffs.length>=maxLines) break;
        }
    }
    return diffs.join("\n");
}

// 简单函数变更识别（新增/修改/删除）
function analyzeFunctionChanges(oldData, newData){
    const fnRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
    const oldFns = new Set();
    const newFns = new Set();
    let m;
    while((m=fnRegex.exec(oldData||""))){ oldFns.add(m[1]); }
    while((m=fnRegex.exec(newData))){ newFns.add(m[1]); }
    const added = [...newFns].filter(f=>!oldFns.has(f));
    const removed = [...oldFns].filter(f=>!newFns.has(f));
    const modified = [...newFns].filter(f=>oldFns.has(f));
    return {added, removed, modified};
}

// ---------- 主流程 ----------
(async ()=>{
    try{
        console.log(`${TITLE} 开始执行`);

        // 下载 version.json
        let remoteVersion = "";
        try{
            const verResp = await new Promise((resolve)=>{
                $httpClient.get(VERSION_URL,(e,r,d)=>resolve(d));
            });
            remoteVersion = JSON.parse(verResp||"{}").version||"";
        }catch(e){ console.warn("version.json 下载失败:", e); }

        for(const sc of SCRIPTS){
            let data;
            try{
                data = await new Promise((resolve,reject)=>{
                    $httpClient.get(sc.js_url,(err,resp,body)=>{
                        if(err||resp.status!==200) reject(err||resp.status);
                        else resolve(body);
                    });
                });
            }catch(e){
                $notification.post(TITLE, `${sc.name} 下载失败 ⚠️`, String(e), { "media-url": LOGO_URL });
                console.error(`${sc.name} 下载失败`, e);
                continue;
            }

            const newHash = await sha256(data);
            const oldHash = $persistentStore.read(CACHE_HASH_KEY+"_"+sc.name);
            const oldData = $persistentStore.read(CACHE_DATA_KEY+"_"+sc.name)||"";
            const localVersion = $persistentStore.read(CACHE_VER_KEY+"_"+sc.name)||"";

            const diff = diffLines(oldData, data, 5);
            const changes = analyzeFunctionChanges(oldData, data);
            const lineChange = data.split("\n").length - (oldData.split("\n").length||0);
            const lineChangeText = lineChange===0?"（行数无变化）":`（变更 ${lineChange>0?"+":""}${lineChange} 行）`;

            let needUpdate = false;
            if(remoteVersion && compareVersion(remoteVersion, localVersion)>0) needUpdate=true;
            if(oldHash && oldHash!==newHash) needUpdate=true;

            if(needUpdate){
                $persistentStore.write(newHash, CACHE_HASH_KEY+"_"+sc.name);
                $persistentStore.write(remoteVersion, CACHE_VER_KEY+"_"+sc.name);
                $persistentStore.write(data, CACHE_DATA_KEY+"_"+sc.name);

                const notifyBody = `
${sc.name} 更新检测到！ ${lineChangeText}
版本：${localVersion||"未知"} → ${remoteVersion||"未知"}
函数变更：
新增 ${changes.added.length} 个函数
修改 ${changes.modified.length} 个函数
删除 ${changes.removed.length} 个函数
diff 摘要：
${diff}
点击查看详细更新
`;
                $notification.post(TITLE, "🚀 检测到脚本更新", notifyBody, { "open-url": "https://github.com/QinyRui/QYR-/compare/main...HEAD", "media-url": LOGO_URL });

                // Telegram 推送
                if(TELEGRAM_ENABLE && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID){
                    const tgMsg = encodeURIComponent(notifyBody);
                    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${tgMsg}&parse_mode=Markdown`;
                    $httpClient.get(tgUrl,()=>{});
                }

                console.log(`${sc.name} 已检测到更新`);
            }else{
                console.log(`${sc.name} 已是最新，无需更新`);
            }
        }

        console.log(`${TITLE} 执行完成`);
    }catch(e){
        console.error("更新检测异常:",e);
        $notification.post(TITLE,"⚠️ 更新检测异常",String(e),{ "media-url": LOGO_URL });
    }
})();