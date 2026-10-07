// api/news.js

// ======================================================
// SOURCES
// ======================================================

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

  "domrf": {
    id: "zni758",
    name: "ДОМ.РФ",
    category: "federal",
    listUrl: "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/",
    type: "domrf"
  },

  "domclick": {
    id: "e74yvs",
    name: "Домклик",
    category: "federal",
    listUrl: "https://blog.domclick.ru/novosti",
    telegramUrl: "https://t.me/s/domclick",
    type: "domclick"
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
// TEXT HELPERS
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

  if (!url) {
    return "";
  }

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
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

  if (!value) {
    return null;
  }

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

  if (
    !(date instanceof Date) ||
    isNaN(date.getTime())
  ) {
    return "";
  }

  const d =
    String(date.getDate())
      .padStart(2, "0");

  const m =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const y =
    date.getFullYear();

  return `${y}-${m}-${d}`;

}


function daysAgoDate(days) {

  const date = new Date();

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


function isRecent(date, days) {

  if (
    !(date instanceof Date) ||
    isNaN(date.getTime())
  ) {
    return false;
  }

  const minDate =
    daysAgoDate(days);

  return date >= minDate;

}


// ======================================================
// DATE FROM N1 URL
// ======================================================

function dateFromN1Url(url) {

  try {

    const u =
      new URL(url);

    const match =
      u.pathname.match(
        /\/realty\/(20\d{2})\/(\d{2})\/(\d{2})\//
      );

    if (!match) {
      return null;
    }

    const date =
      new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );

    if (
      isNaN(date.getTime())
    ) {
      return null;
    }

    return date;

  } catch {

    return null;

  }

}


// ======================================================
// FETCH
// ======================================================

async function fetchText(
  url,
  options = {}
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT
    );

  try {

    const headers = {

      "User-Agent":
        options.userAgent ||
        USER_AGENTS[
          Math.floor(
            Math.random() *
            USER_AGENTS.length
          )
        ],

      "Accept":
        options.accept ||
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

      "Accept-Language":
        "ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6",

      "Cache-Control":
        "no-cache",

      "Pragma":
        "no-cache"

    };

    // ВАЖНО:
    // Referer с кириллицей нельзя напрямую передавать
    // в Headers. Для ДОМ.РФ используется punycode URL.

    if (options.referer) {
      headers["Referer"] =
        options.referer;
    }

    const response =
      await fetch(
        url,
        {
          method: "GET",
          redirect: "follow",
          headers,
          signal:
            controller.signal
        }
      );

    const text =
      await response.text();

    if (!response.ok) {

      const error =
        new Error(
          `HTTP ${response.status}`
        );

      error.status =
        response.status;

      error.body =
        text.slice(0, 500);

      throw error;

    }

    return {

      text,

      status:
        response.status,

      finalUrl:
        response.url

    };

  } finally {

    clearTimeout(timer);

  }

}


// ======================================================
// META
// ======================================================

function getMeta(
  html,
  names
) {

  for (
    const name
    of names
  ) {

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

    for (
      const pattern
      of patterns
    ) {

      const match =
        html.match(pattern);

      if (
        match &&
        match[1]
      ) {

        return decodeHtml(
          match[1]
        );

      }

    }

  }

  return "";

}


function getTitle(html) {

  const og =
    getMeta(
      html,
      [
        "og:title",
        "twitter:title"
      ]
    );

  if (og) {
    return cleanText(og);
  }

  const match =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  return match
    ? cleanText(match[1])
    : "";

}


function getDescription(html) {

  const meta =
    getMeta(
      html,
      [
        "description",
        "og:description",
        "twitter:description"
      ]
    );

  return cleanText(meta);

}


function getImage(
  html,
  baseUrl
) {

  const image =
    getMeta(
      html,
      [
        "og:image",
        "twitter:image",
        "twitter:image:src"
      ]
    );

  return absoluteUrl(
    image,
    baseUrl
  );

}


// ======================================================
// JSON-LD
// ======================================================

