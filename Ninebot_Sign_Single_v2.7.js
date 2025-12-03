/***********************************************
Ninebot_Sign_Single_v2.8.js （诊断增强版）
2025-12-05 15:30 更新
核心功能：自动签到、盲盒开箱、资产查询
适配工具：Loon/Surge/Quantumult X
***********************************************/

// 诊断代码：环境检测
logInfo("环境检测：", {
    IS_LOON: typeof $argument !== "undefined",
    HAS_PERSIST: typeof $persistentStore !== "undefined",
    HAS_NOTIFY: typeof $notification !== "undefined",
    HAS_HTTP: typeof $httpClient !== "undefined"
});

// 诊断代码：打印所有存储键值
logInfo("BoxJS存储内容：", $persistentStore.keys());

// 参数处理（优先使用BoxJS配置）
const ARG = {
    titlePrefix: readPS("ninebot.titlePrefix") || "九号签到助手",
    logLevel: readPS("ninebot.logLevel") || "debug",
    notify: readPS("ninebot.notify") === "true"
};

// 诊断代码：打印参数和配置
logInfo("参数与配置：", {
    ARG: ARG,
    BoxJSConfig: {
        authorization: readPS("ninebot.authorization"),
        deviceId: readPS("ninebot.deviceId")
    }
});

// 强制开启日志验证
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };
function getLogLevel() { return LOG_LEVEL_MAP.full; }

function readPS(key) { try { if (HAS_PERSIST) return $persistentStore.read(key); return null; } catch (e) { return null; } }
function writePS(val, key) { try { if (HAS_PERSIST) return $persistentStore.write(val, key); return false; } catch (e) { return false; } }
function notify(title, sub, body) { 
    logInfo("通知参数：", { title, sub, body });
    if (HAS_NOTIFY) {
        $notification.post(title, sub, body);
        logInfo("通知发送成功");
    } else {
        logWarn("通知未发送：缺少通知API支持");
    }
}
function nowStr() { return new Date().toLocaleString(); }

// 其他代码与之前版本一致...