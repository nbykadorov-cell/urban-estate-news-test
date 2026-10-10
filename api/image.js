// api/image.js

const ALLOWED_HOSTS = [
  "161.ru",
  "93.ru",
  "hsmedia.ru",
  "blog.domclick.ru",
  "domclick.ru",
  "t.me",
  "www.t.me",
  "cdn4.telesco.pe",
  "xn--h1alcedd.xn--d1aqf.xn--p1ai",
  "domrf.ru",
  "www.domrf.ru"
];

function normalizeHostname(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/\.$/, "");
}

function isAllowedHost(hostname) {
  const host = normalizeHostname(hostname);

  return ALLOWED_HOSTS.some(allowed => {
    const normalizedAllowed =
      normalizeHostname(allowed);

    return (
      host === normalizedAllowed ||
      host.endsWith(`.${normalizedAllowed}`)
    );
  });
}

function getQueryUrl(req) {
  const raw = req.query?.url;

  if (Array.isArray(raw)) {
    return raw[0];
  }

  return raw;
}

function isImageContentType(contentType) {
  return /^image\//i.test(
    String(contentType || "")
  );
}

module.exports = async function handler(
  req,
  res
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res
      .status(204)
      .end();
  }

  if (req.method !== "GET") {
    return res
      .status(405)
      .send("Method Not Allowed");
  }

  const rawUrl =
    getQueryUrl(req);

  if (
    !rawUrl ||
    typeof rawUrl !== "string"
  ) {
    return res
      .status(400)
      .send("Missing image URL");
  }

  let target;

  try {
    target = new URL(rawUrl);
  } catch {
    return res
      .status(400)
      .send("Invalid image URL");
  }

  if (
    !/^https?:$/i.test(
      target.protocol
    )
  ) {
    return res
      .status(400)
      .send("Invalid protocol");
  }

  /*
   * Проверяем исходный URL до запроса.
   * Это не позволяет использовать endpoint как произвольный SSRF-прокси.
   */
  if (
    !isAllowedHost(
      target.hostname
    )
  ) {
    return res
      .status(403)
      .send("Image host is not allowed");
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      15000
    );

  try {
    const response =
      await fetch(
        target.toString(),
        {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
            "Accept":
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language":
              "ru-RU,ru;q=0.9,en;q=0.7",
            "Referer":
              target.origin + "/"
          }
        }
      );

    /*
     * fetch может пройти несколько редиректов.
     * После редиректа обязательно проверяем конечный host.
     */
    let finalUrl;

    try {
      finalUrl = new URL(
        response.url ||
          target.toString()
      );
    } catch {
      return res
        .status(502)
        .send("Invalid final image URL");
    }

    if (
      !/^https?:$/i.test(
        finalUrl.protocol
      )
    ) {
      return res
        .status(403)
        .send("Invalid redirected protocol");
    }

    if (
      !isAllowedHost(
        finalUrl.hostname
      )
    ) {
      return res
        .status(403)
        .send("Redirected image host is not allowed");
    }

    if (!response.ok) {
      return res
        .status(response.status)
        .send("Image request failed");
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      !isImageContentType(
        contentType
      )
    ) {
      return res
        .status(415)
        .send("URL does not return an image");
    }

    const contentLength =
      Number(
        response.headers.get(
          "content-length"
        ) || 0
      );

    const MAX_IMAGE_SIZE =
      10 * 1024 * 1024;

    if (
      contentLength >
      MAX_IMAGE_SIZE
    ) {
      return res
        .status(413)
        .send("Image is too large");
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    if (
      buffer.length >
      MAX_IMAGE_SIZE
    ) {
      return res
        .status(413)
        .send("Image is too large");
    }

    res.setHeader(
      "Content-Type",
      contentType
    );

    res.setHeader(
      "Content-Length",
      String(buffer.length)
    );

    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    return res
      .status(200)
      .end(buffer);
  } catch (error) {
    console.error(
      "Image proxy error:",
      error
    );

    return res
      .status(502)
      .send("Unable to load image");
  } finally {
    clearTimeout(timeout);
  }
};
