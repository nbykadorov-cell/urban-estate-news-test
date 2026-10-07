module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  // ---------------------------------------------------------
  // Настройки
  // ---------------------------------------------------------

  const SOURCE_ID = "161ru";
  const SOURCE_NAME = "161.RU";
  const SOURCE_URL = "https://161.ru";
  const LIST_URL = "https://161.ru/text/realty/";

  const DEFAULT_LIMIT = 15;
  const MAX_LIMIT = 20;
  const DEFAULT_DAYS = 7;
  const MAX_DAYS = 30;

  // Сколько статей одновременно загружаем
  const CONCURRENCY = 3;

  // ---------------------------------------------------------
  // Вспомогательные функции
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

  function absoluteUrl(url) {
    if (!url) return "";

    url = decodeHtml(url.trim());

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

    // Убираем рекламные / партнерские query-параметры
    try {
      const parsed = new URL(url);

      return (
        parsed.origin +
        parsed.pathname
      );
    } catch (e) {
      return url.split("?")[0];
    }
  }

  function extractDateFromUrl(url) {
    if (!url) return null;

    const match = url.match(
      /\/text\/realty\/(\d{4})\/(\d{2})\/(\d{2})\//
    );

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return (
      String(year) +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  }

  function extractMeta(html, attribute, value) {
    if (!html) return "";

    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Вариант:
    // <meta property="og:image" content="...">
    let re = new RegExp(
      "<meta[^>]+" +
      attribute +
      '=["\\']' +
      escapedValue +
      '["\\'][^>]+content=["\\']([^"\\']+)["\\']',
      "i"
    );

    let match = html.match(re);

    if (match) {
      return decodeHtml(match[1]);
    }

    // Обратный порядок:
    // <meta content="..." property="og:image">
    re = new RegExp(
      "<meta[^>]+content=["\\']([^"\\']+)["\\'][^>]+" +
      attribute +
      '=["\\']' +
      escapedValue +
      '["\\']',
      "i"
    );

    match = html.match(re);

    if (match) {
      return decodeHtml(match[1]);
    }

    return "";
  }

  function extractTitle(html) {
    if (!html) return "";

    const match = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    if (!match) return "";

    let title = cleanText(match[1]);

    // У 161.RU title имеет примерно такой вид:
    //
    // Заголовок - 6 октября 2026 | 161.ру
    //
    // Убираем служебную часть.
    title = title
      .replace(/\s*-\s*\d{1,2}\s+\S+\s+\d{4}\s*\|\s*161\.ру\s*$/i, "")
      .trim();

    return title;
  }

  function extractDescription(html) {
    if (!html) return "";

    let value = extractMeta(
      html,
      "name",
      "description"
    );

    if (!value) {
      value = extractMeta(
        html,
        "property",
        "og:description"
      );
    }

    return cleanText(value);
  }

  function extractImage(html) {
    if (!html) return "";

    let value = extractMeta(
      html,
      "property",
      "og:image"
    );

    if (!value) {
      value = extractMeta(
        html,
        "name",
        "twitter:image"
      );
    }

    return absoluteUrl(value);
  }

  function extractCanonical(html) {
    if (!html) return "";

    const match = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

    if (match) {
      return absoluteUrl(match[1]);
    }

    // Обратный порядок атрибутов
    const reverseMatch = html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
    );

    if (reverseMatch) {
      return absoluteUrl(reverseMatch[1]);
    }

    return "";
  }

  // ---------------------------------------------------------
  // Получение списка статей
  // ---------------------------------------------------------

  async function fetchArticleList() {
    const response = await fetch(LIST_URL, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml"
      }
    });

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

    while ((match = linkRe.exec(html)) !== null) {
      let url = match[1];

      let title = cleanText(match[2]);

      url = normalizeArticleUrl(url);

      if (!url || !title) {
        continue;
      }

      // Нас интересуют только статьи раздела недвижимости
      if (
        !url.match(
          /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\//
        )
      ) {
        continue;
      }

      // Защита от повторов
      if (seen.has(url)) {
        continue;
      }

      // Слишком короткие ссылки не являются статьями
      if (title.length < 20) {
        continue;
      }

      seen.add(url);

      const date = extractDateFromUrl(url);

      articles.push({
        url: url,
        title: title,
        date: date
      });

      if (articles.length >= MAX_LIMIT) {
        break;
      }
    }

    return articles;
  }

  // ---------------------------------------------------------
  // Получение отдельной статьи
  // ---------------------------------------------------------

  async function fetchArticle(article) {
    try {
      const response = await fetch(article.url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml"
        }
      });

      const html = await response.text();

      if (!response.ok) {
        return {
          ...article,
          ok: false,
          error:
            "HTTP " + response.status
        };
      }

      const pageTitle = extractTitle(html);

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

        title:
          pageTitle ||
          article.title,

        description:
          description ||
          "",

        url: finalUrl,

        image:
          image ||
          "",

        date:
          article.date,

        publishedAt:
          article.date
            ? article.date + "T00:00:00Z"
            : null
      };

    } catch (error) {

      return {
        ...article,
        ok: false,
        error:
          error && error.message
            ? error.message
            : String(error)
      };
    }
  }

  // ---------------------------------------------------------
  // Параллельная обработка с ограничением
  // ---------------------------------------------------------

  async function processWithConcurrency(
    items,
    worker,
    concurrency
  ) {
    const results = new Array(items.length);

    let nextIndex = 0;

    async function runner() {
      while (true) {
        const index = nextIndex++;

        if (index >= items.length) {
          return;
        }

        results[index] =
          await worker(items[index]);
      }
    }

    const runners = [];

    const count = Math.min(
      concurrency,
      items.length
    );

    for (let i = 0; i < count; i++) {
      runners.push(runner());
    }

    await Promise.all(runners);

    return results;
  }

  // ---------------------------------------------------------
  // Параметры запроса
  // ---------------------------------------------------------

  let limit =
    Number(req.query && req.query.limit);

  if (!Number.isFinite(limit) || limit <= 0) {
    limit = DEFAULT_LIMIT;
  }

  limit = Math.min(
    Math.floor(limit),
    MAX_LIMIT
  );

  let days =
    Number(req.query && req.query.days);

  if (!Number.isFinite(days) || days <= 0) {
    days = DEFAULT_DAYS;
  }

  days = Math.min(
    Math.floor(days),
    MAX_DAYS
  );

  const category =
    req.query && req.query.category
      ? String(req.query.category)
          .toLowerCase()
      : "rostov";

  // ---------------------------------------------------------
  // Основной процесс
  // ---------------------------------------------------------

  try {

    // Пока поддерживаем только Ростов
    if (
      category !== "rostov" &&
      category !== "all"
    ) {
      return res.status(200).json({
        ok: true,
        category: category,
        count: 0,
        items: [],
        sources: [
          {
            id: SOURCE_ID,
            name: SOURCE_NAME,
            count: 0,
            message:
              "На данном этапе источник поддерживает только категорию rostov."
          }
        ]
      });
    }

    // 1. Получаем список статей
    const candidates =
      await fetchArticleList();

    // 2. Фильтруем по дате
    const now =
      new Date();

    const cutoff =
      new Date(
        now.getTime() -
        days * 24 * 60 * 60 * 1000
      );

    const recentCandidates =
      candidates.filter((article) => {

        if (!article.date) {
          return false;
        }

        const date =
          new Date(
            article.date + "T23:59:59Z"
          );

        return date >= cutoff;
      });

    // 3. Ограничиваем количество
    const selected =
      recentCandidates.slice(
        0,
        limit
      );

    // 4. Загружаем страницы статей
    const results =
      await processWithConcurrency(
        selected,
        fetchArticle,
        CONCURRENCY
      );

    // 5. Оставляем успешно обработанные
    const items =
      results
        .filter(
          (item) =>
            item &&
            item.ok === true
        )
        .map((item) => {

          const {
            ok,
            ...article
          } = item;

          return article;
        });

    // 6. Сортировка от новых к старым
    items.sort((a, b) => {

      const dateA =
        a.publishedAt || "";

      const dateB =
        b.publishedAt || "";

      return dateB.localeCompare(dateA);
    });

    // -------------------------------------------------------
    // Ответ
    // -------------------------------------------------------

    return res.status(200).json({

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
          id: SOURCE_ID,

          name: SOURCE_NAME,

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

    return res.status(200).json({

      ok: false,

      category:
        category,

      count: 0,

      items: [],

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
