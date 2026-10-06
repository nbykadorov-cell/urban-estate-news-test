module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const r = await fetch("https://161.ru/text/realty/", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const body = await r.text();

    res.status(200).json({
      ok: true,
      target: "https://161.ru/text/realty/",
      httpStatus: r.status,
      contentLength: body.length
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      target: "https://161.ru/text/realty/",
      errorName: e?.name || "Error",
      error: e?.message || String(e)
    });
  }
};
