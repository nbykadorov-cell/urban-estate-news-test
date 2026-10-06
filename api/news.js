module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const target = "https://161.ru/text/realty/";

  try {
    const response = await fetch(target);

    const html = await response.text();

    // Ищем первую ссылку на статью
    const match = html.match(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );

    if (!match) {
      return res.status(200).json({
        ok: true,
        test: "D-161RU-parse",
        found: false,
        htmlLength: html.length
      });
    }

    const url = match[1];
    const titleHtml = match[2];

    const title = titleHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    res.status(200).json({
      ok: true,
      test: "D-161RU-parse",
      found: true,
      htmlLength: html.length,
      url: url,
      title: title
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      test: "D-161RU-parse",
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });

  }
};
