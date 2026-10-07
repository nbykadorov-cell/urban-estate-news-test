module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const SOURCE_ID = "161ru";
  const SOURCE_NAME = "161.RU";
  const SOURCE_URL = "https://161.ru";
  const LIST_URL = "https://161.ru/text/realty/";

  const DEFAULT_LIMIT = 15;
  const MAX_LIMIT = 20;

  const DEFAULT_DAYS = 7;
  const MAX_DAYS = 30;

  const CONCURRENCY = 3;

  // ---------------------------------------------------------
  // TEXT
  // ---------------------------------------------------------

  function cleanText(value) {
    if (!value) return "";

    return String(value)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeHtml(value) {
    if (!value) return "";

    return String(value)
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&nbsp;/gi, " ")
      .trim();
  }

  // ---------------------------------------------------------
  // URL
  // ---------------------------------------------------------

  function absoluteUrl(url) {
    if (!url) return "";

    url = decodeHtml(String(url).trim());

    if (url.startsWith("//")) {
      return "https:" + url;
    }

    if (url.startsWith("/")) {
      return SOURCE_URL + url;
    }

    return url;
  }

  function normalizeArticleUrl(url) {
    if (!url) return "";

    url = absoluteUrl(url);

    try {
      const parsed = new URL(url);

      return (
        parsed.origin +
        parsed.pathname
      );
    } catch (error) {
      return url.split("?")[0];
    }
  }

  // ---------------------------------------------------------
  // DATE
  // ---------------------------------------------------------

  function extractDateFromUrl(url) {
    if (!url) return null;

    const match = url.match(
      /\/text\/realty\/(\d{4})\/(\d{2})\/(\d{2})\//
    );

    if (!match) return null;

    return (
      match[1] +
      "-" +
      match[2] +
      "-" +
      match[3]
    );
  }

  // ---------------------------------------------------------
  // META
  //
  // Здесь специально используем две простые функции,
  // без сложной динамической RegExp-конструкции.
  // ---------------------------------------------------------

  function extractMetaByName(html, name) {
    if (!html) return "";

    const re1 = new RegExp(
      '<meta[^>]+name=["\']' +
      name +
      '["\'][^>]+content=["\']([^"\']*)["\']',
      "i"
    );

    let match = html.match(re1);

    if (match) {
      return decodeHtml(match[1]);
    }

    const re2 = new RegExp(
      '<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']' +
      name +
      '["\']',
      "i"
    );

    match = html.match(re2);

    if (match) {
      return decodeHtml(match[1]);
    }

    return "";
  }

  function extractMetaByProperty(html, property) {
    if (!html) return "";

    const re1 = new RegExp(
      '<meta[^>]+property=["\']' +
      property +
      '["\'][^>]+content=["\']([^"\']*)["\']',
      "i"
    );

    let match = html.match(re1);

    if (match) {
      return decodeHtml(match[1]);
    }

    const re2 = new RegExp(
      '<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']' +
      property +
      '["\']',
      "i"
    );

    match = html.match(re2);

    if (match) {
      return decodeHtml(match[1]);
    }

    return "";
  }

  // ---------------------------------------------------------
  // TITLE
  // ---------------------------------------------------------

  function extractTitle(html) {
    if (!html) return "";

    const match = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    if (!match) return "";

    let title = cleanText(match[1]);

    title = title
      .replace(
        /\s*-\s*\d{1,2}\s+\S+\s+\d{4}\s*\|\s*161\.ру\s*$/i,
        ""
      )
      .trim();

    return title;
  }

  // ---------------------------------------------------------
  // DESCRIPTION
  // ---------------------------------------------------------

  function extractDescription(html) {
    if (!html) return "";

    let description =
      extractMetaByName(
        html,
        "description"
      );

    if (!description) {
      description =
        extractMetaByProperty(
          html,
          "og:description"
        );
    }

    return cleanText(description);
  }

  // ---------------------------------------------------------
  // IMAGE
  // ---------------------------------------------------------

  function extractImage(html) {
    if (!html) return "";

    let image =
      extractMetaByProperty(
        html,
        "og:image"
      );

    if (!image) {
      image =
        extractMetaByName(
          html,
          "twitter:image"
        );
    }

    return absoluteUrl(image);
  }

  // ---------------------------------------------------------
  // CANONICAL
  // ---------------------------------------------------------

  function extractCanonical(html) {
    if (!html) return "";

    let match = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

    if (match) {
      return absoluteUrl(match[1]);
    }

    match = html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
    );

    if (match) {
      return absoluteUrl(match[1]);
    }

    return "";
  }

  // ---------------------------------------------------------
  // FETCH LIST
  // ---------------------------------------------------------

  async function fetchArticleList() {
    const response = await fetch(
      LIST_URL,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml"
        }
      }
    );

    const html = await response.text();

    if (!response.ok) {
      throw new Error(
        "161.RU list HTTP " +
        response.status
      );
    }

    const articles = [];
    const seen = new Set();

    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
      (match = linkRe.exec(html)) !== null
    ) {
      let url = match[1];
      let title = cleanText(match[2]);

      url = normalizeArticleUrl(url);

      if (!url || !title) {
        continue;
      }

      if (
        !url.match(
          /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\//
        )
      ) {
        continue;
      }

      if (seen.has(url)) {
        continue;
      }

      if (title.length < 20) {
        continue;
      }

      seen.add(url);

      articles.push({
        url: url,
        title: title,
        date: extractDateFromUrl(url)
      });

      if (
        articles.length >= MAX_LIMIT
      ) {
        break;
      }
    }

    return articles;
  }

  // ---------------------------------------------------------
  // FETCH ARTICLE
  // ---------------------------------------------------------

  async function fetchArticle(article) {
    try {
      const response = await fetch(
        article.url,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml"
          }
        }
      );

      const html =
        await response.text();

      if (!response.ok) {
        return {
          ok: false,
          url: article.url,
          error:
            "HTTP " +
            response.status
        };
      }

      const title =
        extractTitle(html) ||
        article.title;

      const description =
        extractDescription(html);

      const image =
        extractImage(html);

      const canonical =
        extractCanonical(html);

      const finalUrl =
        canonical
          ? normalizeArticleUrl(canonical)
          : article.url;

      return {
        ok: true,

        source: SOURCE_NAME,

        sourceId: SOURCE_ID,

        category: "rostov",

        title: title,

        description:
          description || "",

        url: finalUrl,

        image:
          image || "",

        date:
          article.date,

        publishedAt:
          article.date
            ? article.date +
              "T00:00:00Z"
            : null
      };

    } catch (error) {

      return {
        ok: false,

        url: article.url,

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      };
    }
  }

  // ---------------------------------------------------------
  // CONCURRENCY
  // ---------------------------------------------------------

  async function processWithConcurrency(
    items,
    worker,
    concurrency
  ) {
    const results =
      new Array(items.length);

    let nextIndex = 0;

    async function runner() {

      while (true) {

        const index =
          nextIndex++;

        if (
          index >=
          items.length
        ) {
          return;
        }

        results[index] =
          await worker(
            items[index]
          );
      }
    }

    const runners = [];

    const count =
      Math.min(
        concurrency,
        items.length
      );

    for (
      let i = 0;
      i < count;
      i++
    ) {
      runners.push(
        runner()
      );
    }

    await Promise.all(
      runners
    );

    return results;
  }

  // ---------------------------------------------------------
  // QUERY PARAMETERS
  // ---------------------------------------------------------

  let limit =
    Number(
      req.query &&
      req.query.limit
    );

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    limit =
      DEFAULT_LIMIT;
  }

  limit =
    Math.min(
      Math.floor(limit),
      MAX_LIMIT
    );

  let days =
    Number(
      req.query &&
      req.query.days
    );

  if (
    !Number.isFinite(days) ||
    days <= 0
  ) {
    days =
      DEFAULT_DAYS;
  }

  days =
    Math.min(
      Math.floor(days),
      MAX_DAYS
    );

  const category =
    req.query &&
    req.query.category
      ? String(
          req.query.category
        ).toLowerCase()
      : "rostov";

  // ---------------------------------------------------------
  // MAIN
  // ---------------------------------------------------------

  try {

    if (
      category !== "rostov" &&
      category !== "all"
    ) {
      return res
        .status(200)
        .json({
          ok: true,

          category: category,

          count: 0,

          items: [],

          sources: [
            {
              id: SOURCE_ID,

              name:
                SOURCE_NAME,

              count: 0,

              message:
                "161.RU на данном этапе поддерживает только категорию rostov."
            }
          ]
        });
    }

    // Получаем список
    const candidates =
      await fetchArticleList();

    // Дата отсечения
    const now =
      new Date();

    const cutoff =
      new Date(
        now.getTime() -
        days *
          24 *
          60 *
          60 *
          1000
      );

    // Фильтр по дате
    const recentCandidates =
      candidates.filter(
        (article) => {

          if (!article.date) {
            return false;
          }

          const date =
            new Date(
              article.date +
              "T23:59:59Z"
            );

          return date >= cutoff;
        }
      );

    // Выбираем нужное количество
    const selected =
      recentCandidates.slice(
        0,
        limit
      );

    // Загружаем статьи
    const results =
      await processWithConcurrency(
        selected,
        fetchArticle,
        CONCURRENCY
      );

    // Только успешные
    const items =
      results
        .filter(
          (item) =>
            item &&
            item.ok === true
        )
        .map(
          (item) => {

            const copy = {
              ...item
            };

            delete copy.ok;

            return copy;
          }
        );

    // Сортировка
    items.sort(
      (a, b) => {

        const dateA =
          a.publishedAt || "";

        const dateB =
          b.publishedAt || "";

        return dateB.localeCompare(
          dateA
        );
      }
    );

    return res
      .status(200)
      .json({

        ok: true,

        category:
          category === "all"
            ? "all"
            : "rostov",

        count:
          items.length,

        items:
          items,

        sources: [

          {
            id:
              SOURCE_ID,

            name:
              SOURCE_NAME,

            count:
              items.length,

            candidates:
              candidates.length,

            recentCandidates:
              recentCandidates.length,

            failed:
              results.filter(
                (item) =>
                  item &&
                  item.ok === false
              ).length
          }

        ]

      });

  } catch (error) {

    return res
      .status(200)
      .json({

        ok: false,

        category:
          category,

        count: 0,

        items: [],

        errorName:
          error &&
          error.name
            ? error.name
            : "Error",

        error:
          error &&
          error.message
            ? error.message
            : String(error)

      });
  }
};
