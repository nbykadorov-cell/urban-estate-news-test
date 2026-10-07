const crypto = require("crypto");

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
   TEXT
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
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanTitle(str) {
  if (!str) return "";

  return cleanText(str)
    .replace(/^Новости\s*[:—-]\s*/i, "")
    .replace(/^ЦИАН\s*[:—-]\s*/i, "")
    .replace(/^Домклик\s*[:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanDescription(str, sourceId) {
  if (!str) return "";

  let text = cleanText(str);

  text = text
    .replace(/Please open Telegram to view this post/gi, "")
    .replace(/VIEW IN TELEGRAM/gi, "")
    .replace(/Домклик в MAX\s*[—-]\s*подписаться/gi, "")
    .replace(/\b\d+(?:\.\d+)?[KКМ]?\s*views?\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?[KКМ]?\s*просмотр(?:а|ов)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (sourceId === "yandexrealty") {
    text = text
      .replace(
        /\s*[-—]\s*Новости\.\s*.*?в Журнале Недвижимости$/i,
        ""
      )
      .replace(
        /\s+в Журнале Недвижимости$/i,
        ""
      )
      .trim();
  }

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


/* =========================================================
   URL
========================================================= */

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

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "from",
      "erid",
      "yclid",
      "ysclid"
    ].forEach(param => {
      u.searchParams.delete(param);
    });

    u.hash = "";

    return u.href.replace(/\/+$/, "");
  } catch {
    return String(url).trim();
  }
}


/*
 * ВАЖНО:
 * Раньше здесь использовался Base64 + slice(0,32).
 * Из-за этого URL одного домена получали одинаковые ID.
 *
 * Теперь ID действительно уникальный.
 */
function makeId(url) {
  const normalized = normalizeUrl(url);

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 24);
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

        "Accept-Language":
          "ru-RU,ru;q=0.9,en;q=0.8",

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
      error:
        error && error.message
          ? error.message
          : String(error)
    };

  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   HTML META
========================================================= */

function extractMeta(html, names) {
  for (const name of names) {
    const escaped =
      name.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

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
  const scripts =
    html.match(
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
          if (
            item &&
            typeof item === "object" &&
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

      if (
        json &&
        typeof json === "object"
      ) {
        if (
          json["@graph"] &&
          Array.isArray(json["@graph"])
        ) {
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
  const jsonLd =
    extractJsonLd(html);

  if (jsonLd) {
    const date =
      jsonLd.datePublished ||
      jsonLd.dateModified ||
      jsonLd.uploadDate;

    if (date) {
      const parsed =
        new Date(date);

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        return parsed;
      }
    }
  }

  const metaDate =
    extractMeta(html, [
      "article:published_time",
      "article:modified_time",
      "datePublished",
      "date",
      "pubdate",
      "publish-date",
      "published_time"
    ]);

  if (metaDate) {
    const parsed =
      new Date(metaDate);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed;
    }
  }

  const timeMatch =
    html.match(
      /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i
    );

  if (timeMatch) {
    const parsed =
      new Date(timeMatch[1]);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed;
    }
  }

  return null;
}


function extractTitleFromHtml(html) {
  const jsonLd =
    extractJsonLd(html);

  if (
    jsonLd &&
    jsonLd.headline
  ) {
    return cleanTitle(
      jsonLd.headline
    );
  }

  const ogTitle =
    extractMeta(html, [
      "og:title",
      "twitter:title"
    ]);

  if (ogTitle) {
    return cleanTitle(
      ogTitle
    );
  }

  const titleMatch =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  if (titleMatch) {
    return cleanTitle(
      titleMatch[1]
    );
  }

  return "";
}


function extractDescriptionFromHtml(
  html,
  sourceId
) {
  const jsonLd =
    extractJsonLd(html);

  if (jsonLd) {
    const description =
      jsonLd.description ||
      jsonLd.articleBody;

    if (description) {
      return cleanDescription(
        description,
        sourceId
      );
    }
  }

  const description =
    extractMeta(html, [
      "description",
      "og:description",
      "twitter:description"
    ]);

  return cleanDescription(
    description,
    sourceId
  );
}


function extractImageFromHtml(html) {
  const jsonLd =
    extractJsonLd(html);

  if (jsonLd) {
    if (jsonLd.image) {
      if (
        typeof jsonLd.image ===
        "string"
      ) {
        return jsonLd.image;
      }

      if (
        Array.isArray(
          jsonLd.image
        )
      ) {
        return (
          jsonLd.image[0] || ""
        );
      }

      if (
        typeof jsonLd.image ===
        "object"
      ) {
        return (
          jsonLd.image.url || ""
        );
      }
    }
  }

  return extractMeta(
    html,
    [
      "og:image",
      "twitter:image"
    ]
  );
}


/* =========================================================
   DATES
========================================================= */

function dateFromNewsUrl(url) {
  const match =
    String(url).match(
      /\/text\/realty\/(\d{4})\/(\d{2})\/(\d{2})\/\d+/
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
      0,
      0
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}


function dateFromDomrfUrl(url) {
  const match =
    String(url).match(
      /(?:na|ot|po|za)-?(\d{1,2})-([a-zа-яё]+)-(\d{4})/i
    );

  if (!match) {
    return null;
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

  const month =
    months[
      match[2].toLowerCase()
    ];

  if (
    month === undefined
  ) {
    return null;
  }

  const date =
    new Date(
      Number(match[3]),
      month,
      Number(match[1]),
      12,
      0,
      0
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}


function isRecent(date, days) {
  if (!date) {
    return false;
  }

  const now =
    Date.now();

  const diff =
    now - date.getTime();

  return (
    diff <=
      days *
      24 *
      60 *
      60 *
      1000
  ) &&
  diff >=
    -24 *
    60 *
    60 *
    1000;
}


/* =========================================================
   TOPIC
========================================================= */

function classifyTopic(
  title,
  description
) {
  const text =
    (
      (title || "") +
      " " +
      (description || "")
    ).toLowerCase();

  if (
    /ипотек|ипотечн|ставк[аи]|кредит|маткапитал|материнск|семейн.*ипотек/.test(
      text
    )
  ) {
    return "mortgage";
  }

  if (
    /новострой|застройщик|девелоп|жк\s|жилой комплекс|строительств|ввод жилья|новое жиль/.test(
      text
    )
  ) {
    return "newbuildings";
  }

  if (
    /законодатель|закон |закон:|росреестр|егрн|кадастр|госуслуг|правил[а-я]* сделки|изменени[яй].*(рынк|недвиж|жиль)|госпошлин/.test(
      text
    )
  ) {
    return "legislation";
  }

  if (
    /как |документ|проверить|проверка|договор|сделк|мошен|риск|продаж[аи]|покупк[аи]|риелтор|риэлтор/.test(
      text
    )
  ) {
    return "useful";
  }

  return "realty";
}


/* =========================================================
   FOREIGN NEWS FILTER
========================================================= */

function isRussianMarketRelevant(
  title,
  description
) {
  const text =
    (
      (title || "") +
      " " +
      (description || "")
    ).toLowerCase();

  const foreignPatterns = [
    /\bсша\b/,
    /\bамерикан/,
    /\bамерик/,
    /\bлондон/,
    /\bангли/,
    /\bвеликобритани/,
    /\bбритан/,
    /\bяпони/,
    /\bяпонск/,
    /\bтурци/,
    /\bтурецк/,
    /\bдубай/,
    /\bоаэ/,
    /\bэмират/,
    /\bкитай/,
    /\bкитайск/,
    /\bфранци/,
    /\bфранцузск/,
    /\bпариж/,
    /\bгермани/,
    /\bнемецк/,
    /\bберлин/,
    /\bиспан/,
    /\bмадрид/,
    /\bитал/,
    /\bрим\b/,
    /\bканад/,
    /\bторонто/,
    /\bавстрали/,
    /\bсидней/,
    /\bфилиппин/,
    /\bиндонези/,
    /\bтаиланд/,
    /\bтайланд/,
    /\bбали/,
    /\bнью[- ]?йорк/,
    /\bмайами/,
    /\bкалифорни/,
    /\bтехас/,
    /\bфлорида/,
    /\bфиладельфи/,
    /\bсан[- ]?франциск/
  ];

  return !foreignPatterns.some(
    re => re.test(text)
  );
}


/* =========================================================
   ARTICLE
========================================================= */

async function fetchArticle(
  candidate,
  source
) {
  const response =
    await fetchText(
      candidate.url
    );

  if (!response.ok) {
    return null;
  }

  const html =
    response.text;

  let title =
    extractTitleFromHtml(
      html
    );

  let description =
    extractDescriptionFromHtml(
      html,
      source.id
    );

  let image =
    extractImageFromHtml(
      html
    );

  let date =
    extractDateFromHtml(
      html
    );

  if (
    !date &&
    candidate.date
  ) {
    date =
      candidate.date;
  }

  if (
    !date &&
    source.id === "domrf"
  ) {
    date =
      dateFromDomrfUrl(
        candidate.url
      );
  }

  if (!title) {
    title =
      candidate.title || "";
  }

  if (!description) {
    description =
      candidate.description || "";
  }

  if (!image) {
    image =
      candidate.image || "";
  }

  title =
    cleanTitle(title);

  description =
    cleanDescription(
      description,
      source.id
    );

  if (!title) {
    return null;
  }

  if (
    source.id ===
    "yandexrealty"
  ) {
    if (
      !isRussianMarketRelevant(
        title,
        description
      )
    ) {
      return null;
    }
  }

  return {
    id: makeId(
      candidate.url
    ),

    source:
      source.id,

    sourceName:
      source.name,

    title,

    description,

    url:
      normalizeUrl(
        candidate.url
      ),

    image:
      absoluteUrl(
        image,
        candidate.url
      ),

    publishedAt:
      date
        ? date.toISOString()
        : null,

    topic:
      classifyTopic(
        title,
        description
      )
  };
}


/* =========================================================
   LINKS
========================================================= */

function extractLinks(
  html,
  source
) {
  const links = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    const rawUrl =
      match[1];

    const anchor =
      cleanText(
        match[2]
      );

    const url =
      absoluteUrl(
        rawUrl,
        source.url
      );

    if (!url) {
      continue;
    }

    let u;

    try {
      u =
        new URL(url);
    } catch {
      continue;
    }

    const path =
      u.pathname;

    let valid = false;

    if (
      source.id === "161ru"
    ) {
      valid =
        /^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+(?:\/)?$/i.test(
          path
        ) &&
        !/\/comments(?:\/|$)/i.test(
          path
        );
    }

    if (
      source.id === "93ru"
    ) {
      valid =
        /^\/text\/realty\/\d{4}\/\d{2}\/\d{2}\/\d+(?:\/)?$/i.test(
          path
        ) &&
        !/\/comments(?:\/|$)/i.test(
          path
        );
    }

    if (
      source.id === "krasdom"
    ) {
      valid =
        /^\/news\/\d+(?:\/)?$/i.test(
          path
        );
    }

    if (
      source.id === "domrf"
    ) {
      valid =
        /^\/news\/.+/i.test(
          path
        ) &&
        !/^\/news\/?$/i.test(
          path
        );
    }

    if (
      source.id ===
      "yandexrealty"
    ) {
      valid =
        /^\/journal\/post\/[^/]+/i.test(
          path
        );
    }

    if (
      source.id === "cian"
    ) {
      valid =
        /^\/magazine\/[^/]+/i.test(
          path
        ) &&
        !/^\/magazine\/?$/i.test(
          path
        ) &&
        !/\/magazine\/tag\//i.test(
          path
        ) &&
        !/\/magazine\/search/i.test(
          path
        );
    }

    if (
      source.id ===
      "domclick"
    ) {
      valid =
        /^\/(novosti|articles|article)\//i.test(
          path
        ) ||
        /^\/[^/]+\/[^/]+/i.test(
          path
        );

      if (
        /\/videos?\//i.test(
          path
        )
      ) {
        valid = false;
      }
    }

    if (!valid) {
      continue;
    }

    const normalized =
      normalizeUrl(url);

    if (
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);

    links.push({
      url: normalized,
      title: anchor,

      date:
        (
          source.id === "161ru" ||
          source.id === "93ru"
        )
          ? dateFromNewsUrl(
              normalized
            )
          : source.id ===
              "domrf"
            ? dateFromDomrfUrl(
                normalized
              )
            : null
    });

    if (
      links.length >=
      MAX_CANDIDATES_PER_SOURCE
    ) {
      break;
    }
  }

  return links;
}


/* =========================================================
   GENERIC
========================================================= */

async function parseGenericSource(
  source,
  days
) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page =
    await fetchText(
      source.url
    );

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error:
        page.error || null,
      httpStatus:
        page.status || null
    };
  }

  let candidates =
    extractLinks(
      page.text,
      source
    );

  diagnostics.candidates =
    candidates.length;

  candidates =
    candidates.filter(
      candidate => {
        if (
          candidate.date
        ) {
          if (
            !isRecent(
              candidate.date,
              days
            )
          ) {
            diagnostics.rejected++;
            return false;
          }
        }

        return true;
      }
    );

  diagnostics.recentCandidates =
    candidates.length;

  const items = [];

  for (
    let i = 0;
    i < candidates.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch =
      candidates.slice(
        i,
        i +
          ARTICLE_CONCURRENCY
      );

    const results =
      await Promise.all(
        batch.map(
          candidate =>
            fetchArticle(
              candidate,
              source
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

      if (
        !item.publishedAt
      ) {
        diagnostics.rejected++;
        continue;
      }

      if (
        !isRecent(
          new Date(
            item.publishedAt
          ),
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
   KRASDOM
========================================================= */

async function parseKrasdom(
  source,
  days
) {
  return parseGenericSource(
    source,
    days
  );
}


/* =========================================================
   DOMRF
========================================================= */

async function parseDomrf(
  source,
  days
) {
  return parseGenericSource(
    source,
    days
  );
}


/* =========================================================
   YANDEX
========================================================= */

async function parseYandex(
  source,
  days
) {
  const result =
    await parseGenericSource(
      source,
      days
    );

  result.items =
    result.items.filter(
      item =>
        isRussianMarketRelevant(
          item.title,
          item.description
        )
    );

  return result;
}


/* =========================================================
   DOMCLICK TELEGRAM
========================================================= */

function parseTelegramPosts(
  html
) {
  const posts = [];

  const blocks =
    html.split(
      /tgme_widget_message_wrap/gi
    );

  for (
    const block of blocks
  ) {
    if (
      !/blog\.domclick\.ru/i.test(
        block
      )
    ) {
      continue;
    }

    const urlMatches =
      block.match(
        /https?:\/\/blog\.domclick\.ru\/[^"'<>\\\s]+/gi
      ) || [];

    if (
      !urlMatches.length
    ) {
      continue;
    }

    let articleUrl = "";

    for (
      const raw of urlMatches
    ) {
      const cleaned =
        raw
          .replace(
            /&amp;/g,
            "&"
          )
          .replace(
            /[)"'>]+$/g,
            ""
          );

      try {
        const parsed =
          new URL(
            cleaned
          );

        if (
          /\/videos?\//i.test(
            parsed.pathname
          )
        ) {
          continue;
        }

        articleUrl =
          normalizeUrl(
            cleaned
          );

        break;

      } catch {
        /* ignore */
      }
    }

    if (!articleUrl) {
      continue;
    }

    if (
      /\/videos?\//i.test(
        articleUrl
      )
    ) {
      continue;
    }

    let text = "";

    const textMatch =
      block.match(
        /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i
      );

    if (textMatch) {
      text =
        cleanText(
          textMatch[1]
        );
    }

    text =
      text
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
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    let image = "";

    const photoMatch =
      block.match(
        /tgme_widget_message_photo_wrap[^>]*style=["'][^"']*url\(['"]?([^'")]+)['"]?\)/i
      );

    if (
      photoMatch
    ) {
      image =
        photoMatch[1];
    }

    if (!image) {
      const imgMatch =
        block.match(
          /<img[^>]+src=["']([^"']+)["']/i
        );

      if (
        imgMatch
      ) {
        image =
          imgMatch[1];
      }
    }

    const dateMatch =
      block.match(
        /datetime=["']([^"']+)["']/i
      );

    let date = null;

    if (
      dateMatch
    ) {
      const parsed =
        new Date(
          dateMatch[1]
        );

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        date =
          parsed;
      }
    }

    if (
      !text
    ) {
      continue;
    }

    posts.push({
      url:
        articleUrl,

      telegramText:
        text,

      image,

      date
    });
  }

  return posts;
}


/*
 * Пытаемся взять нормальный title/description
 * непосредственно со страницы Домклика.
 *
 * Это принципиально лучше, чем использовать
 * Telegram-пост как заголовок.
 */
async function enrichDomclickPost(
  post,
  source
) {
  const article =
    await fetchText(
      post.url
    );

  if (
    article.ok
  ) {
    const title =
      extractTitleFromHtml(
        article.text
      );

    const description =
      extractDescriptionFromHtml(
        article.text,
        source.id
      );

    const image =
      extractImageFromHtml(
        article.text
      );

    const date =
      extractDateFromHtml(
        article.text
      ) ||
      post.date;

    if (
      title
    ) {
      return {
        id:
          makeId(
            post.url
          ),

        source:
          source.id,

        sourceName:
          source.name,

        title:
          cleanTitle(
            title
          ),

        description:
          cleanDescription(
            description ||
              post.telegramText,
            source.id
          ),

        url:
          normalizeUrl(
            post.url
          ),

        image:
          absoluteUrl(
            image ||
              post.image,
            post.url
          ),

        publishedAt:
          date
            ? date.toISOString()
            : null,

        topic:
          classifyTopic(
            title,
            description ||
              post.telegramText
          )
      };
    }
  }

  /*
   * Fallback:
   * если статья временно недоступна,
   * всё равно оставляем новость,
   * но очищаем Telegram-текст.
   */
  const telegramText =
    cleanDescription(
      post.telegramText,
      source.id
    );

  /*
   * Попытка отделить заголовок
   * от текста Telegram.
   */
  let title =
    telegramText;

  let description =
    "";

  const separator =
    telegramText.search(
      /\s{2,}|(?=Рассказываем|Подробнее|Как |Почему |Что |Все |Если )/i
    );

  if (
    separator > 30
  ) {
    title =
      telegramText
        .slice(
          0,
          separator
        )
        .trim();

    description =
      telegramText
        .slice(
          separator
        )
        .trim();
  }

  return {
    id:
      makeId(
        post.url
      ),

    source:
      source.id,

    sourceName:
      source.name,

    title:
      cleanTitle(
        title
      ),

    description:
      cleanDescription(
        description,
        source.id
      ),

    url:
      normalizeUrl(
        post.url
      ),

    image:
      absoluteUrl(
        post.image,
        post.url
      ),

    publishedAt:
      post.date
        ? post.date.toISOString()
        : null,

    topic:
      classifyTopic(
        title,
        description
      )
  };
}


async function parseDomclick(
  source,
  days
) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  const blog =
    await fetchText(
      source.url
    );

  diagnostics.attempts.push({
    url:
      source.url,
    status:
      blog.status,
    ok:
      blog.ok
  });

  let posts = [];

  if (
    blog.ok
  ) {
    const candidates =
      extractLinks(
        blog.text,
        source
      );

    posts =
      candidates.map(
        candidate => ({
          url:
            candidate.url,

          telegramText:
            candidate.title,

          image:
            "",

          date:
            candidate.date
        })
      );
  }

  if (
    !posts.length
  ) {
    const telegramUrl =
      "https://t.me/s/domclick";

    const telegram =
      await fetchText(
        telegramUrl
      );

    diagnostics.attempts.push({
      url:
        telegramUrl,
      status:
        telegram.status,
      ok:
        telegram.ok
    });

    if (
      telegram.ok
    ) {
      posts =
        parseTelegramPosts(
          telegram.text
        );
    }
  }

  diagnostics.candidates =
    posts.length;

  const recentPosts =
    posts.filter(
      post => {
        if (
          !post.date
        ) {
          /*
           * Telegram не всегда отдаёт дату
           * в удобном формате.
           * В таком случае не выбрасываем пост.
           */
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

  for (
    let i = 0;
    i < recentPosts.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch =
      recentPosts.slice(
        i,
        i +
          ARTICLE_CONCURRENCY
      );

    const results =
      await Promise.all(
        batch.map(
          post =>
            enrichDomclickPost(
              post,
              source
            )
        )
      );

    for (
      const item of results
    ) {
      if (
        !item ||
        !item.title
      ) {
        diagnostics.failed++;
        continue;
      }

      if (
        /\/videos?\//i.test(
          item.url
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      if (
        item.publishedAt
      ) {
        if (
          !isRecent(
            new Date(
              item.publishedAt
            ),
            days
          )
        ) {
          diagnostics.rejected++;
          continue;
        }
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
   XML
========================================================= */

function extractXmlTag(
  xml,
  tag
) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const re =
    new RegExp(
      `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
      "i"
    );

  const match =
    xml.match(re);

  return match
    ? cleanText(
        match[1]
      )
    : "";
}


function extractXmlAttribute(
  xml,
  tag,
  attr
) {
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

  const re =
    new RegExp(
      `<${escapedTag}\\b[^>]*${escapedAttr}=["']([^"']+)["']`,
      "i"
    );

  const match =
    xml.match(re);

  return match
    ? decodeEntities(
        match[1]
      )
    : "";
}


function parseCianRss(
  xml,
  source
) {
  const items = [];

  const blocks =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (
    const block of blocks
  ) {
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

    if (
      pubDate
    ) {
      const parsed =
        new Date(
          pubDate
        );

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        date =
          parsed;
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

    if (
      !title ||
      !url
    ) {
      continue;
    }

    items.push({
      id:
        makeId(url),

      source:
        source.id,

      sourceName:
        source.name,

      title,

      description,

      url,

      image:
        absoluteUrl(
          image,
          url
        ),

      publishedAt:
        date
          ? date.toISOString()
          : null,

      topic:
        classifyTopic(
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

function findCianRssUrl(
  html,
  baseUrl
) {
  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    const href =
      match[1];

    const text =
      cleanText(
        match[2]
      ).toLowerCase();

    if (
      /rss/.test(text) ||
      /rss/i.test(href) ||
      /новости\s*[-—]?\s*rss/i.test(
        text
      )
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


async function parseCian(
  source,
  days
) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page =
    await fetchText(
      source.url
    );

  if (!page.ok) {
    diagnostics.failed = 1;

    return {
      items: [],
      diagnostics,
      error:
        page.error || null,
      httpStatus:
        page.status || null
    };
  }

  let rssUrl =
    findCianRssUrl(
      page.text,
      source.url
    );

  if (!rssUrl) {
    const rssMatch =
      page.text.match(
        /<link[^>]+(?:type=["']application\/rss\+xml["']|type=["']application\/xml["'])[^>]+href=["']([^"']+)["']/i
      );

    if (
      rssMatch
    ) {
      rssUrl =
        absoluteUrl(
          rssMatch[1],
          source.url
        );
    }
  }

  let rssItems = [];

  if (
    rssUrl
  ) {
    const rss =
      await fetchText(
        rssUrl,
        {
          headers: {
            Accept:
              "application/rss+xml, application/xml, text/xml, */*"
          }
        }
      );

    if (
      rss.ok
    ) {
      rssItems =
        parseCianRss(
          rss.text,
          source
        );
    }
  }

  if (
    rssItems.length
  ) {
    diagnostics.candidates =
      rssItems.length;

    const recent =
      [];

    for (
      const item of rssItems
    ) {
      if (
        !item.publishedAt
      ) {
        diagnostics.rejected++;
        continue;
      }

      if (
        !isRecent(
          new Date(
            item.publishedAt
          ),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      recent.push(item);
    }

    diagnostics.recentCandidates =
      recent.length;

    return {
      items:
        recent,
      diagnostics
    };
  }

  /*
   * HTML fallback
   */
  const candidates =
    extractLinks(
      page.text,
      source
    );

  diagnostics.candidates =
    candidates.length;

  const items = [];

  for (
    let i = 0;
    i < candidates.length;
    i += ARTICLE_CONCURRENCY
  ) {
    const batch =
      candidates.slice(
        i,
        i +
          ARTICLE_CONCURRENCY
      );

    const results =
      await Promise.all(
        batch.map(
          candidate =>
            fetchArticle(
              candidate,
              source
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

      if (
        !item.publishedAt
      ) {
        diagnostics.rejected++;
        continue;
      }

      if (
        !isRecent(
          new Date(
            item.publishedAt
          ),
          days
        )
      ) {
        diagnostics.rejected++;
        continue;
      }

      items.push(item);
    }
  }

  diagnostics.recentCandidates =
    items.length;

  return {
    items,
    diagnostics
  };
}


/* =========================================================
   DEDUPE
========================================================= */

function dedupeItems(
  items
) {
  const result = [];

  const seenUrls =
    new Set();

  const seenTitles =
    new Set();

  for (
    const item of items
  ) {
    const url =
      normalizeUrl(
        item.url
      );

    const title =
      cleanTitle(
        item.title
      )
        .toLowerCase()
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (
      !url ||
      !title
    ) {
      continue;
    }

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

    result.push({
      ...item,
      url,
      id:
        makeId(url)
    });
  }

  return result;
}


/* =========================================================
   BALANCE
========================================================= */

function balanceItems(
  items,
  limit
) {
  const groups = {};

  for (
    const item of items
  ) {
    if (
      !groups[item.source]
    ) {
      groups[item.source] =
        [];
    }

    groups[item.source].push(
      item
    );
  }

  const sourceIds =
    Object.keys(
      groups
    );

  if (
    !sourceIds.length
  ) {
    return [];
  }

  for (
    const sourceId of sourceIds
  ) {
    groups[sourceId].sort(
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
      const sourceId of sourceIds
    ) {
      if (
        result.length >=
        limit
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
   API
========================================================= */

module.exports = async function handler(
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
        error:
          "Method not allowed"
      });
  }

  try {
    const query =
      req.query || {};

    const category =
      String(
        query.category ||
          "all"
      ).toLowerCase();

    let limit =
      parseInt(
        query.limit,
        10
      );

    if (
      !Number.isFinite(
        limit
      ) ||
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
      !Number.isFinite(
        days
      ) ||
      days <= 0
    ) {
      days =
        DEFAULT_DAYS;
    }

    days =
      Math.min(
        days,
        30
      );

    const sourceResults =
      [];

    for (
      const source of Object.values(
        SOURCES
      )
    ) {
      try {
        let result;

        if (
          source.parser ===
          "krasdom"
        ) {
          result =
            await parseKrasdom(
              source,
              days
            );
        }

        else if (
          source.parser ===
          "domrf"
        ) {
          result =
            await parseDomrf(
              source,
              days
            );
        }

        else if (
          source.parser ===
          "domclick"
        ) {
          result =
            await parseDomclick(
              source,
              days
            );
        }

        else if (
          source.parser ===
          "yandex"
        ) {
          result =
            await parseYandex(
              source,
              days
            );
        }

        else if (
          source.parser ===
          "cian"
        ) {
          result =
            await parseCian(
              source,
              days
            );
        }

        else {
          result =
            await parseGenericSource(
              source,
              days
            );
        }

        sourceResults.push({
          source,
          result
        });

      } catch (
        error
      ) {
        sourceResults.push({
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

    let allItems = [];

    const sourceDiagnostics =
      {};

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
        name:
          source.name,

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

    allItems =
      dedupeItems(
        allItems
      );

    /*
     * Category filtering
     */
    if (
      category !== "all"
    ) {
      allItems =
        allItems.filter(
          item => {
            if (
              category ===
              "krasnodar"
            ) {
              return (
                item.source ===
                  "93ru" ||
                item.source ===
                  "krasdom"
              );
            }

            if (
              category ===
              "rostov"
            ) {
              return (
                item.source ===
                "161ru"
              );
            }

            if (
              category ===
              "mortgage"
            ) {
              return (
                item.topic ===
                "mortgage"
              );
            }

            if (
              category ===
              "newbuildings"
            ) {
              return (
                item.topic ===
                "newbuildings"
              );
            }

            if (
              category ===
              "legislation"
            ) {
              return (
                item.topic ===
                "legislation"
              );
            }

            if (
              category ===
              "useful"
            ) {
              return (
                item.topic ===
                "useful"
              );
            }

            if (
              category ===
              "realty"
            ) {
              return (
                item.topic ===
                "realty"
              );
            }

            if (
              category ===
              "federal"
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
        count:
          items.length,
        items,
        sources:
          sourceDiagnostics
      });

  } catch (
    error
  ) {
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
