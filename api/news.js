// api/news.js

const SOURCES = {
  "161ru": {
    id: "g0a28v",
    name: "161.RU",
    category: "rostov",
    listUrl: "https://161.ru/text/realty/",
    type: "n1"
  },

  "93ru": {
    id: "p4x7s2",
    name: "93.RU",
    category: "krasnodar",
    listUrl: "https://93.ru/text/realty/",
    type: "n1"
  },

  "krasdom": {
    id: "90cg38",
    name: "КРАСДОМ",
    category: "krasnodar",
    listUrl: "https://krasdom.ru/news/",
    type: "krasdom"
  },

  "domclick": {
    id: "e74yvs",
    name: "Домклик",
    category: "federal",
    listUrl: "https://blog.domclick.ru/novosti",
    type: "domclick"
  },

  "domrf": {
    id: "zni758",
    name: "ДОМ.РФ",
    category: "federal",
    listUrl: "https://спроси.дом.рф/news/",
    type: "domrf"
  }
};


// ======================================================
// SETTINGS
// ======================================================

const DEFAULT_LIMIT = 15;
const DEFAULT_DAYS = 7;

const FETCH_TIMEOUT = 15000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
];


// ======================================================
// BASIC HELPERS
// ======================================================

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


function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"“”„]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}


function absoluteUrl(url, baseUrl) {
  if (!url) return "";

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
}


function isSameDomain(url, domains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return domains.some(domain => {
      return hostname === domain ||
        hostname.endsWith("." + domain);
    });

  } catch {
    return false;
  }
}


function stripQuery(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}


// ======================================================
// DATE HELPERS
// ======================================================

function parseDateValue(value) {
  if (!value) return null;

  const text = String(value).trim();

  let date = new Date(text);

  if (!isNaN(date.getTime())) {
    return date;
  }

  const m = text.match(
    /(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})/
  );

  if (m) {
    date = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}


function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();

  return `${y}-${m}-${d}`;
}


function daysAgoDate(days) {
  const date = new Date();

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);

  return date;
}


function isRecent(date, days) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }

  const minDate = daysAgoDate(days);

  return date >= minDate;
}


// ======================================================
// FETCH
// ======================================================

async function fetchText(url, options = {}) {

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT);

  try {

    const headers = {
      "User-Agent":
        options.userAgent ||
        USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],

      "Accept":
        options.accept ||
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

      "Accept-Language":
        "ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6",

      "Cache-Control": "no-cache",

      "Pragma": "no-cache"
    };

    if (options.referer) {
      headers["Referer"] = options.referer;
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {

      const error = new Error(
        `HTTP ${response.status}`
      );

      error.status = response.status;
      error.body = text.slice(0, 500);

      throw error;
    }

    return {
      text,
      status: response.status,
      finalUrl: response.url
    };

  } finally {
    clearTimeout(timer);
  }
}


// ======================================================
// HTML META
// ======================================================

function getMeta(html, names) {

  for (const name of names) {

    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        "i"
      ),

      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
        "i"
      )
    ];

    for (const pattern of patterns) {

      const match = html.match(pattern);

      if (match && match[1]) {
        return decodeHtml(match[1]);
      }
    }
  }

  return "";
}


function getTitle(html) {

  const og = getMeta(html, [
    "og:title",
    "twitter:title"
  ]);

  if (og) return cleanText(og);

  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match
    ? cleanText(match[1])
    : "";
}


function getDescription(html) {

  const meta = getMeta(html, [
    "description",
    "og:description",
    "twitter:description"
  ]);

  return cleanText(meta);
}


function getImage(html, baseUrl) {

  const image = getMeta(html, [
    "og:image",
    "twitter:image",
    "twitter:image:src"
  ]);

  return absoluteUrl(image, baseUrl);
}


// ======================================================
// JSON-LD
// ======================================================

function extractJsonLd(html) {

  const blocks = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {

    const raw = match[1].trim();

    if (!raw) continue;

    try {

      const json = JSON.parse(raw);

      if (Array.isArray(json)) {
        blocks.push(...json);
      } else {
        blocks.push(json);
      }

    } catch {
      // ignore malformed JSON-LD
    }
  }

  return blocks;
}


