// api/news.js

const crypto = require("crypto");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;
const DEFAULT_DAYS = 7;

const SOURCES = {
  "161ru": {
    name: "161.RU",
    category: "rostov",
    url: "https://161.ru/text/realty/"
  },

  "93ru": {
    name: "93.RU",
    category: "krasnodar",
    url: "https://93.ru/text/realty/"
  },

  krasdom: {
    name: "КРАСДОМ",
    category: "krasnodar",
    url: "https://krasdom.ru/news/"
  },

  domrf: {
    name: "ДОМ.РФ",
    category: "federal",
    url: "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/"
  },

  domclick: {
    name: "Домклик",
    category: "federal",
    url: "https://blog.domclick.ru/novosti"
  },

  yandexrealty: {
    name: "Яндекс Недвижимость",
    category: "federal",
    url: "https://realty.yandex.ru/journal/category/news/"
  },

  cian: {
    name: "ЦИАН",
    category: "federal",
    url: "https://krasnodar.cian.ru/magazine/"
  }
};


/* =========================================================
   БАЗОВЫЕ ФУНКЦИИ
========================================================= */

function cleanText(value) {
  if (!value) return "";

  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return "";
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}


function cleanTitle(value) {
  let text = cleanText(value);

  text = text
    .replace(/^новости\s*[-—:]\s*/i, "")
    .replace(/\s*\|\s*(161\.RU|93\.RU).*$/i, "")
    .replace(/\s*[-—]\s*(161\.RU|93\.RU).*$/i, "")
    .replace(/\s*[-—]\s*Новости на СПРОСИ\.ДОМ\.РФ.*$/i, "")
    .replace(/\s*[-—]\s*Новости.*СПРОСИ\.ДОМ\.РФ.*$/i, "")
    .trim();

  return text;
}


function cleanDescription(value) {
  let text = cleanText(value);

  text = text
    .replace(/please open telegram to view this post/gi, "")
    .replace(/view in telegram/gi, "")
    .replace(/\b\d+(?:\.\d+)?[KК]?\s*views?\b/gi, "")
    .replace(/\s*-\s*Новости\.\s*.*?в Журнале Недвижимости\.?\s*$/i, "")
    .replace(/\s*в Журнале Недвижимости\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}


function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function normalizeUrl(url, baseUrl) {
  try {
    if (!url) return null;

    const absolute = new URL(url, baseUrl);

    absolute.hash = "";

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "yclid",
      "ysclid",
      "from",
      "ref"
    ].forEach(key => {
      absolute.searchParams.delete(key);
    });

    return absolute.toString();
  } catch {
    return null;
  }
}


function stripTracking(url) {
  return normalizeUrl(url, url);
}


function makeId(source, url) {
  return crypto
    .createHash("sha256")
    .update(`${source}:${url}`)
    .digest("hex")
    .slice(0, 24);
}


/* =========================================================
   FETCH
========================================================= */

async function fetchText(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 15000
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ru-RU,ru;q=0.9,en;q=0.7",

        "Cache-Control":
          "no-cache",

        ...(options.headers || {})
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      text
    };

  } catch (error) {

    return {
      ok: false,
      status: 0,
      url,
      text: "",
      error: error.message || String(error)
    };

  } finally {

    clearTimeout(timeout);
  }
}


/* =========================================================
   META / JSON-LD
========================================================= */

function extractMeta(html, names) {
  for (const name of names) {

    const re1 = new RegExp(
      `<meta[^>]+(?:name|property)=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );

    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapeRegExp(name)}["']`,
      "i"
    );

    const m1 = html.match(re1);

    if (m1 && m1[1]) {
      return cleanText(m1[1]);
    }

    const m2 = html.match(re2);

    if (m2 && m2[1]) {
      return cleanText(m2[1]);
    }
  }

  return "";
}


function extractTitle(html) {
  const og = extractMeta(html, [
    "og:title",
    "twitter:title"
  ]);

  if (og) {
    return cleanTitle(og);
  }

  const title = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (title) {
    return cleanTitle(title[1]);
  }

  return "";
}


function extractDescription(html) {
  return cleanDescription(
    extractMeta(html, [
      "description",
      "og:description",
      "twitter:description"
    ])
  );
}


function extractImage(html, baseUrl) {
  const image = extractMeta(html, [
    "og:image",
    "og:image:url",
    "twitter:image"
  ]);

  if (!image) {
    return "";
  }

  return normalizeUrl(image, baseUrl) || "";
}


function extractJsonLd(html) {
  const result = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {

    const raw = match[1]
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();

    if (!raw) continue;

    try {

      result.push(
        JSON.parse(raw)
      );

    } catch {

      try {

        const fixed = raw
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");

        result.push(
          JSON.parse(fixed)
        );

      } catch {}
    }
  }

  return result;
}


function flattenJsonLd(value) {
  const result = [];

  function walk(node) {

    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    result.push(node);

    if (node["@graph"]) {
      walk(node["@graph"]);
    }
  }

  walk(value);

  return result;
}


function extractJsonLdArticle(html) {
  const blocks = extractJsonLd(html);

  for (const block of blocks) {

    const objects = flattenJsonLd(block);

    for (const obj of objects) {

      const type = Array.isArray(obj["@type"])
        ? obj["@type"].join(" ")
        : String(obj["@type"] || "");

      if (
        /NewsArticle|Article|BlogPosting|ReportageNewsArticle/i.test(
          type
        )
      ) {
        return obj;
      }
    }
  }

  return null;
}


