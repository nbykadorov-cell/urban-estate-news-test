// api/news.js

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
    parser: "generic"
  },

  "domrf": {
    id: "domrf",
    name: "ДОМ.РФ",
    category: "federal",
    url: "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/",
    parser: "generic"
  },

  "domclick": {
    id: "domclick",
    name: "Домклик",
    category: "federal",
    url: "https://blog.domclick.ru/novosti",
    telegramUrl: "https://t.me/s/domclick",
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
    url: "https://www.cian.ru/magazine/",
    fallbackUrl: "https://krasnodar.cian.ru/magazine/",
    parser: "cian"
  }
};


// ============================================================
// НАСТРОЙКИ
// ============================================================

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;

const DEFAULT_DAYS = 7;
const MAX_DAYS = 31;

const SOURCE_CANDIDATES_LIMIT = 15;

const REQUEST_TIMEOUT = 15000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/154.0.0.0 Safari/537.36 " +
  "UrbanEstateNews/1.0";


// ============================================================
// HTTP
// ============================================================

async function fetchText(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeout || REQUEST_TIMEOUT);

  try {
    const headers = {
      "User-Agent": USER_AGENT,
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);

      error.httpStatus = response.status;
      error.body = text.slice(0, 500);

      throw error;
    }

    return {
      text,
      status: response.status,
      finalUrl: response.url || url
    };

  } finally {
    clearTimeout(timeout);
  }
}


// ============================================================
// TEXT HELPERS
// ============================================================

function decodeEntities(value) {
  if (!value) return "";

  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
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


function stripHtml(value) {
  if (!value) return "";

  return decodeEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}


function cleanText(value) {
  if (!value) return "";

  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}


function cleanDescription(value) {
  let text = cleanText(value);

  text = text
    .replace(/^Новости?\s*[—-]\s*/i, "")
    .replace(/^Статьи?\s*[—-]\s*/i, "")
    .replace(/^Циан\.Журнал\s*[—-]\s*/i, "")
    .replace(/\s+в\s+Журнале\s+Недвижимости\s*$/i, "")
    .replace(/\s+в\s+Циан\.Журнале\s*$/i, "")
    .trim();

  return text;
}


function normalizeTitle(value) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// URL HELPERS
// ============================================================

function absoluteUrl(url, baseUrl) {
  if (!url) return null;

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}


function normalizeUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    u.hash = "";

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "erid"
    ].forEach(key => {
      u.searchParams.delete(key);
    });

    return u.href.replace(/\/+$/, "");
  } catch {
    return String(url).trim();
  }
}


function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || "");
}


function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}


// ============================================================
// HTML ATTRIBUTES
// ============================================================

function getAttribute(tag, name) {
  if (!tag) return "";

  const regex = new RegExp(
    `${name}\\s*=\\s*["']([^"']*)["']`,
    "i"
  );

  const match = tag.match(regex);

  return match ? decodeEntities(match[1]) : "";
}


// ============================================================
// META
// ============================================================

