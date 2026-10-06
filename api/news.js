module.exports = async (req, res) => {
  const started = Date.now();

  const send = (status, data) => {
    res.status(status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data));
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://161.ru/text/realty/", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UrbanEstateNews/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`161.RU HTTP ${response.status}`);
    }

    const html = await response.text();

    const items = [];
    const seen = new Set();

    // 161.RU is server-rendered. We intentionally use a very small,
    // dependency-free parser for this first integration test.
    const linkRe = /<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
    let match;

    while ((match = linkRe.exec(html)) !== null && items.length < 20) {
      let url = match[1].replace(/&amp;/g, "&");

      if (url.startsWith("/")) {
        url = "https://161.ru" + url;
      }

      if (!/^https?:\\/\\/161\\.ru\\/text\\//i.test(url)) continue;
      if (url.includes("/text/tags/") || url.includes("/text/format/")) continue;

      const title = match[2]
        .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
        .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, "&")
        .replace(/\\s+/g, " ")
        .trim();

      if (!title || title.length < 20 || title.length > 500) continue;
      if (seen.has(url)) continue;

      seen.add(url);

      items.push({
        id: `161ru-${items.length + 1}`,
        title,
        url,
        source: "161.RU",
        sourceHome: "https://161.ru/text/realty/",
        categories: ["rostov", "estate"]
      });
    }

    send(200, {
      ok: true,
      version: "stage-1",
      category: "rostov",
      count: items.length,
      elapsedMs: Date.now() - started,
      source: {
        id: "161ru",
        name: "161.RU",
        ok: true,
        count: items.length,
        error: null
      },
      items
    });
  } catch (error) {
    send(200, {
      ok: false,
      version: "stage-1",
      category: "rostov",
      count: 0,
      elapsedMs: Date.now() - started,
      source: {
        id: "161ru",
        name: "161.RU",
        ok: false,
        count: 0,
        error: error && error.name === "AbortError"
          ? "Timeout while requesting 161.RU"
          : String(error && error.message || error)
      },
      items: []
    });
  } finally {
    clearTimeout(timeout);
  }
};
