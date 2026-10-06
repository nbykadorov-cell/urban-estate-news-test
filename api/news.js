module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const response = await fetch("https://161.ru/text/realty/", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    res.status(200).json({
      ok: true,
      test: "fetch-only",
      source: "161.RU",
      httpStatus: response.status,
      htmlLength: html.length
    });
  } catch (error) {
    res.status(200).json({
      ok: false,
      test: "fetch-only",
      source: "161.RU",
      error: error && error.message ? error.message : String(error)
    });
  }
};
