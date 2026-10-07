const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;
const DEFAULT_DAYS = 7;

const SOURCE_TIMEOUT = 12000;
const ARTICLE_CONCURRENCY = 5;
const MAX_CANDIDATES_PER_SOURCE = 30;

const SOURCES = {
  "161ru": {
    id: "161ru",
    name: "161.RU",
    category: "rostov",
    url: "https://161.ru/text/realty/",
    parser: "generic"
  },

  "93ru": {
    id: "93ru",
    name: "93.RU",
    category: "krasnodar",
    url: "https://93.ru/text/realty/",
    parser: "generic"
  },

  "krasdom": {
    id: "krasdom",
    name: "КРАСДОМ",
    category: "krasnodar",
    url: "https://krasdom.ru/news/",
    parser: "krasdom"
  },

  "domrf": {
    id: "domrf",
    name: "ДОМ.РФ",
    category: "federal",
    url: "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/",
    parser: "domrf"
  },

  "domclick": {
    id: "domclick",
    name: "Домклик",
    category: "federal",
    url: "https://blog.domclick.ru/novosti",
    parser: "domclick"
  },

  "yandexrealty": {
    id: "yandexrealty",
    name: "Яндекс Недвижимость",
    category: "federal",
    url: "https://realty.yandex.ru/journal/category/news/",
    parser: "yandex"
  },

  "cian": {
    id: "cian",
    name: "ЦИАН",
    category: "federal",
    url: "https://krasnodar.cian.ru/magazine/",
    parser: "cian"
  }
};


/* =========================================================
   BASIC HELPERS
========================================================= */

function decodeEntities(str) {
  if (!str) return "";

  return String(str)
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
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCharCode(parseInt(n, 16));
      } catch {
        return "";
      }
    });
}


