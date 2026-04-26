const crypto = require("crypto");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    return { ok: false, error: "缺少 initData 或 BOT_TOKEN。" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { ok: false, error: "initData 中缺少 hash。" };
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

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
    user?.username ? `用户名：@${user.username}` : "",
    `姓名：${form.name}`,
    `联系方式：${form.contact}`,
    `备注：${form.note || "无"}`
  ].filter(Boolean).join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: adminChatId,
      text
    })
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { ok: false, error: "只支持 POST 请求。" });
    return;
  }

  const botToken = process.env.BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!botToken) {
    json(response, 500, { ok: false, error: "服务器未配置 BOT_TOKEN。" });
    return;
  }

  try {
    const body = request.body || {};
    const { initData, form } = body;

    const validation = validateTelegramInitData(initData, botToken);
    if (!validation.ok) {
      json(response, 401, validation);
      return;
    }

    const name = String(form?.name || "").trim();
    const contact = String(form?.contact || "").trim();
    const note = String(form?.note || "").trim();

    if (!name || !contact) {
      json(response, 400, { ok: false, error: "姓名和联系方式不能为空。" });
      return;
    }

    if (note.length > 500) {
      json(response, 400, { ok: false, error: "备注不能超过 500 个字符。" });
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

    json(response, 200, {
      ok: true,
      registrationId,
      user: validation.user,
      form: { name, contact, note },
      savedAt: new Date().toISOString(),
      adminNotified: Boolean(adminChatId)
    });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: "服务器处理失败。",
      detail: error.message
    });
  }
};
