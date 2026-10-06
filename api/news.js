module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const target =
    "https://161.ru/text/realty/2026/10/06/76680602/";

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    // title
    let title = "";

    const titleMatch = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    if (titleMatch) {
      title = titleMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // description
    let description = "";

    const descriptionMatch = html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i
    );

    if (descriptionMatch) {
      description = descriptionMatch[1]
        .replace(/\s+/g, " ")
        .trim();
    }

    // og:image
    let image = "";

    const imageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

    if (imageMatch) {
      image = imageMatch[1];
    }

    // canonical
    let canonical = "";

    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

    if (canonicalMatch) {
      canonical = canonicalMatch[1];
    }

    res.status(200).json({
      ok: true,
      test: "F-161RU-article",
      httpStatus: response.status,
      htmlLength: html.length,
      title: title,
      description: description,
      image: image,
      canonical: canonical
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      test: "F-161RU-article",
      errorName:
        error && error.name
          ? error.name
          : "Error",
      error:
        error && error.message
          ? error.message
          : String(error)
    });

  }
};
