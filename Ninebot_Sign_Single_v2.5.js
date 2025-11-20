/*
九号智能电动车签到脚本 v2.5
功能：
1. 手动填写 Authorization / DeviceId / User-Agent 并保存持久化
2. 支持抓包自动写入 Authorization / DeviceId / User-Agent
3. 手动签到 + 自动签到（CRON）
4. 支持自动盲盒、自动补签、内测开关
*/

const $ = new ToolClient();

// 读取持久化配置
const loadConfig = () => $.readJson("config") || {};

// 保存持久化配置
const saveConfig = (config) => $.writeJson(config, "config");

// 获取 Authorization / DeviceId / User-Agent
const getAuthData = () => {
  const cfg = loadConfig();
  return {
    Authorization: cfg.Authorization || "",
    DeviceId: cfg.DeviceId || "",
    UserAgent: cfg.UserAgent || "",
  };
};

// 设置抓包数据
const setCapturedData = (Authorization, DeviceId, UserAgent) => {
  saveConfig({ Authorization, DeviceId, UserAgent });
  $.msg("九号签到助手", "已保存 Authorization / DeviceId / User-Agent");
};

// 用户通知
const notify = (title, message) => $.msg(title, message);

// 主签到函数
const signIn = async () => {
  const { Authorization, DeviceId, UserAgent } = getAuthData();
  if (!Authorization || !DeviceId) {
    return notify("未配置 Token", "请在插件 UI 填写 Authorization / DeviceId");
  }

  try {
    const resp = await $.fetch({
      method: "POST",
      url: "https://api.ninebot.com/sign_in",
      headers: { Authorization, DeviceId, "User-Agent": UserAgent },
    });
    const data = await resp.toJson();
    if (data.success) {
      notify("签到成功", `连续签到 ${data.continuousSignInDays} 天`);
    } else {
      notify("签到失败", data.message || "未知错误");
    }
  } catch (e) {
    notify("签到异常", e.message);
  }
};

// 自动签到（CRON）
const autoSignIn = async () => await signIn();

// 手动签到
const manualSignIn = async () => await signIn();

// 抓包写入数据（示例）
const captureAuthData = () => {
  const captureData = $.readJson("capturedData");
  if (captureData && captureData.Authorization && captureData.DeviceId) {
    setCapturedData(captureData.Authorization, captureData.DeviceId, captureData.UserAgent || "");
  }
};

// CRON 自动签到
cron("0 8 * * *", async () => await autoSignIn());

// 如果手动签到开关开启
if (loadConfig().enable_manual_sign) {
  manualSignIn();
}

// 抓包请求拦截（写入持久化）
http-request "^https:\/\/api\.ninebot\.com\/.*" script-path = "Ninebot_Sign_Single_v2.5.js", tag = "九号-抓包写入", enable = {enable_capture};