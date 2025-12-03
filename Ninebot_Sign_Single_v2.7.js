/***********************************************
Ninebot_Sign_Single_v2.8.js （参数修复版）
2025-12-05 15:30 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

const IS_LOON = typeof $argument !== "undefined";
const IS_REQUEST = typeof $request !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined";
const HAS_NOTIFY = typeof $notification !== "undefined";
const HAS_HTTP = typeof $httpClient !== "undefined";

// 优先读取BoxJS配置，Loon环境叠加参数
const ARG = {
    titlePrefix: IS_LOON ? ($argument?.titlePrefix || readPS("ninebot.titlePrefix") || "九号签到助手") : readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: IS_LOON ? ($argument?.logLevel || readPS("ninebot.logLevel") || "debug") : readPS("ninebot.logLevel") || "debug"
};

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { if (HAS_NOTIFY && (IS_LOON || readPS("ninebot.notify") === "true")) $notification.post(title, sub, body); }
function nowStr() { return new Date().toLocaleString(); }

function formatDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_DEBUG = "ninebot.debug";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_LOG_LEVEL = "ninebot.logLevel";

// 其他代码与之前版本一致...