function extractJsonLd(html) {

  const blocks = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {

    const raw =
      match[1].trim();

    if (!raw) {
      continue;
    }

    try {

      const json =
        JSON.parse(raw);

      if (Array.isArray(json)) {
        blocks.push(...json);
      } else {
        blocks.push(json);
      }

    } catch {
      // ignore
    }

  }

  return blocks;

}


function findJsonLdArticle(html) {

  const blocks =
    extractJsonLd(html);

  for (
    const block
    of blocks
  ) {

    const type =
      String(
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
// DATE FROM ARTICLE HTML
// ======================================================

function extractDateFromHtml(html) {

  const jsonArticle =
    findJsonLdArticle(html);

  if (jsonArticle) {

    const values = [

      jsonArticle.datePublished,

      jsonArticle.dateCreated,

      jsonArticle.dateModified

    ];

    for (
      const value
      of values
    ) {

      const date =
        parseDateValue(value);

      if (date) {
        return date;
      }

    }

  }

  const metaDate =
    getMeta(
      html,
      [
        "article:published_time",
        "datePublished",
        "date",
        "pubdate"
      ]
    );

  const metaParsed =
    parseDateValue(
      metaDate
    );

  if (metaParsed) {
    return metaParsed;
  }

  const visiblePatterns = [

    /\b(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](20\d{2})\b/,

    /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/

  ];

  for (
    const pattern
    of visiblePatterns
  ) {

    const match =
      html.match(pattern);

    if (!match) {
      continue;
    }

    let date;

    if (
      match[1].length === 4
    ) {

      date =
        new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3])
        );

    } else {

      date =
        new Date(
          Number(match[3]),
          Number(match[2]) - 1,
          Number(match[1])
        );

    }

    if (
      !isNaN(date.getTime())
    ) {
      return date;
    }

  }

  return null;

}


// ======================================================
// TOPIC
// ======================================================

