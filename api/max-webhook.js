
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const MESSAGE_PREFIX = "urban-estate:max:message:";
const MESSAGE_INDEX = "urban-estate:max:message-ids";

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Max-Bot-Api-Secret");
  res.end(JSON.stringify(data));
};

async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Не заданы переменные Redis");
  }

  const path = [command, ...args]
    .map((part) => encodeURIComponent(String(part)))
    .join("/");

  const response = await fetch(
    `${REDIS_URL.replace(/\/$/, "")}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `Redis HTTP ${response.status}`);
  }

  return data.result;
}

function getMessage(update) {
  return (
    update.message ||
    update.edited_message ||
    update.data?.message ||
    update.message_created?.message ||
    update.message_edited?.message ||
    null
  );
}

function getEventType(update) {
  return (
    update.update_type ||
    update.type ||
    update.event ||
    ""
  ).toLowerCase();
}

function getMessageId(update, message) {
  return (
    message?.body?.mid ||
    message?.mid ||
    message?.message_id ||
    message?.id ||
    update.message_id ||
    update.mid ||
    update.data?.message_id ||
    update.data?.mid ||
    update.message?.body?.mid ||
    null
  );
}

function getChatId(update, message) {
  return (
    message?.recipient?.chat_id ||
    message?.recipient?.chatId ||
    message?.chat_id ||
    message?.chatId ||
    update.chat_id ||
    update.chatId ||
    update.recipient?.chat_id ||
    update.data?.chat_id ||
    null
  );
}

function getText(message) {
  const body = message?.body || {};
  return String(
    body.text ??
    message?.text ??
    message?.caption ??
    ""
  ).trim();
}

function getAttachments(message) {
  const body = message?.body || {};
  const attachments = body.attachments ?? message?.attachments ?? [];
  return Array.isArray(attachments) ? attachments : [];
}


function extractLinks(text, message) {
  const found = new Map();

  // 1. Ссылки, которые явно присутствуют в тексте
  const matches = String(text || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [];

  for (const rawUrl of matches) {
    const url = rawUrl.replace(/[.,!?;:]+$/, "");
    if (url) {
      found.set(url, {
        url,
        title: ""
      });
    }
  }

  // 2. Ссылки, добавленные через форматирование MAX
  const body = message?.body || {};
  const markup = Array.isArray(body.markup) ? body.markup : [];

  for (const item of markup) {
    const type = String(item.type || "").toLowerCase();
    const value = item.url || item.href || item.payload?.url;

    if (
      (type.includes("link") || value) &&
      typeof value === "string" &&
      /^https?:\/\//i.test(value)
    ) {
      const title =
        item.text ||
        item.value ||
        item.payload?.text ||
        "";

      found.set(value, {
        url: value,
        title: String(title)
      });
    }
  }

  return [...found.values()];
}


function makeCards(text, messageId) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  return extractLinks(text).map((link, index) => {
    const lineIndex = lines.findIndex((line) => line.includes(link.url));
    const sameLine = lineIndex >= 0 ? lines[lineIndex] : "";
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : "";

    const title = (
      sameLine.replace(link.url, "").trim() ||
      previousLine ||
      "Открыть ссылку"
    ).slice(0, 180);

    return {
      id: `${messageId}_${index}`,
      title,
      url: link.url,
      sourceMessageId: messageId,
    };
  });
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      endpoint: "max-webhook",
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const secret = process.env.MAX_WEBHOOK_SECRET;
  const receivedSecret = req.headers["x-max-bot-api-secret"];

  if (secret && receivedSecret !== secret) {
    return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const update = req.body || {};
    const eventType = getEventType(update);

    const message = getMessage(update);
    const messageId = getMessageId(update, message);

    const chatId = String(getChatId(update, message) ?? "");
    const targetChatId = String(process.env.MAX_TARGET_CHAT_ID ?? "");

    if (targetChatId && chatId && chatId !== targetChatId) {
      return json(res, 200, { ok: true, skipped: "another chat" });
    }

    const isRemoved =
      eventType.includes("removed") ||
      eventType.includes("deleted");

    if (!messageId) {
      return json(res, 200, {
        ok: true,
        skipped: "message id not found",
        eventType,
      });
    }

    const redisKey = `${MESSAGE_PREFIX}${messageId}`;

    if (isRemoved) {
      await redis("DEL", redisKey);
      await redis("SREM", MESSAGE_INDEX, messageId);

      return json(res, 200, { ok: true, removed: messageId });
    }

    if (!message) {
      return json(res, 200, {
        ok: true,
        skipped: "message body not found",
        eventType,
      });
    }

    const text = getText(message);
    const attachments = getAttachments(message);
    const links = extractLinks(text, message);
    const now = Date.now();

    const publication = {
      messageId: String(messageId),
      chatId,
      text,
      attachments,
      links,
      cards: makeCards(text, String(messageId)),
      updatedAt: now,
      eventType,
    };

    await redis("SET", redisKey, JSON.stringify(publication));
    await redis("SADD", MESSAGE_INDEX, String(messageId));

    return json(res, 200, {
      ok: true,
      saved: true,
      messageId: String(messageId),
      links: links.length,
      attachments: attachments.length,
    });
  } catch (error) {
    console.error("MAX webhook error:", error);

    return json(res, 500, {
      ok: false,
      error: "Webhook processing failed",
    });
  }
};
