// 美团Cookie自动抓取&写入BoxJS | BoxJS 远程控制日志+通知 | Loon专用
// 仓库链接: https://raw.githubusercontent.com/QinyRui/QYR-/Q/meituan-cookie-capture.js
const $ = new Env("美团Cookie抓取");
const BOXJS_DOMAIN = "meituan-sign";

let LOG_LEVEL = 1;
let NOTIFY_SWITCH = true;

(async function() {
    try {
        // 第一步：加载 BoxJS 配置
        await loadBoxJSConfig();
        log(1, "📌 已加载 BoxJS 配置 | 日志等级:" + LOG_LEVEL + " | 通知开关:" + NOTIFY_SWITCH);

        // 第二步：提取请求头 Cookie
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) {
            log(1, "❌ 请求头未提取到Cookie");
            throw new Error("请求头无Cookie");
        }
        log(2, "🔍 提取到Cookie（脱敏）: " + cookie.substring(0, 50) + "...");

        // 第三步：对比新旧 Cookie
        const oldCookie = await getBoxJSData("cookie");
        log(1, "📥 BoxJS已存储Cookie: " + (oldCookie ? "存在" : "不存在"));

        if (cookie === oldCookie) {
            log(1, "ℹ️ Cookie未变化，无需更新");
            $.done({});
            return;
        }

        // 第四步：写入新 Cookie 到 BoxJS
        await setBoxJSData("cookie", cookie);
        const successMsg = "✅ Cookie已更新并写入BoxJS";
        log(1, successMsg);
        
        if (NOTIFY_SWITCH) {
            $.notify("美团Cookie更新成功", "", successMsg);
        }

    } catch (error) {
        const errMsg = `❌ 抓取失败：${error.message}`;
        log(1, errMsg);
        if (NOTIFY_SWITCH) {
            $.notify("美团Cookie抓取失败", "", error.message);
        }
    } finally {
        $.done({});
    }
})();

// 加载 BoxJS 配置参数
async function loadBoxJSConfig() {
    const logLevel = await getBoxJSData("logLevel");
    LOG_LEVEL = logLevel ? parseInt(logLevel) : 1;

    const notifySwitch = await getBoxJSData("notifySwitch");
    NOTIFY_SWITCH = notifySwitch === "true" || notifySwitch === true;
}

// 带等级控制的日志函数
function log(level, msg) {
    if (level <= LOG_LEVEL) {
        $.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
}

// BoxJS 数据读写通用函数
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(`${BOXJS_DOMAIN}.${key}`, value => {
            resolve(value || "");
        });
    });
}

function setBoxJSData(key, value) {
    return new Promise(resolve => {
        $persistentStore.write(value, `${BOXJS_DOMAIN}.${key}`, () => {
            resolve();
        });
    });
}

// Loon 环境适配函数
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}