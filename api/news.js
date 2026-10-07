// api/news.js

export default async function handler(req, res) {

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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  /* =========================================================
     SOURCE CONFIG
  ========================================================= */

  const SOURCE_CONFIG = {

    "161ru": {
      id: "161ru",
      name: "161.RU",
      category: "rostov",
      listUrl: "https://161.ru/text/realty/",
      type: "n1"
    },

    "93ru": {
      id: "93ru",
      name: "93.RU",
      category: "krasnodar",
      listUrl: "https://93.ru/text/realty/",
      type: "n1"
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
    },

    "domrf": {
      id: "domrf",
      name: "ДОМ.РФ",
      category: "federal",
      listUrl: "https://спроси.дом.рф/news/",
      type: "domrf"
    }

  };


  /* =========================================================
     TEXT / URL
  ========================================================= */

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
      .replace(/\s+/g, " ")
      .trim();

  }


  function absoluteUrl(url, baseUrl) {

    try {

      if (!url) return "";

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

      const u = new URL(url);

      u.hash = "";

      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "yclid",
        "from",
        "ref",
        "erid"
      ].forEach(param => {
        u.searchParams.delete(param);
      });

      return u.href.replace(/\/+$/, "");

    } catch {

      return "";

    }

  }


  /* =========================================================
     DATE
  ========================================================= */

  function normalizeDate(raw) {

    if (!raw) return "";

    const value = String(raw)
      .trim()
      .replace(/\u00a0/g, " ");

    if (!value) return "";


    let match = value.match(
      /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
    );

    if (match) {

      return [
        match[1],
        String(match[2]).padStart(2, "0"),
        String(match[3]).padStart(2, "0")
      ].join("-");

    }


    match = value.match(
      /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/
    );

    if (match) {

      return [
        match[3],
        String(match[2]).padStart(2, "0"),
        String(match[1]).padStart(2, "0")
      ].join("-");

    }


    const months = {

      января: 1,
      февраля: 2,
      марта: 3,
      апреля: 4,
      мая: 5,
      июня: 6,
      июля: 7,
      августа: 8,
      сентября: 9,
      октября: 10,
      ноября: 11,
      декабря: 12

    };


    match = value.match(
      /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})\b/i
    );

    if (match) {

      const month =
        months[
          match[2].toLowerCase()
        ];

      if (month) {

        return [
          match[3],
          String(month).padStart(2, "0"),
          String(match[1]).padStart(2, "0")
        ].join("-");

      }

    }


    const parsed =
      new Date(value);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {

      const year =
        parsed.getFullYear();

      if (
        year >= 2000 &&
        year <= 2100
      ) {

        return [
          year,
          String(
            parsed.getMonth() + 1
          ).padStart(2, "0"),
          String(
            parsed.getDate()
          ).padStart(2, "0")
        ].join("-");

      }

    }


    return "";

  }


  function extractDateFromUrl(url) {

    if (!url) return "";

    const match =
      String(url).match(
        /\/(20\d{2})\/(\d{2})\/(\d{2})\//
      );

    if (!match) return "";

    return `${match[1]}-${match[2]}-${match[3]}`;

  }


  function extractDateFromText(text) {

    if (!text) return "";

    const clean =
      cleanText(text);

    const patterns = [

      /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/,

      /\b\d{1,2}[.\/-]\d{1,2}[.\/-]20\d{2}\b/,

      /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+20\d{2}\b/i

    ];


    for (
      const pattern of patterns
    ) {

      const match =
        clean.match(pattern);

      if (!match) continue;

      const date =
        normalizeDate(
          match[0]
        );

      if (date) return date;

    }


    return "";

  }


  function extractPublishedAtFromText(text) {

    if (!text) return "";

    const clean =
      cleanText(text);

    const match =
      clean.match(
        /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
      );

    if (!match) return "";

    const dt =
      new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6] || 0)
        )
      );

    if (
      Number.isNaN(
        dt.getTime()
      )
    ) {
      return "";
    }

    return dt.toISOString();

  }


  /* =========================================================
     META
  ========================================================= */

  function extractMeta(html, key) {

    if (!html) return "";

    const escaped =
      key.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );


    let regex =
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );

    let match =
      html.match(regex);

    if (match) {
      return cleanText(
        match[1]
      );
    }


    regex =
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
        "i"
      );

    match =
      html.match(regex);

    return match
      ? cleanText(match[1])
      : "";

  }


  /* =========================================================
     JSON-LD DATE
  ========================================================= */

  function extractJsonLdDates(html) {

    const result = [];

    if (!html) return result;


    const regex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match;


    while (
      (match = regex.exec(html))
    ) {

      let raw =
        match[1]
          .replace(/<!--/g, "")
          .replace(/-->/g, "")
          .trim();


      if (!raw) continue;


      try {

        const data =
          JSON.parse(raw);

        const objects =
          Array.isArray(data)
            ? data
            : [data];


        for (
          const obj of objects
        ) {

          if (
            !obj ||
            typeof obj !== "object"
          ) {
            continue;
          }


          if (
            obj.datePublished
          ) {
            result.push(
              obj.datePublished
            );
          }


          if (
            obj.dateCreated
          ) {
            result.push(
              obj.dateCreated
            );
          }


          if (
            obj.uploadDate
          ) {
            result.push(
              obj.uploadDate
            );
          }


          if (
            Array.isArray(
              obj["@graph"]
            )
          ) {

            for (
              const item
              of obj["@graph"]
            ) {

              if (
                !item ||
                typeof item !== "object"
              ) {
                continue;
              }


              if (
                item.datePublished
              ) {
                result.push(
                  item.datePublished
                );
              }


              if (
                item.dateCreated
              ) {
                result.push(
                  item.dateCreated
                );
              }


              if (
                item.uploadDate
              ) {
                result.push(
                  item.uploadDate
                );
              }

            }

          }

        }

      } catch {

      }

    }


    return result;

  }


  function extractPublishedDate(
    html,
    candidate = {}
  ) {

    const jsonDates =
      extractJsonLdDates(html);


    for (
      const raw
      of jsonDates
    ) {

      const date =
        normalizeDate(raw);

      if (date) return date;

    }


    const ogDate =
      extractMeta(
        html,
        "article:published_time"
      );


    if (ogDate) {

      const date =
        normalizeDate(
          ogDate
        );

      if (date) return date;

    }


    const names = [

      "datePublished",
      "datepublished",
      "publishdate",
      "pubdate",
      "date"

    ];


    for (
      const name
      of names
    ) {

      const value =
        extractMeta(
          html,
          name
        );

      if (!value) continue;

      const date =
        normalizeDate(value);

      if (date) return date;

    }


    const urlDate =
      extractDateFromUrl(
        candidate.url || ""
      );


    if (urlDate) {
      return urlDate;
    }


    if (
      candidate &&
      candidate.date
    ) {

      const date =
        normalizeDate(
          candidate.date
        );

      if (date) return date;

    }


    return extractDateFromText(
      html
    );

  }


  function isRecent(
    date,
    days
  ) {

    if (!date) return false;

    const parsed =
      new Date(
        `${date}T23:59:59`
      );

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return false;
    }


    const now =
      new Date();


    const limit =
      new Date(
        now.getTime() -
        Number(days) *
        24 *
        60 *
        60 *
        1000
      );


    return parsed >= limit;

  }


  /* =========================================================
     ARTICLE DATA
  ========================================================= */

  function extractTitle(html) {

    if (!html) return "";


    let value =
      extractMeta(
        html,
        "og:title"
      );


    if (value) return value;


    let match =
      html.match(
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
      );


    if (match) {

      value =
        cleanText(
          match[1]
        );

      if (value) return value;

    }


    match =
      html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );


    return match
      ? cleanText(match[1])
      : "";

  }


  function extractDescription(html) {

    if (!html) return "";


    let value =
      extractMeta(
        html,
        "og:description"
      );


    if (value) return value;


    value =
      extractMeta(
        html,
        "description"
      );


    if (value) return value;


    const match =
      html.match(
        /<p[^>]*>([\s\S]*?)<\/p>/i
      );


    if (match) {

      value =
        cleanText(
          match[1]
        );

      if (
        value.length > 30
      ) {
        return value;
      }

    }


    return "";

  }


  function extractImage(
    html,
    baseUrl
  ) {

    if (!html) return "";


    let image =
      extractMeta(
        html,
        "og:image"
      );


    if (!image) {

      image =
        extractMeta(
          html,
          "twitter:image"
        );

    }


    if (!image) {

      const match =
        html.match(
          /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i
        );

      if (match) {
        image = match[1];
      }

    }


    return absoluteUrl(
      image,
      baseUrl
    );

  }


  function extractCanonical(
    html,
    baseUrl
  ) {

    if (!html) return "";


    let match =
      html.match(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
      );


    if (!match) {

      match =
        html.match(
          /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
        );

    }


    if (!match) return "";


    return normalizeUrl(
      absoluteUrl(
        match[1],
        baseUrl
      )
    );

  }


  /* =========================================================
     FETCH HTML
  ========================================================= */

  async function fetchHtml(url) {

    const response =
      await fetch(
        url,
        {

          redirect: "follow",

          headers: {

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",

            "Cache-Control":
              "no-cache"

          }

        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    return await response.text();

  }


  /* =========================================================
     161 / 93
  ========================================================= */

  async function fetchN1List(
    source
  ) {

    const html =
      await fetchHtml(
        source.listUrl
      );


    const links = [];
    const seen = new Set();


    const regex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;


    while (
      (match = regex.exec(html))
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      if (!url) continue;


      url =
        normalizeUrl(url);


      if (!url) continue;


      let valid = false;


      if (
        source.id === "161ru"
      ) {

        valid =
          /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/i
            .test(url);

      }


      if (
        source.id === "93ru"
      ) {

        valid =
          /^https:\/\/93\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/i
            .test(url);

      }


      if (!valid) continue;


      if (
        seen.has(url)
      ) {
        continue;
      }


      seen.add(url);


      links.push({

        url,

        date:
          extractDateFromUrl(
            url
          )

      });


      if (
        links.length >= 30
      ) {
        break;
      }

    }


    return links;

  }


  /* =========================================================
     КРАСДОМ
  ========================================================= */

  async function fetchKrasdomList(
    source
  ) {

    const html =
      await fetchHtml(
        source.listUrl
      );


    const links = [];
    const seen = new Set();


    const regex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;


    while (
      (match = regex.exec(html))
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      if (!url) continue;


      url =
        normalizeUrl(url);


      if (!url) continue;


      if (
        !/^https:\/\/krasdom\.ru\/news\/.+/i
          .test(url)
      ) {
        continue;
      }


      if (
        /^https:\/\/krasdom\.ru\/news\/?$/i
          .test(url)
      ) {
        continue;
      }


      if (
        /\/(tag|category|page|author|search|feed)\//i
          .test(url)
      ) {
        continue;
      }


      if (
        seen.has(url)
      ) {
        continue;
      }


      seen.add(url);


      links.push({

        url,

        date: ""

      });


      if (
        links.length >= 30
      ) {
        break;
      }

    }


    return links;

  }


  /* =========================================================
     ДОМКЛИК
  ========================================================= */

  async function fetchDomclickList(
    source
  ) {

    const html =
      await fetchHtml(
        source.listUrl
      );


    const links = [];
    const seen = new Set();


    /*
     * Домклик может отдавать ссылки
     * не только через /novosti/,
     * поэтому сначала собираем ВСЕ
     * ссылки blog.domclick.ru.
     */

    const regex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;


    while (
      (match = regex.exec(html))
    ) {

      let url =
        absoluteUrl(
          match[1],
          source.listUrl
        );


      if (!url) continue;


      url =
        normalizeUrl(url);


      if (!url) continue;


      /*
       * Только блог Домклик.
       */

      if (
        !/^https:\/\/blog\.domclick\.ru\//i
          .test(url)
      ) {
        continue;
      }


      /*
       * Исключаем служебные страницы.
       */

      if (
        /\/(tag|category|page|author|search|feed|novosti\/?$)/i
          .test(url)
      ) {
        continue;
      }


      /*
       * Исключаем картинки,
       * файлы и технические ссылки.
       */

      if (
        /\.(jpg|jpeg|png|gif|svg|webp|pdf|xml|json)$/i
          .test(url)
      ) {
        continue;
      }


      if (
        seen.has(url)
      ) {
        continue;
      }


      seen.add(url);


      links.push({

        url,

        date: ""

      });


      if (
        links.length >= 30
      ) {
        break;
      }

    }


    return links;

  }


  /* =========================================================
     ДОМ.РФ
  ========================================================= */

  async function fetchDomrfList(
    source
  ) {

    const html =
      await fetchHtml(
        source.listUrl
      );


    const links = [];
    const seen = new Set();


    const regex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;


    while (
      (match = regex.exec(html))
    ) {

      let raw =
        match[1];


      /*
       * Сначала пробуем обычный URL.
       */

      let url =
        absoluteUrl(
          raw,
          source.listUrl
        );


      /*
       * Иногда русскоязычные URL
       * могут быть записаны в HTML
       * в percent-encoded виде.
       */

      if (!url) continue;


      url =
        normalizeUrl(url);


      if (!url) continue;


      /*
       * ВАЖНО:
       * не ограничиваемся только /news/.
       *
       * ДОМ.РФ может использовать
       * разные внутренние маршруты
       * для публикаций.
       */

      const host =
        (() => {

          try {
            return new URL(url).hostname;
          } catch {
            return "";
          }

        })();


      if (
        !(
          host === "спроси.дом.рф" ||
          host.endsWith(
            ".дом.рф"
          ) ||
          host ===
            "xn--80az8a.xn--d1aqf.xn--p1ai"
        )
      ) {

        continue;

      }


      /*
       * Исключаем сам раздел,
       * навигацию и служебные страницы.
       */

      if (
        /\/news\/?$/i.test(url)
      ) {
        continue;
      }


      if (
        /\/(tag|category|page|author|search|feed|login|account)\//i
          .test(url)
      ) {
        continue;
      }


      if (
        /\.(jpg|jpeg|png|gif|svg|webp|pdf|xml|json)$/i
          .test(url)
      ) {
        continue;
      }


      if (
        seen.has(url)
      ) {
        continue;
      }


      seen.add(url);


      links.push({

        url,

        date:
          extractDateFromUrl(
            url
          )

      });


      if (
        links.length >= 40
      ) {
        break;
      }

    }


    return links;

  }


  /* =========================================================
     ARTICLE
  ========================================================= */

  async function fetchArticle(
    source,
    candidate
  ) {

    const html =
      await fetchHtml(
        candidate.url
      );


    const title =
      extractTitle(html);


    const description =
      extractDescription(html);


    const image =
      extractImage(
        html,
        candidate.url
      );


    const canonical =
      extractCanonical(
        html,
        candidate.url
      );


    const date =
      extractPublishedDate(
        html,
        candidate
      );


    const publishedAt =
      extractPublishedAtFromText(
        html
      );


    return {

      source:
        source.name,

      sourceId:
        source.id,

      category:
        source.category,

      title:
        title || "Без названия",

      description:
        description || "",

      url:
        canonical ||
        candidate.url,

      image:
        image || "",

      date:
        date || "",

      publishedAt:
        publishedAt ||
        (
          date
            ? `${date}T00:00:00Z`
            : ""
        )

    };

  }


  /* =========================================================
     TOPIC
  ========================================================= */

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


  /* =========================================================
     PROCESS SOURCE
  ========================================================= */

  async function processSource(
    source,
    limit,
    days
  ) {

    const diagnostics = {

      id:
        source.id,

      name:
        source.name,

      count:
        0,

      candidates:
        0,

      recentCandidates:
        0,

      failed:
        0

    };


    try {

      let candidates = [];


      if (
        source.type === "n1"
      ) {

        candidates =
          await fetchN1List(
            source
          );

      }

      else if (
        source.type === "krasdom"
      ) {

        candidates =
          await fetchKrasdomList(
            source
          );

      }

      else if (
        source.type === "domclick"
      ) {

        candidates =
          await fetchDomclickList(
            source
          );

      }

      else if (
        source.type === "domrf"
      ) {

        candidates =
          await fetchDomrfList(
            source
          );

      }


      diagnostics.candidates =
        candidates.length;


      /*
       * 161 / 93:
       * дата уже известна из URL.
       */

      if (
        source.type === "n1"
      ) {

        candidates =
          candidates.filter(
            item =>
              item.date &&
              isRecent(
                item.date,
                days
              )
          );

      }


      /*
       * Источники, где дату надо
       * получить со страницы статьи.
       */

      const articleDateSource =
        source.type === "krasdom" ||
        source.type === "domclick" ||
        source.type === "domrf";


      if (
        articleDateSource
      ) {

        candidates =
          candidates.slice(
            0,
            Math.max(
              limit * 2,
              20
            )
          );

      }


      const items = [];


      const batchSize = 4;


      for (
        let i = 0;
        i < candidates.length;
        i += batchSize
      ) {

        const batch =
          candidates.slice(
            i,
            i + batchSize
          );


        const results =
          await Promise.all(

            batch.map(
              async candidate => {

                try {

                  const article =
                    await fetchArticle(
                      source,
                      candidate
                    );


                  if (
                    !article.title ||
                    !article.url
                  ) {

                    return null;

                  }


                  /*
                   * Для новых источников
                   * обязательно нужна дата.
                   */

                  if (
                    articleDateSource &&
                    !article.date
                  ) {

                    return null;

                  }


                  if (
                    !isRecent(
                      article.date,
                      days
                    )
                  ) {

                    return null;

                  }


                  return article;

                }

                catch {

                  diagnostics.failed++;

                  return null;

                }

              }
            )

          );


        for (
          const item of results
        ) {

          if (item) {

            items.push(
              item
            );

          }

        }


        /*
         * Достаточно материалов —
         * прекращаем загрузку.
         */

        if (
          items.length >=
          Math.max(
            limit,
            10
          )
        ) {

          break;

        }

      }


      diagnostics.recentCandidates =
        items.length;


      items.sort(
        (a, b) => {

          const da =
            new Date(
              a.date ||
              "1970-01-01"
            ).getTime();

          const db =
            new Date(
              b.date ||
              "1970-01-01"
            ).getTime();

          return db - da;

        }
      );


      const finalItems =
        items.slice(
          0,
          limit
        );


      diagnostics.count =
        finalItems.length;


      return {

        items:
          finalItems,

        diagnostics

      };

    }

    catch {

      diagnostics.failed++;

      return {

        items: [],

        diagnostics

      };

    }

  }


  /* =========================================================
     REQUEST
  ========================================================= */

  const requestUrl =
    new URL(
      req.url,
      `https://${req.headers.host}`
    );


  const category =
    (
      requestUrl.searchParams.get(
        "category"
      ) || "all"
    ).toLowerCase();


  const limitRaw =
    Number(
      requestUrl.searchParams.get(
        "limit"
      ) || 15
    );


  const limit =
    Math.min(
      Math.max(
        Number.isFinite(limitRaw)
          ? Math.round(limitRaw)
          : 15,
        1
      ),
      50
    );


  const daysRaw =
    Number(
      requestUrl.searchParams.get(
        "days"
      ) || 7
    );


  const days =
    Math.min(
      Math.max(
        Number.isFinite(daysRaw)
          ? Math.round(daysRaw)
          : 7,
        1
      ),
      30
    );


  /* =========================================================
     SOURCES
  ========================================================= */

  let sources = [];


  if (
    category === "all"
  ) {

    sources = [

      SOURCE_CONFIG["161ru"],

      SOURCE_CONFIG["93ru"],

      SOURCE_CONFIG["krasdom"],

      SOURCE_CONFIG["domclick"],

      SOURCE_CONFIG["domrf"]

    ];

  }


  else if (
    category === "rostov"
  ) {

    sources = [

      SOURCE_CONFIG["161ru"]

    ];

  }


  else if (
    category === "krasnodar"
  ) {

    sources = [

      SOURCE_CONFIG["93ru"],

      SOURCE_CONFIG["krasdom"]

    ];

  }


  else if (
    [
      "mortgage",
      "realty",
      "newbuildings",
      "laws"
    ].includes(category)
  ) {

    sources = [

      SOURCE_CONFIG["161ru"],

      SOURCE_CONFIG["93ru"],

      SOURCE_CONFIG["krasdom"],

      SOURCE_CONFIG["domclick"],

      SOURCE_CONFIG["domrf"]

    ];

  }


  else {

    return res.status(200).json({

      ok: false,

      error:
        `Unknown category: ${category}`

    });

  }


  /* =========================================================
     LOAD
  ========================================================= */

  const results =
    await Promise.all(

      sources.map(
        source =>
          processSource(
            source,
            limit,
            days
          )
      )

    );


  let allItems = [];

  const sourceDiagnostics = [];


  for (
    const result
    of results
  ) {

    allItems =
      allItems.concat(
        result.items
      );


    sourceDiagnostics.push(
      result.diagnostics
    );

  }


  /* =========================================================
     TOPIC FILTER
  ========================================================= */

  if (
    [
      "mortgage",
      "realty",
      "newbuildings",
      "laws"
    ].includes(category)
  ) {

    allItems =
      allItems.filter(
        item =>
          getTopicCategory(
            item.title
          ) === category
      );

  }


  /* =========================================================
     DUPLICATE REMOVAL
  ========================================================= */

  const unique = [];

  const seenUrls =
    new Set();

  const seenTitles =
    new Set();


  for (
    const item
    of allItems
  ) {

    const urlKey =
      normalizeUrl(
        item.url
      );


    /*
     * Нормализуем заголовок,
     * чтобы 161.RU и 93.RU
     * с одинаковой новостью
     * считались одним материалом.
     */

    const titleKey =
      cleanText(
        item.title
      )
        .toLowerCase()
        .replace(
          /[^a-zа-яё0-9]+/gi,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    if (
      urlKey &&
      seenUrls.has(urlKey)
    ) {

      continue;

    }


    if (
      titleKey &&
      seenTitles.has(titleKey)
    ) {

      continue;

    }


    if (urlKey) {

      seenUrls.add(
        urlKey
      );

    }


    if (titleKey) {

      seenTitles.add(
        titleKey
      );

    }


    unique.push(
      item
    );

  }


  /* =========================================================
     SORT
  ========================================================= */

  unique.sort(
    (a, b) => {

      const da =
        new Date(
          a.date ||
          "1970-01-01"
        ).getTime();

      const db =
        new Date(
          b.date ||
          "1970-01-01"
        ).getTime();

      return db - da;

    }
  );


  /* =========================================================
     RESPONSE
  ========================================================= */

  return res.status(200).json({

    ok: true,

    category,

    count:
      Math.min(
        unique.length,
        limit
      ),

    items:
      unique.slice(
        0,
        limit
      ),

    sources:
      sourceDiagnostics

  });

}