function getTopicCategory(title) {

  const text =
    String(title || "")
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

function isRelevantDomrfArticle(
  title,
  description
) {

  const text =
    normalizeText(
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
    irrelevant.some(
      pattern =>
        pattern.test(text)
    )
  ) {

    const strongRealEstate = [

      /ипотек/,
      /квартир/,
      /недвижим/,
      /жиль/,
      /новостро/,
      /застройщик/,
      /девелопер/,
      /вторичн/,
      /аренд/,
      /долев/,
      /маткапитал/,
      /росреестр/,
      /егрн/,
      /кадастр/,
      /ижс/,
      /земельн.*участ/,
      /жкх/,
      /жку/,
      /капремонт/

    ];

    if (
      !strongRealEstate.some(
        pattern =>
          pattern.test(text)
      )
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
    strong.filter(
      pattern =>
        pattern.test(text)
    ).length;

  const contextCount =
    context.filter(
      pattern =>
        pattern.test(text)
    ).length;

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

  if (
    strongCount >= 2
  ) {
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
// LINKS
// ======================================================

function extractLinks(
  html,
  baseUrl
) {

  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {

    const href =
      absoluteUrl(
        decodeHtml(match[1]),
        baseUrl
      );

    if (!href) {
      continue;
    }

    const text =
      cleanText(match[2]);

    result.push({

      url:
        stripQuery(href),

      text

    });

  }

  return result;

}


// ======================================================
// 161 / 93
// ======================================================

function extractN1Links(
  html,
  sourceId
) {

  const links =
    extractLinks(
      html,
      SOURCES[sourceId].listUrl
    );

  const host =
    sourceId === "161ru"
      ? "161.ru"
      : "93.ru";

  const regex =
    new RegExp(
      `^https://${host.replace(".", "\\.")}/text/realty/20\\d{2}/\\d{2}/\\d{2}/\\d+/?$`,
      "i"
    );

  const unique =
    new Map();

  for (
    const item
    of links
  ) {

    if (
      !regex.test(item.url)
    ) {
      continue;
    }

    unique.set(
      item.url,
      item
    );

  }

  return Array.from(
    unique.values()
  );

}


// ======================================================
// KRASDOM
// ======================================================

function extractKrasdomLinks(html) {

  const links =
    extractLinks(
      html,
      SOURCES.krasdom.listUrl
    );

  const unique =
    new Map();

  for (
    const item
    of links
  ) {

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

  return Array.from(
    unique.values()
  );

}


// ======================================================
// DOMRF
// ======================================================

function extractDomrfLinks(html) {

  const links =
    extractLinks(
      html,
      SOURCES.domrf.listUrl
    );

  const unique =
    new Map();

  for (
    const item
    of links
  ) {

    try {

      const u =
        new URL(item.url);

      const hostname =
        u.hostname.toLowerCase();

      const isDomrf =
        hostname ===
          "xn--h1alcedd.xn--d1aqf.xn--p1ai" ||
        hostname ===
          "xn--h1alcedd.xn--d1aqf.xn--p1ai";

      if (!isDomrf) {
        continue;
      }

      if (
        !/^\/news\/.+/i.test(
          u.pathname
        )
      ) {
        continue;
      }

      unique.set(
        stripQuery(u.href),
        {
          url:
            stripQuery(u.href),
          text:
            item.text
        }
      );

    } catch {
      // ignore
    }

  }

  return Array.from(
    unique.values()
  );

}


// ======================================================
// DOMCLICK ARTICLE URL
// ======================================================

function isDomclickArticleUrl(url) {

  try {

    const u =
      new URL(url);

    if (
      u.hostname !==
      "blog.domclick.ru"
    ) {
      return false;
    }

    return (
      /^\/novosti\/post\/[^/]+/i.test(
        u.pathname
      ) ||
      /^\/novosti\/[^/]+/i.test(
        u.pathname
      )
    );

  } catch {

    return false;

  }

}


// ======================================================
// DOMCLICK TELEGRAM PARSER
// ======================================================

function extractTelegramImage(
  block
) {

  const patterns = [

    /background-image:url\(['"]?([^'")]+)['"]?\)/i,

    /<img[^>]+src=["']([^"']+)["']/i,

    /<img[^>]+data-src=["']([^"']+)["']/i

  ];

  for (
    const pattern
    of patterns
  ) {

    const match =
      block.match(pattern);

    if (
      match &&
      match[1]
    ) {

      return decodeHtml(
        match[1]
      );

    }

  }

  return "";

}


function extractTelegramDate(
  block
) {

  const patterns = [

    /<time[^>]+datetime=["']([^"']+)["']/i,

    /datetime=["']([^"']+)["']/i

  ];

  for (
    const pattern
    of patterns
  ) {

    const match =
      block.match(pattern);

    if (
      match &&
      match[1]
    ) {

      const date =
        parseDateValue(
          match[1]
        );

      if (date) {
        return date;
      }

    }

  }

  return null;

}


function extractTelegramText(
  block
) {

  const patterns = [

    /<div[^>]+class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,

    /<div[^>]+class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i

  ];

  for (
    const pattern
    of patterns
  ) {

    const match =
      block.match(pattern);

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


function extractTelegramArticleLinks(
  block
) {

  const links =
    extractLinks(
      block,
      "https://t.me/s/domclick"
    );

  const result = [];

  for (
    const item
    of links
  ) {

    if (
      isDomclickArticleUrl(
        item.url
      )
    ) {

      result.push({
        url:
          item.url,
        text:
          item.text
      });

    }

  }

  return result;

}


function getTelegramTitle(
  text,
  articleLinks
) {

  if (
    articleLinks.length &&
    articleLinks[0].text
  ) {

    const linkText =
      cleanText(
        articleLinks[0].text
      );

    if (
      linkText.length >= 20 &&
      !/^читать|подробнее|узнать/i.test(
        linkText
      )
    ) {

      return linkText;

    }

  }

  const lines =
    String(text || "")
      .split(/\n+/)
      .map(line =>
        cleanText(line)
      )
      .filter(Boolean);

  for (
    const line
    of lines
  ) {

    if (
      line.length < 20
    ) {
      continue;
    }

    if (
      /^https?:\/\//i.test(line)
    ) {
      continue;
    }

    if (
      /читать|подробнее|журнал домклик|подписаться/i.test(line) &&
      line.length < 80
    ) {
      continue;
    }

    return line
      .replace(
        /^[^\p{L}\p{N}«"]+/u,
        ""
      )
      .trim();

  }

  return "";

}


function extractDomclickTelegramPosts(
  html
) {

  const posts = [];

  // Telegram groups each post in tgme_widget_message_wrap.
  const blockRegex =
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;

  let match;

  while (
    (match = blockRegex.exec(html))
  ) {

    const block =
      match[0];

    const articleLinks =
      extractTelegramArticleLinks(
        block
      );

    if (
      !articleLinks.length
    ) {
      continue;
    }

    const date =
      extractTelegramDate(
        block
      );

    const text =
      extractTelegramText(
        block
      );

    const title =
      getTelegramTitle(
        text,
        articleLinks
      );

    if (
      !title ||
      !date
    ) {
      continue;
    }

    const image =
      extractTelegramImage(
        block
      );

    posts.push({

      title,

      description:
        text
          .replace(title, "")
          .replace(/\s+/g, " ")
          .trim(),

      url:
        articleLinks[0].url,

      image,

      date

    });

  }

  return posts;

}


// ======================================================
// DOMCLICK TELEGRAM
// ======================================================

async function processDomclick(
  days
) {

  const diagnostics = {

    candidates: 0,

    recentCandidates: 0,

    rejected: 0,

    failed: 0,

    attempts: []

  };

  const items = [];

  // ----------------------------------------------------
  // MAIN BLOG — EXPECTED 401
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
      extractLinks(
        response.text,
        SOURCES.domclick.listUrl
      );

    diagnostics.attempts.push({

      method:
        "blog",

      status:
        "ok",

      candidates:
        links.length

    });

  } catch (error) {

    diagnostics.attempts.push({

      method:
        "blog",

      status:
        "failed",

      error:
        error?.message ||
        String(error),

      httpStatus:
        error?.status ||
        null

    });

  }


  // ----------------------------------------------------
  // OFFICIAL TELEGRAM
  // ----------------------------------------------------

  try {

    const response =
      await fetchText(
        SOURCES.domclick.telegramUrl,
        {
          referer:
            "https://t.me/"
        }
      );

    const posts =
      extractDomclickTelegramPosts(
        response.text
      );

    diagnostics.attempts.push({

      method:
        "telegram",

      status:
        "ok",

      candidates:
        posts.length

    });

    diagnostics.candidates =
      posts.length;


    for (
      const post
      of posts
    ) {

      if (
        !isRecent(
          post.date,
          days
        )
      ) {

        diagnostics.rejected++;

        continue;
      }

      diagnostics.recentCandidates++;

      items.push({

        id:
          Buffer
            .from(
              post.url
            )
            .toString("base64")
            .replace(
              /[^a-zA-Z0-9]/g,
              ""
            )
            .slice(-24),

        sourceId:
          "domclick",

        source:
          "Домклик",

        category:
          "federal",

        topic:
          getTopicCategory(
            post.title
          ),

        title:
          post.title,

        description:
          post.description,

        url:
          post.url,

        image:
          post.image || "",

        date:
          formatDate(
            post.date
          ),

        publishedAt:
          post.date.toISOString()

      });

    }

  } catch (error) {

    diagnostics.attempts.push({

      method:
        "telegram",

      status:
        "failed",

      error:
        error?.message ||
        String(error)

    });

    diagnostics.failed++;

  }


  // ----------------------------------------------------
  // SORT
  // ----------------------------------------------------

  items.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ) -
      new Date(
        a.publishedAt
      )
  );


  return {

    items,

    diagnostics

  };

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

        status:
          "rejected",

        reason:
          "empty-title"

      };

    }

    const description =
      getDescription(html);

    let date =
      extractDateFromHtml(
        html
      );


    // --------------------------------------------------
    // IMPORTANT:
    // 161.RU / 93.RU contain date in article URL.
    // --------------------------------------------------

    if (
      !date &&
      source.type === "n1"
    ) {

      date =
        dateFromN1Url(
          candidate.url
        );

    }


    if (!date) {

      return {

        status:
          "rejected",

        reason:
          "no-date"

      };

    }


    if (
      !isRecent(
        date,
        days
      )
    ) {

      return {

        status:
          "rejected",

        reason:
          "old"

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

        status:
          "rejected",

        reason:
          "irrelevant"

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
          .from(
            candidate.url
          )
          .toString("base64")
          .replace(
            /[^a-zA-Z0-9]/g,
            ""
          )
          .slice(-24),

      sourceId,

      source:
        source.name,

      category:
        source.category,

      topic:
        getTopicCategory(
          title
        ),

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

      status:
        "ok",

      item

    };

  } catch (error) {

    return {

      status:
        "failed",

      error:
        error?.message ||
        String(error)

    };

  }

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


    switch (
      source.type
    ) {

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
      of candidates.slice(
        0,
        50
      )
    ) {

      const result =
        await parseArticle(
          sourceId,
          candidate,
          days
        );


      if (
        result.status ===
        "ok"
      ) {

        diagnostics.recentCandidates++;

        items.push(
          result.item
        );

      } else if (
        result.status ===
        "rejected"
      ) {

        diagnostics.rejected++;

      } else {

        diagnostics.failed++;

      }

    }


    items.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
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
          error?.status ||
          null

      }

    };

  }

}


// ======================================================
// DUPLICATES
// ======================================================

function removeDuplicates(
  items
) {

  const result = [];

  const seenUrls =
    new Set();

  const seenTitles =
    new Set();


  for (
    const item
    of items
  ) {

    const url =
      stripQuery(
        item.url
      );

    const title =
      normalizeText(
        item.title
      );


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

function titleTokens(
  title
) {

  return normalizeText(
    title
  )
    .split(" ")
    .filter(
      word =>
        word.length >= 4
    );

}


function titleSimilarity(
  a,
  b
) {

  const aa =
    new Set(
      titleTokens(a)
    );

  const bb =
    new Set(
      titleTokens(b)
    );


  if (
    !aa.size ||
    !bb.size
  ) {
    return 0;
  }


  let intersection = 0;


  for (
    const word
    of aa
  ) {

    if (
      bb.has(word)
    ) {
      intersection++;
    }

  }


  const union =
    new Set([
      ...aa,
      ...bb
    ]).size;


  return (
    intersection /
    union
  );

}


function removeNearDuplicates(
  items
) {

  const result = [];


  for (
    const item
    of items
  ) {

    let duplicate =
      false;


    for (
      const existing
      of result
    ) {

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

      result.push(
        item
      );

    }

  }


  return result;

}


// ======================================================
// BALANCE SOURCES
// ======================================================

function balanceSources(
  items,
  limit
) {

  const sourceGroups =
    new Map();


  for (
    const item
    of items
  ) {

    if (
      !sourceGroups.has(
        item.sourceId
      )
    ) {

      sourceGroups.set(
        item.sourceId,
        []
      );

    }


    sourceGroups
      .get(
        item.sourceId
      )
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
      group =>
        group.length > 0
    )
  ) {

    const group =
      groups[
        index %
        groups.length
      ];


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
// MAIN API
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
            ) ||
            DEFAULT_LIMIT
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
            ) ||
            DEFAULT_DAYS
          ),
          1
        ),
        30
      );


    // --------------------------------------------------
    // SOURCES
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
              sourceId ===
              "domclick"
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
    // DUPLICATES
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
      requestedCategory !==
        "all"
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
        new Date(
          b.publishedAt
        ) -
        new Date(
          a.publishedAt
        )
    );


    // --------------------------------------------------
    // BALANCE
    // --------------------------------------------------

    const balanced =
      balanceSources(
        allItems,
        limit
      );


    // --------------------------------------------------
    // HEADERS
    // --------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );


    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );


    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

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
