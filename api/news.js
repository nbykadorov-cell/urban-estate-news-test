module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const articleUrl =
    "https://93.ru/text/realty/2026/10/07/76683189/";

  try {
    const response = await fetch(articleUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    function decodeHtml(value) {
      return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getMetaByProperty(property) {
      const re = new RegExp(
        '<meta[^>]+property=["\']' +
        property +
        '["\'][^>]+content=["\']([^"\']*)["\']',
        "i"
      );

      const match = html.match(re);

      return match ? decodeHtml(match[1]) : "";
    }

    function getMetaByName(name) {
      const re = new RegExp(
        '<meta[^>]+name=["\']' +
        name +
        '["\'][^>]+content=["\']([^"\']*)["\']',
        "i"
      );

      const match = html.match(re);

      return match ? decodeHtml(match[1]) : "";
    }

    function getCanonical() {
      const re =
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;

      const match = html.match(re);

      return match ? match[1] : "";
    }

    const title =
      getMetaByProperty("og:title") ||
      getMetaByName("twitter:title");

    const description =
      getMetaByProperty("og:description") ||
      getMetaByName("description");

    const image =
      getMetaByProperty("og:image") ||
      getMetaByName("twitter:image");

    const canonical = getCanonical();

    res.status(200).json({
      ok: true,
      test: "93RU-article",
      httpStatus: response.status,
      htmlLength: html.length,
      url: articleUrl,
      title,
      description,
      image,
      canonical
    });

  } catch (error) {
    res.status(200).json({
      ok: false,
      test: "93RU-article",
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });
  }
};
