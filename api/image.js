// api/image.js
// Прокси изображений для новостной ленты Urban Estate.

const ALLOWED_HOSTS = [
  "161.ru",
  "93.ru",
  "hsmedia.ru",
  "domclick.ru",
  "domclick.com",
  "telesco.pe",
  "telegram.org",
  "cdn-telegram.org",
  "xn--h1alcedd.xn--d1aqf.xn--p1ai",
  "domrf.ru",
  "yandex.net",
  "yandex.ru",
  "yandexcloud.net",
  "yastatic.net",
  "krasdom.ru",
  "cian.ru"
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

function normalizeHostname(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/\.$/, "");
}

function isAllowedHost(hostname) {
  const host = normalizeHostname(hostname);

  return ALLOWED_HOSTS.some(allowed => {
    const domain = normalizeHostname(allowed);
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function getQueryValue(req, key) {
  const value = req.query && req.query[key];
  return Array.isArray(value) ? value[0] : value;
}

function getReferer(source, target) {
  const host = normalizeHostname(target.hostname);

  if (host === "161.ru" || host.endsWith(".161.ru") || host === "hsmedia.ru" || host.endsWith(".hsmedia.ru")) {
    return "https://161.ru/";
  }

  if (host === "93.ru" || host.endsWith(".93.ru")) {
    return "https://93.ru/";
  }

  if (host === "blog.domclick.ru" || host.endsWith(".domclick.ru")) {
    return "https://blog.domclick.ru/novosti";
  }

  if (host === "domclick.ru" || host.endsWith(".domclick.com")) {
    return "https://blog.domclick.ru/novosti";
  }

  if (host === "telesco.pe" || host.endsWith(".telesco.pe") || host === "telegram.org" || host.endsWith(".telegram.org") || host === "cdn-telegram.org" || host.endsWith(".cdn-telegram.org")) {
    return "https://t.me/s/domclick";
  }

  if (host === "xn--h1alcedd.xn--d1aqf.xn--p1ai" || host.endsWith(".xn--h1alcedd.xn--d1aqf.xn--p1ai")) {
    return "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/";
  }

  if (source === "domrf") {
    return "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/";
  }

  return `${target.origin}/`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const rawUrl = getQueryValue(req, "url");
  const source = String(getQueryValue(req, "source") || "").toLowerCase();

  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return res.status(400).send("Missing image URL");
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).send("Invalid image URL");
  }

  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).send("Invalid protocol");
  }

  if (target.username || target.password || !isAllowedHost(target.hostname)) {
    return res.status(403).send("Image host is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
        "Referer": getReferer(source, target)
      }
    });

    let finalUrl;
    try {
      finalUrl = new URL(response.url || target.toString());
    } catch {
      return res.status(502).send("Invalid final image URL");
    }

    // Проверяем также адрес после редиректа, чтобы прокси не стал открытым SSRF-прокси.
    if (!/^https?:$/.test(finalUrl.protocol) || !isAllowedHost(finalUrl.hostname)) {
      return res.status(403).send("Redirected image host is not allowed");
    }

    if (!response.ok) {
      return res.status(response.status).send("Image request failed");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//i.test(contentType)) {
      return res.status(415).send("URL does not return an image");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_SIZE) {
      return res.status(413).send("Image is too large");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      return res.status(502).send("Empty image response");
    }
    if (buffer.length > MAX_IMAGE_SIZE) {
      return res.status(413).send("Image is too large");
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).end(buffer);
  } catch (error) {
    console.error("Image proxy error:", error);
    return res.status(502).send("Unable to load image");
  } finally {
    clearTimeout(timeout);
  }
};