/* =========================================================
   ДАТЫ
========================================================= */

const RU_MONTHS = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11
};


function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  return null;
}


function parseRussianDate(text) {
  if (!text) return null;

  const match = String(text).match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);

  const month =
    RU_MONTHS[
      match[2].toLowerCase()
    ];

  const year = Number(match[3]);

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }

  const date = new Date(
    year,
    month,
    day
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}


function extractDateFromText(html) {
  if (!html) return null;

  const clean = cleanText(html);

  const russianDate =
    parseRussianDate(clean);

  if (russianDate) {
    return russianDate;
  }

  const numeric = clean.match(
    /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/
  );

  if (numeric) {

    const date = new Date(
      Number(numeric[3]),
      Number(numeric[2]) - 1,
      Number(numeric[1])
    );

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const iso = clean.match(
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/
  );

  if (iso) {

    const date = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}


function extractDateFromUrl(url) {
  if (!url) return null;

  let match = url.match(
    /\/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})(?:\/|$)/
  );

  if (match) {

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  match = url.match(
    /[?&](?:date|published|published_at|publish_date)=(20\d{2})-(\d{1,2})-(\d{1,2})/i
  );

  if (match) {

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}


function extractDate(html, url) {

  const article =
    extractJsonLdArticle(html);

  if (article) {

    const candidates = [
      article.datePublished,
      article.dateCreated,
      article.dateModified
    ];

    for (const value of candidates) {

      const date =
        parseDate(value);

      if (date) {
        return date;
      }
    }
  }

  const metaDate =
    extractMeta(html, [
      "article:published_time",
      "datePublished",
      "date",
      "publish-date",
      "publication_date",
      "article:modified_time"
    ]);

  const parsedMeta =
    parseDate(metaDate);

  if (parsedMeta) {
    return parsedMeta;
  }

  const timeRegex =
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi;

  let timeMatch;

  while ((timeMatch = timeRegex.exec(html))) {

    const date =
      parseDate(timeMatch[1]);

    if (date) {
      return date;
    }
  }

  const russianDate =
    parseRussianDate(
      cleanText(html)
    );

  if (russianDate) {
    return russianDate;
  }

  return extractDateFromUrl(url);
}


/* =========================================================
   URL ФИЛЬТРЫ
========================================================= */

function isAllowed161(url) {
  try {

    const u = new URL(url);

    if (u.hostname !== "161.ru") {
      return false;
    }

    if (
      !/^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    if (
      /\/comments(?:\/|$)/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    return true;

  } catch {

    return false;
  }
}


function isAllowed93(url) {
  try {

    const u = new URL(url);

    if (u.hostname !== "93.ru") {
      return false;
    }

    if (
      !/^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    if (
      /\/comments(?:\/|$)/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    return true;

  } catch {

    return false;
  }
}


function isAllowedKrasdom(url) {
  try {

    const u = new URL(url);

    if (u.hostname !== "krasdom.ru") {
      return false;
    }

    return /^\/news\/\d+/i.test(
      u.pathname
    );

  } catch {

    return false;
  }
}


function isAllowedDomrf(url) {
  try {

    const u = new URL(url);

    if (
      !/xn--h1alcedd\.xn--d1aqf\.xn--p1ai$/i.test(
        u.hostname
      )
    ) {
      return false;
    }

    return /^\/news\/.+/i.test(
      u.pathname
    );

  } catch {

    return false;
  }
}


function isAllowedDomclick(url) {
  try {

    const u = new URL(url);

    if (
      u.hostname !== "blog.domclick.ru"
    ) {
      return false;
    }

    if (
      /\/videos?(?:\/|$)/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    if (
      !/^\/[^/]+\/.+/i.test(
        u.pathname
      )
    ) {
      return false;
    }

    return true;

  } catch {

    return false;
  }
}


function isAllowedYandex(url) {
  try {

    const u = new URL(url);

    if (
      u.hostname !== "realty.yandex.ru"
    ) {
      return false;
    }

    return /^\/journal\/(?:post|article)\//i.test(
      u.pathname
    );

  } catch {

    return false;
  }
}


function isAllowedCian(url) {
  try {

    const u = new URL(url);

    if (
      !/^(?:www\.)?cian\.ru$/i.test(u.hostname) &&
      !/^(?:www\.)?krasnodar\.cian\.ru$/i.test(u.hostname)
    ) {
      return false;
    }

    if (
      /^\/novosti-[^/]+-\d+/i.test(
        u.pathname
      ) ||
      /^\/magazine\/.+/i.test(
        u.pathname
      )
    ) {
      return true;
    }

    return false;

  } catch {

    return false;
  }
}


/* =========================================================
   ЯНДЕКС — ЗАРУБЕЖНЫЕ НОВОСТИ
========================================================= */

const YANDEX_FOREIGN_WORDS = [
  "лондон",
  "япони",
  "япон",
  "турци",
  "турц",
  "майами",
  "сша",
  "американ",
  "америк",
  "великобрит",
  "англи",
  "англий",
  "дубай",
  "оаэ",
  "сингапур",
  "таиланд",
  "тайланд",
  "бали",
  "индонези",
  "кипр",
  "испан",
  "франци",
  "француз",
  "итал",
  "германи",
  "герман",
  "катар",
  "саудовск",
  "зарубежн",
  "иностранн",
  "канад",
  "австрал",
  "мексик",
  "бразил",
  "китай",
  "китайск",
  "коре",
  "тайван",
  "индий",
  "индия",
  "израил",
  "египет",
  "черногор",
  "греци",
  "португал",
  "чехи",
  "чехия",
  "польш",
  "венгр",
  "серби",
  "армени",
  "грузи"
];


const YANDEX_FOREIGN_SLUGS = [
  "london",
  "yaponi",
  "yapon",
  "turci",
  "miami",
  "usa",
  "ssha",
  "america",
  "britain",
  "england",
  "dubai",
  "oae",
  "singapore",
  "thailand",
  "bali",
  "indonesia",
  "cyprus",
  "spain",
  "france",
  "italy",
  "germany",
  "qatar",
  "canada",
  "australia"
];


function isYandexForeignContent(item) {

  const text = [
    item.title || "",
    item.description || "",
    item.url || ""
  ]
    .join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");

  for (
    const word of YANDEX_FOREIGN_WORDS
  ) {

    if (text.includes(word)) {
      return true;
    }
  }

  for (
    const slug of YANDEX_FOREIGN_SLUGS
  ) {

    if (text.includes(slug)) {
      return true;
    }
  }

  return false;
}


/* =========================================================
   ДОМ.РФ — РЕЛЕВАНТНОСТЬ
========================================================= */

const DOMRF_RELEVANT_WORDS = [
  "ипотек",
  "недвижим",
  "квартир",
  "жиль",
  "дом",
  "новостро",
  "застрой",
  "строитель",
  "эскроу",
  "аренд",
  "росреестр",
  "егрн",
  "кадастр",
  "земел",
  "ижс",
  "маткапитал",
  "семейн",
  "жку",
  "коммунальн",
  "жилищ",
  "участок",
  "собственн",
  "покупк",
  "продаж",
  "кредит",
  "ставк",
  "банк"
];


function isDomrfRelevant(item) {

  const text = (
    `${item.title} ${item.description}`
  )
    .toLowerCase()
    .replace(/ё/g, "е");

  return DOMRF_RELEVANT_WORDS.some(
    word => text.includes(word)
  );
}


/* =========================================================
   КЛАССИФИКАЦИЯ
========================================================= */

function classifyTopic(
  title,
  description
) {

  const text =
    `${title} ${description}`.toLowerCase();

  if (
    /ипотек|ключев(ая|ой) ставк|банк|кредит|семейн(ая|ой) ипотек|ставк[аи]|рефинанс/i.test(
      text
    )
  ) {
    return "Ипотека и банки";
  }

  if (
    /закон|законодательств|госдум|правительств|путин|минфин|росреестр|маткапитал|налог|налогооблож|изменени[ея] правил/i.test(
      text
    )
  ) {
    return "Законодательство";
  }

  if (
    /новостройк|жк |жилой комплекс|застройщик|долев|строительств|эскроу|новый дом/i.test(
      text
    )
  ) {
    return "Новостройки";
  }

  if (
    /квартир|жиль[её]|недвижим|дом[аеу]?|рынок жилья|вторичк|аренд|продаж[ае] квартир/i.test(
      text
    )
  ) {
    return "Недвижимость";
  }

  return "Главное сегодня";
}


/* =========================================================
   ССЫЛКИ
========================================================= */

function extractLinks(
  html,
  baseUrl
) {

  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;

  let match;

  while ((match = regex.exec(html))) {

    const url =
      normalizeUrl(
        match[1],
        baseUrl
      );

    if (!url) continue;

    result.push(url);
  }

  return [
    ...new Set(result)
  ];
}


/* =========================================================
   ДАННЫЕ СТАТЬИ
========================================================= */

function extractArticleData(
  html,
  url
) {

  const jsonLd =
    extractJsonLdArticle(html);

  let title = "";
  let description = "";
  let image = "";
  let publishedAt = null;

  if (jsonLd) {

    if (
      typeof jsonLd.headline ===
      "string"
    ) {
      title =
        cleanTitle(
          jsonLd.headline
        );
    }

    if (
      typeof jsonLd.description ===
      "string"
    ) {
      description =
        cleanDescription(
          jsonLd.description
        );
    }

    if (jsonLd.image) {

      if (
        typeof jsonLd.image ===
        "string"
      ) {

        image =
          normalizeUrl(
            jsonLd.image,
            url
          ) || "";

      } else if (
        Array.isArray(
          jsonLd.image
        ) &&
        jsonLd.image.length
      ) {

        const value =
          typeof jsonLd.image[0] ===
          "string"
            ? jsonLd.image[0]
            : jsonLd.image[0]?.url;

        image =
          normalizeUrl(
            value,
            url
          ) || "";

      } else if (
        typeof jsonLd.image ===
        "object"
      ) {

        image =
          normalizeUrl(
            jsonLd.image.url,
            url
          ) || "";
      }
    }

    publishedAt =
      parseDate(
        jsonLd.datePublished
      ) ||
      parseDate(
        jsonLd.dateCreated
      ) ||
      parseDate(
        jsonLd.dateModified
      );
  }

  if (!title) {
    title =
      extractTitle(html);
  }

  if (!description) {
    description =
      extractDescription(html);
  }

  if (!image) {
    image =
      extractImage(
        html,
        url
      );
  }

  if (!publishedAt) {
    publishedAt =
      extractDate(
        html,
        url
      );
  }

  return {
    title: cleanTitle(title),
    description: cleanDescription(description),
    image,
    publishedAt
  };
}


/* =========================================================
   ITEM
========================================================= */

function createItem({
  source,
  sourceName,
  category,
  url,
  title,
  description,
  image,
  publishedAt
}) {

  if (!title || !url) {
    return null;
  }

  const date =
    publishedAt instanceof Date
      ? publishedAt
      : parseDate(publishedAt);

  if (!date) {
    return null;
  }

  return {
    id: makeId(
      source,
      url
    ),

    source,

    sourceName,

    category,

    topic:
      classifyTopic(
        title,
        description
      ),

    title:
      cleanTitle(title),

    description:
      cleanDescription(
        description
      ),

    url:
      stripTracking(url),

    image:
      image || "",

    publishedAt:
      date.toISOString()
  };
}


/* =========================================================
   ОБЩИЙ ПАРСЕР
========================================================= */

async function parseGenericSource(
  sourceKey,
  source,
  html,
  stats
) {

  let urls =
    extractLinks(
      html,
      source.url
    );

  urls =
    urls.filter(url => {

      if (sourceKey === "161ru") {
        return isAllowed161(url);
      }

      if (sourceKey === "93ru") {
        return isAllowed93(url);
      }

      if (sourceKey === "krasdom") {
        return isAllowedKrasdom(url);
      }

      if (sourceKey === "domrf") {
        return isAllowedDomrf(url);
      }

      if (sourceKey === "yandexrealty") {
        return isAllowedYandex(url);
      }

      if (sourceKey === "cian") {
        return isAllowedCian(url);
      }

      return false;
    });

  urls = [
    ...new Set(urls)
  ];

  stats.candidates =
    urls.length;

  const items = [];

  for (
    const url of urls.slice(
      0,
      100
    )
  ) {

    try {

      const page =
        await fetchText(url);

      if (
        !page.ok ||
        !page.text
      ) {
        stats.failed++;
        continue;
      }

      const data =
        extractArticleData(
          page.text,
          url
        );

      if (
        !data.title ||
        !data.publishedAt
      ) {
        stats.rejected++;
        continue;
      }

      const item =
        createItem({
          source: sourceKey,
          sourceName: source.name,
          category: source.category,
          url,
          title: data.title,
          description:
            data.description,
          image: data.image,
          publishedAt:
            data.publishedAt
        });

      if (!item) {
        stats.rejected++;
        continue;
      }

      if (
        sourceKey ===
        "yandexrealty" &&
        isYandexForeignContent(
          item
        )
      ) {
        stats.rejected++;
        continue;
      }

      if (
        sourceKey ===
        "domrf" &&
        !isDomrfRelevant(item)
      ) {
        stats.rejected++;
        continue;
      }

      items.push(item);

    } catch {

      stats.failed++;
    }
  }

  return items;
}


/* =========================================================
   TELEGRAM DOMCLICK
========================================================= */

function extractTelegramPosts(html) {

  const posts = [];

  /*
   * Telegram сейчас может несколько раз менять
   * HTML-разметку, поэтому не привязываемся
   * к конкретному wrapper.
   */

  const regex =
    /<div[^>]+class=["'][^"']*tgme_widget_message\b[^"']*["'][^>]*>/gi;

  const starts = [];

  let match;

  while (
    (match = regex.exec(html))
  ) {
    starts.push(
      match.index
    );
  }

  for (
    let i = 0;
    i < starts.length;
    i++
  ) {

    const start =
      starts[i];

    const end =
      starts[i + 1] ||
      html.length;

    const block =
      html.slice(
        start,
        end
      );

    posts.push({
      html: block,
      start,
      end
    });
  }

  /*
   * Если wrapper не найден,
   * создаем fallback-посты по ссылкам.
   */

  if (!posts.length) {

    const linkRegex =
      /href=["'](https?:\/\/blog\.domclick\.ru\/[^"'<> ]+)["']/gi;

    let linkMatch;

    while (
      (linkMatch =
        linkRegex.exec(html))
    ) {

      posts.push({
        html,
        start:
          linkMatch.index,
        end:
          linkMatch.index +
          linkMatch[0].length
      });
    }
  }

  return posts;
}


function extractTelegramText(
  block
) {

  const textMatch =
    block.match(
      /<div[^>]+class=["'][^"']*\btgme_widget_message_text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );

  if (!textMatch) {
    return "";
  }

  return cleanDescription(
    textMatch[1]
  );
}


function extractTelegramTitle(
  block,
  articleTitle
) {

  if (articleTitle) {
    return cleanTitle(
      articleTitle
    );
  }

  const text =
    extractTelegramText(
      block
    );

  if (!text) {
    return "";
  }

  const parts =
    text
      .split(/\n+/)
      .map(
        item =>
          cleanText(item)
      )
      .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  /*
   * Если Telegram-пост начинается
   * с нормального заголовка — используем его.
   */

  let title =
    parts[0];

  /*
   * Убираем служебные ссылки.
   */

  title =
    title
      .replace(
        /https?:\/\/\S+/gi,
        ""
      )
      .trim();

  if (
    title.length < 20 &&
    parts.length > 1
  ) {
    title =
      parts
        .slice(0, 2)
        .join(" ")
        .trim();
  }

  /*
   * Не допускаем огромный Telegram-текст
   * в поле title.
   */

  if (
    title.length > 180
  ) {
    title =
      title.slice(
        0,
        177
      ) + "...";
  }

  return cleanTitle(
    title
  );
}


function extractTelegramDate(
  block
) {

  /*
   * Основной вариант:
   * Telegram time datetime.
   */

  const time =
    block.match(
      /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i
    );

  if (time) {

    const date =
      parseDate(
        time[1]
      );

    if (date) {
      return date;
    }
  }

  /*
   * Второй вариант:
   * data-time / title.
   */

  const dataTime =
    block.match(
      /(?:data-time|data-timestamp|datetime)=["']([^"']+)["']/i
    );

  if (dataTime) {

    const date =
      parseDate(
        dataTime[1]
      );

    if (date) {
      return date;
    }

    const timestamp =
      Number(
        dataTime[1]
      );

    if (
      Number.isFinite(
        timestamp
      )
    ) {

      const dateFromTimestamp =
        new Date(
          timestamp > 10000000000
            ? timestamp
            : timestamp * 1000
        );

      if (
        !Number.isNaN(
          dateFromTimestamp.getTime()
        )
      ) {
        return dateFromTimestamp;
      }
    }
  }

  /*
   * Третий вариант:
   * дата в тексте поста.
   */

  return extractDateFromText(
    block
  );
}


async function parseDomclick(
  stats
) {

  const items = [];

  const attempts = [];

  /*
   * Пробуем официальный блог.
   */

  const blog =
    await fetchText(
      "https://blog.domclick.ru/novosti"
    );

  attempts.push({
    url:
      "https://blog.domclick.ru/novosti",
    status:
      blog.status,
    ok:
      blog.ok
  });

  /*
   * На данный момент блог отдает 401,
   * поэтому основной fallback — Telegram.
   */

  if (
    !blog.ok ||
    !blog.text
  ) {

    const telegram =
      await fetchText(
        "https://t.me/s/domclick"
      );

    attempts.push({
      url:
        "https://t.me/s/domclick",
      status:
        telegram.status,
      ok:
        telegram.ok
    });

    if (
      telegram.ok &&
      telegram.text
    ) {

      const posts =
        extractTelegramPosts(
          telegram.text
        );

      const articleLinks =
        [];

      /*
       * Обрабатываем каждый Telegram-пост
       * отдельно, чтобы дата не терялась.
       */

      for (
        const post of posts
      ) {

        const linkRegex =
          /href=["'](https?:\/\/blog\.domclick\.ru\/[^"'<> ]+)["']/gi;

        let linkMatch;

        while (
          (linkMatch =
            linkRegex.exec(
              post.html
            ))
        ) {

          const rawUrl =
            linkMatch[1];

          const url =
            normalizeUrl(
              rawUrl,
              "https://t.me/"
            );

          if (!url) continue;

          if (
            !isAllowedDomclick(
              url
            )
          ) {
            continue;
          }

          if (
            /\/videos?(?:\/|$)/i.test(
              url
            )
          ) {
            continue;
          }

          articleLinks.push({
            url,
            post
          });
        }
      }

      /*
       * Убираем дубли.
       */

      const unique =
        new Map();

      for (
        const item of articleLinks
      ) {

        if (
          !unique.has(
            item.url
          )
        ) {
          unique.set(
            item.url,
            item
          );
        }
      }

      const links =
        [
          ...unique.values()
        ];

      stats.candidates =
        links.length;

      for (
        const entry of links.slice(
          0,
          50
        )
      ) {

        try {

          const url =
            entry.url;

          const post =
            entry.post;

          /*
           * Данные Telegram-поста.
           */

          const telegramText =
            extractTelegramText(
              post.html
            );

          const telegramDate =
            extractTelegramDate(
              post.html
            );

          /*
           * Пробуем открыть саму статью.
           */

          const article =
            await fetchText(
              url
            );

          let data = {
            title: "",
            description: "",
            image: "",
            publishedAt:
              null
          };

          if (
            article.ok &&
            article.text
          ) {

            data =
              extractArticleData(
                article.text,
                url
              );
          }

          /*
           * Если дата статьи отсутствует,
           * используем дату Telegram.
           */

          if (
            !data.publishedAt &&
            telegramDate
          ) {
            data.publishedAt =
              telegramDate;
          }

          /*
           * Если title статьи не получили,
           * берем из Telegram.
           */

          if (!data.title) {

            data.title =
              extractTelegramTitle(
                post.html,
                ""
              );
          }

          /*
           * Если description статьи нет,
           * используем Telegram.
           */

          if (
            !data.description &&
            telegramText
          ) {

            data.description =
              telegramText;
          }

          /*
           * Иногда Telegram-пост начинается
           * с заголовка + сразу идет описание.
           * В таком случае убираем заголовок
           * из description.
           */

          if (
            data.title &&
            data.description
          ) {

            const titleLower =
              data.title
                .toLowerCase()
                .trim();

            const descriptionLower =
              data.description
                .toLowerCase()
                .trim();

            if (
              descriptionLower.startsWith(
                titleLower
              )
            ) {

              data.description =
                data.description
                  .slice(
                    data.title.length
                  )
                  .trim();
            }
          }

          if (
            !data.title ||
            !data.publishedAt
          ) {

            stats.rejected++;
            continue;
          }

          const item =
            createItem({
              source:
                "domclick",

              sourceName:
                "Домклик",

              category:
                "federal",

              url,

              title:
                data.title,

              description:
                data.description,

              image:
                data.image,

              publishedAt:
                data.publishedAt
            });

          if (!item) {

            stats.rejected++;
            continue;
          }

          items.push(
            item
          );

        } catch {

          stats.failed++;
        }
      }

      stats.attempts =
        attempts;

      return items;
    }

    stats.attempts =
      attempts;

    return items;
  }

  /*
   * Если блог Домклика когда-нибудь
   * снова начнет отдавать страницу напрямую.
   */

  const genericStats = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const generic =
    await parseGenericSource(
      "domclick",
      SOURCES.domclick,
      blog.text,
      genericStats
    );

  stats.candidates =
    genericStats.candidates;

  stats.rejected +=
    genericStats.rejected;

  stats.failed +=
    genericStats.failed;

  stats.attempts =
    attempts;

  return generic;
}


/* =========================================================
   ЦИАН
========================================================= */

function extractCianRssLinks(
  html
) {

  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {

    const href =
      normalizeUrl(
        match[1],
        SOURCES.cian.url
      );

    const text =
      cleanText(
        match[2]
      );

    if (!href) {
      continue;
    }

    if (
      /rss|feed|новост/i.test(href) ||
      /rss|новост/i.test(text)
    ) {
      result.push(
        href
      );
    }
  }

  return [
    ...new Set(result)
  ];
}


function parseXmlItems(
  xml
) {

  const items = [];

  const itemRegex =
    /<item\b[\s\S]*?<\/item>/gi;

  let match;

  while (
    (match =
      itemRegex.exec(xml))
  ) {

    const block =
      match[0];

    const title =
      extractXmlTag(
        block,
        "title"
      );

    const link =
      extractXmlTag(
        block,
        "link"
      );

    const description =
      extractXmlTag(
        block,
        "description"
      );

    const pubDate =
      extractXmlTag(
        block,
        "pubDate"
      ) ||
      extractXmlTag(
        block,
        "dc:date"
      ) ||
      extractXmlTag(
        block,
        "published"
      );

    let image = "";

    const enclosure =
      block.match(
        /<enclosure[^>]+url=["']([^"']+)["']/i
      );

    if (enclosure) {
      image =
        enclosure[1];
    }

    if (
      title &&
      link
    ) {

      items.push({
        title:
          cleanTitle(title),

        link:
          stripTracking(link),

        description:
          cleanDescription(
            description
          ),

        pubDate:
          parseDate(
            pubDate
          ),

        image
      });
    }
  }

  return items;
}


function extractXmlTag(
  block,
  tag
) {

  const regex =
    new RegExp(
      `<${escapeRegExp(tag)}[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`,
      "i"
    );

  const match =
    block.match(
      regex
    );

  if (!match) {
    return "";
  }

  return cleanText(
    match[1]
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        "$1"
      )
  );
}


async function parseCian(
  stats
) {

  const items = [];

  const page =
    await fetchText(
      SOURCES.cian.url
    );

  if (
    !page.ok ||
    !page.text
  ) {

    stats.failed++;
    return items;
  }

  let rssLinks =
    extractCianRssLinks(
      page.text
    );

  rssLinks = [
    ...rssLinks,

    "https://www.cian.ru/rss/novosti.xml",

    "https://www.cian.ru/rss/"
  ];

  rssLinks = [
    ...new Set(
      rssLinks
    )
  ];

  let rss = null;

  for (
    const rssUrl of rssLinks
  ) {

    const response =
      await fetchText(
        rssUrl
      );

    if (
      response.ok &&
      response.text &&
      /<item\b/i.test(
        response.text
      )
    ) {

      rss =
        response.text;

      break;
    }
  }

  if (rss) {

    const parsed =
      parseXmlItems(
        rss
      );

    stats.candidates =
      parsed.length;

    for (
      const article of parsed
    ) {

      if (!article.pubDate) {

        stats.rejected++;
        continue;
      }

      if (
        !isAllowedCian(
          article.link
        )
      ) {

        stats.rejected++;
        continue;
      }

      const item =
        createItem({
          source:
            "cian",

          sourceName:
            "ЦИАН",

          category:
            "federal",

          url:
            article.link,

          title:
            article.title,

          description:
            article.description,

          image:
            normalizeUrl(
              article.image,
              article.link
            ) || "",

          publishedAt:
            article.pubDate
        });

      if (!item) {

        stats.rejected++;
        continue;
      }

      items.push(
        item
      );
    }

    return items;
  }

  /*
   * HTML fallback
   */

  let links =
    extractLinks(
      page.text,
      SOURCES.cian.url
    );

  links =
    links.filter(
      isAllowedCian
    );

  stats.candidates =
    links.length;

  for (
    const url of links.slice(
      0,
      100
    )
  ) {

    try {

      const article =
        await fetchText(
          url
        );

      if (
        !article.ok ||
        !article.text
      ) {

        stats.failed++;
        continue;
      }

      const data =
        extractArticleData(
          article.text,
          url
        );

      if (
        !data.title ||
        !data.publishedAt
      ) {

        stats.rejected++;
        continue;
      }

      const item =
        createItem({
          source:
            "cian",

          sourceName:
            "ЦИАН",

          category:
            "federal",

          url,

          title:
            data.title,

          description:
            data.description,

          image:
            data.image,

          publishedAt:
            data.publishedAt
        });

      if (!item) {

        stats.rejected++;
        continue;
      }

      items.push(
        item
      );

    } catch {

      stats.failed++;
    }
  }

  return items;
}


/* =========================================================
   АКТУАЛЬНОСТЬ
========================================================= */

function isRecent(
  date,
  days
) {

  if (!date) {
    return false;
  }

  const timestamp =
    date instanceof Date
      ? date.getTime()
      : new Date(date).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return false;
  }

  return (
    timestamp >=
    Date.now() -
      days *
        24 *
        60 *
        60 *
        1000
  );
}


/* =========================================================
   ДЕДУПЛИКАЦИЯ
========================================================= */

function normalizeStoryTitle(
  title
) {

  return String(
    title || ""
  )
    .toLowerCase()
    .replace(
      /ё/g,
      "е"
    )
    .replace(
      /«|»|"|„|“|”/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function dedupeItems(
  items,
  category
) {

  const result = [];

  const map =
    new Map();

  for (
    const item of items
  ) {

    const key =
      normalizeStoryTitle(
        item.title
      );

    if (!key) {

      result.push(
        item
      );

      continue;
    }

    if (
      !map.has(key)
    ) {

      map.set(
        key,
        item
      );

      result.push(
        item
      );

      continue;
    }

    const existing =
      map.get(key);

    /*
     * Только для общей ленты
     * удаляем одинаковые новости
     * 161.RU / 93.RU.
     */

    if (
      category === "all" &&
      (
        (
          existing.source ===
            "161ru" &&
          item.source ===
            "93ru"
        ) ||
        (
          existing.source ===
            "93ru" &&
          item.source ===
            "161ru"
        )
      )
    ) {

      const existingScore =
        (
          existing.description ||
          ""
        ).length +
        (
          existing.image
            ? 100
            : 0
        );

      const newScore =
        (
          item.description ||
          ""
        ).length +
        (
          item.image
            ? 100
            : 0
        );

      if (
        newScore >
        existingScore
      ) {

        const index =
          result.indexOf(
            existing
          );

        if (
          index >= 0
        ) {
          result[index] =
            item;
        }

        map.set(
          key,
          item
        );
      }
    }
  }

  return result;
}


/* =========================================================
   БАЛАНС ИСТОЧНИКОВ
========================================================= */

function balanceItems(
  items,
  limit
) {

  if (
    items.length <=
    limit
  ) {

    return items.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );
  }

  const groups =
    new Map();

  for (
    const item of items
  ) {

    if (
      !groups.has(
        item.source
      )
    ) {

      groups.set(
        item.source,
        []
      );
    }

    groups
      .get(item.source)
      .push(item);
  }

  for (
    const list of groups.values()
  ) {

    list.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );
  }

  const result = [];

  let added = true;

  while (
    result.length <
      limit &&
    added
  ) {

    added = false;

    for (
      const list of groups.values()
    ) {

      if (!list.length) {
        continue;
      }

      result.push(
        list.shift()
      );

      added = true;

      if (
        result.length >=
        limit
      ) {
        break;
      }
    }
  }

  return result;
}


/* =========================================================
   КАТЕГОРИЯ
========================================================= */

function filterCategory(
  items,
  category
) {

  if (
    !category ||
    category === "all"
  ) {
    return items;
  }

  const normalized =
    String(category)
      .trim()
      .toLowerCase();

  return items.filter(
    item => {

      const itemCategory =
        String(
          item.category || ""
        ).toLowerCase();

      const topic =
        String(
          item.topic || ""
        ).toLowerCase();

      if (
        normalized ===
          "rostov" ||
        normalized ===
          "ростов"
      ) {

        return (
          itemCategory ===
          "rostov"
        );
      }

      if (
        normalized ===
          "krasnodar" ||
        normalized ===
          "краснодар"
      ) {

        return (
          itemCategory ===
          "krasnodar"
        );
      }

      if (
        normalized ===
          "federal" ||
        normalized ===
          "федеральное"
      ) {

        return (
          itemCategory ===
          "federal"
        );
      }

      return (
        topic ===
          normalized ||
        topic ===
          String(category)
            .toLowerCase()
      );
    }
  );
}


/* =========================================================
   STATS
========================================================= */

function createStats(
  source
) {

  return {
    name:
      source.name,

    category:
      source.category,

    candidates: 0,

    recentCandidates: 0,

    rejected: 0,

    failed: 0
  };
}


/* =========================================================
   API
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {

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

    if (
      req.method ===
      "OPTIONS"
    ) {

      return res
        .status(204)
        .end();
    }

    if (
      req.method !==
      "GET"
    ) {

      return res
        .status(405)
        .json({
          ok: false,
          error:
            "Method Not Allowed"
        });
    }

    const category =
      String(
        req.query?.category ||
          "all"
      ).trim();

    let limit =
      Number(
        req.query?.limit ||
          DEFAULT_LIMIT
      );

    let days =
      Number(
        req.query?.days ||
          DEFAULT_DAYS
      );

    if (
      !Number.isFinite(
        limit
      )
    ) {

      limit =
        DEFAULT_LIMIT;
    }

    if (
      !Number.isFinite(
        days
      )
    ) {

      days =
        DEFAULT_DAYS;
    }

    limit =
      Math.max(
        1,
        Math.min(
          MAX_LIMIT,
          Math.floor(limit)
        )
      );

    days =
      Math.max(
        1,
        Math.min(
          30,
          Math.floor(days)
        )
      );

    const allItems = [];

    const sourcesStats = {};


    /* =====================================================
       161.RU
    ===================================================== */

    {
      const source =
        SOURCES["161ru"];

      const stats =
        createStats(
          source
        );

      try {

        const page =
          await fetchText(
            source.url
          );

        if (
          page.ok &&
          page.text
        ) {

          const items =
            await parseGenericSource(
              "161ru",
              source,
              page.text,
              stats
            );

          for (
            const item of items
          ) {

            if (
              isRecent(
                item.publishedAt,
                days
              )
            ) {

              stats.recentCandidates++;

              allItems.push(
                item
              );

            } else {

              stats.rejected++;
            }
          }

        } else {

          stats.failed++;
        }

      } catch {

        stats.failed++;
      }

      sourcesStats["161ru"] =
        stats;
    }


    /* =====================================================
       93.RU
    ===================================================== */

    {
      const source =
        SOURCES["93ru"];

      const stats =
        createStats(
          source
        );

      try {

        const page =
          await fetchText(
            source.url
          );

        if (
          page.ok &&
          page.text
        ) {

          const items =
            await parseGenericSource(
              "93ru",
              source,
              page.text,
              stats
            );

          for (
            const item of items
          ) {

            if (
              isRecent(
                item.publishedAt,
                days
              )
            ) {

              stats.recentCandidates++;

              allItems.push(
                item
              );

            } else {

              stats.rejected++;
            }
          }

        } else {

          stats.failed++;
        }

      } catch {

        stats.failed++;
      }

      sourcesStats["93ru"] =
        stats;
    }


    /* =====================================================
       КРАСДОМ
    ===================================================== */

    {
      const source =
        SOURCES.krasdom;

      const stats =
        createStats(
          source
        );

      try {

        const page =
          await fetchText(
            source.url
          );

        if (
          page.ok &&
          page.text
        ) {

          const items =
            await parseGenericSource(
              "krasdom",
              source,
              page.text,
              stats
            );

          for (
            const item of items
          ) {

            if (
              isRecent(
                item.publishedAt,
                days
              )
            ) {

              stats.recentCandidates++;

              allItems.push(
                item
              );

            } else {

              stats.rejected++;
            }
          }

        } else {

          stats.failed++;
        }

      } catch {

        stats.failed++;
      }

      sourcesStats.krasdom =
        stats;
    }


    /* =====================================================
       ДОМ.РФ
    ===================================================== */

    {
      const source =
        SOURCES.domrf;

      const stats =
        createStats(
          source
        );

      try {

        const page =
          await fetchText(
            source.url
          );

        if (
          page.ok &&
          page.text
        ) {

          const items =
            await parseGenericSource(
              "domrf",
              source,
              page.text,
              stats
            );

          for (
            const item of items
          ) {

            if (
              isRecent(
                item.publishedAt,
                days
              )
            ) {

              stats.recentCandidates++;

              allItems.push(
                item
              );

            } else {

              stats.rejected++;
            }
          }

        } else {

          stats.failed++;
        }

      } catch {

        stats.failed++;
      }

      sourcesStats.domrf =
        stats;
    }


    /* =====================================================
       ДОМКЛИК
    ===================================================== */

    {
      const source =
        SOURCES.domclick;

      const stats =
        createStats(
          source
        );

      try {

        const items =
          await parseDomclick(
            stats
          );

        for (
          const item of items
        ) {

          if (
            isRecent(
              item.publishedAt,
              days
            )
          ) {

            stats.recentCandidates++;

            allItems.push(
              item
            );

          } else {

            stats.rejected++;
          }
        }

      } catch {

        stats.failed++;
      }

      sourcesStats.domclick =
        stats;
    }


    /* =====================================================
       ЯНДЕКС НЕДВИЖИМОСТЬ
    ===================================================== */

    {
      const source =
        SOURCES.yandexrealty;

      const stats =
        createStats(
          source
        );

      try {

        const page =
          await fetchText(
            source.url
          );

        if (
          page.ok &&
          page.text
        ) {

          const items =
            await parseGenericSource(
              "yandexrealty",
              source,
              page.text,
              stats
            );

          for (
            const item of items
          ) {

            if (
              isRecent(
                item.publishedAt,
                days
              )
            ) {

              stats.recentCandidates++;

              allItems.push(
                item
              );

            } else {

              stats.rejected++;
            }
          }

        } else {

          stats.failed++;
        }

      } catch {

        stats.failed++;
      }

      sourcesStats.yandexrealty =
        stats;
    }


    /* =====================================================
       ЦИАН
    ===================================================== */

    {
      const source =
        SOURCES.cian;

      const stats =
        createStats(
          source
        );

      try {

        const items =
          await parseCian(
            stats
          );

        for (
          const item of items
        ) {

          if (
            isRecent(
              item.publishedAt,
              days
            )
          ) {

            stats.recentCandidates++;

            allItems.push(
              item
            );

          } else {

            stats.rejected++;
          }
        }

      } catch {

        stats.failed++;
      }

      sourcesStats.cian =
        stats;
    }


    /* =====================================================
       ФИНАЛЬНАЯ ОБРАБОТКА
    ===================================================== */

    let filtered =
      filterCategory(
        allItems,
        category
      );

    filtered =
      dedupeItems(
        filtered,
        category
      );

    filtered.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );

    filtered =
      balanceItems(
        filtered,
        limit
      );

    filtered.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );


    /* =====================================================
       УДАЛЕНИЕ ДУБЛЕЙ URL
    ===================================================== */

    const seenUrls =
      new Set();

    filtered =
      filtered.filter(
        item => {

          const url =
            stripTracking(
              item.url
            );

          if (
            seenUrls.has(
              url
            )
          ) {
            return false;
          }

          seenUrls.add(
            url
          );

          return true;
        }
      );


    /* =====================================================
       RESPONSE
    ===================================================== */

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );

    return res
      .status(200)
      .json({

        ok: true,

        category,

        count:
          filtered.length,

        items:
          filtered.slice(
            0,
            limit
          ),

        sources:
          sourcesStats
      });
  };