function findJsonLdArticle(html) {

  const blocks = extractJsonLd(html);

  for (const block of blocks) {

    const type = String(
      block?.["@type"] || ""
    ).toLowerCase();

    if (
      type.includes("article") ||
      type.includes("newsarticle") ||
      type.includes("blogposting")
    ) {
      return block;
    }
  }

  return null;
}


// ======================================================
// DATE FROM HTML
// ======================================================

function extractDateFromHtml(html) {

  const jsonArticle = findJsonLdArticle(html);

  if (jsonArticle) {

    const values = [
      jsonArticle.datePublished,
      jsonArticle.dateCreated,
      jsonArticle.dateModified
    ];

    for (const value of values) {

      const date = parseDateValue(value);

      if (date) return date;
    }
  }

  const metaDate = getMeta(html, [
    "article:published_time",
    "datePublished",
    "date",
    "pubdate"
  ]);

  const metaParsed = parseDateValue(metaDate);

  if (metaParsed) {
    return metaParsed;
  }

  const visiblePatterns = [
    /\b(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](20\d{2})\b/,
    /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/
  ];

  for (const pattern of visiblePatterns) {

    const match = html.match(pattern);

    if (!match) continue;

    let date;

    if (match[1].length === 4) {

      date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );

    } else {

      date = new Date(
        Number(match[3]),
        Number(match[2]) - 1,
        Number(match[1])
      );
    }

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}


// ======================================================
// TOPIC
// ======================================================

function getTopicCategory(title) {

  const text = String(title || "")
    .toLowerCase();

  if (
    /ипотек|ипотеч|семейн.*ипотек|ставк.*кредит|кредит|рефинанс|банк|банки/.test(text)
  ) {
    return "mortgage";
  }

  if (
    /новострой|новостроек|застройщик|застройщики|девелопер|жк |жилой комплекс|строительств|домов|дольщик|долев/.test(text)
  ) {
    return "newbuildings";
  }

  if (
    /закон|законодатель|росреестр|госдум|минфин|правительств|налог|штраф|правил|изменен|регулирован/.test(text)
  ) {
    return "laws";
  }

  return "realty";
}


// ======================================================
// DOMRF RELEVANCE
// ======================================================

function isRelevantDomrfArticle(title, description) {

  const text = normalizeText(
    `${title} ${description}`
  );

  const irrelevant = [

    /пенси/,
    /пенсион/,
    /пособи/,
    /социальн.*выплат/,
    /выходн.*ноябр/,
    /как отдыхаем/,
    /праздник/,
    /туризм/,
    /путешеств/,
    /погода/,
    /рецепт/,
    /здоров/,
    /спорт/,
    /телефонн.*мошен/,
    /стар.*вещ/,
    /не стоит выбрасывать/
  ];

  if (
    irrelevant.some(pattern => pattern.test(text))
  ) {

    const strongRealEstate = [
      /ипотек/,
      /квартир/,
      /недвижим/,
      /жиль/,
      /новостро/,
      /застройщик/,
      /росреестр/,
      /егрн/,
      /кадастр/,
      /ижс/,
      /земельн.*участ/,
      /жкх/,
      /жку/,
      /капремонт/,
      /маткапитал/,
      /долев/
    ];

    if (
      !strongRealEstate.some(pattern => pattern.test(text))
    ) {
      return false;
    }
  }

  const strong = [
    /недвижим/,
    /квартир/,
    /жиль/,
    /ипотек/,
    /новостро/,
    /застройщик/,
    /девелопер/,
    /вторич/,
    /аренд/,
    /долев/,
    /маткапитал/,
    /росреестр/,
    /егрн/,
    /кадастр/,
    /ижс/,
    /земельн.*участ/,
    /домовлад/,
    /жкх/,
    /жку/,
    /коммуналь/,
    /капремонт/,
    /жилищн/
  ];

  const context = [
    /ставк/,
    /кредит/,
    /собственник/,
    /владельц/,
    /регистрац/,
    /налог/,
    /правил/,
    /программ/,
    /господдерж/
  ];

  const strongCount =
    strong.filter(pattern => pattern.test(text)).length;

  const contextCount =
    context.filter(pattern => pattern.test(text)).length;

  if (
    /маткапитал/.test(text)
  ) {
    return true;
  }

  if (
    /жкх|жку|коммуналь|капремонт/.test(text) &&
    strongCount >= 1
  ) {
    return true;
  }

  if (
    /егрн|росреестр|кадастр/.test(text)
  ) {
    return true;
  }

  if (
    /владельц.*недвижим/.test(text) &&
    /регистрац|ограничен|собствен/.test(text)
  ) {
    return true;
  }

  if (strongCount >= 2) {
    return true;
  }

  if (
    strongCount >= 1 &&
    contextCount >= 1
  ) {
    return true;
  }

  return false;
}


