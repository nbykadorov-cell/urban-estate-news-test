
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const messageIds = await redisCommand([
      "SMEMBERS",
      INDEX_KEY
    ]);

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(200).json({
        ok: true,
        count: 0,
        cards: []
      });
    }

    const records = await Promise.all(
      messageIds.map(async messageId => {
        const value = await redisCommand([
          "GET",
          PREFIX + "message:" + String(messageId)
        ]);

        if (!value) return null;

        try {
          return typeof value === "string"
            ? JSON.parse(value)
            : value;
        } catch {
          return null;
        }
      })
    );

    const cards = records
      .filter(Boolean)
      .flatMap(record => Array.isArray(record.cards) ? record.cards : [])
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));

    return res.status(200).json({
      ok: true,
      count: cards.length,
      cards
    });
  } catch (error) {
    console.error("MAX cards API failed:", error.message);

    return res.status(500).json({
      error: "Could not load MAX cards"
    });
  }
};

