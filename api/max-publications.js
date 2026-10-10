
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const MESSAGE_PREFIX = "urban-estate:max:message:";
const MESSAGE_INDEX = "urban-estate:max:message-ids";

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({
      ok: false,
      error: "Method not allowed",
    }));
  }

  try {
    const ids = await redis("SMEMBERS", MESSAGE_INDEX) || [];
    const publications = [];

    for (const id of ids) {
      const raw = await redis("GET", `${MESSAGE_PREFIX}${id}`);

      if (!raw) continue;

      try {
        const publication = typeof raw === "string"
          ? JSON.parse(raw)
          : raw;

        publications.push(publication);
      } catch (error) {
        console.error("Invalid publication record:", id);
      }
    }

    publications.sort(
      (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.end(JSON.stringify({
      ok: true,
      count: publications.length,
      publications,
    }));
  } catch (error) {
    console.error("MAX publications API error:", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.end(JSON.stringify({
      ok: false,
      error: "Failed to load publications",
    }));
  }
};
