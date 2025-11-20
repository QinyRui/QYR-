try {
  const beta = await httpGet({ url: END.betaStatus, headers });
  log("内测状态返回：", beta);

  if (beta?.data?.qualified) {
    notifyBody += "\n🚀 已获得内测资格";
  } else {
    notifyBody += "\n⚠️ 未获得内测资格";

    if (cfg.autoApplyBeta) {
      try {
        const applyResp = await httpPost({
          url: "https://cn-cbu-gateway.ninebot.com/app-api/beta/v1/registration",
          headers,
          body: JSON.stringify({ deviceId: cfg.DeviceId })
        });

        // ✅ 打印完整返回
        log("内测申请返回：", applyResp);

        // ✅ 根据接口返回判断
        if (applyResp?.success) {
          notifyBody += " → 自动申请成功 🎉";
        } else if (applyResp?.msg) {
          notifyBody += ` → 自动申请失败 ❌ 原因：${applyResp.msg}`;
        } else {
          notifyBody += " → 自动申请失败 ❌ 原因未知";
        }
      } catch (e) {
        log("内测自动申请异常：", e);
        notifyBody += " → 自动申请异常 ❌";
      }
    }
  }
} catch (e) {
  log("内测检测异常：", e);
}