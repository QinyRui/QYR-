// 美团Cookie自动抓取&写入BoxJS | 适配Loon
// 仓库地址: https://github.com/QinyRui/QYR-/tree/Q
const $ = new Env("美团Cookie抓取");
const BOXJS_DOMAIN = "meituan-sign"; // 与BoxJS配置的domain一致

(async function() {
    try {
        // 从请求头提取Cookie
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) throw new Error("请求头无Cookie");

        // 读取BoxJS中已存储的Cookie
        const oldCookie = await getBoxJSData("cookie");
        if (cookie === oldCookie) {
            $.log("Cookie未变化，无需更新");
            $.done({});
            return;
        }

        // 写入新Cookie到BoxJS
        await setBoxJSData("cookie", cookie);
        $.log("✅ Cookie已更新并写入BoxJS");
        $.notify("美团Cookie更新成功", "", "已自动同步到BoxJS");

    } catch (error) {
        $.log(`❌ 抓取失败：${error.message}`);
    } finally {
        $.done({});
    }
})();

// BoxJS数据读取
function getBoxJSData(key) {
    return new Promise(resolve => {
        $persistentStore.read(`${BOXJS_DOMAIN}.${key}`, value => {
            resolve(value || "");
        });
    });
}

// BoxJS数据写入
function setBoxJSData(key, value) {
    return new Promise(resolve => {
        $persistentStore.write(value, `${BOXJS_DOMAIN}.${key}`, () => {
            resolve();
        });
    });
}

// Loon环境适配
function Env(name) {
    this.name = name;
    this.log = msg => console.log(`[${name}] ${msg}`);
    this.notify = (title, sub, msg) => $notification.post(title, sub, msg);
}