const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MESSAGE_PREFIX = "urban-estate:max:message:";
const MESSAGE_INDEX = "urban-estate:max:message-ids";
const DEVELOPER_GROUPS = {
  "-72201455059710": { city: "Краснодар", category: "МКД" },
  "-72201528984318": { city: "Краснодар", category: "ИЖС" },
  "-77585146495742": { city: "Краснодар", category: "Побережье" },
  "-71978515874558": { city: "Ростов", category: "МКД" },
  "-78729160737534": { city: "Ростов", category: "ИЖС" },
  "-72201477210878": { city: "Крым", category: "МКД" },
  "-77585125589758": { city: "Новороссия", category: "МКД" }
};

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Max-Bot-Api-Secret");
  res.end(JSON.stringify(data));
};

async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Не заданы переменные Redis");
  const path = [command, ...args].map(x => encodeURIComponent(String(x))).join("/");
  const response = await fetch(`${REDIS_URL.replace(/\/$/, "")}/${path}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `Redis HTTP ${response.status}`);
  return data.result;
}
function getMessage(u) {
  return u.message || u.edited_message || u.data?.message || u.message_created?.message || u.message_edited?.message || u.message_removed?.message || null;
}
function getEventType(u) { return String(u.update_type || u.type || u.event || "").toLowerCase(); }
function getMessageId(u, m) {
  return m?.body?.mid || m?.mid || m?.message_id || m?.id || u.message_id || u.mid || u.data?.message_id || u.data?.mid || u.message_removed?.message_id || u.message_removed?.mid || u.message?.body?.mid || null;
}
function getChatId(u, m) {
  return m?.recipient?.chat_id || m?.recipient?.chatId || m?.chat_id || m?.chatId || u.chat_id || u.chatId || u.recipient?.chat_id || u.data?.chat_id || u.data?.chat?.chat_id || u.message_removed?.chat_id || null;
}
function getText(m) { const b = m?.body || {}; return String(b.text ?? m?.text ?? m?.caption ?? "").trim(); }
function getAttachments(m) { const b = m?.body || {}; const a = b.attachments ?? m?.attachments ?? []; return Array.isArray(a) ? a : []; }
function extractLinks(text, message) {
  const found = new Map();
  for (const raw of (String(text || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [])) {
    const url = raw.replace(/[.,!?;:]+$/, ""); if (url) found.set(url, { url, title: "" });
  }
  const markup = Array.isArray(message?.body?.markup) ? message.body.markup : [];
  for (const item of markup) {
    const url = item.url || item.href || item.payload?.url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      found.set(url, { url, title: String(item.text || item.value || item.payload?.text || "") });
    }
  }
  return [...found.values()];
}
function makeCards(text, messageId, links) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim());
  return links.map((link, i) => {
    const lineIndex = lines.findIndex(line => line.includes(link.url));
    const line = lineIndex >= 0 ? lines[lineIndex] : "";
    const previous = lineIndex > 0 ? lines[lineIndex - 1] : "";
    return { id: `${messageId}_${i}`, title: (line.replace(link.url, "").trim() || link.title || previous || "Открыть ссылку").slice(0, 180), url: link.url, sourceMessageId: messageId };
  });
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") return json(res, 200, { ok: true, endpoint: "max-webhook" });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (secret && req.headers["x-max-bot-api-secret"] !== secret) return json(res, 401, { ok: false, error: "Unauthorized" });

  try {
    const update = req.body || {}, eventType = getEventType(update);
    const message = getMessage(update), messageId = getMessageId(update, message);
    const chatId = String(getChatId(update, message) ?? "");
    const removed = eventType.includes("removed") || eventType.includes("deleted");
    if (!messageId) return json(res, 200, { ok: true, skipped: "message id not found", eventType });
    const key = `${MESSAGE_PREFIX}${messageId}`;

    // Удаление должно сработать и при неполном payload без chat_id.
    if (removed) {
      await redis("DEL", key);
      await redis("SREM", MESSAGE_INDEX, String(messageId));
      return json(res, 200, { ok: true, removed: String(messageId) });
    }

    // Важно: MAX_TARGET_CHAT_ID больше не ограничивает обработку одной группой.
    if (!chatId || !Object.prototype.hasOwnProperty.call(DEVELOPER_GROUPS, chatId)) {
      return json(res, 200, { ok: true, skipped: "chat is not in developer groups" });
    }
    if (!message) return json(res, 200, { ok: true, skipped: "message body not found", eventType });

    const text = getText(message), attachments = getAttachments(message), links = extractLinks(text, message);
    const publication = {
      messageId: String(messageId), chatId, text,
      markup: message?.body?.markup || message?.markup || [],
      attachments, links, cards: makeCards(text, String(messageId), links),
      sourceMessageUrl: message?.url || null,
      updatedAt: Date.now(), eventType
    };
    await redis("SET", key, JSON.stringify(publication));
    await redis("SADD", MESSAGE_INDEX, String(messageId));
    return json(res, 200, { ok: true, saved: true, messageId: String(messageId), chatId, links: links.length, attachments: attachments.length });
  } catch (error) {
    console.error("MAX webhook error:", error);
    return json(res, 500, { ok: false, error: "Webhook processing failed" });
  }
};
