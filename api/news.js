module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const target = "https://161.ru/text/realty/";

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    const links = [];

    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = linkRe.exec(html)) !== null) {
      const url = match[1];
      const title = match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (
        url.includes("/text/realty/") &&
        title.length >= 20
      ) {
        links.push({
          url: url,
          title: title
        });
      }

      if (links.length >= 10) {
        break;
      }
    }

    res.status(200).json({
      ok: true,
      test: "E-161RU-links",
      htmlLength: html.length,
      count: links.length,
      items: links
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      test: "E-161RU-links",
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });

  }
};