function cleanText(str) {
  if (!str) return "";

  return decodeEntities(
    String(str)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}


function cleanDescription(str, sourceId) {
  let text = cleanText(str);

  if (!text) return "";

  /* Telegram / Домклик */
  text = text
    .replace(/Please open Telegram to view this post/gi, "")
    .replace(/VIEW IN TELEGRAM/gi, "")
    .replace(/Домклик в MAX\s*[—-]\s*подписаться/gi, "")
    .replace(/\b\d+(?:\.\d+)?[KКМ]? views?\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?[KКМ]?\s*просмотр(?:а|ов)?\b/gi, "")
    .replace(/\s*просмотров\s*\d*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  /* Яндекс */
  if (sourceId === "yandexrealty") {
    text = text
      .replace(/\s*[-—]\s*Новости\.\s*.*?в Журнале Недвижимости$/i, "")
      .replace(/\s+в Журнале Недвижимости$/i, "")
      .trim();
  }

  /* Убираем лишние служебные подписи */
  text = text
    .replace(/\s*\|\s*ЦИАН\s*$/i, "")
    .replace(/\s*\|\s*Домклик\s*$/i, "")
    .replace(/\s*\|\s*ДОМ\.РФ\s*$/i, "")
    .trim();

  if (text.length > 420) {
    text = text.slice(0, 417).trim() + "...";
  }

  return text;
}


function cleanTitle(str) {
  let text = cleanText(str);

  text = text
    .replace(/^Новости\s*[:—-]\s*/i, "")
    .replace(/^ЦИАН\s*[:—-]\s*/i, "")
    .replace(/^Домклик\s*[:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}


function absoluteUrl(url, base) {
  if (!url) return "";

  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}


function normalizeUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    const removeParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "from",
      "erid",
      "yclid",
      "ysclid"
    ];

    removeParams.forEach(param => {
      u.searchParams.delete(param);
    });

    u.hash = "";

    return u.href.replace(/\/+$/, "");
  } catch {
    return String(url).trim();
  }
}


function makeId(url) {
  const normalized = normalizeUrl(url);

  return Buffer
    .from(normalized)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
}


/* =========================================================
   FETCH
========================================================= */

async function fetchText(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeout || SOURCE_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/154.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      text,
      url: response.url
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      url,
      error: error && error.message
        ? error.message
        : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   HTML HELPERS
========================================================= */

function getAttr(tag, attr) {
  const re = new RegExp(
    attr + '\\s*=\\s*["\']([^"\']*)["\']',
    "i"
  );

  const match = tag.match(re);

  return match ? decodeEntities(match[1]) : "";
}


function extractMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`,
        "i"
      )
    ];

    for (const re of patterns) {
      const match = html.match(re);

      if (match && match[1]) {
        return cleanText(match[1]);
      }
    }
  }

  return "";
}


function extractJsonLd(html) {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  ) || [];

  for (const script of scripts) {
    const content = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const json = JSON.parse(content);

      if (Array.isArray(json)) {
        for (const item of json) {
          if (item && typeof item === "object") {
            if (
              item.datePublished ||
              item.dateModified ||
              item.headline
            ) {
              return item;
            }
          }
        }
      }

      if (json && typeof json === "object") {
        if (json["@graph"] && Array.isArray(json["@graph"])) {
          for (const item of json["@graph"]) {
            if (
              item &&
              (
                item.datePublished ||
                item.dateModified ||
                item.headline
              )
            ) {
              return item;
            }
          }
        }

        return json;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}


function extractDateFromHtml(html) {
  const jsonLd = extractJsonLd(html);

  if (jsonLd) {
    const date =
      jsonLd.datePublished ||
      jsonLd.dateModified ||
      jsonLd.uploadDate;

    if (date) {
      const parsed = new Date(date);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  const metaDate = extractMeta(html, [
    "article:published_time",
    "article:modified_time",
    "datePublished",
    "date",
    "pubdate",
    "publish-date",
    "published_time"
  ]);

  if (metaDate) {
    const parsed = new Date(metaDate);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const timeMatch = html.match(
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i
  );

  if (timeMatch) {
    const parsed = new Date(timeMatch[1]);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}


function extractTitleFromHtml(html) {
  const jsonLd = extractJsonLd(html);

  if (jsonLd && jsonLd.headline) {
    return cleanTitle(jsonLd.headline);
  }

  const ogTitle = extractMeta(html, [
    "og:title",
    "twitter:title"
  ]);

  if (ogTitle) {
    return cleanTitle(ogTitle);
  }

  const titleMatch = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (titleMatch) {
    return cleanTitle(titleMatch[1]);
  }

  return "";
}


function extractDescriptionFromHtml(html, sourceId) {
  const jsonLd = extractJsonLd(html);

  if (jsonLd) {
    const description =
      jsonLd.description ||
      jsonLd.articleBody;

    if (description) {
      return cleanDescription(description, sourceId);
    }
  }

  const description = extractMeta(html, [
    "description",
    "og:description",
    "twitter:description"
  ]);

  return cleanDescription(description, sourceId);
}


function extractImageFromHtml(html) {
  const jsonLd = extractJsonLd(html);

  if (jsonLd) {
    if (jsonLd.image) {
      if (typeof jsonLd.image === "string") {
        return jsonLd.image;
      }

      if (Array.isArray(jsonLd.image)) {
        return jsonLd.image[0] || "";
      }

      if (typeof jsonLd.image === "object") {
        return jsonLd.image.url || "";
      }
    }
  }

  return extractMeta(html, [
    "og:image",
    "twitter:image"
  ]);
}


/* =========================================================
   DATE HELPERS
========================================================= */

function dateFromNewsUrl(url) {
  const match = String(url).match(
    /\/text\/realty\/(\d{4})\/(\d{2})\/(\d{2})\/\d+/
  );

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function isRecent(date, days) {
  if (!date) return false;

  const now = Date.now();
  const diff = now - date.getTime();

  return diff <= days * 24 * 60 * 60 * 1000 &&
         diff >= -24 * 60 * 60 * 1000;
}


/* =========================================================
   TOPIC
========================================================= */

function classifyTopic(title, description) {
  const text = (
    (title || "") +
    " " +
    (description || "")
  ).toLowerCase();

  if (
    /ипотек|ипотечн|ставк[аи]|кредит|маткапитал|материнск|семейн.*ипотек/.test(text)
  ) {
    return "mortgage";
  }

  if (
    /новострой|застройщик|девелоп|жк\s|жилой комплекс|строительств|ввод жилья|новое жиль/.test(text)
  ) {
    return "newbuildings";
  }

  if (
    /законодатель|закон |закон:|росреестр|егрн|кадастр|госуслуг|правил[а-я]* сделки|изменени[яй].*(рынк|недвиж|жиль)|госпошлин/.test(text)
  ) {
    return "legislation";
  }

  if (
    /как |документ|проверить|проверка|договор|сделк|мошен|риск|продаж[аи]|покупк[аи]|риелтор|риэлтор/.test(text)
  ) {
    return "useful";
  }

  return "realty";
}


/* =========================================================
   YANDEX FOREIGN FILTER
========================================================= */

function isRussianMarketRelevant(title, description) {
  const text = (
    (title || "") +
    " " +
    (description || "")
  ).toLowerCase();

  const foreignPatterns = [
    /\bв сша\b/,
    /\bсша\b/,
    /\bамерикан/,
    /\bв америк/,
    /\bтехас/,
    /\bкалифорни/,
    /\bфлорида/,
    /\bмайами/,
    /\bлос[- ]анджелес/,
    /\bнью[- ]йорк/,
    /\bфиладельфи/,
    /\bсан[- ]франциск/,
    /\bканад/,
    /\bбритан/,
    /\bвеликобритани/,
    /\bлондон/,
    /\bфранци/,
    /\bпариж/,
    /\bгермани/,
    /\bберлин/,
    /\bиспан/,
    /\bитал/,
    /\bдубай/,
    /\bоаэ/
  ];

  return !foreignPatterns.some(re => re.test(text));
}


/* =========================================================
   ARTICLE EXTRACTION
========================================================= */

async function fetchArticle(candidate, source) {
  const response = await fetchText(candidate.url);

  if (!response.ok) {
    return null;
  }

  const html = response.text;

  let title = extractTitleFromHtml(html);
  let description = extractDescriptionFromHtml(
    html,
    source.id
  );

  let image = extractImageFromHtml(html);

  let date = extractDateFromHtml(html);

  if (!date && candidate.date) {
    date = candidate.date;
  }

  if (!title) {
    title = candidate.title || "";
  }

  if (!description) {
    description = candidate.description || "";
  }

  if (!image) {
    image = candidate.image || "";
  }

  title = cleanTitle(title);
  description = cleanDescription(
    description,
    source.id
  );

  if (!title) return null;

  if (
    source.id === "yandexrealty" &&
    !isRussianMarketRelevant(title, description)
  ) {
    return null;
  }

  return {
    id: makeId(candidate.url),
    source: source.id,
    sourceName: source.name,
    title,
    description,
    url: normalizeUrl(candidate.url),
    image: absoluteUrl(image, candidate.url),
    publishedAt: date
      ? date.toISOString()
      : null,
    topic: classifyTopic(
      title,
      description
    )
  };
}


/* =========================================================
   LINK EXTRACTION
========================================================= */

function extractLinks(html, source) {
  const links = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const rawUrl = match[1];
    const anchor = cleanText(match[2]);

    const url = absoluteUrl(
      rawUrl,
      source.url
    );

    if (!url) continue;

    let u;

    try {
      u = new URL(url);
    } catch {
      continue;
    }

    const path = u.pathname;

    let valid = false;

    /* =========================================
       161.RU
    ========================================= */

    if (source.id === "161ru") {
      valid =
        /^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+(?:\/)?$/i.test(path) &&
        !/\/comments(?:\/|$)/i.test(path);
    }


    /* =========================================
       93.RU
    ========================================= */

    if (source.id === "93ru") {
      valid =
        /^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+(?:\/)?$/i.test(path) &&
        !/\/comments(?:\/|$)/i.test(path);
    }


    /* =========================================
       КРАСДОМ
    ========================================= */

    if (source.id === "krasdom") {
      valid =
        /^\/news\/\d+(?:\/)?$/i.test(path) &&
        !/^\/news\/?$/i.test(path);
    }


    /* =========================================
       ДОМ.РФ
    ========================================= */

    if (source.id === "domrf") {
      valid =
        /^\/news\/.+/i.test(path) &&
        !/^\/news\/?$/i.test(path);
    }


    /* =========================================
       ЯНДЕКС НЕДВИЖИМОСТЬ
    ========================================= */

    if (source.id === "yandexrealty") {
      valid =
        /^\/journal\/post\/[^/]+/i.test(path);
    }


    /* =========================================
       ЦИАН
    ========================================= */

    if (source.id === "cian") {
      valid =
        /^\/magazine\/[^/]+/i.test(path) &&
        !/^\/magazine\/?$/i.test(path) &&
        !/\/magazine\/tag\//i.test(path) &&
        !/\/magazine\/search/i.test(path);
    }


    /* =========================================
       DOMCLICK
    ========================================= */

    if (source.id === "domclick") {
      valid =
        /^\/(novosti|articles|article)\//i.test(path) ||
        /^\/[^/]+\/[^/]+/i.test(path);

      if (/\/videos?\//i.test(path)) {
        valid = false;
      }
    }

    if (!valid) continue;

    const normalized = normalizeUrl(url);

    if (seen.has(normalized)) continue;

    seen.add(normalized);

    links.push({
      url: normalized,
      title: anchor,
      date:
        source.id === "161ru" ||
        source.id === "93ru"
          ? dateFromNewsUrl(normalized)
          : null
    });

    if (links.length >= MAX_CANDIDATES_PER_SOURCE) {
      break;
    }
  }

  return links;
}


/* =========================================================
   GENERIC SOURCES
========================================================= */

async function parseGenericSource(source, days) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(source.url);

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error: page.error || null,
      httpStatus: page.status || null
    };
  }

  let candidates = extractLinks(
    page.text,
    source
  );

  diagnostics.candidates = candidates.length;

  /* Для 161/93 дата уже есть в URL */
  candidates = candidates.filter(candidate => {
    if (
      (source.id === "161ru" ||
       source.id === "93ru") &&
      candidate.date
    ) {
      if (!isRecent(candidate.date, days)) {
        diagnostics.rejected++;
        return false;
      }
    }

    return true;
  });

  diagnostics.recentCandidates =
    candidates.length;

  const items = [];

  for (
    let i = 0;
    i < candidates.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch = candidates.slice(
      i,
      i + ARTICLE_CONCURRENCY
    );

    const results = await Promise.all(
      batch.map(candidate =>
        fetchArticle(candidate, source)
      )
    );

    for (const item of results) {
      if (!item) {
        diagnostics.failed++;
        continue;
      }

      if (
        item.publishedAt &&
        !isRecent(
          new Date(item.publishedAt),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      items.push(item);
    }
  }

  return {
    items,
    diagnostics
  };
}


/* =========================================================
   КРАСДОМ
========================================================= */

async function parseKrasdom(source, days) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(
    source.url
  );

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error: page.error || null,
      httpStatus: page.status || null
    };
  }

  const candidates = extractLinks(
    page.text,
    source
  );

  diagnostics.candidates =
    candidates.length;

  diagnostics.recentCandidates =
    candidates.length;

  const items = [];

  for (
    let i = 0;
    i < candidates.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch = candidates.slice(
      i,
      i + ARTICLE_CONCURRENCY
    );

    const results = await Promise.all(
      batch.map(candidate =>
        fetchArticle(candidate, source)
      )
    );

    for (const item of results) {
      if (!item) {
        diagnostics.failed++;
        continue;
      }

      if (
        item.publishedAt &&
        !isRecent(
          new Date(item.publishedAt),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      items.push(item);
    }
  }

  return {
    items,
    diagnostics
  };
}


/* =========================================================
   ДОМ.РФ
========================================================= */

async function parseDomrf(source, days) {
  return parseGenericSource(
    source,
    days
  );
}


/* =========================================================
   ЯНДЕКС НЕДВИЖИМОСТЬ
========================================================= */

async function parseYandex(source, days) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(
    source.url
  );

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error: page.error || null,
      httpStatus: page.status || null
    };
  }

  const candidates = extractLinks(
    page.text,
    source
  );

  diagnostics.candidates =
    candidates.length;

  diagnostics.recentCandidates =
    candidates.length;

  const items = [];

  for (
    let i = 0;
    i < candidates.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch = candidates.slice(
      i,
      i + ARTICLE_CONCURRENCY
    );

    const results = await Promise.all(
      batch.map(candidate =>
        fetchArticle(candidate, source)
      )
    );

    for (const item of results) {
      if (!item) {
        diagnostics.rejected++;
        continue;
      }

      if (
        item.publishedAt &&
        !isRecent(
          new Date(item.publishedAt),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      if (
        !isRussianMarketRelevant(
          item.title,
          item.description
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      items.push(item);
    }
  }

  return {
    items,
    diagnostics
  };
}


/* =========================================================
   DOMCLICK
========================================================= */

function parseTelegramPosts(html) {
  const posts = [];

  const blocks =
    html.split(
      /tgme_widget_message_wrap/gi
    );

  for (const block of blocks) {
    if (!/blog\.domclick\.ru/i.test(block)) {
      continue;
    }

    const urlMatches =
      block.match(
        /https?:\/\/blog\.domclick\.ru\/[^"'<>\\\s]+/gi
      ) || [];

    if (!urlMatches.length) continue;

    let articleUrl = "";

    for (const raw of urlMatches) {
      const cleaned = raw
        .replace(/&amp;/g, "&")
        .replace(/[)"'>]+$/g, "");

      try {
        const parsed = new URL(cleaned);

        if (/\/videos?\//i.test(parsed.pathname)) {
          continue;
        }

        articleUrl = normalizeUrl(cleaned);
        break;
      } catch {
        /* ignore */
      }
    }

    if (!articleUrl) continue;

    if (/\/videos?\//i.test(articleUrl)) {
      continue;
    }

    let title = "";

    const titleMatch = block.match(
      /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i
    );

    if (titleMatch) {
      const body = cleanText(
        titleMatch[1]
      );

      const lines = body
        .split(/\n+/)
        .map(x => cleanText(x))
        .filter(Boolean);

      if (lines.length) {
        title = lines[0];
      }
    }

    let description = "";

    if (titleMatch) {
      const body = cleanText(
        titleMatch[1]
      );

      const lines = body
        .split(/\n+/)
        .map(x => cleanText(x))
        .filter(Boolean);

      if (lines.length > 1) {
        description = lines
          .slice(1)
          .join(" ");
      } else {
        description = body
          .replace(title, "")
          .trim();
      }
    }

    description = description
      .replace(
        /Please open Telegram to view this post/gi,
        ""
      )
      .replace(
        /VIEW IN TELEGRAM/gi,
        ""
      )
      .replace(
        /Домклик в MAX\s*[—-]\s*подписаться/gi,
        ""
      )
      .trim();

    let image = "";

    const photoMatch = block.match(
      /tgme_widget_message_photo_wrap[^>]*style=["'][^"']*url\(['"]?([^'")]+)['"]?\)/i
    );

    if (photoMatch) {
      image = photoMatch[1];
    }

    if (!image) {
      const imgMatch = block.match(
        /<img[^>]+src=["']([^"']+)["']/i
      );

      if (imgMatch) {
        image = imgMatch[1];
      }
    }

    const dateMatch = block.match(
      /datetime=["']([^"']+)["']/i
    );

    let date = null;

    if (dateMatch) {
      const parsed = new Date(
        dateMatch[1]
      );

      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!title) {
      continue;
    }

    posts.push({
      url: articleUrl,
      title: cleanTitle(title),
      description: cleanDescription(
        description,
        "domclick"
      ),
      image,
      date
    });
  }

  return posts;
}


async function parseDomclick(source, days) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  /* Сначала официальный блог */
  const blog = await fetchText(
    source.url
  );

  diagnostics.attempts.push({
    url: source.url,
    status: blog.status,
    ok: blog.ok
  });

  let posts = [];

  if (blog.ok) {
    const candidates = extractLinks(
      blog.text,
      source
    );

    posts = candidates;
  }

  /*
   * Если блог возвращает 401/403 или
   * не дал нормальных кандидатов —
   * используем официальный Telegram.
   */
  if (!posts.length) {
    const telegramUrl =
      "https://t.me/s/domclick";

    const telegram = await fetchText(
      telegramUrl
    );

    diagnostics.attempts.push({
      url: telegramUrl,
      status: telegram.status,
      ok: telegram.ok
    });

    if (telegram.ok) {
      posts =
        parseTelegramPosts(
          telegram.text
        );
    }
  }

  diagnostics.candidates =
    posts.length;

  const recentPosts = posts.filter(
    post => {
      if (!post.date) {
        return true;
      }

      return isRecent(
        post.date,
        days
      );
    }
  );

  diagnostics.recentCandidates =
    recentPosts.length;

  const items = [];

  for (const post of recentPosts) {
    if (
      /\/videos?\//i.test(post.url)
    ) {
      diagnostics.rejected++;
      continue;
    }

    if (
      !post.title ||
      !post.url
    ) {
      diagnostics.rejected++;
      continue;
    }

    items.push({
      id: makeId(post.url),
      source: source.id,
      sourceName: source.name,
      title: cleanTitle(post.title),
      description: cleanDescription(
        post.description,
        source.id
      ),
      url: normalizeUrl(post.url),
      image: absoluteUrl(
        post.image,
        post.url
      ),
      publishedAt: post.date
        ? post.date.toISOString()
        : null,
      topic: classifyTopic(
        post.title,
        post.description
      )
    });
  }

  return {
    items,
    diagnostics
  };
}


/* =========================================================
   XML HELPERS — CIAN RSS
========================================================= */

function extractXmlTag(xml, tag) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const re = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? cleanText(match[1])
    : "";
}


function extractXmlTagRaw(xml, tag) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const re = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? match[1]
    : "";
}


function extractXmlAttribute(xml, tag, attr) {
  const escapedTag =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const escapedAttr =
    attr.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const re = new RegExp(
    `<${escapedTag}\\b[^>]*${escapedAttr}=["']([^"']+)["']`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? decodeEntities(match[1])
    : "";
}


function parseCianRss(xml, source) {
  const items = [];

  const blocks =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (const block of blocks) {
    const title =
      cleanTitle(
        extractXmlTag(
          block,
          "title"
        )
      );

    const url =
      normalizeUrl(
        extractXmlTag(
          block,
          "link"
        )
      );

    const description =
      cleanDescription(
        extractXmlTag(
          block,
          "description"
        ),
        source.id
      );

    const pubDate =
      extractXmlTag(
        block,
        "pubDate"
      ) ||
      extractXmlTag(
        block,
        "dc:date"
      );

    let date = null;

    if (pubDate) {
      const parsed =
        new Date(pubDate);

      if (!Number.isNaN(
        parsed.getTime()
      )) {
        date = parsed;
      }
    }

    let image =
      extractXmlAttribute(
        block,
        "enclosure",
        "url"
      );

    if (!image) {
      image =
        extractXmlAttribute(
          block,
          "media:content",
          "url"
        );
    }

    if (!image) {
      image =
        extractXmlAttribute(
          block,
          "media:thumbnail",
          "url"
        );
    }

    if (!title || !url) {
      continue;
    }

    if (
      !/^https?:\/\/(?:[^/]+\.)?cian\.ru\//i.test(
        url
      )
    ) {
      continue;
    }

    items.push({
      id: makeId(url),
      source: source.id,
      sourceName: source.name,
      title,
      description,
      url,
      image: absoluteUrl(
        image,
        url
      ),
      publishedAt: date
        ? date.toISOString()
        : null,
      topic: classifyTopic(
        title,
        description
      )
    });
  }

  return items;
}


/* =========================================================
   CIAN
========================================================= */

function findCianRssUrl(html, baseUrl) {
  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const href = match[1];
    const text = cleanText(
      match[2]
    ).toLowerCase();

    if (
      /rss/.test(text) ||
      /rss/i.test(href) ||
      /новости\s*[-—]?\s*rss/i.test(text)
    ) {
      const url =
        absoluteUrl(
          href,
          baseUrl
        );

      if (url) {
        return url;
      }
    }
  }

  return "";
}


async function parseCian(source, days) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(
    source.url
  );

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error: page.error || null,
      httpStatus: page.status || null
    };
  }

  let rssUrl =
    findCianRssUrl(
      page.text,
      source.url
    );

  /*
   * Возможные RSS ссылки могут быть
   * прописаны через <link rel="alternate">
   */
  if (!rssUrl) {
    const rssMatch =
      page.text.match(
        /<link[^>]+(?:type=["']application\/rss\+xml["']|type=["']application\/xml["'])[^>]+href=["']([^"']+)["']/i
      );

    if (rssMatch) {
      rssUrl =
        absoluteUrl(
          rssMatch[1],
          source.url
        );
    }
  }

  let rssItems = [];

  if (rssUrl) {
    const rss =
      await fetchText(
        rssUrl,
        {
          headers: {
            "Accept":
              "application/rss+xml, application/xml, text/xml, */*"
          }
        }
      );

    if (rss.ok) {
      rssItems =
        parseCianRss(
          rss.text,
          source
        );
    }
  }

  /*
   * Если RSS не нашли/не прочитали —
   * fallback на ссылки журнала.
   */
  if (!rssItems.length) {
    const candidates =
      extractLinks(
        page.text,
        source
      );

    diagnostics.candidates =
      candidates.length;

    const results = [];

    for (
      let i = 0;
      i < candidates.length;
      i += ARTICLE_CONCURRENCY
    ) {
      const batch =
        candidates.slice(
          i,
          i + ARTICLE_CONCURRENCY
        );

      const batchResults =
        await Promise.all(
          batch.map(candidate =>
            fetchArticle(
              candidate,
              source
            )
          )
        );

      results.push(
        ...batchResults.filter(Boolean)
      );
    }

    for (const item of results) {
      if (
        item.publishedAt &&
        !isRecent(
          new Date(item.publishedAt),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      rssItems.push(item);
    }

    diagnostics.recentCandidates =
      rssItems.length;

    return {
      items: rssItems,
      diagnostics
    };
  }

  diagnostics.candidates =
    rssItems.length;

  for (const item of rssItems) {
    if (
      item.publishedAt &&
      !isRecent(
        new Date(item.publishedAt),
        days
      )
    ) {
      diagnostics.rejected++;
      continue;
    }

    diagnostics.recentCandidates++;
  }

  const recent =
    rssItems.filter(item => {
      if (!item.publishedAt) {
        return true;
      }

      return isRecent(
        new Date(item.publishedAt),
        days
      );
    });

  return {
    items: recent,
    diagnostics
  };
}


/* =========================================================
   DEDUPE
========================================================= */

function dedupeItems(items) {
  const result = [];
  const seenUrls = new Set();
  const seenTitles = new Set();

  for (const item of items) {
    const url =
      normalizeUrl(item.url);

    const title =
      cleanTitle(item.title)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    if (!url || !title) {
      continue;
    }

    if (seenUrls.has(url)) {
      continue;
    }

    /*
     * Заголовки полностью одинаковые
     * у разных источников тоже обычно
     * означают одну новость.
     */
    if (seenTitles.has(title)) {
      continue;
    }

    seenUrls.add(url);
    seenTitles.add(title);

    result.push({
      ...item,
      url
    });
  }

  return result;
}


/* =========================================================
   BALANCE SOURCES
========================================================= */

function balanceItems(items, limit) {
  const groups = {};

  for (const item of items) {
    if (!groups[item.source]) {
      groups[item.source] = [];
    }

    groups[item.source].push(item);
  }

  const sourceIds =
    Object.keys(groups);

  if (!sourceIds.length) {
    return [];
  }

  for (const sourceId of sourceIds) {
    groups[sourceId].sort(
      (a, b) => {
        const ad =
          a.publishedAt
            ? new Date(a.publishedAt).getTime()
            : 0;

        const bd =
          b.publishedAt
            ? new Date(b.publishedAt).getTime()
            : 0;

        return bd - ad;
      }
    );
  }

  const result = [];

  /*
   * Первый проход — равномерно
   * по источникам.
   */
  let added = true;

  while (
    result.length < limit &&
    added
  ) {
    added = false;

    for (const sourceId of sourceIds) {
      if (
        result.length >= limit
      ) {
        break;
      }

      if (
        groups[sourceId].length
      ) {
        result.push(
          groups[sourceId].shift()
        );

        added = true;
      }
    }
  }

  /*
   * Второй проход уже не нужен:
   * все группы постепенно исчерпываются.
   */

  result.sort(
    (a, b) => {
      const ad =
        a.publishedAt
          ? new Date(
              a.publishedAt
            ).getTime()
          : 0;

      const bd =
        b.publishedAt
          ? new Date(
              b.publishedAt
            ).getTime()
          : 0;

      return bd - ad;
    }
  );

  return result.slice(
    0,
    limit
  );
}


/* =========================================================
   CONCURRENCY
========================================================= */

async function mapSources() {
  const sourceList =
    Object.values(SOURCES);

  const results = [];

  for (const source of sourceList) {
    try {
      let result;

      if (
        source.parser === "krasdom"
      ) {
        result =
          await parseKrasdom(
            source,
            CURRENT_DAYS
          );
      }

      else if (
        source.parser === "domrf"
      ) {
        result =
          await parseDomrf(
            source,
            CURRENT_DAYS
          );
      }

      else if (
        source.parser === "domclick"
      ) {
        result =
          await parseDomclick(
            source,
            CURRENT_DAYS
          );
      }

      else if (
        source.parser === "yandex"
      ) {
        result =
          await parseYandex(
            source,
            CURRENT_DAYS
          );
      }

      else if (
        source.parser === "cian"
      ) {
        result =
          await parseCian(
            source,
            CURRENT_DAYS
          );
      }

      else {
        result =
          await parseGenericSource(
            source,
            CURRENT_DAYS
          );
      }

      results.push({
        source,
        result
      });
    } catch (error) {
      results.push({
        source,
        result: {
          items: [],
          diagnostics: {
            candidates: 0,
            recentCandidates: 0,
            rejected: 0,
            failed: 1
          },
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        }
      });
    }
  }

  return results;
}


/* =========================================================
   GLOBAL DAYS
========================================================= */

let CURRENT_DAYS =
  DEFAULT_DAYS;


/* =========================================================
   API
========================================================= */

module.exports = async function handler(
  req,
  res
) {
  /*
   * CORS
   */
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Cache-Control",
    "s-maxage=60, stale-while-revalidate=120"
  );

  if (
    req.method === "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  if (
    req.method !== "GET"
  ) {
    return res
      .status(405)
      .json({
        ok: false,
        error: "Method not allowed"
      });
  }

  try {
    const query =
      req.query || {};

    const category =
      String(
        query.category || "all"
      ).toLowerCase();

    let limit =
      parseInt(
        query.limit,
        10
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
        limit,
        MAX_LIMIT
      );

    let days =
      parseInt(
        query.days,
        10
      );

    if (
      !Number.isFinite(days) ||
      days <= 0
    ) {
      days =
        DEFAULT_DAYS;
    }

    /*
     * Ограничиваем разумный период,
     * чтобы случайный параметр days=999999
     * не заставлял API собирать архив.
     */
    days =
      Math.min(days, 30);

    CURRENT_DAYS =
      days;

    const sourceResults =
      await mapSources();

    let allItems = [];

    const sourceDiagnostics = {};

    for (
      const entry of sourceResults
    ) {
      const source =
        entry.source;

      const result =
        entry.result;

      sourceDiagnostics[
        source.id
      ] = {
        name: source.name,
        category:
          source.category,
        candidates:
          result.diagnostics
            ?.candidates || 0,
        recentCandidates:
          result.diagnostics
            ?.recentCandidates || 0,
        rejected:
          result.diagnostics
            ?.rejected || 0,
        failed:
          result.diagnostics
            ?.failed || 0
      };

      if (
        result.error
      ) {
        sourceDiagnostics[
          source.id
        ].error =
          result.error;
      }

      if (
        result.httpStatus
      ) {
        sourceDiagnostics[
          source.id
        ].httpStatus =
          result.httpStatus;
      }

      if (
        result.diagnostics &&
        result.diagnostics.attempts
      ) {
        sourceDiagnostics[
          source.id
        ].attempts =
          result.diagnostics.attempts;
      }

      allItems.push(
        ...(result.items || [])
      );
    }

    /*
     * Убираем дубли.
     */
    allItems =
      dedupeItems(
        allItems
      );

    /*
     * Фильтр категории.
     */
    if (
      category !== "all"
    ) {
      allItems =
        allItems.filter(
          item => {
            if (
              category === "krasnodar"
            ) {
              return (
                item.source ===
                  "93ru" ||
                item.source ===
                  "krasdom"
              );
            }

            if (
              category === "rostov"
            ) {
              return (
                item.source ===
                "161ru"
              );
            }

            if (
              category === "mortgage"
            ) {
              return (
                item.topic ===
                "mortgage"
              );
            }

            if (
              category === "newbuildings"
            ) {
              return (
                item.topic ===
                "newbuildings"
              );
            }

            if (
              category === "legislation"
            ) {
              return (
                item.topic ===
                "legislation"
              );
            }

            if (
              category === "useful"
            ) {
              return (
                item.topic ===
                "useful"
              );
            }

            if (
              category === "realty"
            ) {
              return (
                item.topic ===
                "realty"
              );
            }

            if (
              category === "federal"
            ) {
              return [
                "domrf",
                "domclick",
                "yandexrealty",
                "cian"
              ].includes(
                item.source
              );
            }

            return true;
          }
        );
    }

    /*
     * Финальное распределение.
     */
    const items =
      balanceItems(
        allItems,
        limit
      );

    return res
      .status(200)
      .json({
        ok: true,
        category,
        count: items.length,
        items,
        sources:
          sourceDiagnostics
      });

  } catch (error) {
    console.error(
      "NEWS API ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          error &&
          error.message
            ? error.message
            : String(error)
      });
  }
};