function getMeta(html, names) {
  if (!html) return "";

  const list = Array.isArray(names) ? names : [names];

  for (const wanted of list) {
    const regex1 = new RegExp(
      `<meta[^>]+(?:name|property)=["']${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    );

    const regex2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
      "i"
    );

    const match = html.match(regex1) || html.match(regex2);

    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}


// ============================================================
// JSON-LD
// ============================================================

function extractJsonLd(html) {
  const result = [];

  if (!html) return result;

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
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        result.push(...parsed);
      } else {
        result.push(parsed);
      }
    } catch {
      // Некоторые сайты кладут некорректный JSON-LD.
    }
  }

  return result;
}


function flattenJsonLd(value, result = []) {
  if (!value) return result;

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenJsonLd(item, result);
    }

    return result;
  }

  if (typeof value === "object") {
    result.push(value);

    if (value["@graph"]) {
      flattenJsonLd(value["@graph"], result);
    }

    if (value.mainEntity) {
      flattenJsonLd(value.mainEntity, result);
    }

    if (value.itemListElement) {
      flattenJsonLd(value.itemListElement, result);
    }
  }

  return result;
}


// ============================================================
// DATE
// ============================================================

function parseDateValue(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (!text) return null;

  const direct = new Date(text);

  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return parseRussianDate(text);
}


function parseRussianDate(value) {
  if (!value) return null;

  let text = String(value)
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const now = new Date();

  if (/^сегодня\b/.test(text)) {
    const time = text.match(/(\d{1,2}):(\d{2})/);

    const d = new Date(now);

    if (time) {
      d.setHours(Number(time[1]), Number(time[2]), 0, 0);
    } else {
      d.setHours(12, 0, 0, 0);
    }

    return d;
  }

  if (/^вчера\b/.test(text)) {
    const time = text.match(/(\d{1,2}):(\d{2})/);

    const d = new Date(now);
    d.setDate(d.getDate() - 1);

    if (time) {
      d.setHours(Number(time[1]), Number(time[2]), 0, 0);
    } else {
      d.setHours(12, 0, 0, 0);
    }

    return d;
  }

  const months = {
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

  const match = text.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?/i
  );

  if (!match) return null;

  const day = Number(match[1]);
  const month = months[match[2]];
  const year = match[3]
    ? Number(match[3])
    : now.getFullYear();

  const hour = match[5]
    ? Number(match[5])
    : 12;

  const minute = match[6]
    ? Number(match[6])
    : 0;

  const result = new Date(
    year,
    month,
    day,
    hour,
    minute,
    0,
    0
  );

  return Number.isNaN(result.getTime())
    ? null
    : result;
}


function extractDateFromUrl(url, sourceId) {
  if (!url) return null;

  if (
    sourceId === "161ru" ||
    sourceId === "93ru"
  ) {
    const match = url.match(
      /\/(20\d{2})\/(\d{2})\/(\d{2})\//
    );

    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
        0,
        0
      );
    }
  }

  return null;
}


function extractDateFromHtml(html) {
  if (!html) return null;

  // JSON-LD
  const json = extractJsonLd(html);
  const objects = flattenJsonLd(json);

  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;

    const candidates = [
      obj.datePublished,
      obj.dateCreated,
      obj.dateModified,
      obj.uploadDate
    ];

    for (const value of candidates) {
      const parsed = parseDateValue(value);

      if (parsed) return parsed;
    }
  }

  // OpenGraph / meta
  const metaDate = getMeta(html, [
    "article:published_time",
    "article:modified_time",
    "datePublished",
    "date",
    "publish-date",
    "publication_date"
  ]);

  if (metaDate) {
    const parsed = parseDateValue(metaDate);

    if (parsed) return parsed;
  }

  // <time datetime>
  const timeRegex =
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi;

  let match;

  while ((match = timeRegex.exec(html))) {
    const parsed = parseDateValue(match[1]);

    if (parsed) return parsed;
  }

  // Русская дата в тексте
  const visible = cleanText(html.slice(0, 30000));

  const relative = visible.match(
    /\b(?:сегодня|вчера)\s*(?:в\s*)?\d{1,2}:\d{2}\b/i
  );

  if (relative) {
    const parsed = parseRussianDate(relative[0]);

    if (parsed) return parsed;
  }

  const russian = visible.match(
    /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?(?:\s+\d{1,2}:\d{2})?\b/i
  );

  if (russian) {
    const parsed = parseRussianDate(russian[0]);

    if (parsed) return parsed;
  }

  return null;
}


// ============================================================
// IMAGE
// ============================================================

function cleanImageUrl(value) {
  if (!value) return "";

  const first = String(value)
    .split(",")
    .map(x => x.trim())
    .find(x => isHttpUrl(x));

  return first || "";
}


function extractImageFromHtml(html, baseUrl) {
  const metaImage = getMeta(html, [
    "og:image",
    "og:image:url",
    "twitter:image",
    "twitter:image:src"
  ]);

  if (metaImage) {
    return absoluteUrl(
      cleanImageUrl(metaImage),
      baseUrl
    );
  }

  const json = extractJsonLd(html);
  const objects = flattenJsonLd(json);

  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;

    let image = obj.image;

    if (Array.isArray(image)) {
      image = image[0];
    }

    if (image && typeof image === "object") {
      image = image.url || image.contentUrl;
    }

    if (image) {
      return absoluteUrl(
        cleanImageUrl(image),
        baseUrl
      );
    }
  }

  return "";
}


// ============================================================
// ARTICLE PARSING
// ============================================================

function extractTitleFromHtml(html) {
  const og = getMeta(html, [
    "og:title",
    "twitter:title"
  ]);

  if (og) return normalizeTitle(og);

  const h1 = html.match(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  );

  if (h1) {
    const title = normalizeTitle(h1[1]);

    if (title) return title;
  }

  const title = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (title) {
    return normalizeTitle(title[1])
      .replace(/\s+[|—-]\s+.*$/, "")
      .trim();
  }

  return "";
}


function extractDescriptionFromHtml(html) {
  const description = getMeta(html, [
    "description",
    "og:description",
    "twitter:description"
  ]);

  if (description) {
    return cleanDescription(description);
  }

  const json = extractJsonLd(html);
  const objects = flattenJsonLd(json);

  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;

    if (obj.description) {
      const text = cleanDescription(obj.description);

      if (text.length >= 30) {
        return text;
      }
    }
  }

  const paragraphs = [];

  const regex =
    /<p[^>]*>([\s\S]*?)<\/p>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const text = cleanText(match[1]);

    if (
      text.length >= 50 &&
      !/cookie|реклама|подпис/i.test(text)
    ) {
      paragraphs.push(text);
    }

    if (paragraphs.length >= 3) {
      break;
    }
  }

  return paragraphs[0] || "";
}


async function parseArticle(url, source) {
  const response = await fetchText(url);

  const html = response.text;

  const title = extractTitleFromHtml(html);

  const description =
    extractDescriptionFromHtml(html);

  const image =
    extractImageFromHtml(
      html,
      response.finalUrl || url
    );

  const date =
    extractDateFromHtml(html) ||
    extractDateFromUrl(url, source.id);

  if (!title) {
    throw new Error("Не удалось определить заголовок");
  }

  return {
    title,
    description,
    image,
    date,
    finalUrl: response.finalUrl || url
  };
}


// ============================================================
// TOPIC
// ============================================================

function classifyTopic(title, description) {
  const text = (
    `${title || ""} ${description || ""}`
  ).toLowerCase();

  if (
    /ипотек|ставк.*кредит|кредит.*жиль|семейн.*ипотек|маткапитал|рефинансир/.test(
      text
    )
  ) {
    return "mortgage";
  }

  if (
    /закон|закона|законодательств|росреестр|кадастр|егрн|госдум|минстрой|правительств|налог|налогооблож|юрист|сделк.*недвиж/.test(
      text
    )
  ) {
    return "legislation";
  }

  if (
    /новостро|застройщик|девелопер|жилой комплекс|жк |дду|строительств.*жил/.test(
      text
    )
  ) {
    return "newbuildings";
  }

  if (
    /риелтор|риелтор|агент.*недвиж|продаж.*квартир|покупк.*квартир|вторичн|жиль[её]|квартир|дом|недвижим|аренд/.test(
      text
    )
  ) {
    return "realty";
  }

  return "realty";
}


// ============================================================
// RELEVANCE
// ============================================================

function isRelevant(title, description) {
  const text = (
    `${title || ""} ${description || ""}`
  ).toLowerCase();

  if (!text.trim()) return false;

  const keywords = [
    "недвижим",
    "квартир",
    "жиль",
    "ипотек",
    "дом",
    "застройщик",
    "девелоп",
    "новостро",
    "строительств",
    "земель",
    "участк",
    "аренд",
    "риелтор",
    "риелтор",
    "росреестр",
    "кадастр",
    "егрн",
    "маткапитал",
    "семейн",
    "жкх",
    "жк ",
    "сделк"
  ];

  return keywords.some(keyword =>
    text.includes(keyword)
  );
}


// ============================================================
// LINKS
// ============================================================

function extractAllLinks(html, baseUrl) {
  const result = [];

  if (!html) return result;

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const href = match[1];

    const title = cleanText(match[2]);

    const url = absoluteUrl(
      href,
      baseUrl
    );

    if (!url || !isHttpUrl(url)) {
      continue;
    }

    result.push({
      url,
      title
    });
  }

  return result;
}


function filterLinksBySource(links, sourceId) {
  const result = [];

  for (const item of links) {
    const url = item.url;

    try {
      const u = new URL(url);

      const host = u.hostname.toLowerCase();
      const path = u.pathname;

      if (sourceId === "161ru") {
        if (
          !/161\.ru$/.test(host) ||
          !/^\/text\/realty\//.test(path)
        ) {
          continue;
        }
      }

      if (sourceId === "93ru") {
        if (
          !/93\.ru$/.test(host) ||
          !/^\/text\/realty\//.test(path)
        ) {
          continue;
        }
      }

      if (sourceId === "krasdom") {
        if (
          !/krasdom\.ru$/.test(host) ||
          !/^\/news\//.test(path)
        ) {
          continue;
        }
      }

      if (sourceId === "domrf") {
        if (
          !(
            host.includes("xn--h1alcedd") ||
            host.includes("спроси.дом.рф")
          ) ||
          !/^\/news\//.test(path)
        ) {
          continue;
        }
      }

      if (sourceId === "yandexrealty") {
        if (
          !/realty\.yandex\.ru$/.test(host) ||
          !/^\/journal\/post\//.test(path)
        ) {
          continue;
        }
      }

      if (sourceId === "cian") {
        if (
          !/cian\.ru$/.test(host) ||
          !/^\/magazine\//.test(path)
        ) {
          continue;
        }

        if (
          path === "/magazine/" ||
          path === "/magazine"
        ) {
          continue;
        }
      }

      result.push({
        ...item,
        url: normalizeUrl(url)
      });

    } catch {
      // пропускаем некорректную ссылку
    }
  }

  return result;
}


function uniqueLinks(links) {
  const map = new Map();

  for (const item of links) {
    const key = normalizeUrl(item.url);

    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}


// ============================================================
// YANDEX
// ============================================================

function extractYandexLinks(html) {
  const all = extractAllLinks(
    html,
    SOURCES.yandexrealty.url
  );

  return uniqueLinks(
    filterLinksBySource(
      all,
      "yandexrealty"
    )
  );
}


// ============================================================
// CIAN
// ============================================================

function extractCianLinks(html) {
  const all = extractAllLinks(
    html,
    SOURCES.cian.url
  );

  const links = filterLinksBySource(
    all,
    "cian"
  );

  const result = [];

  for (const item of links) {
    const title = normalizeTitle(item.title);

    if (!title) continue;

    // Исключаем служебные ссылки.
    if (
      /^(войти|регистрация|все новости|показать больше|подробнее)$/i.test(
        title
      )
    ) {
      continue;
    }

    result.push(item);
  }

  return uniqueLinks(result);
}


// ============================================================
// CIAN PAGE DATE EXTRACTION
// ============================================================

function extractCianListingDate(html, linkUrl) {
  if (!html || !linkUrl) return null;

  const escaped = linkUrl
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `<a[^>]+href=["']${escaped}["'][^>]*>[\\s\\S]{0,8000}`,
    "i"
  );

  const match = html.match(regex);

  if (!match) return null;

  const block = cleanText(
    match[0]
  );

  const relative = block.match(
    /\b(?:сегодня|вчера)\s*(?:в\s*)?\d{1,2}:\d{2}\b/i
  );

  if (relative) {
    return parseRussianDate(
      relative[0]
    );
  }

  const russian = block.match(
    /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?(?:\s+\d{1,2}:\d{2})?\b/i
  );

  if (russian) {
    return parseRussianDate(
      russian[0]
    );
  }

  return null;
}


// ============================================================
// TELEGRAM DOMCLICK
// ============================================================

function extractTelegramBlocks(html) {
  if (!html) return [];

  return html.match(
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*tgme_widget_message_wrap|$)/gi
  ) || [];
}


function extractTelegramPostUrl(block) {
  if (!block) return "";

  const dataPost = block.match(
    /data-post=["']([^"']+)["']/i
  );

  if (dataPost && dataPost[1]) {
    return `https://t.me/${dataPost[1]}`;
  }

  const link =
    block.match(
      /href=["'](https:\/\/t\.me\/[^"']+)["']/i
    );

  return link
    ? link[1]
    : "";
}


function extractTelegramArticleUrl(block) {
  if (!block) return "";

  const links = [];

  const regex =
    /href=["'](https?:\/\/[^"']+)["']/gi;

  let match;

  while ((match = regex.exec(block))) {
    const url = match[1];

    if (
      /blog\.domclick\.ru/i.test(url)
    ) {
      links.push(url);
    }
  }

  if (links.length) {
    return normalizeUrl(
      links[0]
    );
  }

  return "";
}


function extractTelegramDate(block) {
  if (!block) return null;

  const time =
    block.match(
      /<time[^>]+datetime=["']([^"']+)["']/i
    );

  if (time) {
    return parseDateValue(
      time[1]
    );
  }

  return null;
}


function extractTelegramImage(block) {
  if (!block) return "";

  const photo =
    block.match(
      /background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i
    );

  if (photo) {
    return cleanImageUrl(
      photo[1]
    );
  }

  const img =
    block.match(
      /<img[^>]+src=["']([^"']+)["']/i
    );

  if (img) {
    return cleanImageUrl(
      img[1]
    );
  }

  return "";
}


function extractTelegramText(block) {
  if (!block) return "";

  let text = block
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    );

  text = text
    .replace(
      /<br\s*\/?>/gi,
      "\n"
    )
    .replace(
      /<\/p>/gi,
      "\n"
    )
    .replace(
      /<\/div>/gi,
      "\n"
    );

  text = stripHtml(text);

  return text
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}


