/**
 * SGCC 多模式抓包脚本（安全版）
 * 作者：QinyRui
 * 功能：
 * - 自动识别 JSON / Form / 加密 / 空 Body
 * - 自动写入 BoxJS（raw + account）
 * - 手动运行也不会报 $request 错误
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
    try {
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

        // 可能是加密网关或大数据流
        if (/^[0-9A-F]+$/i.test(bodyRaw) || bodyRaw.length > 200) {
            return { type: "encrypted", data: bodyRaw };
        }

        return { type: "text", data: bodyRaw };
    } catch (e) {
        return { type: "unknown", data: bodyRaw };
    }
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

// 从 header 提取 token
["Authorization", "authorization"].forEach(k => {
    if (headers[k]) {
        data.token = headers[k].replace(/Bearer /i, "");
        LOG(`🔑 从 header 捕获 token: ${data.token}`);
    }
});

// 从 JSON / Form 提取字段
if (parsed.type === "json" || parsed.type === "form") {
    let obj = parsed.data;
    const keys = Object.keys(obj);

    keys.forEach(k => {
        let keyLower = k.toLowerCase();
        let v = obj[k];

        if (keyLower.includes("token") && typeof v === "string") {
            if (keyLower.includes("refresh")) data.refreshToken = v;
            else data.token = v;
        }
        if (keyLower.includes("customer")) data.customerId = v;
        if (keyLower.includes("province")) data.provinceCode = v;
        if (keyLower.includes("city")) data.cityCode = v;
        if (keyLower.includes("elec") || keyLower.includes("account")) data.elecId = v;
        if (keyLower.includes("meter")) data.meterId = v;
    });

    LOG(`📦 抓取到字段解析完成`);
}

// 如果所有字段都为空 → 可能加密接口
const nothing =
    !data.token &&
    !data.refreshToken &&
    !data.customerId &&
    !data.elecId &&
    !data.cookie;

if (nothing) LOG(`⚠️ 未抓到明确字段（可能加密或无关接口）`);

// 读取旧数据
let old = JSON.parse($persistentStore.read(KEY_DATA) || "{}");

// 自动更新最新 token
if (data.token) old.token = data.token;
if (data.refreshToken) old.refreshToken = data.refreshToken;
if (data.customerId) old.customerId = data.customerId;
if (data.provinceCode) old.provinceCode = data.provinceCode;
if (data.cityCode) old.cityCode = data.cityCode;
if (data.elecId) old.elecId = data.elecId;
if (data.meterId) old.meterId = data.meterId;
if (data.cookie) old.cookie = data.cookie;

// 保存结果
$persistentStore.write(JSON.stringify(old, null, 2), KEY_DATA);
LOG(`💾 已写入 BoxJS: ${KEY_DATA}`);

$persistentStore.write(
    JSON.stringify(
        { url, method, headers, parsedBody: parsed, final: old },
        null,
        2
    ),
    KEY_RAW
);
LOG(`🗂 已备份到 BoxJS (raw)：${KEY_RAW}`);

$done({});