// ======================================================
// URL EXTRACTION
// ======================================================

function extractLinks(html, baseUrl) {

  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {

    const href = absoluteUrl(
      decodeHtml(match[1]),
      baseUrl
    );

    if (!href) continue;

    const text = cleanText(match[2]);

    result.push({
      url: stripQuery(href),
      text
    });
  }

  return result;
}


// ======================================================
// 161.RU / 93.RU LIST
// ======================================================

function extractN1Links(html, sourceId) {

  const links = extractLinks(
    html,
    SOURCES[sourceId].listUrl
  );

  const source = SOURCES[sourceId];

  const host =
    sourceId === "161ru"
      ? "161.ru"
      : "93.ru";

  const regex =
    new RegExp(
      `^https://${host.replace(".", "\\.")}/text/realty/20\\d{2}/\\d{2}/\\d{2}/\\d+/?$`,
      "i"
    );

  const unique = new Map();

  for (const item of links) {

    if (!regex.test(item.url)) continue;

    unique.set(
      item.url,
      item
    );
  }

  return Array.from(unique.values());
}


// ======================================================
// KRASDOM LIST
// ======================================================

function extractKrasdomLinks(html) {

  const links = extractLinks(
    html,
    SOURCES.krasdom.listUrl
  );

  const unique = new Map();

  for (const item of links) {

    if (
      !/^https:\/\/krasdom\.ru\/news\/.+/i.test(item.url)
    ) {
      continue;
    }

    if (
      item.url ===
      "https://krasdom.ru/news/"
    ) {
      continue;
    }

    unique.set(
      item.url,
      item
    );
  }

  return Array.from(unique.values());
}


// ======================================================
// DOMRF LIST
// ======================================================

function extractDomrfLinks(html) {

  const links = extractLinks(
    html,
    SOURCES.domrf.listUrl
  );

  const unique = new Map();

  for (const item of links) {

    try {

      const u = new URL(item.url);

      const hostname =
        u.hostname.toLowerCase();

      const isDomrf =
        hostname === "xn--h1alcedd.xn--d1aqf.xn--p1ai" ||
        hostname === "спроси.дом.рф";

      if (!isDomrf) continue;

      if (
        !/^\/news\/.+/i.test(u.pathname)
      ) {
        continue;
      }

      unique.set(
        stripQuery(u.href),
        {
          url: stripQuery(u.href),
          text: item.text
        }
      );

    } catch {
      // ignore
    }
  }

  return Array.from(unique.values());
}


// ======================================================
// DOMCLICK
// ======================================================

function isDomclickArticleUrl(url) {

  try {

    const u = new URL(url);

    if (
      u.hostname !== "blog.domclick.ru"
    ) {
      return false;
    }

    return (
      /^\/novosti\/post\/[^/]+/i.test(u.pathname) ||
      /^\/novosti\/[^/]+/i.test(u.pathname)
    );

  } catch {
    return false;
  }
}


function extractDomclickLinks(html) {

  const links = extractLinks(
    html,
    "https://blog.domclick.ru/novosti"
  );

  const unique = new Map();

  for (const item of links) {

    if (
      !isDomclickArticleUrl(item.url)
    ) {
      continue;
    }

    unique.set(
      item.url,
      {
        url: item.url,
        text: item.text
      }
    );
  }

  return Array.from(unique.values());
}


// ======================================================
// DOMCLICK SEARCH FALLBACK
// ======================================================

