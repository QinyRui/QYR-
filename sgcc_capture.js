/*******************************
 网上国网自动抓包 · 带详细日志版
 保存 Key：wangshangguowang
 作者：QinyRui 自用
 *******************************/

const KEY = "wangshangguowang";

// 判断是否国家电网接口
const host = $request.hostname || "";
const url = $request.url || "";

if (!/sgcc|95598|power|electric/i.test(host + url)) {
    console.log(`[SGCC] ❌ 非国家电网接口，跳过：${host}${url}`);
    $done({});
    return;
}

console.log(`\n==============================`);
console.log(`[SGCC] ⚡ 拦截到请求：${url}`);
console.log("==============================\n");

// 解析 header
const headers = $request.headers || {};
let token = headers["Authorization"] || headers["authorization"] || "";
let cookie = headers["Cookie"] || headers["cookie"] || "";

// 解析 body
let body = "";
try {
    if ($request.body) {
        body = $request.body;
        console.log(`[SGCC] 📦 请求体：${body}`);
    }
} catch (e) {
    console.log(`[SGCC] ⚠️ 请求体解析失败：${e}`);
}

// 尝试从 body 中解析 JSON（部分国网接口 token 在 body 中）
let json = {};
try {
    if (isJson(body)) {
        json = JSON.parse(body);
        console.log(`[SGCC] 📄 Body JSON 解析成功`);
    }
} catch (e) {
    console.log(`[SGCC] ⚠️ Body JSON 解析错误：${e}`);
}

// 从 JSON 内找关键字段
let found = {
    token: token || json?.token || json?.accessToken,
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

// 如果什么都没抓到，直接结束
if (!found.token && !found.elecId && !found.meterId) {
    console.log(`[SGCC] ❌ 未发现有效字段，不写入`);
    $done({});
    return;
}

// 读取旧存储
let oldData = $persistentStore.read(KEY);
let data = {};

if (oldData && isJson(oldData)) {
    data = JSON.parse(oldData);
    console.log(`[SGCC] 📚 当前已有数据：`);
    console.log(JSON.stringify(data, null, 2));
} else {
    console.log(`[SGCC] 🆕 BoxJS 里没有旧数据，将新建`);
    data = {};
}

// 更新字段（覆盖最新）
data.time = Date.now();
if (found.token) data.token = found.token;
if (found.refreshToken) data.refreshToken = found.refreshToken;
if (found.customerId) data.customerId = found.customerId;
if (found.provinceCode) data.provinceCode = found.provinceCode;
if (found.cityCode) data.cityCode = found.cityCode;
if (found.cookie) data.cookie = found.cookie;

// 处理电表数组
data.meters ||= [];

if (found.elecId || found.meterId) {
    const item = {
        elecId: found.elecId,
        meterId: found.meterId,
        update: Date.now()
    };

    // 去重（以 elecId 为准）
    data.meters = data.meters.filter(m => m.elecId !== found.elecId);
    data.meters.push(item);

    console.log(`[SGCC] 🔁 电表信息已更新（自动去重）`);
}

// 写入 BoxJS
const save = $persistentStore.write(JSON.stringify(data), KEY);

if (save) {
    console.log(`[SGCC] ✅ 写入成功：${KEY}`);
    $notification.post(
        "网上国网 · 抓包成功",
        "数据已写入 BoxJS",
        `点击查看：${KEY}`
    );
} else {
    console.log(`[SGCC] ❌ 写入失败，请检查 Key 或 BoxJS`);
    $notification.post(
        "网上国网 · 抓包失败",
        "写入 BoxJS 失败",
        "请查看脚本日志"
    );
}

$done({});


function isJson(str) {
    if (!str) return false;
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}