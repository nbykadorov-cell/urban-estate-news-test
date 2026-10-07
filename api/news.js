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
      type: "n1",
      articlePattern:
        /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/
    },

    "93ru": {
      id: "93ru",
      name: "93.RU",
      category: "krasnodar",
      listUrl: "https://93.ru/text/realty/",
      type: "n1",
      articlePattern:
        /^https:\/\/93\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/
    },

    "krasdom": {
      id: "krasdom",
      name: "КРАСДОМ",
      category: "krasnodar",
      listUrl: "https://krasdom.ru/news/",
      type: "krasdom"
    }
  };

  function cleanText(value) {
    return String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

      return parsed.href;
    } catch {
      return "";
    }
  }

  function extractDateFromUrl(url) {
    const match = url.match(
      /\/(\d{4})\/(\d{2})\/(\d{2})\//
    );

    if (!match) {
      return "";
    }

    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function extractDateFromText(text) {
    const match = String(text || "").match(
      /(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})/
    );

    if (!match) {
      return "";
    }

    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3];

    return `${year}-${month}-${day}`;
  }

  function extractMetaByProperty(html, property) {
    const escaped = property.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

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
    const escaped = name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

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
        const match = html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

        return match
          ? cleanText(match[1])
          : "";
      })()
    );
  }

  function extractDescription(html) {
    return (
      extractMetaByProperty(
        html,
        "og:description"
      ) ||
      extractMetaByName(
        html,
        "description"
      ) ||
      extractMetaByName(
        html,
        "twitter:description"
      )
    );
  }

  function extractImage(html) {
    return (
      extractMetaByProperty(
        html,
        "og:image"
      ) ||
      extractMetaByName(
        html,
        "twitter:image"
      )
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
    date.setDate(
      date.getDate() - days
    );

    return date;
  }

  function isRecent(dateString, days) {
    if (!dateString) {
      return false;
    }

    const date = new Date(
      `${dateString}T00:00:00Z`
    );

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    return date >= getDateLimit(days);
  }

  function getTopicCategory(title) {
    const text =
      String(title || "")
        .toLowerCase();

    if (
      /ипотек|ипотеч|семейн.*ипотек|ставк.*кредит|кредит|рефинанс|банк|банки/.test(
        text
      )
    ) {
      return "mortgage";
    }

    if (
      /новострой|новостроек|застройщик|застройщики|девелопер|жк |жилой комплекс|строительств|домов|дольщик|долев/.test(
        text
      )
    ) {
      return "newbuildings";
    }

    if (
      /закон|законодатель|росреестр|госдум|минфин|правительств|налог|штраф|правил|изменен|регулирован/.test(
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
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "ru-RU,ru;q=0.9,en;q=0.8"
      }
    });

    const html =
      await response.text();

    return {
      status: response.status,
      html
    };
  }

  /*
   * ============================================================
   * 161.RU / 93.RU
   * ============================================================
   */

  async function fetchN1List(source) {
    const result =
      await fetchHtml(
        source.listUrl
      );

    const html =
      result.html;

    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const articles = [];
    const seen = new Set();

    let match;

    while (
      (match = linkRe.exec(html)) !== null
    ) {
      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );

      url =
        normalizeUrl(url);

      if (!url) {
        continue;
      }

      if (
        !source.articlePattern.test(url)
      ) {
        continue;
      }

      const title =
        cleanText(match[2]);

      if (!title) {
        continue;
      }

      if (seen.has(url)) {
        continue;
      }

      seen.add(url);

      articles.push({
        url,
        title,
        date:
          extractDateFromUrl(url)
      });

      if (
        articles.length >= 30
      ) {
        break;
      }
    }

    return articles;
  }

  /*
   * ============================================================
   * КРАСДОМ
   * ============================================================
   */

  async function fetchKrasdomList(source) {
    const result =
      await fetchHtml(
        source.listUrl
      );

    const html =
      result.html;

    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const articles = [];
    const seen = new Set();

    let match;

    while (
      (match = linkRe.exec(html)) !== null
    ) {
      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );

      url =
        normalizeUrl(url);

      if (!url) {
        continue;
      }

      /*
       * КРАСДОМ использует /news/
       * для отдельных публикаций.
       *
       * Исключаем:
       * /news/
       * внешние ссылки
       * служебные страницы
       */
      if (
        !/^https:\/\/krasdom\.ru\/news\/.+/i.test(
          url
        )
      ) {
        continue;
      }

      if (
        url ===
        "https://krasdom.ru/news/"
      ) {
        continue;
      }

      /*
       * Не берём ссылки навигации.
       */
      if (
        /\/news\/(page|category|tag|author|search)/i.test(
          url
        )
      ) {
        continue;
      }

      const title =
        cleanText(match[2]);

      if (
        title.length < 10
      ) {
        continue;
      }

      if (
        /показать ещё|читать далее|подробнее|все новости/i.test(
          title
        )
      ) {
        continue;
      }

      if (
        seen.has(url)
      ) {
        continue;
      }

      seen.add(url);

      articles.push({
        url,
        title,
        date:
          extractDateFromText(
            match[2]
          )
      });

      if (
        articles.length >= 30
      ) {
        break;
      }
    }

    return articles;
  }

  async function fetchArticle(
    source,
    candidate
  ) {
    try {
      const result =
        await fetchHtml(
          candidate.url
        );

      if (
        result.status < 200 ||
        result.status >= 400
      ) {
        return null;
      }

      const html =
        result.html;

      const title =
        extractTitle(html) ||
        candidate.title;

      const description =
        extractDescription(html);

      const image =
        extractImage(html);

      const canonical =
        normalizeUrl(
          extractCanonical(html) ||
          candidate.url
        ) ||
        candidate.url;

      const date =
        extractDateFromUrl(
          canonical
        ) ||
        candidate.date;

      /*
       * Для КРАСДОМ дополнительно
       * пробуем найти дату в самой странице.
       */
      let finalDate =
        date;

      if (!finalDate) {
        finalDate =
          extractDateFromText(
            html
          );
      }

      return {
        source:
          source.name,

        sourceId:
          source.id,

        category:
          source.category,

        topicCategory:
          getTopicCategory(
            title
          ),

        title,

        description,

        url:
          canonical,

        image,

        date:
          finalDate,

        publishedAt:
          finalDate
            ? `${finalDate}T00:00:00Z`
            : null
      };

    } catch {
      return null;
    }
  }

  async function processSource(
    source,
    days,
    limit
  ) {
    const diagnostics = {
      id:
        source.id,

      name:
        source.name,

      count: 0,

      candidates: 0,

      recentCandidates: 0,

      failed: 0
    };

    try {
      let candidates;

      if (
        source.type ===
        "krasdom"
      ) {
        candidates =
          await fetchKrasdomList(
            source
          );
      } else {
        candidates =
          await fetchN1List(
            source
          );
      }

      diagnostics.candidates =
        candidates.length;

      /*
       * Для источников с датой
       * сразу отбрасываем старые.
       *
       * Если дата не определилась,
       * оставляем кандидат — дата
       * может быть внутри статьи.
       */
      const recentCandidates =
        candidates.filter(
          item =>
            !item.date ||
            isRecent(
              item.date,
              days
            )
        );

      diagnostics.recentCandidates =
        recentCandidates.length;

      const selected =
        recentCandidates.slice(
          0,
          Math.max(
            limit,
            10
          )
        );

      const items = [];

      /*
       * По 3 статьи одновременно.
       */
      for (
        let i = 0;
        i < selected.length;
        i += 3
      ) {
        const batch =
          selected.slice(
            i,
            i + 3
          );

        const results =
          await Promise.all(
            batch.map(
              item =>
                fetchArticle(
                  source,
                  item
                )
            )
          );

        for (
          const item of results
        ) {
          if (item) {
            items.push(item);
          } else {
            diagnostics.failed++;
          }
        }

        /*
         * Нам не нужно загружать
         * десятки страниц, если уже
         * набрали достаточно свежих.
         */
        if (
          items.length >=
          limit
        ) {
          break;
        }
      }

      diagnostics.count =
        items.length;

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
          error &&
          error.message
            ? error.message
            : String(error)
      };
    }
  }

  try {
    const query =
      req.query || {};

    const requestedCategory =
      String(
        query.category ||
          "all"
      ).toLowerCase();

    let limit =
      parseInt(
        query.limit || "15",
        10
      );

    let days =
      parseInt(
        query.days || "7",
        10
      );

    if (
      !Number.isFinite(limit)
    ) {
      limit = 15;
    }

    if (
      !Number.isFinite(days)
    ) {
      days = 7;
    }

    limit =
      Math.max(
        1,
        Math.min(
          limit,
          20
        )
      );

    days =
      Math.max(
        1,
        Math.min(
          days,
          30
        )
      );

    const sources = [];

    /*
     * Ростов
     */
    if (
      requestedCategory ===
        "all" ||
      requestedCategory ===
        "rostov"
    ) {
      sources.push(
        SOURCE_CONFIG["161ru"]
      );
    }

    /*
     * Краснодар
     */
    if (
      requestedCategory ===
        "all" ||
      requestedCategory ===
        "krasnodar"
    ) {
      sources.push(
        SOURCE_CONFIG["93ru"],

        SOURCE_CONFIG[
          "krasdom"
        ]
      );
    }

    /*
     * Тематические категории.
     */
    if (
      [
        "mortgage",
        "realty",
        "newbuildings",
        "laws"
      ].includes(
        requestedCategory
      )
    ) {
      sources.push(
        SOURCE_CONFIG["161ru"],
        SOURCE_CONFIG["93ru"],
        SOURCE_CONFIG[
          "krasdom"
        ]
      );
    }

    /*
     * Убираем дубликаты.
     */
    const uniqueSources =
      [
        ...new Map(
          sources.map(
            source => [
              source.id,
              source
            ]
          )
        ).values()
      ];

    const allItems = [];
    const sourceDiagnostics = [];

    for (
      const source of uniqueSources
    ) {
      const result =
        await processSource(
          source,
          days,
          limit
        );

      let items =
        result.items;

      /*
       * Регион.
       */
      if (
        requestedCategory ===
          "rostov" ||
        requestedCategory ===
          "krasnodar"
      ) {
        items =
          items.filter(
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
        ].includes(
          requestedCategory
        )
      ) {
        items =
          items.filter(
            item =>
              item.topicCategory ===
              requestedCategory
          );
      }

      allItems.push(
        ...items
      );

      sourceDiagnostics.push(
        result.diagnostics
      );
    }

    /*
     * Удаляем дубли.
     */
    const seenUrls =
      new Set();

    const uniqueItems =
      allItems.filter(
        item => {
          if (!item.url) {
            return false;
          }

          if (
            seenUrls.has(
              item.url
            )
          ) {
            return false;
          }

          seenUrls.add(
            item.url
          );

          return true;
        }
      );

    /*
     * Новые сверху.
     */
    uniqueItems.sort(
      (a, b) => {
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
      }
    );

    const finalItems =
      uniqueItems.slice(
        0,
        limit
      );

    /*
     * Внутреннее поле больше
     * не нужно Tilda.
     */
    finalItems.forEach(
      item => {
        delete item.topicCategory;
      }
    );

    res.status(200).json({
      ok: true,

      category:
        requestedCategory,

      count:
        finalItems.length,

      items:
        finalItems,

      sources:
        sourceDiagnostics
    });

  } catch (error) {
    res.status(200).json({
      ok: false,

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