async function fetchDomclickSearch() {

  const queries = [
    "site:blog.domclick.ru/novosti/post Домклик недвижимость",
    "site:blog.domclick.ru/novosti/post Домклик ипотека",
    "site:blog.domclick.ru/novosti/post Домклик новостройки"
  ];

  const results = [];

  for (const query of queries) {

    try {

      const url =
        "https://www.google.com/search?q=" +
        encodeURIComponent(query) +
        "&num=20";

      const response =
        await fetchText(
          url,
          {
            accept:
              "text/html,application/xhtml+xml",
            referer:
              "https://www.google.com/"
          }
        );

      const links =
        extractLinks(
          response.text,
          "https://www.google.com/"
        );

      for (const item of links) {

        if (
          isDomclickArticleUrl(item.url)
        ) {

          results.push({
            url: stripQuery(item.url),
            text: item.text
          });
        }
      }

    } catch {
      // search fallback failed
    }
  }

  const unique = new Map();

  for (const item of results) {
    unique.set(item.url, item);
  }

  return Array.from(unique.values());
}


// ======================================================
// DOMCLICK TELEGRAM FALLBACK
// ======================================================
//
// Этот fallback используется только для обнаружения
// заголовков/дат, если сам журнал закрыт от Vercel.
//
// Ссылка карточки при этом остается официальной
// только если удалось обнаружить официальный URL.
//

async function fetchDomclickTelegram() {

  const url =
    "https://t.me/s/domclick";

  try {

    const response =
      await fetchText(
        url,
        {
          referer:
            "https://t.me/"
        }
      );

    return response.text;

  } catch {

    return "";
  }
}


// ======================================================
// ARTICLE PARSER
// ======================================================

async function parseArticle(
  sourceId,
  candidate,
  days
) {

  const source =
    SOURCES[sourceId];

  try {

    const response =
      await fetchText(
        candidate.url,
        {
          referer:
            source.listUrl
        }
      );

    const html =
      response.text;

    const title =
      getTitle(html);

    if (!title) {

      return {
        status: "rejected",
        reason: "empty-title"
      };
    }

    const description =
      getDescription(html);

    const date =
      extractDateFromHtml(html);

    if (!date) {

      return {
        status: "rejected",
        reason: "no-date"
      };
    }

    if (!isRecent(date, days)) {

      return {
        status: "rejected",
        reason: "old"
      };
    }

    if (
      sourceId === "domrf" &&
      !isRelevantDomrfArticle(
        title,
        description
      )
    ) {

      return {
        status: "rejected",
        reason: "irrelevant"
      };
    }

    const image =
      getImage(
        html,
        candidate.url
      );

    const item = {

      id:
        Buffer
          .from(candidate.url)
          .toString("base64")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(-24),

      sourceId,

      source:
        source.name,

      category:
        source.category,

      topic:
        getTopicCategory(title),

      title:
        cleanText(title),

      description:
        cleanText(description),

      url:
        candidate.url,

      image:
        image || "",

      date:
        formatDate(date),

      publishedAt:
        date.toISOString()

    };

    return {
      status: "ok",
      item
    };

  } catch (error) {

    return {
      status: "failed",
      error:
        error?.message ||
        String(error)
    };
  }
}


// ======================================================
// DOMCLICK SPECIAL PARSER
// ======================================================

