/*
 * 米游社插件版本检查脚本（通用版，支持九号/米游社插件）
 * author: QinyRui
 * repo: https://github.com/QinyRui/QYR-
 * 功能：检查插件远程版本，对比本地版本并推送更新提醒
 */
const boxjs = typeof $boxjs !== 'undefined' ? $boxjs : null;
const notify = true; // 强制推送更新通知（可改为从BoxJS读取）
const titlePrefix = "米游社版本检查";

// 日志配置（适配米游社logLevel）
const LOG_LEVEL = boxjs ? (boxjs.getItem("mihoyo.logLevel") || "simple") : "simple";
function log(type, msg) {
  if (LOG_LEVEL === "silent") return;
  if (LOG_LEVEL === "simple" && type === "debug") return;
  console.log(`[米游社更新-${type}] [${new Date().toLocaleTimeString()}] ${msg}`);
}

// 插件配置（需与MihoyoSign.plugin的updateUrl一致）
const PLUGIN_CONFIG = {
  name: "米游社签到插件",
  localVersion: "1.0.0", // 本地插件版本（与插件#!version一致）
  remoteUrl: "https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.plugin" // 插件远程Raw链接
};

// 版本号对比（支持x.y.z格式）
function compareVersion(localVer, remoteVer) {
  const localArr = localVer.split(".").map(Number);
  const remoteArr = remoteVer.split(".").map(Number);
  const maxLen = Math.max(localArr.length, remoteArr.length);

  for (let i = 0; i < maxLen; i++) {
    const localVal = localArr[i] || 0;
    const remoteVal = remoteArr[i] || 0;
    if (remoteVal > localVal) return 1; // 远程版本更高
    if (remoteVal < localVal) return -1; // 本地版本更高
  }
  return 0; // 版本相同
}

// 提取远程插件的版本号
async function getRemoteVersion(url) {
  try {
    log("debug", `请求远程插件：${url}`);
    const response = await $httpClient.get({ url });
    if (response.status === 200) {
      // 匹配插件中的#!version字段
      const versionMatch = response.body.match(/#!version = (\d+\.\d+\.\d+)/);
      if (versionMatch && versionMatch[1]) {
        log("info", `获取远程版本：${versionMatch[1]}`);
        return versionMatch[1];
      } else {
        log("error", "远程插件未找到#!version字段");
        return null;
      }
    } else {
      log("error", `请求远程插件失败，状态码：${response.status}`);
      return null;
    }
  } catch (e) {
    log("error", `请求异常：${e.message}`);
    return null;
  }
}

// 推送更新通知
function sendUpdateNotify(remoteVer) {
  if (!notify) return;
  $notification.post(
    titlePrefix,
    "插件有更新 📢",
    `当前版本：${PLUGIN_CONFIG.localVersion}\n最新版本：${remoteVer}\n\n更新地址：\n${PLUGIN_CONFIG.remoteUrl}`
  );
}

// 主逻辑
async function checkUpdate() {
  log("info", "开始检查米游社插件版本");
  const remoteVer = await getRemoteVersion(PLUGIN_CONFIG.remoteUrl);
  
  if (!remoteVer) {
    log("warn", "版本检查失败，未获取到远程版本");
    notify && $notification.post(titlePrefix, "版本检查失败", "无法获取远程插件版本");
    return;
  }

  const compareRes = compareVersion(PLUGIN_CONFIG.localVersion, remoteVer);
  switch (compareRes) {
    case 1:
      log("info", `发现新版本：${remoteVer}（本地：${PLUGIN_CONFIG.localVersion}）`);
      sendUpdateNotify(remoteVer);
      break;
    case 0:
      log("info", `当前已是最新版本：${PLUGIN_CONFIG.localVersion}`);
      notify && $notification.post(titlePrefix, "版本检查结果", "当前已是最新版本");
      break;
    case -1:
      log("warn", `本地版本高于远程：${PLUGIN_CONFIG.localVersion} > ${remoteVer}`);
      notify && $notification.post(titlePrefix, "版本异常", "本地版本高于远程版本，请检查插件链接");
      break;
  }
}

// 执行检查
checkUpdate().then(() => $done({}));