/**
 * SGCC 多模式抓包（升级版）
 * 支持明文 JSON / Form / 加密 Body
 * 自动写入 BoxJS（raw + account）
 */

if (typeof $request === "undefined") {
    console.log("[SGCC-Capture] ❌ 请确保脚本被 HTTP-REQUEST 触发");
    $done({});
}

const KEY_RAW = "wangshangguowang.raw";
const KEY_DATA = "wangshangguowang.account";

const url = $request.url || "";
const method = ($request.method || "").toUpperCase();
const headers = $request.headers || {};
const bodyRaw = $request.body || "";

function LOG(msg) { console.log(`[SGCC-Capture] ${msg}`); }

LOG(`⚡ 拦截到请求：${url}`);
LOG(`📩 Method: ${method}`);
LOG(`📥 Body Length: ${bodyRaw?.length || 0}`);

function parseBody() {
    if (!bodyRaw) return { type: "empty", data: "" };

    // 尝试 JSON
    try {
        const json = JSON.parse(bodyRaw);
        return { type: "json", data: json };
    } catch (e) {}

    // 尝试表单
    if (bodyRaw.includes("&") && bodyRaw.includes("=")) {
        let obj = {};
        bodyRaw.split("&").forEach(kv => {
            const [k, v] = kv.split("=");
            obj[k] = decodeURIComponent(v || "");
        });
        return { type: "form", data: obj };
    }

    // 判断 HEX / Base64 / 加密数据
    if (/^[0-9A-Fa-f]+$/.test(bodyRaw) || bodyRaw.length > 200) {
        return { type: "encrypted", data: bodyRaw };
    }

    return { type: "text", data: bodyRaw };
}

const parsed = parseBody();
LOG(`🔍 Body 类型判定：${parsed.type}`);

let data = {
    token: "",
    refreshToken: "",
    customerId: "",
    provinceCode: "",
    cityCode: "",
    elecId: "",
    meterId: "",
    cookie: headers["Cookie"] || headers["cookie"] || ""
};

// 从 header 捕获 token
["Authorization", "authorization"].forEach(k => {
    if (headers[k]) {
        data.token = headers[k].replace(/Bearer /i, "");
        LOG(`🔑 捕获 header token: ${data.token}`);
    }
});

// 解析 JSON / Form 字段
if (parsed.type === "json" || parsed.type === "form") {
    const obj = parsed.data;
    Object.keys(obj).forEach(k => {
        const v = obj[k];
        const keyLower = k.toLowerCase();

        if (keyLower.includes("token")) {
            keyLower.includes("refresh") ? data.refreshToken = v : data.token = v;
        }
        if (keyLower.includes("customer")) data.customerId = v;
        if (keyLower.includes("province")) data.provinceCode = v;
        if (keyLower.includes("city")) data.cityCode = v;
        if (keyLower.includes("elec") || keyLower.includes("account")) data.elecId = v;
        if (keyLower.includes("meter")) data.meterId = v;
    });
    LOG(`📦 JSON/Form 字段解析完成`);
}

// 检查是否抓到有效字段
const hasData = data.token || data.customerId || data.elecId || data.meterId;
if (!hasData && parsed.type === "encrypted") {
    LOG(`⚠️ Body 为加密数据，无法解析字段，可查看 raw 数据`);
}

// 读取旧数据并更新
let old = JSON.parse($persistentStore.read(KEY_DATA) || "{}");
Object.assign(old, data);

// 写入 BoxJS
$persistentStore.write(JSON.stringify(old, null, 2), KEY_DATA);
LOG(`💾 已写入 BoxJS: ${KEY_DATA}`);

$persistentStore.write(JSON.stringify({
    url, method, headers, parsedBody: parsed, final: old
}, null, 2), KEY_RAW);
LOG(`🗂 已备份到 BoxJS (raw)：${KEY_RAW}`);

$done({});