/*******************************
 网上国网自动抓包 · 日志版
 BoxJS Key: wangshangguowang
 Author: QinyRui
*******************************/

if (typeof $request === "undefined") {
    console.log("[SGCC] ❌ 当前环境不支持 $request，请确保类型是 HTTP-REQUEST 并且 URL 匹配");
    $notification.post("网上国网抓包 ❌", "脚本必须放在 HTTP-REQUEST 类型", "");
    $done({});
    return;
}

const KEY = "wangshangguowang";

// 打印拦截 URL
console.log(`[SGCC] ⚡ 拦截到请求：${$request.url}`);

// 解析 headers
const headers = $request.headers || {};
let token = headers["Authorization"] || headers["authorization"] || "";
let cookie = headers["Cookie"] || headers["cookie"] || "";

// 解析 body
let body = $request.body || "";
let json = {};
try {
    if (body) json = JSON.parse(body);
} catch (e) {
    console.log(`[SGCC] ⚠️ Body JSON 解析错误：${e}`);
}

// 抓取字段
let found = {
    token: token || json?.token || json?.accessToken || "",
    refreshToken: json?.refreshToken || "",
    customerId: json?.customerId || json?.data?.customerId || "",
    provinceCode: json?.provinceCode || "",
    cityCode: json?.cityCode || "",
    elecId: json?.elecId || json?.data?.elecId || "",
    meterId: json?.meterId || json?.data?.meterId || "",
    cookie: cookie
};

console.log(`[SGCC] 🔍 抓取到字段：`);
console.log(JSON.stringify(found, null, 2));

// 如果没抓到关键字段，直接结束
if (!found.token && !found.elecId && !found.meterId) {
    console.log(`[SGCC] ❌ 未抓到有效字段`);
    $done({});
    return;
}

// 读取 BoxJS 旧数据
let oldData = $persistentStore.read(KEY);
let data = oldData && isJson(oldData) ? JSON.parse(oldData) : {};
data.time = Date.now();
if (found.token) data.token = found.token;
if (found.refreshToken) data.refreshToken = found.refreshToken;
if (found.customerId) data.customerId = found.customerId;
if (found.provinceCode) data.provinceCode = found.provinceCode;
if (found.cityCode) data.cityCode = found.cityCode;
if (found.cookie) data.cookie = found.cookie;

// 电表信息
data.meters ||= [];
if (found.elecId || found.meterId) {
    const item = { elecId: found.elecId, meterId: found.meterId, update: Date.now() };
    // 去重
    data.meters = data.meters.filter(m => m.elecId !== found.elecId);
    data.meters.push(item);
    console.log(`[SGCC] 🔁 电表信息已更新（去重成功）`);
}

// 写入 BoxJS
const save = $persistentStore.write(JSON.stringify(data), KEY);
if (save) {
    console.log(`[SGCC] ✅ 写入成功：${KEY}`);
    $notification.post("网上国网抓包 ✅", "数据已写入 BoxJS", `共 ${data.meters.length} 个电表`);
} else {
    console.log(`[SGCC] ❌ 写入失败`);
    $notification.post("网上国网抓包 ❌", "写入 BoxJS 失败", "请检查 Key 或 BoxJS");
}

$done({});

function isJson(str) {
    if (!str) return false;
    try { JSON.parse(str); return true; } catch { return false; }
}