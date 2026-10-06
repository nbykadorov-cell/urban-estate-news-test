module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const target = "https://161.ru/text/realty/";

    const response = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    res.status(200).json({
      ok: true,
      target: target,
      httpStatus: response.status,
      contentLength: html.length
    });

  } catch (error) {
    res.status(200).json({
      ok: false,
      target: "https://161.ru/text/realty/",
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });
  }
};