async function processDomclick(days) {

  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  let candidates = [];

  // ----------------------------------------------------
  // ATTEMPT 1 — MAIN PAGE
  // ----------------------------------------------------

  try {

    const response =
      await fetchText(
        SOURCES.domclick.listUrl,
        {
          referer:
            "https://domclick.ru/"
        }
      );

    const links =
      extractDomclickLinks(
        response.text
      );

    candidates.push(...links);

    diagnostics.attempts.push({
      method: "main",
      status: "ok",
      candidates: links.length
    });

  } catch (error) {

    diagnostics.attempts.push({
      method: "main",
      status: "failed",
      error:
        error?.message ||
        String(error),
      httpStatus:
        error?.status || null
    });
  }


  // ----------------------------------------------------
  // ATTEMPT 2 — ALTERNATIVE JOURNAL URL
  // ----------------------------------------------------

  const alternativeUrls = [
    "https://blog.domclick.ru/",
    "https://blog.domclick.ru/novosti/",
    "https://blog.domclick.ru/novosti?page=1"
  ];

  for (const url of alternativeUrls) {

    if (candidates.length >= 10) {
      break;
    }

    try {

      const response =
        await fetchText(
          url,
          {
            referer:
              "https://blog.domclick.ru/"
          }
        );

      const links =
        extractDomclickLinks(
          response.text
        );

      candidates.push(...links);

      diagnostics.attempts.push({
        method: "alternative",
        url,
        status: "ok",
        candidates: links.length
      });

    } catch (error) {

      diagnostics.attempts.push({
        method: "alternative",
        url,
        status: "failed",
        error:
          error?.message ||
          String(error),
        httpStatus:
          error?.status || null
      });
    }
  }


  // ----------------------------------------------------
  // UNIQUE
  // ----------------------------------------------------

  const unique =
    new Map();

  for (const candidate of candidates) {

    if (
      !isDomclickArticleUrl(
        candidate.url
      )
    ) {
      continue;
    }

    unique.set(
      candidate.url,
      candidate
    );
  }

  candidates =
    Array.from(unique.values());

  diagnostics.candidates =
    candidates.length;


  // ----------------------------------------------------
  // PARSE OFFICIAL ARTICLES
  // ----------------------------------------------------

  const items = [];

  for (const candidate of candidates.slice(0, 30)) {

    const result =
      await parseArticle(
        "domclick",
        candidate,
        days
      );

    if (result.status === "ok") {

      diagnostics.recentCandidates++;

      items.push(
        result.item
      );

    } else if (
      result.status === "rejected"
    ) {

      diagnostics.rejected++;

    } else {

      diagnostics.failed++;
    }
  }


  // ----------------------------------------------------
  // SEARCH FALLBACK
  // ----------------------------------------------------

  if (
    items.length === 0
  ) {

    try {

      const searchCandidates =
        await fetchDomclickSearch();

      diagnostics.attempts.push({
        method: "google-search",
        status: "ok",
        candidates:
          searchCandidates.length
      });

      for (
        const candidate
        of searchCandidates.slice(0, 20)
      ) {

        const result =
          await parseArticle(
            "domclick",
            candidate,
            days
          );

        if (
          result.status === "ok"
        ) {

          items.push(
            result.item
          );

        } else if (
          result.status === "rejected"
        ) {

          diagnostics.rejected++;

        } else {

          diagnostics.failed++;
        }
      }

    } catch (error) {

      diagnostics.attempts.push({
        method: "google-search",
        status: "failed",
        error:
          error?.message ||
          String(error)
      });
    }
  }


  // ----------------------------------------------------
  // SORT
  // ----------------------------------------------------

  items.sort(
    (a, b) =>
      new Date(b.publishedAt) -
      new Date(a.publishedAt)
  );


  return {
    items,
    diagnostics
  };
}


// ======================================================
// GENERIC SOURCE PROCESSOR
// ======================================================

