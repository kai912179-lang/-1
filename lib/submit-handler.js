const crypto = require("crypto");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Vercel 可能已解析 body；Express 用 middleware；裸 Node 需读流 */
function readJsonBody(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function validateTelegramInitData(initData, botToken) {
  if (!initData) return { ok: false, error: "缺少 initData。" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "initData 缺少 hash。" };

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const received = Buffer.from(hash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");
  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
    return { ok: false, error: "Telegram initData 校验失败。" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = 24 * 60 * 60;
  if (!authDate || now - authDate > maxAgeSeconds) {
    return { ok: false, error: "Telegram initData 已过期，请重新打开小程序。" };
  }

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  return { ok: true, user };
}

async function sendAdminNotification({ botToken, adminChatId, user, form, registrationId }) {
  if (!botToken || !adminChatId) return;

  const userLine = user
    ? `${user.first_name || ""} ${user.last_name || ""}`.trim() + ` (${user.id})`
    : "未知用户";

  const text = [
    "收到新的小程序登记：",
    `登记编号：${registrationId}`,
    `Telegram 用户：${userLine}`,
    user && user.username ? `用户名：@${user.username}` : "",
    `姓名：${form.name}`,
    `联系方式：${form.contact}`,
    `备注：${form.note || "无"}`
  ]
    .filter(Boolean)
    .join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: adminChatId, text })
  });
}

async function submitHandler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "只支持 POST 请求。" });
    return;
  }

  const botToken = process.env.BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!botToken) {
    json(res, 500, { ok: false, error: "服务器未配置 BOT_TOKEN。" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const initData = body.initData;
    const form = body.form || {};

    const validation = validateTelegramInitData(initData, botToken);
    if (!validation.ok) {
      json(res, 401, validation);
      return;
    }

    const name = String(form.name || "").trim();
    const contact = String(form.contact || "").trim();
    const note = String(form.note || "").trim();

    if (!name || !contact) {
      json(res, 400, { ok: false, error: "姓名和联系方式不能为空。" });
      return;
    }
    if (note.length > 500) {
      json(res, 400, { ok: false, error: "备注不能超过 500 个字符。" });
      return;
    }

    const registrationId = `REG-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

    await sendAdminNotification({
      botToken,
      adminChatId,
      user: validation.user,
      form: { name, contact, note },
      registrationId
    });

    json(res, 200, {
      ok: true,
      registrationId,
      user: validation.user,
      form: { name, contact, note },
      savedAt: new Date().toISOString(),
      adminNotified: Boolean(adminChatId)
    });
  } catch (e) {
    json(res, 500, { ok: false, error: "服务器处理失败。", detail: e.message });
  }
}

module.exports = { submitHandler, validateTelegramInitData };
