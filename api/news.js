module.exports = async (req, res) => {

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  /* ============================================================
   * SOURCE CONFIG
   * ============================================================ */

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
    },


    "domclick": {
      id: "domclick",
      name: "Домклик",
      category: "federal",
      listUrl: "https://blog.domclick.ru/novosti",
      type: "domclick"
    }

  };


  /* ============================================================
   * TEXT / URL HELPERS
   * ============================================================ */

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
          return String.fromCharCode(
            Number(n)
          );
        } catch {
          return "";
        }

      })

      .replace(/\s+/g, " ")
      .trim();
  }


  function absoluteUrl(url, baseUrl) {

    try {
      return new URL(
        url,
        baseUrl
      ).href;
    } catch {
      return "";
    }
  }


  function normalizeUrl(url) {

    try {

      const parsed =
        new URL(url);

      parsed.search = "";
      parsed.hash = "";

      return parsed.href;

    } catch {
      return "";
    }
  }


  /* ============================================================
   * DATE HELPERS
   * ============================================================ */

  function normalizeDate(value) {

    if (!value) {
      return "";
    }

    const raw =
      String(value)
        .trim();

    if (!raw) {
      return "";
    }


    /* ISO */

    const isoMatch =
      raw.match(
        /^(\d{4})-(\d{2})-(\d{2})/
      );

    if (isoMatch) {

      return (
        isoMatch[1] +
        "-" +
        isoMatch[2] +
        "-" +
        isoMatch[3]
      );
    }


    /* DD.MM.YYYY */

    const ruMatch =
      raw.match(
        /^(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/
      );

    if (ruMatch) {

      return (
        ruMatch[3] +
        "-" +
        ruMatch[2].padStart(2, "0") +
        "-" +
        ruMatch[1].padStart(2, "0")
      );
    }


    /* YYYY/MM/DD */

    const slashMatch =
      raw.match(
        /^(20\d{2})\/(\d{1,2})\/(\d{1,2})/
      );

    if (slashMatch) {

      return (
        slashMatch[1] +
        "-" +
        slashMatch[2].padStart(2, "0") +
        "-" +
        slashMatch[3].padStart(2, "0")
      );
    }


    const parsed =
      new Date(raw);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {

      return (
        parsed.getUTCFullYear() +
        "-" +
        String(
          parsed.getUTCMonth() + 1
        ).padStart(2, "0") +
        "-" +
        String(
          parsed.getUTCDate()
        ).padStart(2, "0")
      );
    }


    return "";
  }


  function extractDateFromUrl(url) {

    const match =
      String(url || "").match(
        /\/(\d{4})\/(\d{2})\/(\d{2})\//
      );

    if (!match) {
      return "";
    }

    return (
      match[1] +
      "-" +
      match[2] +
      "-" +
      match[3]
    );
  }


  function extractDateFromText(text) {

    const match =
      String(text || "").match(
        /(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/
      );

    if (!match) {
      return "";
    }

    return (
      match[3] +
      "-" +
      match[2].padStart(2, "0") +
      "-" +
      match[1].padStart(2, "0")
    );
  }


  function extractPublishedAtFromText(text) {

    const value =
      String(text || "")
        .trim();

    if (!value) {
      return "";
    }

    const parsed =
      new Date(value);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {

      return parsed.toISOString();
    }

    return "";
  }


  function getDateLimit(days) {

    const date =
      new Date();

    date.setHours(
      0,
      0,
      0,
      0
    );

    date.setDate(
      date.getDate() - days
    );

    return date;
  }


  function isRecent(
    dateString,
    days
  ) {

    if (!dateString) {
      return false;
    }

    const date =
      new Date(
        dateString +
        "T00:00:00Z"
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return false;
    }

    return (
      date >=
      getDateLimit(days)
    );
  }


  /* ============================================================
   * META HELPERS
   * ============================================================ */

  function extractMetaByProperty(
    html,
    property
  ) {

    const escaped =
      property.replace(
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


    for (
      const re of patterns
    ) {

      const match =
        html.match(re);

      if (
        match &&
        match[1]
      ) {

        return cleanText(
          match[1]
        );
      }
    }

    return "";
  }


  function extractMetaByName(
    html,
    name
  ) {

    const escaped =
      name.replace(
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


    for (
      const re of patterns
    ) {

      const match =
        html.match(re);

      if (
        match &&
        match[1]
      ) {

        return cleanText(
          match[1]
        );
      }
    }

    return "";
  }


  function extractTitle(html) {

    return (

      extractMetaByProperty(
        html,
        "og:title"
      )

      ||

      extractMetaByName(
        html,
        "twitter:title"
      )

      ||

      (() => {

        const match =
          html.match(
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
      )

      ||

      extractMetaByName(
        html,
        "description"
      )

      ||

      extractMetaByName(
        html,
        "twitter:description"
      )

    );
  }


  function extractImage(
    html,
    baseUrl
  ) {

    const image =

      extractMetaByProperty(
        html,
        "og:image"
      )

      ||

      extractMetaByName(
        html,
        "twitter:image"
      );


    return image
      ? absoluteUrl(
          image,
          baseUrl
        )
      : "";
  }


  function extractCanonical(html) {

    const patterns = [

      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,

      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i

    ];


    for (
      const re of patterns
    ) {

      const match =
        html.match(re);

      if (
        match &&
        match[1]
      ) {

        return match[1];
      }
    }

    return "";
  }


  /* ============================================================
   * JSON-LD DATE
   * ============================================================ */

  function extractJsonLdDates(
    html
  ) {

    const dates = [];

    const scriptRe =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match;


    while (
      (match =
        scriptRe.exec(html)) !== null
    ) {

      const raw =
        match[1]
          .trim();

      if (!raw) {
        continue;
      }


      try {

        const data =
          JSON.parse(raw);


        function scan(value) {

          if (!value) {
            return;
          }


          if (
            Array.isArray(value)
          ) {

            value.forEach(
              scan
            );

            return;
          }


          if (
            typeof value !==
            "object"
          ) {
            return;
          }


          const possibleKeys = [

            "datePublished",
            "dateCreated",
            "uploadDate"

          ];


          for (
            const key of possibleKeys
          ) {

            if (
              value[key]
            ) {

              dates.push(
                String(
                  value[key]
                )
              );
            }
          }


          Object.keys(
            value
          ).forEach(
            key => {

              if (
                key !==
                  "datePublished" &&
                key !==
                  "dateCreated" &&
                key !==
                  "uploadDate"
              ) {

                const child =
                  value[key];

                if (
                  typeof child ===
                    "object" &&
                  child !== null
                ) {

                  scan(child);
                }
              }

            }
          );

        }


        scan(data);

      } catch {

        /*
         * Некоторые сайты помещают
         * JSON-LD с небольшими ошибками.
         * Тогда просто переходим дальше.
         */

      }
    }


    return dates;
  }


  function extractPublishedDate(
    html,
    candidateDate
  ) {

    /* 1. JSON-LD */

    const jsonLdDates =
      extractJsonLdDates(
        html
      );


    for (
      const value of jsonLdDates
    ) {

      const date =
        normalizeDate(
          value
        );

      if (date) {

        const publishedAt =
          extractPublishedAtFromText(
            value
          );

        return {
          date,
          publishedAt
        };
      }
    }


    /* 2. OpenGraph */

    const ogDate =
      extractMetaByProperty(
        html,
        "article:published_time"
      );


    if (ogDate) {

      const date =
        normalizeDate(
          ogDate
        );

      if (date) {

        return {
          date,
          publishedAt:
            extractPublishedAtFromText(
              ogDate
            )
        };
      }
    }


    /* 3. Meta date */

    const metaNames = [

      "datePublished",
      "datepublished",
      "publishdate",
      "pubdate",
      "date"

    ];


    for (
      const name of metaNames
    ) {

      const value =
        extractMetaByName(
          html,
          name
        );


      if (value) {

        const date =
          normalizeDate(
            value
          );

        if (date) {

          return {
            date,
            publishedAt:
              extractPublishedAtFromText(
                value
              )
          };
        }
      }
    }


    /* 4. URL */

    const urlDate =
      extractDateFromUrl(
        candidateDate
          ? candidateDate.url || ""
          : ""
      );


    if (urlDate) {

      return {
        date: urlDate,
        publishedAt: ""
      };
    }


    /* 5. Visible text */

    const textDate =
      extractDateFromText(
        html
      );


    if (textDate) {

      return {
        date: textDate,
        publishedAt: ""
      };
    }


    return {
      date: "",
      publishedAt: ""
    };
  }


  /* ============================================================
   * TOPIC CATEGORY
   * ============================================================ */

  function getTopicCategory(
    title
  ) {

    const text =
      String(title || "")
        .toLowerCase();


    if (
      /ипотек|ипотеч|семейн.*ипотек|ставк.*кредит|кредит|рефинанс|банк|банки/
        .test(text)
    ) {

      return "mortgage";
    }


    if (
      /новострой|новостроек|застройщик|застройщики|девелопер|жк |жилой комплекс|строительств|домов|дольщик|долев/
        .test(text)
    ) {

      return "newbuildings";
    }


    if (
      /закон|законодатель|росреестр|госдум|минфин|правительств|налог|штраф|правил|изменен|регулирован/
        .test(text)
    ) {

      return "laws";
    }


    return "realty";
  }


  /* ============================================================
   * FETCH
   * ============================================================ */

  async function fetchHtml(
    url
  ) {

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36",

            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "ru-RU,ru;q=0.9,en;q=0.8",

            "Cache-Control":
              "no-cache"

          }
        }
      );


    const html =
      await response.text();


    return {
      status:
        response.status,

      html
    };
  }


  /* ============================================================
   * 161.RU / 93.RU
   * ============================================================ */

  async function fetchN1List(
    source
  ) {

    const result =
      await fetchHtml(
        source.listUrl
      );


    const html =
      result.html;


    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;


    const articles = [];
    const seen =
      new Set();


    let match;


    while (
      (match =
        linkRe.exec(html)) !== null
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      url =
        normalizeUrl(
          url
        );


      if (!url) {
        continue;
      }


      if (
        !source.articlePattern.test(
          url
        )
      ) {
        continue;
      }


      const title =
        cleanText(
          match[2]
        );


      if (!title) {
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
          extractDateFromUrl(
            url
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


  /* ============================================================
   * КРАСДОМ
   * ============================================================ */

  async function fetchKrasdomList(
    source
  ) {

    const result =
      await fetchHtml(
        source.listUrl
      );


    const html =
      result.html;


    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;


    const articles = [];
    const seen =
      new Set();


    let match;


    while (
      (match =
        linkRe.exec(html)) !== null
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      url =
        normalizeUrl(
          url
        );


      if (!url) {
        continue;
      }


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


      if (
        /\/news\/(page|category|tag|author|search)/i.test(
          url
        )
      ) {
        continue;
      }


      const title =
        cleanText(
          match[2]
        );


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


      /*
       * Берём больше кандидатов,
       * потому что дату КРАСДОМ
       * определяем уже со страницы
       * самой статьи.
       */

      if (
        articles.length >= 25
      ) {
        break;
      }
    }


    return articles;
  }


  /* ============================================================
   * ДОМКЛИК
   * ============================================================ */

  async function fetchDomclickList(
    source
  ) {

    const result =
      await fetchHtml(
        source.listUrl
      );


    const html =
      result.html;


    const linkRe =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;


    const articles = [];
    const seen =
      new Set();


    let match;


    while (
      (match =
        linkRe.exec(html)) !== null
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      url =
        normalizeUrl(
          url
        );


      if (!url) {
        continue;
      }


      /*
       * Берём только публикации
       * из раздела /novosti/.
       */

      if (
        !/^https:\/\/blog\.domclick\.ru\/novosti\/.+/i.test(
          url
        )
      ) {
        continue;
      }


      /*
       * Исключаем служебные разделы.
       */

      if (
        /\/novosti\/(tag|category|page|author|search|feed)(\/|$)/i.test(
          url
        )
      ) {
        continue;
      }


      const title =
        cleanText(
          match[2]
        );


      if (
        title.length < 10
      ) {
        continue;
      }


      if (
        /читать|подробнее|все новости|показать/i.test(
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
          extractDateFromUrl(
            url
          )

      });


      if (
        articles.length >= 25
      ) {
        break;
      }
    }


    return articles;
  }


  /* ============================================================
   * ARTICLE
   * ============================================================ */

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
        extractTitle(
          html
        ) ||
        candidate.title;


      const description =
        extractDescription(
          html
        );


      const image =
        extractImage(
          html,
          candidate.url
        );


      const canonical =
        normalizeUrl(
          absoluteUrl(
            extractCanonical(
              html
            ),
            candidate.url
          ) ||
          candidate.url
        ) ||
        candidate.url;


      const published =
        extractPublishedDate(
          html,
          {
            ...candidate,
            url: canonical
          }
        );


      let finalDate =
        published.date ||
        candidate.date ||
        extractDateFromUrl(
          canonical
        );


      let publishedAt =
        published.publishedAt;


      if (
        !publishedAt &&
        finalDate
      ) {

        publishedAt =
          `${finalDate}T00:00:00Z`;
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
          publishedAt || null

      };

    } catch {

      return null;
    }
  }


  /* ============================================================
   * PROCESS SOURCE
   * ============================================================ */

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


      /* LIST */

      if (
        source.type ===
        "krasdom"
      ) {

        candidates =
          await fetchKrasdomList(
            source
          );

      } else if (
        source.type ===
        "domclick"
      ) {

        candidates =
          await fetchDomclickList(
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


      /* ========================================================
       * Для 161.RU / 93.RU дата известна сразу.
       * ======================================================== */

      let selected;


      if (
        source.type ===
          "n1"
      ) {

        const recentCandidates =
          candidates.filter(
            item =>
              item.date &&
              isRecent(
                item.date,
                days
              )
          );


        diagnostics.recentCandidates =
          recentCandidates.length;


        selected =
          recentCandidates.slice(
            0,
            limit
          );

      }


      /* ========================================================
       * КРАСДОМ / ДОМКЛИК
       *
       * Дата определяется на странице
       * каждой статьи.
       * ======================================================== */

      else {

        selected =
          candidates.slice(
            0,
            Math.max(
              limit * 2,
              15
            )
          );

      }


      const items = [];


      /*
       * Загружаем статьи пачками.
       */

      for (
        let i = 0;
        i < selected.length;
        i += 4
      ) {

        const batch =
          selected.slice(
            i,
            i + 4
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

          if (!item) {

            diagnostics.failed++;

            continue;
          }


          /*
           * Для КРАСДОМ и Домклика
           * проверяем свежесть только
           * после получения даты статьи.
           */

          if (
            source.type ===
              "krasdom" ||
            source.type ===
              "domclick"
          ) {

            if (
              !item.date ||
              !isRecent(
                item.date,
                days
              )
            ) {

              continue;
            }
          }


          items.push(
            item
          );


          if (
            items.length >=
            limit
          ) {

            break;
          }

        }


        if (
          items.length >=
          limit
        ) {

          break;
        }

      }


      diagnostics.recentCandidates =
        items.length;


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


  /* ============================================================
   * MAIN
   * ============================================================ */

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


    /* ==========================================================
     * ALL
     * ========================================================== */

    if (
      requestedCategory ===
      "all"
    ) {

      sources.push(

        SOURCE_CONFIG[
          "161ru"
        ],

        SOURCE_CONFIG[
          "93ru"
        ],

        SOURCE_CONFIG[
          "krasdom"
        ],

        SOURCE_CONFIG[
          "domclick"
        ]

      );

    }


    /* ==========================================================
     * ROSTOV
     * ========================================================== */

    if (
      requestedCategory ===
      "rostov"
    ) {

      sources.push(
        SOURCE_CONFIG[
          "161ru"
        ]
      );

    }


    /* ==========================================================
     * KRASNODAR
     * ========================================================== */

    if (
      requestedCategory ===
      "krasnodar"
    ) {

      sources.push(

        SOURCE_CONFIG[
          "93ru"
        ],

        SOURCE_CONFIG[
          "krasdom"
        ]

      );

    }


    /* ==========================================================
     * THEMATIC
     * ========================================================== */

    const thematicCategories = [

      "mortgage",
      "realty",
      "newbuildings",
      "laws"

    ];


    if (
      thematicCategories.includes(
        requestedCategory
      )
    ) {

      sources.push(

        SOURCE_CONFIG[
          "161ru"
        ],

        SOURCE_CONFIG[
          "93ru"
        ],

        SOURCE_CONFIG[
          "krasdom"
        ],

        SOURCE_CONFIG[
          "domclick"
        ]

      );

    }


    /* ==========================================================
     * UNIQUE SOURCES
     * ========================================================== */

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


    /* ==========================================================
     * PROCESS
     * ========================================================== */

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


      /* REGION */

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


      /* TOPIC */

      if (
        thematicCategories.includes(
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


    /* ==========================================================
     * DEDUPLICATION
     * ========================================================== */

    const seenUrls =
      new Set();


    const uniqueItems =
      allItems.filter(
        item => {

          if (
            !item.url
          ) {

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


    /* ==========================================================
     * SORT
     * ========================================================== */

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


    /* ==========================================================
     * FINAL
     * ========================================================== */

    const finalItems =
      uniqueItems.slice(
        0,
        limit
      );


    /*
     * topicCategory нужен только
     * внутри backend.
     */

    finalItems.forEach(
      item => {

        delete item.topicCategory;

      }
    );


    /* ==========================================================
     * RESPONSE
     * ========================================================== */

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
