// Ninebot_Sign_Single_v2.6.js
!(async () => {
  const args = $argument || [];
  const notify = args[0] === "true";
  const autoRepair = args[1] === "true";
  const titlePrefix = args[2] || "九号签到助手";
  const progressStyle = parseInt(args[3] || 0);

  console.info("info 当前配置：", { notify, autoRepair, titlePrefix, progressStyle });

  // ---------- 辅助函数 ----------
  function renderBlindBoxProgress(blindBox, style) {
    const bars = ["░█", "▁▂▃▄▅▆▇█", "▒▓█", "□■", "⬜⬛", "◇◆", "·●", "⣿⣀"];
    const barChars = bars[style] || bars[0];
    return blindBox.map(box => {
      const total = box.target;
      const opened = box.opened;
      const percent = opened / total;
      const length = 20;
      const filledLength = Math.round(percent * length);
      const emptyLength = length - filledLength;
      let bar = barChars[barChars.length - 1].repeat(filledLength) + barChars[0].repeat(emptyLength);
      return `${box.target} 天盲盒：\n[${bar}] ${opened} / ${total} 天`;
    }).join("\n\n");
  }

  async function querySignStatus() {
    try {
      const resp = await $httpClient.get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status" });
      return JSON.parse(resp.body);
    } catch (e) {
      console.error("error 查询签到状态失败", e);
      return { currentSignStatus: 0, signCards: 0, consecutiveDays: 0, rewardClaimed: false };
    }
  }

  async function doSign() {
    try {
      const resp = await $httpClient.post({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign" });
      return JSON.parse(resp.body);
    } catch (e) {
      console.error("error 执行签到失败", e);
      return { success: false };
    }
  }

  async function repairShareTasks() {
    try {
      const resp = await $httpClient.get({ url: "https://snssdk.ninebot.com/service/2/app_log/" });
      const data = JSON.parse(resp.body);
      console.info("info 分享任务原始数据：", data);
      // 自动修复逻辑示例，可根据返回数据补发请求
    } catch (e) {
      console.error("error 修复分享任务失败", e);
    }
  }

  async function queryAccount() {
    try {
      const resp = await $httpClient.get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-account/info" });
      const data = JSON.parse(resp.body).data || {};
      return {
        credit: data.credit || 0,
        level: data.level || 0,
        creditUpgrade: data.credit_upgrade || 0,
        balance: data.balance || 0
      };
    } catch (e) {
      console.error("error 查询账户信息失败", e);
      return { credit: 0, level: 0, creditUpgrade: 0, balance: 0 };
    }
  }

  async function queryBlindBox() {
    try {
      const resp = await $httpClient.get({ url: "https://cn-cbu-gateway.ninebot.com/portal/api/user-blind-box/list" });
      const data = JSON.parse(resp.body).data || [];
      return data.map(item => ({ target: item.target, opened: item.opened }));
    } catch (e) {
      console.error("error 查询盲盒失败", e);
      return [];
    }
  }

  // ---------- 主流程 ----------
  console.info("info 九号自动签到开始");

  const status = await querySignStatus();

  if (status.currentSignStatus === 0) {
    const signResult = await doSign();
    console.info("info 签到结果：", signResult);
  } else {
    console.info("info 检测到今日已签到，跳过签到接口");
  }

  if (autoRepair) {
    await repairShareTasks();
  }

  const account = await queryAccount();
  const blindBox = await queryBlindBox();
  const blindBoxText = renderBlindBoxProgress(blindBox, progressStyle);

  if (notify) {
    const message = `
✨ 今日签到：${status.currentSignStatus === 1 ? "已签到" : "成功"}
🎁 奖励领取：${status.rewardClaimed ? "已领取" : "未领取"}

📊 账户状态
- 当前经验：${account.credit}（LV.${account.level}）
- 距离升级：${account.creditUpgrade} 经验
- 当前 N 币：${account.balance}
- 补签卡：${status.signCards} 张
- 连续签到：${status.consecutiveDays} 天

📦 盲盒进度
${blindBoxText}
    `;
    $notify(titlePrefix, "", message);
  }

  console.info("info 九号自动签到结束");
})();