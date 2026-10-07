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
     BASIC HELPERS
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

      return new URL(url, baseUrl).href;

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
        "ref"
      ].forEach(param => {
        u.searchParams.delete(param);
      });

      return u.href.replace(/\/+$/, "");

    } catch {

      return "";

    }

  }


  /* =========================================================
     DATE HELPERS
  ========================================================= */

  function normalizeDate(raw) {

    if (!raw) return "";

    let value = String(raw)
      .trim()
      .replace(/\u00a0/g, " ");

    if (!value) return "";


    // ISO / YYYY-MM-DD
    let match = value.match(
      /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
    );

    if (match) {

      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);

      if (
        y >= 2000 &&
        m >= 1 &&
        m <= 12 &&
        d >= 1 &&
        d <= 31
      ) {

        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      }

    }


    // DD.MM.YYYY
    match = value.match(
      /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/
    );

    if (match) {

      const d = Number(match[1]);
      const m = Number(match[2]);
      const y = Number(match[3]);

      if (
        d >= 1 &&
        d <= 31 &&
        m >= 1 &&
        m <= 12
      ) {

        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      }

    }


    // Русские месяцы
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

      const d = Number(match[1]);
      const m = months[match[2].toLowerCase()];
      const y = Number(match[3]);

      if (m) {

        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      }

    }


    // Попытка распознать нормальную дату JS
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {

      const y = parsed.getFullYear();

      if (y >= 2000 && y <= 2100) {

        return [
          y,
          String(parsed.getMonth() + 1).padStart(2, "0"),
          String(parsed.getDate()).padStart(2, "0")
        ].join("-");

      }

    }


    return "";

  }


  function extractDateFromUrl(url) {

    if (!url) return "";

    let match = String(url).match(
      /\/(20\d{2})\/(\d{2})\/(\d{2})\//
    );

    if (match) {

      return `${match[1]}-${match[2]}-${match[3]}`;

    }

    match = String(url).match(
      /[?&](?:date|published|published_at)=(20\d{2})[-/](\d{2})[-/](\d{2})/i
    );

    if (match) {

      return `${match[1]}-${match[2]}-${match[3]}`;

    }

    return "";

  }


  function extractDateFromText(text) {

    if (!text) return "";

    const clean = cleanText(text);

    const patterns = [

      /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/,

      /\b\d{1,2}[.\/-]\d{1,2}[.\/-]20\d{2}\b/,

      /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+20\d{2}\b/i

    ];

    for (const pattern of patterns) {

      const match = clean.match(pattern);

      if (match) {

        const result = normalizeDate(match[0]);

        if (result) return result;

      }

    }

    return "";

  }


  function extractPublishedAtFromText(text) {

    if (!text) return "";

    const clean = cleanText(text);

    const match = clean.match(
      /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
    );

    if (!match) return "";

    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const h = Number(match[4]);
    const min = Number(match[5]);
    const sec = Number(match[6] || 0);

    const dt = new Date(
      Date.UTC(y, m - 1, d, h, min, sec)
    );

    if (Number.isNaN(dt.getTime())) return "";

    return dt.toISOString();

  }


  function extractMetaByProperty(html, property) {

    if (!html) return "";

    const regex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );

    let match = html.match(regex);

    if (match) return cleanText(match[1]);


    const reverseRegex = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i"
    );

    match = html.match(reverseRegex);

    return match ? cleanText(match[1]) : "";

  }


  function extractMetaByName(html, name) {

    return (
      extractMetaByProperty(html, name) ||
      extractMetaByProperty(html, name.toLowerCase())
    );

  }


  function extractJsonLdDates(html) {

    const result = [];

    if (!html) return result;

    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match;

    while ((match = regex.exec(html))) {

      let raw = match[1]
        .replace(/<!--/g, "")
        .replace(/-->/g, "")
        .trim();

      if (!raw) continue;

      try {

        const data = JSON.parse(raw);

        const objects = Array.isArray(data)
          ? data
          : [data];

        for (const obj of objects) {

          if (!obj || typeof obj !== "object") continue;

          if (obj.datePublished) {
            result.push(obj.datePublished);
          }

          if (obj.dateCreated) {
            result.push(obj.dateCreated);
          }

          if (obj.uploadDate) {
            result.push(obj.uploadDate);
          }

          if (Array.isArray(obj["@graph"])) {

            for (const graphItem of obj["@graph"]) {

              if (!graphItem || typeof graphItem !== "object") continue;

              if (graphItem.datePublished) {
                result.push(graphItem.datePublished);
              }

              if (graphItem.dateCreated) {
                result.push(graphItem.dateCreated);
              }

              if (graphItem.uploadDate) {
                result.push(graphItem.uploadDate);
              }

            }

          }

        }

      } catch {

        // Некоторые сайты помещают JSON-LD
        // с невалидными символами.
        // В таком случае просто переходим дальше.

      }

    }

    return result;

  }


  function extractPublishedDate(html, candidateDate = {}) {

    if (!html) return "";


    // 1. JSON-LD

    const jsonLdDates = extractJsonLdDates(html);

    for (const raw of jsonLdDates) {

      const date = normalizeDate(raw);

      if (date) return date;

    }


    // 2. OpenGraph published time

    const ogPublished =
      extractMetaByProperty(
        html,
        "article:published_time"
      );

    if (ogPublished) {

      const date = normalizeDate(ogPublished);

      if (date) return date;

    }


    // 3. Специальные meta

    const metaNames = [
      "datePublished",
      "datepublished",
      "publishdate",
      "pubdate",
      "date"
    ];

    for (const name of metaNames) {

      const raw = extractMetaByName(
        html,
        name
      );

      if (!raw) continue;

      const date = normalizeDate(raw);

      if (date) return date;

    }


    // 4. URL

    const urlDate = extractDateFromUrl(
      candidateDate.url || ""
    );

    if (urlDate) return urlDate;


    // 5. Дата из переданного кандидата

    if (
      candidateDate &&
      typeof candidateDate === "object" &&
      candidateDate.date
    ) {

      const date = normalizeDate(
        candidateDate.date
      );

      if (date) return date;

    }


    // 6. Дата в тексте

    const textDate = extractDateFromText(html);

    if (textDate) return textDate;


    return "";

  }


  function isRecent(date, days) {

    if (!date) return false;

    const parsed = new Date(
      `${date}T23:59:59`
    );

    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const now = new Date();

    const limit = new Date(
      now.getTime() -
      Number(days) * 24 * 60 * 60 * 1000
    );

    return parsed >= limit;

  }


  function getDateLimit(days) {

    const d = Number(days);

    if (!Number.isFinite(d) || d <= 0) {
      return 7;
    }

    return Math.min(
      Math.max(Math.round(d), 1),
      30
    );

  }


  /* =========================================================
     HTML EXTRACTION
  ========================================================= */

  function extractTitle(html) {

    if (!html) return "";

    let match = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    );

    if (match) {
      return cleanText(match[1]);
    }

    match = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
    );

    if (match) {
      return cleanText(match[1]);
    }

    match = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    if (match) {
      return cleanText(match[1]);
    }

    match = html.match(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    );

    if (match) {
      return cleanText(match[1]);
    }

    return "";

  }


  function extractDescription(html) {

    if (!html) return "";

    let description =
      extractMetaByProperty(
        html,
        "og:description"
      );

    if (description) return description;


    description =
      extractMetaByName(
        html,
        "description"
      );

    if (description) return description;


    const match = html.match(
      /<p[^>]*>([\s\S]*?)<\/p>/i
    );

    if (match) {

      const text = cleanText(match[1]);

      if (text.length > 30) {
        return text;
      }

    }

    return "";

  }


  function extractImage(html, baseUrl) {

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

    if (!image) {

      const match = html.match(
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


  function extractCanonical(html, baseUrl) {

    if (!html) return "";

    let match = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

    if (!match) {

      match = html.match(
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
      );

    }

    if (!match) return "";

    return normalizeUrl(
      absoluteUrl(match[1], baseUrl)
    );

  }


  /* =========================================================
     FETCH
  ========================================================= */

  async function fetchHtml(url) {

    const response = await fetch(url, {

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

    });

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    return await response.text();

  }


  /* =========================================================
     161.RU / 93.RU
  ========================================================= */

  async function fetchN1List(source) {

    const html = await fetchHtml(
      source.listUrl
    );

    const links = [];
    const seen = new Set();

    const hrefRegex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;

    while ((match = hrefRegex.exec(html))) {

      let url = absoluteUrl(
        match[1],
        source.listUrl
      );

      if (!url) continue;

      url = normalizeUrl(url);

      if (!url) continue;


      let valid = false;

      if (source.id === "161ru") {

        valid =
          /^https:\/\/161\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/i
            .test(url);

      }


      if (source.id === "93ru") {

        valid =
          /^https:\/\/93\.ru\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/i
            .test(url);

      }


      if (!valid) continue;

      if (seen.has(url)) continue;

      seen.add(url);

      links.push({

        url,

        date:
          extractDateFromUrl(url)

      });

      if (links.length >= 30) {
        break;
      }

    }

    return links;

  }


  /* =========================================================
     КРАСДОМ
  ========================================================= */

  async function fetchKrasdomList(source) {

    const html = await fetchHtml(
      source.listUrl
    );

    const links = [];
    const seen = new Set();

    const hrefRegex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;

    while ((match = hrefRegex.exec(html))) {

      let url = absoluteUrl(
        match[1],
        source.listUrl
      );

      if (!url) continue;

      url = normalizeUrl(url);

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


      if (seen.has(url)) continue;

      seen.add(url);

      links.push({

        url,

        date: ""

      });


      if (links.length >= 30) {
        break;
      }

    }

    return links;

  }


  /* =========================================================
     ДОМКЛИК
  ========================================================= */

  async function fetchDomclickList(source) {

    const html = await fetchHtml(
      source.listUrl
    );

    const links = [];
    const seen = new Set();

    const hrefRegex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;

    while ((match = hrefRegex.exec(html))) {

      let url = absoluteUrl(
        match[1],
        source.listUrl
      );

      if (!url) continue;

      url = normalizeUrl(url);

      if (!url) continue;


      if (
        !/^https:\/\/blog\.domclick\.ru\/novosti\/.+/i
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


      if (seen.has(url)) continue;

      seen.add(url);

      links.push({

        url,

        date: ""

      });


      if (links.length >= 30) {
        break;
      }

    }

    return links;

  }


  /* =========================================================
     ДОМ.РФ
  ========================================================= */

  async function fetchDomrfList(source) {

    const html = await fetchHtml(
      source.listUrl
    );

    const links = [];
    const seen = new Set();

    const hrefRegex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;

    while ((match = hrefRegex.exec(html))) {

      let url = absoluteUrl(
        match[1],
        source.listUrl
      );

      if (!url) continue;

      url = normalizeUrl(url);

      if (!url) continue;


      // ДОМ.РФ может отдавать URL
      // с русским доменом в разных формах.
      if (
        !/^https:\/\/спроси\.дом\.рф\//i.test(url) &&
        !/^https:\/\/xn--80aapx0b\.xn--d1aqf\.xn--p1ai\//i.test(url)
      ) {
        continue;
      }


      // Исключаем сам раздел новостей
      if (
        /\/news\/?$/i.test(url)
      ) {
        continue;
      }


      // Служебные страницы
      if (
        /\/(tag|category|page|author|search|feed)\//i
          .test(url)
      ) {
        continue;
      }


      if (seen.has(url)) continue;

      seen.add(url);

      links.push({

        url,

        date:
          extractDateFromUrl(url)

      });


      if (links.length >= 30) {
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

    const html = await fetchHtml(
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
      extractPublishedAtFromText(html);


    return {

      source: source.name,

      sourceId: source.id,

      category: source.category,

      title:
        title || "Без названия",

      description:
        description || "",

      url:
        canonical || candidate.url,

      image:
        image || "",

      date:
        date || "",

      publishedAt:
        publishedAt || (
          date
            ? `${date}T00:00:00Z`
            : ""
        )

    };

  }


  /* =========================================================
     TOPIC CLASSIFICATION
  ========================================================= */

  function getTopicCategory(title) {

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


      if (source.type === "n1") {

        candidates =
          await fetchN1List(source);

      }

      else if (
        source.type === "krasdom"
      ) {

        candidates =
          await fetchKrasdomList(source);

      }

      else if (
        source.type === "domclick"
      ) {

        candidates =
          await fetchDomclickList(source);

      }

      else if (
        source.type === "domrf"
      ) {

        candidates =
          await fetchDomrfList(source);

      }


      diagnostics.candidates =
        candidates.length;


      /*
       * N1 источники уже содержат дату
       * в URL, поэтому старые статьи
       * отбрасываем до загрузки страниц.
       */

      if (source.type === "n1") {

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
       * Для КРАСДОМ, Домклик и ДОМ.РФ
       * сначала открываем статьи,
       * определяем реальную дату,
       * затем применяем days.
       */

      const needArticleDate =
        source.type === "krasdom" ||
        source.type === "domclick" ||
        source.type === "domrf";


      if (needArticleDate) {

        candidates =
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
       * Обрабатываем небольшими пачками,
       * чтобы Vercel не перегружался.
       */

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


                  if (
                    needArticleDate &&
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
            items.push(item);
          }

        }


        /*
         * Если уже набрали достаточно,
         * дальше источник можно не грузить.
         */

        if (
          items.length >=
          Math.max(limit, 10)
        ) {

          break;

        }

      }


      diagnostics.recentCandidates =
        items.length;


      /*
       * Сортируем внутри источника
       * по дате от новых к старым.
       */

      items.sort(
        (a, b) => {

          const da =
            new Date(
              a.date || "1970-01-01"
            ).getTime();

          const db =
            new Date(
              b.date || "1970-01-01"
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

    catch (error) {

      diagnostics.failed++;

      return {

        items: [],

        diagnostics

      };

    }

  }


  /* =========================================================
     REQUEST PARAMS
  ========================================================= */

  const url =
    new URL(
      req.url,
      `https://${req.headers.host}`
    );


  const category =
    (
      url.searchParams.get(
        "category"
      ) || "all"
    ).toLowerCase();


  const limitRaw =
    Number(
      url.searchParams.get(
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


  const days =
    getDateLimit(
      url.searchParams.get(
        "days"
      ) || 7
    );


  /* =========================================================
     SOURCE SELECTION
  ========================================================= */

  let sources = [];


  /*
   * ВСЕ НОВОСТИ
   */

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


  /*
   * РОСТОВ
   */

  else if (
    category === "rostov"
  ) {

    sources = [

      SOURCE_CONFIG["161ru"]

    ];

  }


  /*
   * КРАСНОДАР
   */

  else if (
    category === "krasnodar"
  ) {

    sources = [

      SOURCE_CONFIG["93ru"],

      SOURCE_CONFIG["krasdom"]

    ];

  }


  /*
   * ТЕМАТИЧЕСКИЕ КАТЕГОРИИ
   */

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


  /*
   * НЕИЗВЕСТНАЯ КАТЕГОРИЯ
   */

  else {

    return res.status(200).json({

      ok: false,

      error:
        `Unknown category: ${category}`

    });

  }


  /* =========================================================
     FETCH SOURCES
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


  results.forEach(result => {

    allItems =
      allItems.concat(
        result.items
      );

    sourceDiagnostics.push(
      result.diagnostics
    );

  });


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
     REMOVE DUPLICATES
  ========================================================= */

  const unique = [];
  const seenUrls = new Set();


  for (
    const item of allItems
  ) {

    const key =
      normalizeUrl(
        item.url
      );


    if (!key) continue;

    if (
      seenUrls.has(key)
    ) {
      continue;
    }


    seenUrls.add(key);

    unique.push(item);

  }


  /* =========================================================
     GLOBAL SORT
  ========================================================= */

  unique.sort(
    (a, b) => {

      const da =
        new Date(
          a.date || "1970-01-01"
        ).getTime();

      const db =
        new Date(
          b.date || "1970-01-01"
        ).getTime();

      return db - da;

    }
  );


  /* =========================================================
     FINAL RESPONSE
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
