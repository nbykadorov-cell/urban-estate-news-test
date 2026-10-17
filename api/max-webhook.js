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

function extractUrlFromLine(line) {
  const match = line.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0].replace(/[.,!?;:]+$/, "") : "";
}

// Интеллектуальный парсер по разделам застройщика
function parseDeveloperPost(text, messageId) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim());
  
  let name = "";
  let description = "";
  let groups = [];
  let resources = [];
  let contacts = [];
  let comment = "";

  let currentSection = "header"; // header, groups, resources, contacts, comment

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Проверка на разделители разделов (линии из дефисов или подчеркиваний)
    if (/^[—\-_]{3,}$/.test(line)) {
      if (currentSection === "header") currentSection = "groups";
      else if (currentSection === "groups") currentSection = "resources";
      else if (currentSection === "resources") currentSection = "contacts";
      else if (currentSection === "contacts") currentSection = "comment";
      continue;
    }

    // Текстовые маркеры разделов (если они прописаны явно)
    const lower = line.toLowerCase();
    if (lower.includes("сайт и групп") || lower.includes("ссылки на сайты")) {
      currentSection = "groups";
      continue;
    }
    if (lower.includes("материал") || lower.includes("ресурс")) {
      currentSection = "resources";
      continue;
    }
    if (lower.includes("контакт") || lower.includes("менеджер")) {
      currentSection = "contacts";
      continue;
    }
    if (lower.includes("комментарий")) {
      currentSection = "comment";
      continue;
    }

    // Распределение по секциям с учетом особенностей разметки
    if (currentSection === "header") {
      if (!name) {
        name = line;
      } else {
        description += (description ? "\n" : "") + line;
      }
    } else if (currentSection === "groups") {
      groups.push({ title: line, url: extractUrlFromLine(line) });
    } else if (currentSection === "resources") {
      // Ресурсы могут быть ссылкой или текстом (логин/пароль)
      resources.push({ title: line, url: extractUrlFromLine(line) });
    } else if (currentSection === "contacts") {
      // Собираем все строки контактов (телефоны, имена, подписи городов)
      contacts.push(line);
    } else if (currentSection === "comment") {
      comment += (comment ? "\n" : " ") + line;
    }
  }

  return {
    id: String(messageId),
    name: name || "Застройщик",
    description,
    groups,
    resources,
    contacts,
    comment
  };
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

    if (removed) {
      await redis("DEL", key);
      await redis("SREM", MESSAGE_INDEX, String(messageId));
      return json(res, 200, { ok: true, removed: String(messageId) });
    }

    if (!chatId || !Object.prototype.hasOwnProperty.call(DEVELOPER_GROUPS, chatId)) {
      return json(res, 200, { ok: true, skipped: "chat is not in developer groups" });
    }
    if (!message) return json(res, 200, { ok: true, skipped: "message body not found", eventType });

    const text = getText(message), attachments = getAttachments(message);
    const parsedData = parseDeveloperPost(text, messageId);

    const publication = {
      messageId: String(messageId),
      chatId,
      text,
      ...parsedData,
      markup: message?.body?.markup || message?.markup || [],
      attachments,
      updatedAt: Date.now(),
      eventType
    };

    await redis("SET", key, JSON.stringify(publication));
    await redis("SADD", MESSAGE_INDEX, String(messageId));
    return json(res, 200, { ok: true, saved: true, messageId: String(messageId), chatId });
  } catch (error) {
    console.error("MAX webhook error:", error);
    return json(res, 500, { ok: false, error: "Webhook processing failed" });
  }
};
