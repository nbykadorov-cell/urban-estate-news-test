
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET;
const TARGET_CHAT_ID = process.env.MAX_TARGET_CHAT_ID;

const PREFIX = "urban-estate:max:";
const INDEX_KEY = PREFIX + "message-ids";

async function redisCommand(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Upstash Redis environment variables are missing");
  }

  const response = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error("Redis request failed");
  }

  return result.result;
}

function getMessage(update) {
  return update.message ||
    update.edited_message ||
    update.data?.message ||
    null;
}

function getChatId(update, message) {
  return update.chat_id ??
    message?.recipient?.chat_id ??
    message?.recipient?.chatId ??
    message?.chat_id ??
    message?.chatId ??
    null;
}

function getMessageId(update, message) {
  return message?.body?.mid ??
    message?.message_id ??
    message?.id ??
    update.message_id ??
    update.mid ??
    update.data?.message_id ??
    null;
}

function getText(message) {
  const body = message?.body || {};
  const parts = [];

  if (typeof body.text === "string") {
    parts.push(body.text);
  }

  if (Array.isArray(body.attachments)) {
    parts.push(JSON.stringify(body.attachments));
  }

  return parts.join("\n");
}

function extractCards(text, messageId, timestamp) {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const found = text.match(urlRegex) || [];
  const urls = [...new Set(
    found.map(url => url.replace(/[),.;!?]+$/g, ""))
      .filter(url => /^https?:\/\//i.test(url))
  )];

  const lines = text.split(/\r?\n/).map(line => line.trim());

  return urls.map((url, index) => {
    const lineIndex = lines.findIndex(line => line.includes(url));
    let title = "";

    if (lineIndex >= 0) {
      title = lines[lineIndex]
        .replace(url, "")
        .replace(/^[\s\-–—:|•]+|[\s\-–—:|•]+$/g, "")
        .trim();

      if (!title && lineIndex > 0) {
        title = lines[lineIndex - 1].trim();
      }
    }

    return {
      id: String(messageId) + "_" + index,
      title: title || "Открыть ссылку",
      url,
      sourceMessageId: String(messageId),
      updatedAt: timestamp || Date.now()
    };
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "max-webhook"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!WEBHOOK_SECRET || !TARGET_CHAT_ID) {
    return res.status(500).json({
      error: "MAX webhook environment variables are missing"
    });
  }

  const suppliedSecret =
    req.headers["x-max-bot-api-secret"];

  if (suppliedSecret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let update = req.body;

  if (typeof update === "string") {
    try {
      update = JSON.parse(update);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  if (!update || typeof update !== "object") {
    return res.status(400).json({ error: "Invalid update" });
  }

  const type = update.update_type || "";
  const message = getMessage(update);
  const chatId = getChatId(update, message);

  // Обрабатываем только сообщения нужной группы.
  if (
    chatId === null ||
    String(chatId) !== String(TARGET_CHAT_ID)
  ) {
    return res.status(200).json({
      ok: true,
      ignored: "different chat"
    });
  }

  const messageId = getMessageId(update, message);

  if (messageId === null) {
    return res.status(200).json({
      ok: true,
      ignored: "message ID not found"
    });
  }

  const redisKey = PREFIX + "message:" + String(messageId);

  try {
    if (type === "message_removed") {
      await redisCommand(["DEL", redisKey]);
      await redisCommand([
        "SREM",
        INDEX_KEY,
        String(messageId)
      ]);

      return res.status(200).json({ ok: true });
    }

    if (
      type !== "message_created" &&
      type !== "message_edited"
    ) {
      return res.status(200).json({
        ok: true,
        ignored: "unsupported event"
      });
    }

    if (!message) {
      return res.status(200).json({
        ok: true,
        ignored: "message content not found"
      });
    }

    const text = getText(message);
    const timestamp = update.timestamp || Date.now();
    const cards = extractCards(text, messageId, timestamp);

    // Редактирование сообщения без ссылок удаляет его старые карточки.
    if (cards.length === 0) {
      await redisCommand(["DEL", redisKey]);
      await redisCommand([
        "SREM",
        INDEX_KEY,
        String(messageId)
      ]);
    } else {
      await redisCommand([
        "SET",
        redisKey,
        JSON.stringify({
          messageId: String(messageId),
          chatId: String(chatId),
          cards,
          updatedAt: Date.now()
        })
      ]);

      await redisCommand([
        "SADD",
        INDEX_KEY,
        String(messageId)
      ]);
    }

    return res.status(200).json({
      ok: true,
      savedCards: cards.length
    });
  } catch (error) {
    console.error("MAX webhook processing failed:", error.message);

    return res.status(500).json({
      error: "Could not save MAX update"
    });
  }
};

