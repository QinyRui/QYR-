(async () => {
    const cfg = {
        debug: $argument.enable_debug === "true",
        notify: $argument.enable_notify === "true",
        autoOpenBox: $argument.enable_openbox === "true",
        autoRepair: $argument.enable_supplement === "true",
        autoApplyBeta: $argument.enable_internal_test === "true",
        titlePrefix: $argument.notify_title || "九号签到"
    };

    if(cfg.debug) console.log("🟢 开始执行九号签到脚本...");

    // ---------- 1. 获取签到状态 ----------
    const st = await getStatus();
    if(cfg.debug) console.log("📄 当前连续签到天数:", st?.data?.consecutiveDays || 0);

    // ---------- 2. 执行签到 ----------
    const sign = await doSign();
    if(cfg.debug) console.log("📄 签到结果:", sign?.msg);

    // ---------- 3. 获取余额 ----------
    const bal = await getBalance();
    if(cfg.debug) console.log("📄 N币余额:", bal?.data?.balance);

    // ---------- 4. 获取盲盒任务 ----------
    const box = await getBlindBox();
    if(cfg.debug) console.log("📄 盲盒任务列表结果:", box?.data?.notOpenedBoxes);

    // ---------- 5. 自动开启盲盒 ----------
    if(cfg.autoOpenBox && box?.data?.notOpenedBoxes?.length){
        for(const b of box.data.notOpenedBoxes){
            if(b.leftDaysToOpen === 0){
                const reward = await openBox(b.awardDays);
                if(cfg.debug) console.log(`🎁 ${b.awardDays}天盲盒领取结果:`, reward);
            }
        }
    }

    // ---------- 6. 内测申请 ----------
    let beta;
    if(cfg.autoApplyBeta) beta = await applyBeta();

    // ---------- 7. 构建美化通知 ----------
    let notifyLines = [];
    notifyLines.push("📝 签到结果：" + (sign?.code === 0 ? "签到成功" : (sign?.msg || "已签到，不能重复签到")));
    if(st?.code === 0){
        notifyLines.push(`📅 连续签到：${st.data?.consecutiveDays || 0} 天`);
        notifyLines.push(`🎫 补签卡：${st.data?.signCardsNum || 0} 张`);
    }
    if(bal?.code === 0){
        notifyLines.push(`💰 N币余额：${bal.data?.balance || 0}`);
    }
    if(box?.data?.notOpenedBoxes?.length){
        notifyLines.push("🎁 盲盒任务：");
        box.data.notOpenedBoxes.forEach(b=>{
            let days = b.awardDays || "?";
            let left = b.leftDaysToOpen ?? "?";
            notifyLines.push(`   🔹 ${days}天盲盒，还需 ${left} 天`);
        });
    }
    if(beta){
        if(beta?.data?.qualified) notifyLines.push("🚀 已获得内测资格");
        else notifyLines.push("⚠️ 未获得内测资格" + (cfg.autoApplyBeta ? " → 自动申请" : ""));
    }

    if(cfg.notify) $notification.post(cfg.titlePrefix, "", notifyLines.join("\n"));
    if(cfg.debug) console.log("✅ 脚本执行完成.");
})();