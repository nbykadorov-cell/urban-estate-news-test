module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const SOURCE_CONFIG = {
    "161ru": {
      id: "161ru",
      name: "161.RU",
      category: "rostov",
      listUrl: "https://161.ru/text/realty/",
      articlePattern:
        /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/
    },

    "93ru": {
      id: "93ru",
      name: "93.RU",
      category: "krasnodar",
      listUrl: "https://93.ru/text/realty/",
      articlePattern:
        /^https:\/\/93\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/
    }
  };

  function cleanText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => {
        try {
          return String.fromCharCode(Number(n));
        } catch {
          return "";
        }
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  function absoluteUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return "";
    }
  }

  function normalizeUrl(url) {
    try {
      const parsed = new URL(url);

      parsed.search = "";
      parsed.hash = "";

      let result = parsed.href;

      if (!result.endsWith("/")) {
        result += "/";
      }

      return result;
    } catch {
      return "";
    }
  }

  function extractDateFromUrl(url) {
    const match = url.match(
      /\/(\d{4})\/(\d{2})\/(\d{2})\/\d+\/?$/
    );

    if (!match) {
      return "";
    }

    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function extractMetaByProperty(html, property) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(
        `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
        "i"
      )
    ];

    for (const re of patterns) {
      const match = html.match(re);

      if (match && match[1]) {
        return cleanText(match[1]);
      }
    }

    return "";
  }

  function extractMetaByName(html, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(
        `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`,
        "i"
      )
    ];

    for (const re of patterns) {
      const match = html.match(re);

      if (match && match[1]) {
        return cleanText(match[1]);
      }
    }

    return "";
  }

  function extractTitle(html) {
    return (
      extractMetaByProperty(html, "og:title") ||
      extractMetaByName(html, "twitter:title") ||
      (() => {
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match ? cleanText(match[1]) : "";
      })()
    );
  }

  function extractDescription(html) {
    return (
      extractMetaByProperty(html, "og:description") ||
      extractMetaByName(html, "description") ||
      extractMetaByName(html, "twitter:description")
    );
  }

  function extractImage(html) {
    return (
      extractMetaByProperty(html, "og:image") ||
      extractMetaByName(html, "twitter:image")
    );
  }

  function extractCanonical(html) {
    const patterns = [
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
    ];

    for (const re of patterns) {
      const match = html.match(re);

      if (match && match[1]) {
        return match[1];
      }
    }

    return "";
  }

  function getDateLimit(days) {
    const date = new Date();

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);

    return date;
  }

  function isRecent(dateString, days) {
    if (!dateString) {
      return false;
    }

    const articleDate = new Date(`${dateString}T00:00:00Z`);

    if (Number.isNaN(articleDate.getTime())) {
      return false;
    }

    return articleDate >= getDateLimit(days);
  }

  function getCategoryFromTitle(title, sourceCategory) {
    const text = String(title || "").toLowerCase();

    if (
      /ипотек|семейн.*ипотек|ставк.*ипотек|кредит|рефинанс|банк/.test(
        text
      )
    ) {
      return "mortgage";
    }

    if (
      /новострой|застройщик|девелопер|жк |жилой комплекс|строительств/.test(
        text
      )
    ) {
      return "newbuildings";
    }

    if (
      /закон|законодатель|госдум|минфин|правительств|изменени.*услови/.test(
        text
      )
    ) {
      return "laws";
    }

    return "realty";
  }

  async function fetchHtml(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await response.text();

    return {
      status: response.status,
      html
    };
  }

  async function fetchArticleList(source) {
    const result = await fetchHtml(source.listUrl);

    const html = result.html;

    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const articles = [];
    const seen = new Set();

    let match;

    while ((match = linkRe.exec(html)) !== null) {
      let url = absoluteUrl(match[1], source.listUrl);

      url = normalizeUrl(url);

      if (!url) {
        continue;
      }

      /*
       * Очень важно:
       * 93.RU и 161.RU имеют ссылки /comments/.
       * Регулярное выражение выше пропускает только
       * непосредственно страницу статьи.
       */
      if (!source.articlePattern.test(url)) {
        continue;
      }

      const title = cleanText(match[2]);

      if (!title) {
        continue;
      }

      if (seen.has(url)) {
        continue;
      }

      seen.add(url);

      const date = extractDateFromUrl(url);

      articles.push({
        url,
        title,
        date
      });

      if (articles.length >= 30) {
        break;
      }
    }

    return articles;
  }

  async function fetchArticle(source, candidate) {
    try {
      const result = await fetchHtml(candidate.url);

      if (result.status < 200 || result.status >= 400) {
        return null;
      }

      const html = result.html;

      const title =
        extractTitle(html) ||
        candidate.title;

      const description =
        extractDescription(html);

      const image =
        extractImage(html);

      const canonical =
        normalizeUrl(
          extractCanonical(html) || candidate.url
        ) || candidate.url;

      const date =
        extractDateFromUrl(canonical) ||
        candidate.date;

      return {
        source: source.name,
        sourceId: source.id,
        category:
          source.category === "rostov"
            ? "rostov"
            : "krasnodar",
        topicCategory: getCategoryFromTitle(
          title,
          source.category
        ),
        title,
        description,
        url: canonical,
        image,
        date,
        publishedAt: date
          ? `${date}T00:00:00Z`
          : null
      };
    } catch {
      return null;
    }
  }

  async function processSource(source, days, limit) {
    const diagnostics = {
      id: source.id,
      name: source.name,
      count: 0,
      candidates: 0,
      recentCandidates: 0,
      failed: 0
    };

    try {
      const candidates =
        await fetchArticleList(source);

      diagnostics.candidates =
        candidates.length;

      const recentCandidates =
        candidates.filter(item =>
          isRecent(item.date, days)
        );

      diagnostics.recentCandidates =
        recentCandidates.length;

      const selected =
        recentCandidates.slice(0, limit);

      const items = [];

      /*
       * Обрабатываем максимум 3 статьи одновременно.
       * Это снижает вероятность таймаута Vercel.
       */
      for (let i = 0; i < selected.length; i += 3) {
        const batch = selected.slice(i, i + 3);

        const results =
          await Promise.all(
            batch.map(item =>
              fetchArticle(source, item)
            )
          );

        for (const item of results) {
          if (item) {
            items.push(item);
          } else {
            diagnostics.failed++;
          }
        }
      }

      diagnostics.count = items.length;

      return {
        items,
        diagnostics
      };
    } catch (error) {
      diagnostics.failed++;

      return {
        items: [],
        diagnostics,
        error:
          error && error.message
            ? error.message
            : String(error)
      };
    }
  }

  try {
    const query = req.query || {};

    const requestedCategory =
      String(query.category || "all")
        .toLowerCase();

    let limit =
      parseInt(query.limit || "15", 10);

    let days =
      parseInt(query.days || "7", 10);

    if (!Number.isFinite(limit)) {
      limit = 15;
    }

    if (!Number.isFinite(days)) {
      days = 7;
    }

    limit = Math.max(
      1,
      Math.min(limit, 20)
    );

    days = Math.max(
      1,
      Math.min(days, 30)
    );

    const sources = [];

    if (
      requestedCategory === "all" ||
      requestedCategory === "rostov"
    ) {
      sources.push(
        SOURCE_CONFIG["161ru"]
      );
    }

    if (
      requestedCategory === "all" ||
      requestedCategory === "krasnodar"
    ) {
      sources.push(
        SOURCE_CONFIG["93ru"]
      );
    }

    /*
     * Если запрошена тематическая категория,
     * пока берём оба региональных источника.
     */
    if (
      [
        "mortgage",
        "realty",
        "newbuildings",
        "laws"
      ].includes(requestedCategory)
    ) {
      sources.push(
        SOURCE_CONFIG["161ru"],
        SOURCE_CONFIG["93ru"]
      );
    }

    /*
     * Убираем возможные дубликаты источников.
     */
    const uniqueSources = [
      ...new Map(
        sources.map(source => [
          source.id,
          source
        ])
      ).values()
    ];

    const allItems = [];
    const sourceDiagnostics = [];

    for (const source of uniqueSources) {
      const result =
        await processSource(
          source,
          days,
          limit
        );

      let items = result.items;

      /*
       * Региональная категория:
       * оставляем только соответствующий регион.
       */
      if (
        requestedCategory === "rostov" ||
        requestedCategory === "krasnodar"
      ) {
        items = items.filter(
          item =>
            item.category ===
            requestedCategory
        );
      }

      /*
       * Тематическая категория.
       */
      if (
        [
          "mortgage",
          "realty",
          "newbuildings",
          "laws"
        ].includes(requestedCategory)
      ) {
        items = items.filter(
          item =>
            item.topicCategory ===
            requestedCategory
        );
      }

      allItems.push(...items);

      sourceDiagnostics.push(
        result.diagnostics
      );
    }

    /*
     * Убираем дубликаты.
     */
    const seenUrls = new Set();

    const uniqueItems =
      allItems.filter(item => {
        if (!item.url) {
          return false;
        }

        if (seenUrls.has(item.url)) {
          return false;
        }

        seenUrls.add(item.url);

        return true;
      });

    /*
     * Сначала самые свежие.
     */
    uniqueItems.sort((a, b) => {
      const da =
        new Date(
          a.publishedAt ||
          a.date ||
          0
        ).getTime();

      const db =
        new Date(
          b.publishedAt ||
          b.date ||
          0
        ).getTime();

      return db - da;
    });

    const finalItems =
      uniqueItems.slice(
        0,
        limit
      );

    /*
     * Убираем внутреннее поле,
     * которое нужно только для фильтрации.
     */
    finalItems.forEach(item => {
      delete item.topicCategory;
    });

    res.status(200).json({
      ok: true,
      category: requestedCategory,
      count: finalItems.length,
      items: finalItems,
      sources: sourceDiagnostics
    });

  } catch (error) {
    res.status(200).json({
      ok: false,
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
