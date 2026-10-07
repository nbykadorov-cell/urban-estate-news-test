module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const response = await fetch("https://93.ru/text/realty/", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    // Ищем все ссылки
    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const items = [];
    const seen = new Set();

    let match;

    while ((match = linkRe.exec(html)) !== null) {
      let url = match[1];
      let title = match[2];

      // Декодируем HTML
      title = title
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();

      // Абсолютный URL
      try {
        url = new URL(url, "https://93.ru/").href;
      } catch {
        continue;
      }

      // Нас интересуют только статьи раздела недвижимости
      if (!/^https:\/\/93\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\//.test(url)) {
        continue;
      }

      // Убираем GET-параметры
      url = url.split("?")[0];

      if (!title || seen.has(url)) {
        continue;
      }

      seen.add(url);

      items.push({
        url,
        title
      });

      if (items.length >= 10) {
        break;
      }
    }

    res.status(200).json({
      ok: true,
      test: "93RU-links",
      source: "93.RU",
      htmlLength: html.length,
      count: items.length,
      items
    });

  } catch (error) {
    res.status(200).json({
      ok: false,
      test: "93RU-links",
      source: "93.RU",
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });
  }
};
