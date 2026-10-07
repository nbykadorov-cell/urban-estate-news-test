const crypto = require("crypto");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;
const DEFAULT_DAYS = 7;

const SOURCES = {
  "161ru": {
    name: "161.RU",
    category: "rostov",
    urls: [
      "https://161.ru/text/realty/"
    ]
  },

  "93ru": {
    name: "93.RU",
    category: "krasnodar",
    urls: [
      "https://93.ru/text/realty/"
    ]
  },

  "krasdom": {
    name: "КРАСДОМ",
    category: "krasnodar",
    urls: [
      "https://krasdom.ru/news/"
    ]
  },

  "domrf": {
    name: "ДОМ.РФ",
    category: "federal",
    urls: [
      "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/"
    ]
  },

  "domclick": {
    name: "Домклик",
    category: "federal",
    urls: [
      "https://blog.domclick.ru/novosti"
    ],
    telegramUrl: "https://t.me/s/domclick"
  },

  "yandexrealty": {
    name: "Яндекс Недвижимость",
    category: "federal",
    urls: [
      "https://realty.yandex.ru/journal/category/news/"
    ]
  },

  "cian": {
    name: "ЦИАН",
    category: "federal",
    urls: [
      "https://krasnodar.cian.ru/magazine/"
    ]
  }
};


// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------

function cleanText(value) {
  if (!value) return "";

  return String(value)
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


function cleanTitle(value) {
  let text = cleanText(value);

  text = text
    .replace(/^[-–—•⭐️🔥✅✏️📝🏠]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}


function cleanDescription(value) {
  let text = cleanText(value);

  text = text
    .replace(/Please open Telegram to view this post/gi, "")
    .replace(/VIEW IN TELEGRAM/gi, "")
    .replace(/\b\d[\d\s]*views?\b/gi, "")
    .replace(/\b\d[\d\s]*просмотр(?:а|ов)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 500);
}


function normalizeUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    u.hash = "";

    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}


function makeId(url) {
  return crypto
    .createHash("sha256")
    .update(String(url))
    .digest("hex")
    .slice(0, 24);
}


function absoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}


function stripTracking(url) {
  try {
    const u = new URL(url);

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "yclid",
      "from"
    ].forEach(key => u.searchParams.delete(key));

    return u.toString();
  } catch {
    return url;
  }
}


// ---------------------------------------------------------
// FETCH
// ---------------------------------------------------------

async function fetchText(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeout || 15000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/154.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      text: "",
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}


// ---------------------------------------------------------
// META / JSON-LD
// ---------------------------------------------------------

function extractMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`,
        "i"
      )
    ];

    for (const regex of patterns) {
      const match = html.match(regex);

      if (match && match[1]) {
        return cleanText(match[1]);
      }
    }
  }

  return "";
}


function extractJsonLd(html) {
  const result = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {
    try {
      const json = JSON.parse(match[1].trim());

      if (Array.isArray(json)) {
        result.push(...json);
      } else if (json["@graph"] && Array.isArray(json["@graph"])) {
        result.push(...json["@graph"]);
      } else {
        result.push(json);
      }
    } catch {}
  }

  return result;
}


function getJsonLdArticle(html) {
  const items = extractJsonLd(html);

  return (
    items.find(item => {
      if (!item || typeof item !== "object") return false;

      const type = item["@type"];

      if (Array.isArray(type)) {
        return type.some(t =>
          /article|newsarticle|blogposting/i.test(String(t))
        );
      }

      return /article|newsarticle|blogposting/i.test(String(type || ""));
    }) || null
  );
}


// ---------------------------------------------------------
// DATE
// ---------------------------------------------------------

function parseDate(value) {
  if (!value) return null;

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}


function dateFromUrl(url) {
  if (!url) return null;

  const match = url.match(
    /\/(20\d{2})\/(\d{2})\/(\d{2})\/\d+/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}


function isRecent(date, days) {
  if (!date) return false;

  const now = Date.now();
  const min = now - days * 24 * 60 * 60 * 1000;

  return date.getTime() >= min && date.getTime() <= now + 24 * 60 * 60 * 1000;
}


// ---------------------------------------------------------
// ARTICLE DATA
// ---------------------------------------------------------

function extractArticleData(html, url) {
  const jsonLd = getJsonLdArticle(html);

  let title =
    (jsonLd && (jsonLd.headline || jsonLd.name)) ||
    extractMeta(html, [
      "og:title",
      "twitter:title"
    ]) ||
    "";

  let description =
    (jsonLd && (jsonLd.description || jsonLd.abstract)) ||
    extractMeta(html, [
      "og:description",
      "description",
      "twitter:description"
    ]) ||
    "";

  let image =
    (jsonLd &&
      jsonLd.image &&
      (
        typeof jsonLd.image === "string"
          ? jsonLd.image
          : jsonLd.image.url
      )) ||
    extractMeta(html, [
      "og:image",
      "twitter:image"
    ]) ||
    "";

  let publishedAt =
    (jsonLd &&
      (
        jsonLd.datePublished ||
        jsonLd.dateCreated ||
        jsonLd.dateModified
      )) ||
    extractMeta(html, [
      "article:published_time",
      "datePublished",
      "date"
    ]) ||
    null;

  let date = parseDate(publishedAt);

  if (!date) {
    date = dateFromUrl(url);
  }

  return {
    title: cleanTitle(title),
    description: cleanDescription(description),
    image: absoluteUrl(image, url),
    publishedAt: date ? date.toISOString() : null
  };
}


// ---------------------------------------------------------
// TOPICS
// ---------------------------------------------------------

function detectTopic(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();

  if (
    /ипотек|ставк|ключев|кредит|банк|семейн.*ипотек|платеж/.test(text)
  ) {
    return "mortgage";
  }

  if (
    /закон|законодатель|госдум|госуслуг|егрн|кадастров|право|документ|налог|юрид/.test(text)
  ) {
    return "legislation";
  }

  if (
    /новостро|застройщик|девелоп|жк |жилой комплекс|строительств|долгостро/.test(text)
  ) {
    return "newbuildings";
  }

  if (
    /ростов|ростов-на-дону|аксай|дон|ростовск/.test(text)
  ) {
    return "rostov";
  }

  if (
    /краснодар|кубан|краснодарск|сочи|адыге/.test(text)
  ) {
    return "krasnodar";
  }

  return "realty";
}


// ---------------------------------------------------------
// FOREIGN CONTENT FILTER
// ---------------------------------------------------------

function isForeignYandexArticle(title, description, url) {
  const text = `${title} ${description} ${url}`.toLowerCase();

  const foreignPatterns = [
    // Великобритания
    "лондон",
    "англи",
    "великобритани",
    "британ",

    // США
    "сша",
    "америк",
    "нью-йорк",
    "майами",
    "калифорни",
    "флорид",

    // Япония
    "япони",
    "токио",
    "осак",

    // Турция
    "турци",
    "стамбул",
    "антали",

    // ОАЭ
    "оаэ",
    "дубай",
    "абу-даби",

    // Европа
    "германи",
    "берлин",
    "франци",
    "париж",
    "итали",
    "рим",
    "испан",
    "барселон",
    "португал",
    "нидерланд",
    "амстердам",
    "австри",
    "швейцар",
    "чехи",
    "польш",
    "польша",

    // Азия
    "кита",
    "китай",
    "пекин",
    "шанхай",
    "сингапур",
    "таиланд",
    "бангкок",

    // Другие
    "австрали",
    "канад",
    "мексик",
    "бразили",
    "индонези",
    "коре"
  ];

  return foreignPatterns.some(pattern =>
    text.includes(pattern)
  );
}


// ---------------------------------------------------------
// GENERIC LINK EXTRACTION
// ---------------------------------------------------------

function extractLinks(html, baseUrl, sourceKey) {
  const links = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    let href = match[1];
    const anchorText = cleanText(match[2]);

    href = absoluteUrl(href, baseUrl);

    if (!href) continue;

    href = stripTracking(href);

    try {
      const u = new URL(href);

      // -----------------------------------------
      // 161.RU
      // -----------------------------------------

      if (sourceKey === "161ru") {
        if (
          !/^\/text\/realty\/20\d{2}\/\d{2}\/\d{2}\/\d+$/.test(u.pathname)
        ) {
          continue;
        }

        if (/\/comments/i.test(u.pathname)) continue;
      }


      // -----------------------------------------
      // 93.RU
      // -----------------------------------------

      if (sourceKey === "93ru") {
        if (
          !/^\/text\/realty\/20\d{2}\/\d{2}\/\d{2}\/\d+$/.test(u.pathname)
        ) {
          continue;
        }

        if (/\/comments/i.test(u.pathname)) continue;
      }


      // -----------------------------------------
      // КРАСДОМ
      // -----------------------------------------

      if (sourceKey === "krasdom") {
        if (!/^\/news\/\d+$/.test(u.pathname)) {
          continue;
        }
      }


      // -----------------------------------------
      // ДОМ.РФ
      // -----------------------------------------

      if (sourceKey === "domrf") {
        if (!/^\/news\/.+/i.test(u.pathname)) {
          continue;
        }
      }


      // -----------------------------------------
      // Яндекс Недвижимость
      // -----------------------------------------

      if (sourceKey === "yandexrealty") {
        if (!/^\/journal\/post\/[^/]+\/?$/i.test(u.pathname)) {
          continue;
        }
      }


      // -----------------------------------------
      // ЦИАН
      // -----------------------------------------

      if (sourceKey === "cian") {
        if (!/^\/novosti-[^/]+-\d+$/i.test(u.pathname)) {
          continue;
        }
      }


      // -----------------------------------------
      // Домклик
      // -----------------------------------------

      if (sourceKey === "domclick") {
        if (!/^https?:\/\/blog\.domclick\.ru\//i.test(href)) {
          continue;
        }

        if (/\/videos\//i.test(href)) {
          continue;
        }

        if (!/\/post\//i.test(href)) {
          continue;
        }
      }


      links.push({
        url: href,
        anchorText
      });

    } catch {}
  }

  const unique = new Map();

  for (const item of links) {
    if (!unique.has(item.url)) {
      unique.set(item.url, item);
    }
  }

  return Array.from(unique.values());
}


// ---------------------------------------------------------
// GENERIC SOURCE
// ---------------------------------------------------------

async function parseGenericSource(sourceKey, days) {
  const source = SOURCES[sourceKey];

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const allLinks = [];

  for (const url of source.urls) {
    const page = await fetchText(url);

    if (!page.ok) {
      stats.failed++;
      continue;
    }

    const links = extractLinks(
      page.text,
      page.url || url,
      sourceKey
    );

    allLinks.push(...links);
  }

  const uniqueLinks = new Map();

  for (const item of allLinks) {
    if (!uniqueLinks.has(item.url)) {
      uniqueLinks.set(item.url, item);
    }
  }

  const links = Array.from(uniqueLinks.values());

  stats.candidates = links.length;

  const items = [];

  for (const link of links) {
    let date = dateFromUrl(link.url);

    if (date && !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    const article = await fetchText(link.url);

    if (!article.ok) {
      stats.failed++;
      continue;
    }

    const data = extractArticleData(
      article.text,
      article.url || link.url
    );

    if (!data.title) {
      stats.rejected++;
      continue;
    }

    if (!date && data.publishedAt) {
      date = new Date(data.publishedAt);
    }

    if (!date || !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    stats.recentCandidates++;

    items.push({
      id: makeId(link.url),
      source: sourceKey,
      sourceName: source.name,
      title: data.title,
      description: data.description,
      url: normalizeUrl(link.url),
      image: data.image || "",
      publishedAt: date.toISOString(),
      topic: detectTopic(data.title, data.description)
    });
  }

  return {
    items,
    stats
  };
}


// ---------------------------------------------------------
// YANDEX REALTY
// ---------------------------------------------------------

async function parseYandexRealty(days) {
  const source = SOURCES.yandexrealty;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(source.urls[0]);

  if (!page.ok) {
    stats.failed++;
    return { items: [], stats };
  }

  const links = extractLinks(
    page.text,
    page.url || source.urls[0],
    "yandexrealty"
  );

  stats.candidates = links.length;

  const unique = new Map();

  for (const link of links) {
    if (!unique.has(link.url)) {
      unique.set(link.url, link);
    }
  }

  const items = [];

  for (const link of unique.values()) {
    const article = await fetchText(link.url);

    if (!article.ok) {
      stats.failed++;
      continue;
    }

    const data = extractArticleData(
      article.text,
      article.url || link.url
    );

    if (!data.title) {
      stats.rejected++;
      continue;
    }

    if (
      isForeignYandexArticle(
        data.title,
        data.description,
        link.url
      )
    ) {
      stats.rejected++;
      continue;
    }

    let date = data.publishedAt
      ? new Date(data.publishedAt)
      : null;

    if (!date || !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    // Убираем служебный хвост Яндекса
    let description = cleanDescription(data.description)
      .replace(/\s*[-–—]\s*Новости\.[\s\S]*$/i, "")
      .replace(/\s*в Журнале Недвижимости\.?$/i, "")
      .trim();

    stats.recentCandidates++;

    items.push({
      id: makeId(link.url),
      source: "yandexrealty",
      sourceName: source.name,
      title: cleanTitle(data.title),
      description,
      url: normalizeUrl(link.url),
      image: data.image || "",
      publishedAt: date.toISOString(),
      topic: detectTopic(data.title, description)
    });
  }

  return {
    items,
    stats
  };
}


// ---------------------------------------------------------
// CIAN
// ---------------------------------------------------------

function extractXmlTag(xml, tag) {
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = xml.match(regex);

  return match ? cleanText(match[1]) : "";
}


function extractXmlItems(xml) {
  const result = [];

  const regex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match;

  while ((match = regex.exec(xml))) {
    const block = match[1];

    const title = extractXmlTag(block, "title");
    const link = extractXmlTag(block, "link");
    const description = extractXmlTag(block, "description");

    let pubDate =
      extractXmlTag(block, "pubDate") ||
      extractXmlTag(block, "dc:date") ||
      extractXmlTag(block, "date");

    let image = "";

    const enclosure = block.match(
      /<enclosure[^>]+url=["']([^"']+)["']/i
    );

    if (enclosure) {
      image = enclosure[1];
    }

    const mediaContent = block.match(
      /<media:content[^>]+url=["']([^"']+)["']/i
    );

    if (!image && mediaContent) {
      image = mediaContent[1];
    }

    if (title && link) {
      result.push({
        title,
        link,
        description,
        pubDate,
        image
      });
    }
  }

  return result;
}


async function findCianRssUrl(html, baseUrl) {
  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const href = match[1];
    const text = cleanText(match[2]);

    if (
      /rss/i.test(href) ||
      /rss/i.test(text)
    ) {
      const url = absoluteUrl(href, baseUrl);

      if (url) {
        return url;
      }
    }
  }

  // fallback: стандартные варианты RSS
  const candidates = [
    "https://www.cian.ru/rss/novosti/",
    "https://www.cian.ru/rss/",
    "https://krasnodar.cian.ru/rss/"
  ];

  for (const url of candidates) {
    const test = await fetchText(url);

    if (
      test.ok &&
      /<item[\s>]/i.test(test.text)
    ) {
      return test.url || url;
    }
  }

  return "";
}


async function parseCian(days) {
  const source = SOURCES.cian;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page = await fetchText(source.urls[0]);

  if (!page.ok) {
    stats.failed++;
    return { items: [], stats };
  }

  const rssUrl = await findCianRssUrl(
    page.text,
    page.url || source.urls[0]
  );

  let rssItems = [];

  if (rssUrl) {
    const rss = await fetchText(rssUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*"
      }
    });

    if (rss.ok) {
      rssItems = extractXmlItems(rss.text);
    }
  }

  // Если RSS не найден — используем ссылки со страницы
  if (!rssItems.length) {
    const links = extractLinks(
      page.text,
      page.url || source.urls[0],
      "cian"
    );

    rssItems = links.map(item => ({
      title: item.anchorText,
      link: item.url,
      description: "",
      pubDate: null,
      image: ""
    }));
  }

  const unique = new Map();

  for (const item of rssItems) {
    const url = normalizeUrl(item.link);

    if (!url) continue;

    if (!/^https?:\/\/(?:www\.)?cian\.ru\/novosti-/i.test(url)) {
      continue;
    }

    if (!unique.has(url)) {
      unique.set(url, {
        ...item,
        link: url
      });
    }
  }

  stats.candidates = unique.size;

  const items = [];

  for (const rssItem of unique.values()) {
    let date = parseDate(rssItem.pubDate);

    if (date && !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    const article = await fetchText(rssItem.link);

    if (!article.ok) {
      stats.failed++;
      continue;
    }

    const data = extractArticleData(
      article.text,
      article.url || rssItem.link
    );

    const title =
      data.title ||
      cleanTitle(rssItem.title);

    const description =
      data.description ||
      cleanDescription(rssItem.description);

    if (!title) {
      stats.rejected++;
      continue;
    }

    if (!date && data.publishedAt) {
      date = new Date(data.publishedAt);
    }

    if (!date || !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    stats.recentCandidates++;

    items.push({
      id: makeId(rssItem.link),
      source: "cian",
      sourceName: source.name,
      title,
      description,
      url: normalizeUrl(rssItem.link),
      image: data.image || absoluteUrl(rssItem.image, rssItem.link) || "",
      publishedAt: date.toISOString(),
      topic: detectTopic(title, description)
    });
  }

  return {
    items,
    stats
  };
}


// ---------------------------------------------------------
// DOMCLICK TELEGRAM
// ---------------------------------------------------------

function extractDomclickArticleUrls(text) {
  const urls = new Set();

  const regex =
    /https?:\/\/blog\.domclick\.ru\/[^\s<>"')]+/gi;

  let match;

  while ((match = regex.exec(text))) {
    let url = match[0];

    url = url.replace(/[),.;!?]+$/g, "");

    if (/\/videos\//i.test(url)) {
      continue;
    }

    if (!/\/post\//i.test(url)) {
      continue;
    }

    urls.add(url);
  }

  return Array.from(urls);
}


function extractTelegramPosts(html) {
  const posts = [];

  const postRegex =
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

  let match;

  while ((match = postRegex.exec(html))) {
    posts.push(match[1]);
  }

  if (!posts.length) {
    const blocks =
      html.split(/tgme_widget_message_wrap/i);

    for (let i = 1; i < blocks.length; i++) {
      posts.push(blocks[i]);
    }
  }

  return posts;
}


function parseTelegramDate(block) {
  const match = block.match(
    /datetime=["']([^"']+)["']/i
  );

  if (!match) return null;

  return parseDate(match[1]);
}


function parseTelegramImage(block) {
  const patterns = [
    /background-image:url\(["']?([^"')]+)["']?\)/i,
    /background-image:\s*url\(([^)]+)\)/i
  ];

  for (const regex of patterns) {
    const match = block.match(regex);

    if (match && match[1]) {
      return match[1]
        .replace(/^["']|["']$/g, "")
        .trim();
    }
  }

  return "";
}


function parseTelegramText(block) {
  const match = block.match(
    /class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  if (!match) return "";

  return cleanText(match[1]);
}


async function parseDomclick(days) {
  const source = SOURCES.domclick;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  // Сначала проверяем официальный блог
  const direct = await fetchText(source.urls[0]);

  stats.attempts.push({
    url: source.urls[0],
    status: direct.status,
    ok: direct.ok
  });

  let links = [];

  if (direct.ok) {
    links = extractLinks(
      direct.text,
      direct.url || source.urls[0],
      "domclick"
    );
  }

  // Если блог отдаёт 401 — используем официальный Telegram
  if (!links.length) {
    const telegram = await fetchText(source.telegramUrl);

    stats.attempts.push({
      url: source.telegramUrl,
      status: telegram.status,
      ok: telegram.ok
    });

    if (telegram.ok) {
      const posts = extractTelegramPosts(
        telegram.text
      );

      for (const block of posts) {
        const date = parseTelegramDate(block);

        if (!date || !isRecent(date, days)) {
          continue;
        }

        const text = parseTelegramText(block);
        const image = parseTelegramImage(block);
        const urls = extractDomclickArticleUrls(text);

        for (const url of urls) {
          links.push({
            url,
            telegramText: text,
            telegramDate: date,
            telegramImage: image
          });
        }
      }
    }
  }

  const unique = new Map();

  for (const link of links) {
    const url = normalizeUrl(link.url);

    if (!url) continue;

    if (/\/videos\//i.test(url)) {
      continue;
    }

    if (!/\/post\//i.test(url)) {
      continue;
    }

    if (!unique.has(url)) {
      unique.set(url, {
        ...link,
        url
      });
    }
  }

  stats.candidates = unique.size;

  const items = [];

  for (const link of unique.values()) {
    const article = await fetchText(link.url);

    let title = "";
    let description = "";
    let image = link.telegramImage || "";
    let date = link.telegramDate || null;

    if (article.ok) {
      const data = extractArticleData(
        article.text,
        article.url || link.url
      );

      title = data.title;
      description = data.description;

      if (data.image) {
        image = data.image;
      }

      if (data.publishedAt) {
        date = new Date(data.publishedAt);
      }
    }

    /*
     * Если сам материал Домклика недоступен,
     * пытаемся аккуратно разобрать Telegram-пост.
     */
    if (!title && link.telegramText) {
      let text = cleanText(link.telegramText);

      text = text
        .replace(/➡️\s*Читать новость.*$/i, "")
        .replace(/➡️\s*Узнать.*$/i, "")
        .replace(/🏠.*$/i, "")
        .trim();

      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean);

      if (sentences.length) {
        title = sentences[0];
      }

      description = sentences
        .slice(1)
        .join(" ");
    }

    if (!title) {
      stats.rejected++;
      continue;
    }

    /*
     * Очень важно:
     * если есть нормальная дата статьи — используем её.
     * Telegram-дата используется только как fallback.
     */
    if (!date || !isRecent(date, days)) {
      stats.rejected++;
      continue;
    }

    /*
     * Убираем Telegram-эмодзи и служебные фразы.
     */
    title = cleanTitle(title)
      .replace(
        /\s*➡️\s*Читать новость.*$/i,
        ""
      )
      .trim();

    description = cleanDescription(description)
      .replace(
        /\s*➡️\s*Читать новость.*$/i,
        ""
      )
      .replace(
        /\s*➡️\s*Узнать.*$/i,
        ""
      )
      .trim();

    stats.recentCandidates++;

    items.push({
      id: makeId(link.url),
      source: "domclick",
      sourceName: source.name,
      title,
      description,
      url: link.url,
      image,
      publishedAt: date.toISOString(),
      topic: detectTopic(title, description)
    });
  }

  return {
    items,
    stats
  };
}


// ---------------------------------------------------------
// DEDUPE
// ---------------------------------------------------------

function dedupeItems(items) {
  const map = new Map();

  for (const item of items) {
    const key =
      normalizeUrl(item.url) ||
      `${item.source}:${item.title.toLowerCase()}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}