async function processSource(
  sourceId,
  days
) {

  const source =
    SOURCES[sourceId];

  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  try {

    const response =
      await fetchText(
        source.listUrl,
        {
          referer:
            source.listUrl
        }
      );

    let candidates = [];

    switch (source.type) {

      case "n1":
        candidates =
          extractN1Links(
            response.text,
            sourceId
          );
        break;

      case "krasdom":
        candidates =
          extractKrasdomLinks(
            response.text
          );
        break;

      case "domrf":
        candidates =
          extractDomrfLinks(
            response.text
          );
        break;

      default:
        candidates = [];
    }

    diagnostics.candidates =
      candidates.length;

    const items = [];

    for (
      const candidate
      of candidates.slice(0, 50)
    ) {

      const result =
        await parseArticle(
          sourceId,
          candidate,
          days
        );

      if (
        result.status === "ok"
      ) {

        diagnostics.recentCandidates++;

        items.push(
          result.item
        );

      } else if (
        result.status === "rejected"
      ) {

        diagnostics.rejected++;

      } else {

        diagnostics.failed++;
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );

    return {
      items,
      diagnostics
    };

  } catch (error) {

    diagnostics.failed++;

    return {
      items: [],
      diagnostics: {
        ...diagnostics,
        error:
          error?.message ||
          String(error),
        httpStatus:
          error?.status || null
      }
    };
  }
}


// ======================================================
// DUPLICATES
// ======================================================

function removeDuplicates(items) {

  const result = [];

  const seenUrls =
    new Set();

  const seenTitles =
    new Set();

  for (const item of items) {

    const url =
      stripQuery(item.url);

    const title =
      normalizeText(item.title);

    if (
      seenUrls.has(url)
    ) {
      continue;
    }

    if (
      seenTitles.has(title)
    ) {
      continue;
    }

    seenUrls.add(url);
    seenTitles.add(title);

    result.push(item);
  }

  return result;
}


// ======================================================
// NEAR DUPLICATES
// ======================================================

function titleTokens(title) {

  return normalizeText(title)
    .split(" ")
    .filter(word => word.length >= 4);
}


function titleSimilarity(a, b) {

  const aa =
    new Set(titleTokens(a));

  const bb =
    new Set(titleTokens(b));

  if (!aa.size || !bb.size) {
    return 0;
  }

  let intersection = 0;

  for (const word of aa) {

    if (bb.has(word)) {
      intersection++;
    }
  }

  const union =
    new Set([
      ...aa,
      ...bb
    ]).size;

  return intersection / union;
}


function removeNearDuplicates(items) {

  const result = [];

  for (const item of items) {

    let duplicate = false;

    for (const existing of result) {

      const similarity =
        titleSimilarity(
          item.title,
          existing.title
        );

      if (
        similarity >= 0.82
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


// ======================================================
// BALANCE SOURCES
// ======================================================

function balanceSources(items, limit) {

  const sourceGroups =
    new Map();

  for (const item of items) {

    if (!sourceGroups.has(item.sourceId)) {
      sourceGroups.set(
        item.sourceId,
        []
      );
    }

    sourceGroups
      .get(item.sourceId)
      .push(item);
  }

  const result = [];

  const groups =
    Array.from(
      sourceGroups.values()
    );

  let index = 0;

  while (
    result.length < limit &&
    groups.some(
      group => group.length > 0
    )
  ) {

    const group =
      groups[index % groups.length];

    if (
      group &&
      group.length > 0
    ) {

      result.push(
        group.shift()
      );
    }

    index++;
  }

  return result;
}


// ======================================================
// MAIN
// ======================================================

export default async function handler(
  req,
  res
) {

  try {

    const url =
      new URL(
        req.url,
        "https://urban-estate-news-test.vercel.app"
      );

    const requestedCategory =
      url.searchParams.get(
        "category"
      ) || "all";

    const limit =
      Math.min(
        Math.max(
          Number(
            url.searchParams.get(
              "limit"
            ) || DEFAULT_LIMIT
          ),
          1
        ),
        50
      );

    const days =
      Math.min(
        Math.max(
          Number(
            url.searchParams.get(
              "days"
            ) || DEFAULT_DAYS
          ),
          1
        ),
        30
      );


    // --------------------------------------------------
    // SOURCE PROCESSING
    // --------------------------------------------------

    const sourceIds = [
      "161ru",
      "93ru",
      "krasdom",
      "domrf",
      "domclick"
    ];

    const results =
      await Promise.all(
        sourceIds.map(
          sourceId => {

            if (
              sourceId === "domclick"
            ) {

              return processDomclick(
                days
              );
            }

            return processSource(
              sourceId,
              days
            );
          }
        )
      );


    // --------------------------------------------------
    // COLLECT
    // --------------------------------------------------

    let allItems = [];

    const diagnostics = {};


    for (
      let i = 0;
      i < sourceIds.length;
      i++
    ) {

      const sourceId =
        sourceIds[i];

      const result =
        results[i];

      allItems.push(
        ...result.items
      );

      diagnostics[sourceId] =
        result.diagnostics;
    }


    // --------------------------------------------------
    // REMOVE DUPLICATES
    // --------------------------------------------------

    allItems =
      removeDuplicates(
        allItems
      );

    allItems =
      removeNearDuplicates(
        allItems
      );


    // --------------------------------------------------
    // CATEGORY
    // --------------------------------------------------

    if (
      requestedCategory &&
      requestedCategory !== "all"
    ) {

      allItems =
        allItems.filter(
          item =>
            item.topic ===
            requestedCategory ||
            item.category ===
            requestedCategory
        );
    }


    // --------------------------------------------------
    // SORT
    // --------------------------------------------------

    allItems.sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );


    // --------------------------------------------------
    // BALANCE SOURCES
    // --------------------------------------------------

    const balanced =
      balanceSources(
        allItems,
        limit
      );


    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.status(200).json({

      ok: true,

      category:
        requestedCategory,

      count:
        balanced.length,

      items:
        balanced,

      sources:
        diagnostics

    });

  } catch (error) {

    res.status(500).json({

      ok: false,

      error:
        error?.message ||
        String(error)

    });
  }
}
