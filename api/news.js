module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const target = "https://161.ru/text/realty/";

  try {
    const response = await fetch(target);

    const html = await response.text();

    res.status(200).json({
      ok: true,
      test: "C-161RU",
      target: target,
      httpStatus: response.status,
      contentLength: html.length
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      test: "C-161RU",
      target: target,
      errorName: error && error.name ? error.name : "Error",
      error: error && error.message ? error.message : String(error)
    });

  }
};
