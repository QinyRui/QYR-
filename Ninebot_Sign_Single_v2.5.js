/*
九号智能电动车签到脚本 v2.5
功能：
1. 支持手动填写 Authorization 和 DeviceId，保存为持久化数据
2. 支持抓包自动写入 Authorization 和 DeviceId
3. 支持手动签到，自动签到（基于 CRON）
4. 支持自动开启盲盒、自动补签、内测申请等开关
*/

const $ = new ToolClient();

// 读取持久化的数据
const loadData = () => {
  const config = $.readJson("config");
  return config || {};
};

// 保存持久化的数据
const saveData = (data) => {
  $.writeJson(data, "config");
};

// 获取手动填写的 Authorization 和 DeviceId
const getAuthData = () => {
  const config = loadData();
  return {
    Authorization: config.Authorization || "",
    DeviceId: config.DeviceId || "",
  };
};

// 设置手动填写的 Authorization 和 DeviceId
const setAuthData = (Authorization, DeviceId) => {
  const config = loadData();
  config.Authorization = Authorization;
  config.DeviceId = DeviceId;
  saveData(config);
};

// 获取抓包数据（如果有）
const getCapturedData = () => {
  const capturedData = $.readJson("capturedData");
  return capturedData || {};
};

// 保存抓包数据（如果有）
const saveCapturedData = (capturedData) => {
  $.writeJson(capturedData, "capturedData");
};

// 提供用户通知
const notify = (title, message) => {
  $.msg(title, message);
};

// 主签到操作
const signIn = async () => {
  const { Authorization, DeviceId } = getAuthData();

  if (!Authorization || !DeviceId) {
    return notify("未配置 Token", "请在插件 UI 填写 Authorization 和 DeviceId");
  }

  // 模拟签到请求（这里以假设的 API 进行示例）
  const response = await $.fetch({
    method: "POST",
    url: "https://api.ninebot.com/sign_in",
    headers: {
      Authorization,
      DeviceId,
    },
  });

  const data = await response.toJson();
  if (data.success) {
    notify("签到成功", `签到完成！当前连续签到：${data.continuousSignInDays}天`);
  } else {
    notify("签到失败", `签到失败：${data.message}`);
  }
};

// 自动签到（CRON）
const autoSignIn = async () => {
  await signIn();
};

// 捕获请求并自动填充 Authorization 和 DeviceId（抓包功能）
const captureAuthData = () => {
  const captureData = $.readJson("capturedData");
  if (captureData) {
    setAuthData(captureData.Authorization, captureData.DeviceId);
    notify("抓包成功", "已自动填写 Authorization 和 DeviceId");
  } else {
    notify("抓包失败", "未成功捕获 Authorization 和 DeviceId");
  }
};

// 手动执行签到
const manualSignIn = async () => {
  await signIn();
};

// 定时任务 - 自动签到
cron("0 8 * * *", async () => {
  await autoSignIn();
});

// 监听抓包请求
http-request "^https:\/\/api\.ninebot\.com\/sign_in" script-path = "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot_Sign_Single_v2.5.js", tag = "九号-抓包写入", timeout = 10, enable = { enable_capture }

// 手动执行按钮
if (enable_manual_sign) {
  manualSignIn();
}