// ---------------------------------------------------------
// BALANCE SOURCES
// ---------------------------------------------------------

function balanceItems(items, limit) {
  const groups = new Map();

  for (const item of items) {
    if (!groups.has(item.source)) {
      groups.set(item.source, []);
    }

    groups.get(item.source).push(item);
  }

  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() -
        new Date(a.publishedAt).getTime()
    );
  }

  const result = [];

  while (result.length < limit) {
    let added = false;

    for (const list of groups.values()) {
      if (!list.length) continue;

      result.push(list.shift());
      added = true;

      if (result.length >= limit) {
        break;
      }
    }

    if (!added) break;
  }

  result.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() -
      new Date(a.publishedAt).getTime()
  );

  return result.slice(0, limit);
}


// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------

module.exports = async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const requestedLimit =
    Number(req.query.limit) || DEFAULT_LIMIT;

  const limit = Math.min(
    Math.max(requestedLimit, 1),
    MAX_LIMIT
  );

  const days =
    Math.min(
      Math.max(
        Number(req.query.days) || DEFAULT_DAYS,
        1
      ),
      30
    );

  const category =
    String(
      req.query.category || "all"
    ).toLowerCase();


  const parsers = [
    ["161ru", () => parseGenericSource("161ru", days)],
    ["93ru", () => parseGenericSource("93ru", days)],
    ["krasdom", () => parseGenericSource("krasdom", days)],
    ["domrf", () => parseGenericSource("domrf", days)],
    ["domclick", () => parseDomclick(days)],
    ["yandexrealty", () => parseYandexRealty(days)],
    ["cian", () => parseCian(days)]
  ];


  const results = await Promise.all(
    parsers.map(async ([key, parser]) => {
      try {
        return {
          key,
          ...(await parser())
        };
      } catch (error) {
        return {
          key,
          items: [],
          stats: {
            name: SOURCES[key].name,
            category: SOURCES[key].category,
            candidates: 0,
            recentCandidates: 0,
            rejected: 0,
            failed: 1,
            error: error.message
          }
        };
      }
    })
  );


  const allItems = [];
  const sources = {};

  for (const result of results) {
    sources[result.key] = result.stats;

    for (const item of result.items) {
      allItems.push(item);
    }
  }


  let items = dedupeItems(allItems);


  // Фильтрация категории
  if (
    category &&
    category !== "all"
  ) {
    items = items.filter(
      item =>
        item.topic === category ||
        item.source === category
    );
  }


  items = balanceItems(
    items,
    limit
  );


  return res.status(200).json({
    ok: true,
    category,
    count: items.length,
    items,
    sources
  });
};
