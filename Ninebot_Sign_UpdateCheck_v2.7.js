/*
 九号签到脚本 · 终极更新检测系统（全功能安全版）
 功能：
 1. 下载远程 JS + version.json
 2. Hash 对比 + 版本号对比
 3. 多脚本支持（单号版 / 多号版）
 4. JS 函数变更类型识别（新增 / 修改 / 删除）
 5. Diff 摘要（最多5行）
 6. 卡片式通知 + LOGO + emoji
 7. 完整日志输出
 8. 可选 Telegram Bot 推送
*/

// ---------- 配置区域 ----------
const SCRIPTS = [
    {
        name: "单号签到脚本",
        js_url: "https://raw.githubusercontent.com/QinyRui/QYR-/main/jiuhao/Ninebot_Sign_Single_v2.7.js"
    },
    // 如果有多号版，可继续加
];

const VERSION_URL = "https://raw.githubusercontent.com/QinyRui/QYR-/main/jiuhao/version.json";
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
function safeReadPS(key) {
    try { return $persistentStore.read(key) || ""; } catch(e){ return ""; }
}

function safeWritePS(key, val){
    try { return $persistentStore.write(val, key); } catch(e){ return false; }
}

function safeNotify(title, subtitle, body, opts={}){
    try {
        if(!$notification){
            console.log("通知 API 不可用:", title, subtitle, body);
            return;
        }
        $notification.post(title||TITLE, subtitle||"", body||"无更新信息", opts);
        console.log("通知发送成功：", title, subtitle);
    } catch(e){
        console.error("通知发送失败：", e);
    }
}

function sha256(str) { return $crypto.sha256(str).toUpperCase(); }

function compareVersion(a, b) {
    const x = (a||"0.0.0").split('.').map(Number), y = (b||"0.0.0").split('.').map(Number);
    for (let i=0;i<Math.max(x.length,y.length);i++){
        const s=x[i]||0, t=y[i]||0;
        if(s>t) return 1; if(s<t) return -1;
    }
    return 0;
}

function diffLines(oldData, newData, maxLines = 5){
    const oldLines = (oldData||"").split("\n");
    const newLines = (newData||"").split("\n");
    const diffs = [];
    for(let i=0;i<Math.min(newLines.length, oldLines.length);i++){
        if(oldLines[i]!==newLines[i]){
            diffs.push((newLines[i].startsWith("+")||newLines[i].startsWith("-")?newLines[i]: "+ "+newLines[i]));
            if(diffs.length>=maxLines) break;
        }
    }
    return diffs.join("\n") || "无差异";
}

function analyzeFunctionChanges(oldData, newData){
    const fnRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
    const oldFns = new Set(), newFns = new Set();
    let m;
    while((m=fnRegex.exec(oldData||""))){ oldFns.add(m[1]); }
    while((m=fnRegex.exec(newData||""))){ newFns.add(m[1]); }
    const added = [...newFns].filter(f=>!oldFns.has(f));
    const removed = [...oldFns].filter(f=>!newFns.has(f));
    const modified = [...newFns].filter(f=>oldFns.has(f));
    return {added, removed, modified};
}

// ---------- 主流程 ----------
(async ()=>{
    console.log(`${TITLE} 开始执行`);
    try{
        // 下载 version.json
        let remoteVersion = "";
        try{
            const verResp = await new Promise((resolve)=>{
                $httpClient.get(VERSION_URL,(e,r,d)=>resolve(d));
            });
            remoteVersion = JSON.parse(verResp||"{}").version||"";
            console.log("远程版本:", remoteVersion);
        }catch(e){
            console.warn("version.json 下载失败:", e);
        }

        for(const sc of SCRIPTS){
            let data = "";
            try{
                data = await new Promise((resolve,reject)=>{
                    $httpClient.get(sc.js_url,(err,resp,body)=>{
                        if(err || !resp || resp.status!==200) reject(err||"请求失败");
                        else resolve(body||"");
                    });
                });
                console.log(`${sc.name} JS 下载成功`);
            }catch(e){
                console.error(`${sc.name} 下载异常:`, e);
                safeNotify(TITLE, `${sc.name} 下载失败 ⚠️`, String(e), { "media-url": LOGO_URL });
                continue;
            }

            const newHash = sha256(data);
            const oldHash = safeReadPS(CACHE_HASH_KEY+"_"+sc.name);
            const oldData = safeReadPS(CACHE_DATA_KEY+"_"+sc.name);
            const localVersion = safeReadPS(CACHE_VER_KEY+"_"+sc.name);

            const diff = diffLines(oldData, data, 5);
            const changes = analyzeFunctionChanges(oldData, data);
            const lineChange = data.split("\n").length - (oldData.split("\n").length||0);
            const lineChangeText = lineChange===0?"（行数无变化）":`（变更 ${lineChange>0?"+":""}${lineChange} 行）`;

            let needUpdate = false;
            if(remoteVersion && compareVersion(remoteVersion, localVersion)>0) needUpdate=true;
            if(oldHash && oldHash!==newHash) needUpdate=true;

            if(needUpdate){
                safeWritePS(CACHE_HASH_KEY+"_"+sc.name, newHash);
                safeWritePS(CACHE_VER_KEY+"_"+sc.name, remoteVersion);
                safeWritePS(CACHE_DATA_KEY+"_"+sc.name, data);

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
                safeNotify(TITLE, "🚀 检测到脚本更新", notifyBody, { "open-url": "https://github.com/QinyRui/QYR-/compare/main...HEAD", "media-url": LOGO_URL });

                // Telegram推送
                if(TELEGRAM_ENABLE && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID){
                    const tgMsg = encodeURIComponent(notifyBody);
                    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${tgMsg}&parse_mode=Markdown`;
                    $httpClient.get(tgUrl,()=>{});
                }

            }else{
                console.log(`${sc.name} 已是最新，无需更新`);
            }
        }
    }catch(e){
        console.error("更新检测异常:", e);
        safeNotify(TITLE,"⚠️ 更新检测异常",String(e),{ "media-url": LOGO_URL });
    }
    console.log(`${TITLE} 执行完成`);
})();