function extractTelegramTitle(text) {
  if (!text) return "";

  const lines = text
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.length >= 20 &&
      line.length <= 220 &&
      !/^https?:\/\//i.test(line) &&
      !/^Подписаться/i.test(line) &&
      !/^#/.test(line)
    ) {
      return line;
    }
  }

  return lines[0] || "";
}


function extractTelegramDescription(text, title) {
  if (!text) return "";

  const lines = text
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const description = lines
    .filter(line => line !== title)
    .filter(line => !/^https?:\/\//i.test(line))
    .filter(line => !/^Подписаться/i.test(line))
    .filter(line => !/^#/.test(line))
    .join(" ");

  return cleanDescription(
    description
  );
}


async function processDomclick() {
  const stats = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  // ----------------------------------------------------------
  // 1. Сначала пробуем официальный блог
  // ----------------------------------------------------------

  try {
    const response = await fetchText(
      SOURCES.domclick.url
    );

    stats.attempts.push({
      method: "blog",
      status: "ok",
      candidates: 0
    });

    const links = uniqueLinks(
      filterLinksBySource(
        extractAllLinks(
          response.text,
          SOURCES.domclick.url
        ),
        "domclick"
      )
    );

    if (links.length) {
      stats.candidates = links.length;

      const items = [];

      for (
        const link of links.slice(
          0,
          SOURCE_CANDIDATES_LIMIT
        )
      ) {
        try {
          const article =
            await parseArticle(
              link.url,
              SOURCES.domclick
            );

          if (
            !article.date ||
            !isRecent(
              article.date,
              DEFAULT_DAYS
            )
          ) {
            stats.rejected++;
            continue;
          }

          stats.recentCandidates++;

          if (
            !isRelevant(
              article.title,
              article.description
            )
          ) {
            continue;
          }

          items.push(
            makeItem({
              source: SOURCES.domclick,
              title: article.title,
              description: article.description,
              image: article.image,
              url: article.finalUrl || link.url,
              date: article.date
            })
          );

        } catch {
          stats.failed++;
        }
      }

      if (items.length) {
        return {
          items,
          stats
        };
      }

    }

  } catch (error) {
    stats.attempts.push({
      method: "blog",
      status: "failed",
      error: error.message,
      httpStatus: error.httpStatus || null
    });
  }


  // ----------------------------------------------------------
  // 2. Fallback — официальный Telegram
  // ----------------------------------------------------------

  try {
    const response = await fetchText(
      SOURCES.domclick.telegramUrl
    );

    const blocks =
      extractTelegramBlocks(
        response.text
      );

    const candidates = [];

    for (const block of blocks) {
      const text =
        extractTelegramText(
          block
        );

      const title =
        extractTelegramTitle(
          text
        );

      if (!title) continue;

      const date =
        extractTelegramDate(
          block
        );

      if (!date) continue;

      let url =
        extractTelegramArticleUrl(
          block
        );

      if (!url) {
        url =
          extractTelegramPostUrl(
            block
          );
      }

      if (!url) continue;

      const description =
        extractTelegramDescription(
          text,
          title
        );

      const image =
        extractTelegramImage(
          block
        );

      candidates.push({
        title,
        description,
        date,
        url,
        image
      });
    }

    stats.candidates =
      candidates.length;

    const items = [];

    for (
      const candidate of candidates
        .slice(
          0,
          SOURCE_CANDIDATES_LIMIT
        )
    ) {
      if (
        !isRecent(
          candidate.date,
          DEFAULT_DAYS
        )
      ) {
        stats.rejected++;
        continue;
      }

      stats.recentCandidates++;

      if (
        !isRelevant(
          candidate.title,
          candidate.description
        )
      ) {
        continue;
      }

      items.push(
        makeItem({
          source: SOURCES.domclick,
          title: candidate.title,
          description: candidate.description,
          image: candidate.image,
          url: candidate.url,
          date: candidate.date
        })
      );
    }

    stats.attempts.push({
      method: "telegram",
      status: "ok",
      candidates: candidates.length
    });

    return {
      items,
      stats
    };

  } catch (error) {
    stats.attempts.push({
      method: "telegram",
      status: "failed",
      error: error.message,
      httpStatus: error.httpStatus || null
    });

    stats.failed++;

    return {
      items: [],
      stats
    };
  }
}


// ============================================================
// RECENCY
// ============================================================

function isRecent(date, days) {
  if (!date) return false;

  const timestamp =
    date instanceof Date
      ? date.getTime()
      : new Date(date).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();

  const diff =
    now - timestamp;

  const maxAge =
    days *
    24 *
    60 *
    60 *
    1000;

  // Небольшой запас для часовых поясов.
  const futureLimit =
    2 *
    60 *
    60 *
    1000;

  return (
    diff <= maxAge &&
    diff >= -futureLimit
  );
}


// ============================================================
// ITEM
// ============================================================

function makeId(url) {
  const value =
    normalizeUrl(url);

  try {
    return Buffer
      .from(value)
      .toString("base64url");
  } catch {
    return Buffer
      .from(value)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}


function makeItem({
  source,
  title,
  description,
  image,
  url,
  date
}) {
  const cleanUrl =
    normalizeUrl(url);

  const publishedAt =
    date instanceof Date
      ? date.toISOString()
      : new Date(date).toISOString();

  return {
    id: makeId(cleanUrl),
    sourceId: source.id,
    source: source.name,
    category: source.category,
    topic: classifyTopic(
      title,
      description
    ),
    title: normalizeTitle(title),
    description: cleanDescription(
      description
    ),
    url: cleanUrl,
    image: cleanImageUrl(image),
    date: publishedAt.slice(0, 10),
    publishedAt
  };
}


// ============================================================
// GENERIC SOURCE
// ============================================================

async function processGenericSource(
  source,
  days
) {
  const stats = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  let listing;

  try {
    listing =
      await fetchText(
        source.url
      );
  } catch (error) {
    return {
      items: [],
      stats: {
        ...stats,
        failed: 1,
        error: error.message,
        httpStatus:
          error.httpStatus || null
      }
    };
  }

  let links;

  if (
    source.id === "yandexrealty"
  ) {
    links =
      extractYandexLinks(
        listing.text
      );
  } else if (
    source.id === "cian"
  ) {
    links =
      extractCianLinks(
        listing.text
      );

    // Если www.cian.ru не отдал ссылки,
    // пробуем региональную версию.
    if (!links.length && source.fallbackUrl) {
      try {
        const fallback =
          await fetchText(
            source.fallbackUrl
          );

        links =
          extractCianLinks(
            fallback.text
          );
      } catch {
        // основной запрос уже учтен;
        // fallback просто пропускаем
      }
    }
  } else {
    links =
      uniqueLinks(
        filterLinksBySource(
          extractAllLinks(
            listing.text,
            source.url
          ),
          source.id
        )
      );
  }

  stats.candidates =
    links.length;

  const candidates =
    links.slice(
      0,
      SOURCE_CANDIDATES_LIMIT
    );

  const items = [];

  // Обрабатываем параллельно небольшими группами.
  const concurrency = 5;

  for (
    let i = 0;
    i < candidates.length;
    i += concurrency
  ) {
    const batch =
      candidates.slice(
        i,
        i + concurrency
      );

    const results =
      await Promise.allSettled(
        batch.map(
          async link => {
            const article =
              await parseArticle(
                link.url,
                source
              );

            return {
              link,
              article
            };
          }
        )
      );

    for (
      let index = 0;
      index < results.length;
      index++
    ) {
      const result =
        results[index];

      if (
        result.status === "rejected"
      ) {
        stats.failed++;
        continue;
      }

      const {
        link,
        article
      } = result.value;

      let date =
        article.date;

      // Для ЦИАН и Яндекса дополнительно
      // пробуем дату из страницы списка.
      if (
        !date &&
        source.id === "cian"
      ) {
        date =
          extractCianListingDate(
            listing.text,
            link.url
          );
      }

      if (!date) {
        stats.rejected++;
        continue;
      }

      if (
        !isRecent(
          date,
          days
        )
      ) {
        stats.rejected++;
        continue;
      }

      stats.recentCandidates++;

      if (
        !isRelevant(
          article.title,
          article.description
        )
      ) {
        continue;
      }

      items.push(
        makeItem({
          source,
          title: article.title,
          description: article.description,
          image: article.image,
          url:
            article.finalUrl ||
            link.url,
          date
        })
      );
    }
  }

  return {
    items,
    stats
  };
}


// ============================================================
// DUPLICATES
// ============================================================

function deduplicateItems(items) {
  const byUrl = new Map();

  for (const item of items) {
    const key =
      normalizeUrl(item.url);

    if (!key) continue;

    if (!byUrl.has(key)) {
      byUrl.set(
        key,
        item
      );
      continue;
    }

    const existing =
      byUrl.get(key);

    // Предпочитаем запись,
    // у которой есть описание и изображение.
    if (
      (!existing.description &&
        item.description) ||
      (!existing.image &&
        item.image)
    ) {
      byUrl.set(
        key,
        item
      );
    }
  }

  return Array.from(
    byUrl.values()
  );
}


function normalizeForDuplicate(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function similarity(a, b) {
  const aa =
    new Set(
      normalizeForDuplicate(a)
        .split(" ")
        .filter(Boolean)
    );

  const bb =
    new Set(
      normalizeForDuplicate(b)
        .split(" ")
        .filter(Boolean)
    );

  if (!aa.size || !bb.size) {
    return 0;
  }

  let intersection = 0;

  for (const word of aa) {
    if (bb.has(word)) {
      intersection++;
    }
  }

  return (
    intersection /
    Math.max(
      aa.size,
      bb.size
    )
  );
}


function removeNearDuplicates(items) {
  const result = [];

  for (const item of items) {
    let duplicate = false;

    for (const existing of result) {
      if (
        similarity(
          item.title,
          existing.title
        ) >= 0.86
      ) {
        duplicate = true;
        break;
      }
    }

    if (!duplicate) {
      result.push(item);
    }
  }

  return result;
}


// ============================================================
// BALANCE SOURCES
// ============================================================

function balanceItems(
  items,
  limit
) {
  if (items.length <= limit) {
    return items;
  }

  const groups = new Map();

  for (const item of items) {
    if (!groups.has(item.sourceId)) {
      groups.set(
        item.sourceId,
        []
      );
    }

    groups
      .get(item.sourceId)
      .push(item);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );
  }

  const sourceIds =
    Array.from(
      groups.keys()
    );

  const maxPerSource =
    Math.max(
      1,
      Math.ceil(
        limit /
          sourceIds.length
      ) + 2
    );

  const result = [];

  // Сначала гарантируем присутствие
  // нескольких источников.
  for (
    const sourceId of sourceIds
  ) {
    const group =
      groups.get(sourceId);

    const take =
      Math.min(
        maxPerSource,
        group.length
      );

    for (
      let i = 0;
      i < take;
      i++
    ) {
      result.push(
        group[i]
      );
    }
  }

  // Затем добираем самые свежие.
  if (result.length < limit) {
    const used =
      new Set(
        result.map(
          item => item.url
        )
      );

    const remaining =
      items
        .filter(
          item =>
            !used.has(item.url)
        )
        .sort(
          (a, b) =>
            new Date(b.publishedAt) -
            new Date(a.publishedAt)
        );

    for (
      const item of remaining
    ) {
      if (
        result.length >= limit
      ) {
        break;
      }

      result.push(item);
    }
  }

  return result
    .sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    )
    .slice(0, limit);
}


// ============================================================
// CATEGORY FILTER
// ============================================================

function matchesCategory(
  item,
  category
) {
  if (
    !category ||
    category === "all"
  ) {
    return true;
  }

  const value =
    String(category)
      .toLowerCase()
      .trim();

  const aliases = {
    mortgage: [
      "mortgage",
      "ипотека",
      "ипотека и банки"
    ],

    realty: [
      "realty",
      "недвижимость"
    ],

    newbuildings: [
      "newbuildings",
      "новостройки",
      "новостройка"
    ],

    legislation: [
      "legislation",
      "законодательство",
      "законы"
    ],

    krasnodar: [
      "krasnodar",
      "краснодар"
    ],

    rostov: [
      "rostov",
      "ростов"
    ],

    useful: [
      "useful",
      "полезное",
      "полезное для риелтора"
    ]
  };

  for (
    const [
      key,
      values
    ] of Object.entries(
      aliases
    )
  ) {
    if (
      values.includes(value)
    ) {
      return (
        item.topic === key ||
        item.category === key
      );
    }
  }

  return (
    item.topic === value ||
    item.category === value
  );
}


// ============================================================
// MAIN API
// ============================================================

export default async function handler(
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

  res.setHeader(
    "Cache-Control",
    "s-maxage=60, stale-while-revalidate=120"
  );

  if (req.method === "OPTIONS") {
    return res
      .status(200)
      .end();
  }

  try {
    const query =
      req.query || {};

    const category =
      String(
        query.category ||
        "all"
      )
        .toLowerCase()
        .trim();

    let limit =
      Number(
        query.limit ||
        DEFAULT_LIMIT
      );

    if (
      !Number.isFinite(limit)
    ) {
      limit =
        DEFAULT_LIMIT;
    }

    limit =
      Math.max(
        1,
        Math.min(
          MAX_LIMIT,
          Math.floor(limit)
        )
      );

    let days =
      Number(
        query.days ||
        DEFAULT_DAYS
      );

    if (
      !Number.isFinite(days)
    ) {
      days =
        DEFAULT_DAYS;
    }

    days =
      Math.max(
        1,
        Math.min(
          MAX_DAYS,
          Math.floor(days)
        )
      );

    const allItems = [];

    const sourcesStats = {};


    // --------------------------------------------------------
    // Запускаем обычные источники параллельно.
    // --------------------------------------------------------

    const regularSources =
      Object.values(
        SOURCES
      ).filter(
        source =>
          source.parser !==
          "domclick"
      );

    const regularResults =
      await Promise.allSettled(
        regularSources.map(
          source =>
            processGenericSource(
              source,
              days
            )
        )
      );

    for (
      let i = 0;
      i <
      regularResults.length;
      i++
    ) {
      const source =
        regularSources[i];

      const result =
        regularResults[i];

      if (
        result.status ===
        "fulfilled"
      ) {
        allItems.push(
          ...result.value.items
        );

        sourcesStats[
          source.id
        ] =
          result.value.stats;

      } else {
        sourcesStats[
          source.id
        ] = {
          candidates: 0,
          recentCandidates: 0,
          rejected: 0,
          failed: 1,
          error:
            result.reason?.message ||
            "Unknown error"
        };
      }
    }


    // --------------------------------------------------------
    // Домклик
    // --------------------------------------------------------

    const domclick =
      await processDomclick();

    allItems.push(
      ...domclick.items
    );

    sourcesStats.domclick =
      domclick.stats;


    // --------------------------------------------------------
    // Дедупликация
    // --------------------------------------------------------

    let items =
      deduplicateItems(
        allItems
      );

    items =
      removeNearDuplicates(
        items
      );


    // --------------------------------------------------------
    // Сортировка
    // --------------------------------------------------------

    items.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );


    // --------------------------------------------------------
    // Фильтр категории
    // --------------------------------------------------------

    if (
      category !== "all"
    ) {
      items =
        items.filter(
          item =>
            matchesCategory(
              item,
              category
            )
        );
    }


    // --------------------------------------------------------
    // Баланс источников
    // --------------------------------------------------------

    items =
      balanceItems(
        items,
        limit
      );


    // --------------------------------------------------------
    // Ответ
    // --------------------------------------------------------

    return res
      .status(200)
      .json({
        ok: true,
        category,
        count: items.length,
        items,
        sources: sourcesStats
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
          error.message ||
          "Internal Server Error",
        category:
          req.query?.category ||
          "all",
        count: 0,
        items: [],
        sources: {}
      });
  }
}
