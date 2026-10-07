const SOURCES = [
  {
    id: "161ru",
    name: "161.RU",
    category: "rostov",
    url: "https://161.ru/text/realty/",
    type: "n1"
  },
  {
    id: "93ru",
    name: "93.RU",
    category: "krasnodar",
    url: "https://93.ru/text/realty/",
    type: "n1"
  },
  {
    id: "krasdom",
    name: "КРАСДОМ",
    category: "krasnodar",
    url: "https://krasdom.ru/news/",
    type: "krasdom"
  },
  {
    id: "domrf",
    name: "ДОМ.РФ",
    category: "federal",
    url: "https://xn--h1alcedd.xn--d1aqf.xn--p1ai/news/",
    type: "domrf"
  },
  {
    id: "domclick",
    name: "Домклик",
    category: "federal",
    url: "https://blog.domclick.ru/novosti",
    telegramUrl: "https://t.me/s/domclick",
    type: "domclick"
  },
  {
    id: "yandexrealty",
    name: "Яндекс Недвижимость",
    category: "federal",
    url: "https://realty.yandex.ru/journal/category/news/",
    type: "yandexrealty"
  },
  {
    id: "cian",
    name: "ЦИАН",
    category: "federal",
    url: "https://krasnodar.cian.ru/magazine/",
    type: "cian"
  }
];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;
const DEFAULT_DAYS = 7;

const SOURCE_TIMEOUT = 12000;

const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "из",
  "за",
  "для",
  "с",
  "со",
  "к",
  "ко",
  "у",
  "о",
  "об",
  "от",
  "до",
  "не",
  "что",
  "как",
  "а",
  "но",
  "или",
  "это",
  "при",
  "же",
  "ли",
  "бы",
  "мы",
  "они",
  "он",
  "она",
  "их",
  "его",
  "ее",
  "уже",
  "так",
  "все",
  "всё",
  "будет",
  "быть"
]);


/* =========================================================
   TEXT HELPERS
   ========================================================= */

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
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


function cleanTextPreserveLines(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}


/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function makeId(value) {
  try {
    return Buffer.from(String(value || ""), "utf8")
      .toString("base64")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32);
  } catch {
    return String(Date.now());
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function getDateOnly(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}


function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}


function dateFromN1Url(url) {
  const match = String(url || "").match(
    /\/(\d{4})\/(\d{2})\/(\d{2})\//
  );

  if (!match) {
    return null;
  }

  const date = new Date(
    `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}


function isRecent(date, days) {
  if (!date) {
    return false;
  }

  const now = Date.now();
  const diff = now - date.getTime();

  return (
    diff >= -24 * 60 * 60 * 1000 &&
    diff <= days * 24 * 60 * 60 * 1000
  );
}


/* =========================================================
   DUPLICATES
   ========================================================= */

function getTextTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter(
      word =>
        word.length >= 3 &&
        !STOP_WORDS.has(word)
    );
}


function similarity(a, b) {
  const aa = new Set(getTextTokens(a));
  const bb = new Set(getTextTokens(b));

  if (!aa.size || !bb.size) {
    return 0;
  }

  let common = 0;

  for (const word of aa) {
    if (bb.has(word)) {
      common++;
    }
  }

  return common / Math.max(aa.size, bb.size);
}


function isNearDuplicate(a, b) {
  if (!a || !b) {
    return false;
  }

  if (
    normalizeText(a) ===
    normalizeText(b)
  ) {
    return true;
  }

  return similarity(a, b) >= 0.72;
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ru-RU,ru;q=0.9,en;q=0.8"
      }
    });

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}`
      );

      error.httpStatus =
        response.status;

      throw error;
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   META / JSON-LD
   ========================================================= */

function extractMeta(html, names) {
  for (const name of names) {
    const escapedName =
      name.replace(
        /[-/\\^$*+?.()|[\]{}]/g,
        "\\$&"
      );

    const regex = new RegExp(
      `<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    );

    const match =
      html.match(regex);

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


function extractJsonLd(html) {
  const scripts = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    const raw = match[1]
      .replace(/<!--/g, "")
      .replace(/-->/g, "")
      .trim();

    if (!raw) {
      continue;
    }

    try {
      scripts.push(
        JSON.parse(raw)
      );
    } catch {
      try {
        const fixed =
          raw
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");

        scripts.push(
          JSON.parse(fixed)
        );
      } catch {}
    }
  }

  return scripts;
}


function findArticleJsonLd(data) {
  const items = Array.isArray(data)
    ? data
    : [data];

  for (const item of items) {
    if (!item) {
      continue;
    }

    if (
      item["@graph"] &&
      Array.isArray(item["@graph"])
    ) {
      const nested =
        findArticleJsonLd(
          item["@graph"]
        );

      if (nested) {
        return nested;
      }
    }

    const type =
      Array.isArray(item["@type"])
        ? item["@type"]
        : [item["@type"]];

    if (
      type.some(value =>
        /article|newsarticle|blogposting/i.test(
          String(value || "")
        )
      )
    ) {
      return item;
    }
  }

  return null;
}


/* =========================================================
   ARTICLE DATE
   ========================================================= */

function extractArticleDate(
  html,
  url,
  jsonLd
) {
  const jsonDate =
    jsonLd?.datePublished ||
    jsonLd?.dateCreated ||
    jsonLd?.dateModified;

  if (jsonDate) {
    const parsed =
      parseDate(jsonDate);

    if (parsed) {
      return parsed;
    }
  }

  const metaDate =
    extractMeta(html, [
      "article:published_time",
      "datePublished",
      "date",
      "pubdate"
    ]);

  if (metaDate) {
    const parsed =
      parseDate(metaDate);

    if (parsed) {
      return parsed;
    }
  }

  const urlDate =
    dateFromN1Url(url);

  if (urlDate) {
    return urlDate;
  }

  return null;
}


/* =========================================================
   LINKS
   ========================================================= */

function extractLinks(html) {
  const links = [];

  const regex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    const url =
      match[1]
        .replace(
          /&amp;/gi,
          "&"
        )
        .trim();

    const text =
      cleanText(match[2]);

    if (!url) {
      continue;
    }

    links.push({
      url,
      text
    });
  }

  return links;
}


function absoluteUrl(
  url,
  base
) {
  try {
    return new URL(
      url,
      base
    ).href;
  } catch {
    return "";
  }
}


/* =========================================================
   TOPIC
   ========================================================= */

function detectTopic(
  title,
  description
) {
  const text =
    normalizeText(
      `${title || ""} ${
        description || ""
      }`
    );

  if (
    /ипотек|ставк|кредит|банк|семейн.*ипотек|рефинанс|первоначальн/.test(
      text
    )
  ) {
    return "mortgage";
  }

  if (
    /новострой|застройщик|жк |жилой комплекс|долев|строительств|дом нов/.test(
      text
    )
  ) {
    return "newbuildings";
  }

  if (
    /закон|законодательств|госдум|госуслуг|егрн|правил|изменен.*услов|налог|маткапитал|материнск|документ|договор|право собственности/.test(
      text
    )
  ) {
    return "law";
  }

  if (
    /продаж.*квартир|покуп.*квартир|вторич|рынок недвижим|цена.*квартир|квартир.*цена|жиль|недвижим/.test(
      text
    )
  ) {
    return "realty";
  }

  return "realty";
}


/* =========================================================
   SOURCE RELEVANCE
   ========================================================= */

function isDomrfRelevant(
  title,
  description,
  url
) {
  const text =
    normalizeText(
      `${title || ""} ${
        description || ""
      } ${url || ""}`
    );

  return /ипотек|недвижим|жиль|квартир|дом|маткапитал|егрн|жку|коммунал|застройщик|строительств|новострой|семейн.*ипотек|рынок/.test(
    text
  );
}


function isYandexRelevant(
  title,
  description
) {
  const text =
    normalizeText(
      `${title || ""} ${
        description || ""
      }`
    );

  return /недвижим|жиль|квартир|ипотек|застройщик|новострой|дом|участок|аренд|жку|коммунал|егрн|росреестр|рынок|строительств|семейн.*ипотек|маткапитал|налог.*недвижим|продаж.*квартир|покуп.*квартир/.test(
    text
  );
}


function isCianRelevant(
  title,
  description
) {
  const text =
    normalizeText(
      `${title || ""} ${
        description || ""
      }`
    );

  return /недвижим|жиль|квартир|ипотек|застройщик|новострой|дом|участок|аренд|жку|коммунал|егрн|росреестр|рынок|строительств|семейн.*ипотек|маткапитал|налог.*недвижим|продаж.*квартир|покуп.*квартир|риелтор|сделк/.test(
    text
  );
}


/* =========================================================
   N1
   ========================================================= */

function isN1ArticleUrl(
  url
) {
  return /\/text\/realty\/\d{4}\/\d{2}\/\d{2}\//i.test(
    url
  );
}


function extractN1Candidates(
  html,
  source
) {
  const links =
    extractLinks(html);

  const candidates = [];

  for (const link of links) {
    const url =
      absoluteUrl(
        link.url,
        source.url
      );

    if (
      !url ||
      !isN1ArticleUrl(url)
    ) {
      continue;
    }

    const title =
      cleanText(link.text);

    if (
      !title ||
      title.length < 10
    ) {
      continue;
    }

    candidates.push({
      url,
      title
    });
  }

  const unique = [];
  const seen = new Set();

  for (
    const item of candidates
  ) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);
    unique.push(item);
  }

  return unique;
}


async function processN1Candidate(
  candidate,
  source,
  days
) {
  try {
    const html =
      await fetchText(
        candidate.url
      );

    const jsonLdData =
      extractJsonLd(html);

    const jsonLd =
      findArticleJsonLd(
        jsonLdData
      );

    const title =
      cleanText(
        jsonLd?.headline
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:title",
            "twitter:title"
          ]
        )
      ) ||
      candidate.title;

    const description =
      cleanText(
        jsonLd?.description
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:description",
            "description",
            "twitter:description"
          ]
        )
      );

    let date =
      extractArticleDate(
        html,
        candidate.url,
        jsonLd
      );

    if (!date) {
      date =
        dateFromN1Url(
          candidate.url
        );
    }

    if (
      !date ||
      !isRecent(date, days)
    ) {
      return null;
    }

    const image =
      cleanText(
        jsonLd?.image?.url ||
        jsonLd?.image
      ) ||
      extractMeta(
        html,
        [
          "og:image",
          "twitter:image"
        ]
      );

    return {
      id: makeId(
        candidate.url
      ),

      sourceId:
        source.id,

      source:
        source.name,

      category:
        source.category,

      topic:
        detectTopic(
          title,
          description
        ),

      title,
      description,

      url:
        candidate.url,

      image,

      date:
        getDateOnly(date),

      publishedAt:
        date.toISOString()
    };
  } catch {
    return null;
  }
}


/* =========================================================
   KRASDOM
   ========================================================= */

function isKrasdomArticleUrl(
  url
) {
  return /krasdom\.ru\/news\/\d+/i.test(
    url
  );
}


function extractKrasdomCandidates(
  html,
  source
) {
  const links =
    extractLinks(html);

  const candidates = [];

  for (const link of links) {
    const url =
      absoluteUrl(
        link.url,
        source.url
      );

    if (
      !url ||
      !isKrasdomArticleUrl(url)
    ) {
      continue;
    }

    const title =
      cleanText(link.text);

    if (
      !title ||
      title.length < 10
    ) {
      continue;
    }

    candidates.push({
      url,
      title
    });
  }

  const unique = [];
  const seen = new Set();

  for (
    const item of candidates
  ) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);
    unique.push(item);
  }

  return unique;
}


async function processKrasdomCandidate(
  candidate,
  source,
  days
) {
  try {
    const html =
      await fetchText(
        candidate.url
      );

    const jsonLdData =
      extractJsonLd(html);

    const jsonLd =
      findArticleJsonLd(
        jsonLdData
      );

    const title =
      cleanText(
        jsonLd?.headline
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:title",
            "twitter:title"
          ]
        )
      ) ||
      candidate.title;

    const description =
      cleanText(
        jsonLd?.description
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:description",
            "description",
            "twitter:description"
          ]
        )
      );

    const date =
      extractArticleDate(
        html,
        candidate.url,
        jsonLd
      );

    if (
      !date ||
      !isRecent(date, days)
    ) {
      return null;
    }

    const image =
      cleanText(
        jsonLd?.image?.url ||
        jsonLd?.image
      ) ||
      extractMeta(
        html,
        [
          "og:image",
          "twitter:image"
        ]
      );

    return {
      id: makeId(
        candidate.url
      ),

      sourceId:
        source.id,

      source:
        source.name,

      category:
        source.category,

      topic:
        detectTopic(
          title,
          description
        ),

      title,
      description,

      url:
        candidate.url,

      image,

      date:
        getDateOnly(date),

      publishedAt:
        date.toISOString()
    };
  } catch {
    return null;
  }
}


/* =========================================================
   DOM.RF
   ========================================================= */

function isDomrfArticleUrl(
  url
) {
  const value =
    String(url || "");

  return (
    /xn--h1alcedd\.xn--d1aqf\.xn--p1ai\/news\/.+/i.test(
      value
    ) ||
    /спроси\.дом\.рф\/news\/.+/i.test(
      value
    )
  );
}


function extractDomrfCandidates(
  html,
  source
) {
  const links =
    extractLinks(html);

  const candidates = [];

  for (const link of links) {
    const url =
      absoluteUrl(
        link.url,
        source.url
      );

    if (
      !url ||
      !isDomrfArticleUrl(url)
    ) {
      continue;
    }

    const title =
      cleanText(link.text);

    if (
      !title ||
      title.length < 10
    ) {
      continue;
    }

    candidates.push({
      url,
      title
    });
  }

  const unique = [];
  const seen = new Set();

  for (
    const item of candidates
  ) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);
    unique.push(item);
  }

  return unique;
}


async function processDomrfCandidate(
  candidate,
  source,
  days
) {
  try {
    const html =
      await fetchText(
        candidate.url
      );

    const jsonLdData =
      extractJsonLd(html);

    const jsonLd =
      findArticleJsonLd(
        jsonLdData
      );

    const title =
      cleanText(
        jsonLd?.headline
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:title",
            "twitter:title"
          ]
        )
      ) ||
      candidate.title;

    const description =
      cleanText(
        jsonLd?.description
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:description",
            "description",
            "twitter:description"
          ]
        )
      );

    if (
      !isDomrfRelevant(
        title,
        description,
        candidate.url
      )
    ) {
      return null;
    }

    const date =
      extractArticleDate(
        html,
        candidate.url,
        jsonLd
      );

    if (
      !date ||
      !isRecent(date, days)
    ) {
      return null;
    }

    const image =
      cleanText(
        jsonLd?.image?.url ||
        jsonLd?.image
      ) ||
      extractMeta(
        html,
        [
          "og:image",
          "twitter:image"
        ]
      );

    return {
      id: makeId(
        candidate.url
      ),

      sourceId:
        source.id,

      source:
        source.name,

      category:
        source.category,

      topic:
        detectTopic(
          title,
          description
        ),

      title,
      description,

      url:
        candidate.url,

      image,

      date:
        getDateOnly(date),

      publishedAt:
        date.toISOString()
    };
  } catch {
    return null;
  }
}


/* =========================================================
   DOMCLICK
   ========================================================= */

function isDomclickArticleUrl(
  url
) {
  const value =
    String(url || "");

  return (
    /blog\.domclick\.ru\/novosti\/post\//i.test(
      value
    ) ||
    /blog\.domclick\.ru\/nedvizhimost\/post\//i.test(
      value
    ) ||
    /blog\.domclick\.ru\/dom-i-uyut\/post\//i.test(
      value
    )
  );
}


function extractDomclickArticleLinks(
  block
) {
  const links = [];

  const regex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(block))
  ) {
    const url =
      match[1]
        .replace(
          /&amp;/gi,
          "&"
        )
        .trim();

    const text =
      cleanText(match[2]);

    if (!url) {
      continue;
    }

    if (
      isDomclickArticleUrl(
        url
      )
    ) {
      links.push({
        url,
        text
      });
    }
  }

  return links;
}


function extractTelegramBlocks(
  html
) {
  const blocks = [];

  const regex =
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    blocks.push(
      match[0]
    );
  }

  return blocks;
}


function extractTelegramText(
  block
) {
  const match =
    block.match(
      /<div[^>]+class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );

  if (!match) {
    return "";
  }

  return cleanTextPreserveLines(
    match[1]
  );
}


function extractTelegramDate(
  block
) {
  const timeMatch =
    block.match(
      /<time[^>]+datetime=["']([^"']+)["']/i
    );

  if (timeMatch) {
    const date =
      parseDate(
        timeMatch[1]
      );

    if (date) {
      return date;
    }
  }

  const titleMatch =
    block.match(
      /<time[^>]+title=["']([^"']+)["']/i
    );

  if (titleMatch) {
    const date =
      parseDate(
        titleMatch[1]
      );

    if (date) {
      return date;
    }
  }

  return null;
}


function extractTelegramImage(
  block
) {
  const imagePatterns = [
    /background-image:url\(["']?([^)"']+)["']?\)/i,
    /<img[^>]+src=["']([^"']+)["']/i
  ];

  for (
    const pattern of imagePatterns
  ) {
    const match =
      block.match(pattern);

    if (
      match &&
      match[1]
    ) {
      return match[1]
        .replace(
          /&amp;/gi,
          "&"
        )
        .trim();
    }
  }

  return "";
}


function cleanTelegramTitle(
  value
) {
  return String(value || "")
    .replace(
      /^[^A-Za-zА-Яа-яЁё0-9«"«]+/u,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function getTelegramTitle(
  text,
  articleLinks
) {
  const lines =
    String(text || "")
      .split("\n")
      .map(line =>
        line.trim()
      )
      .filter(Boolean);

  for (
    const rawLine of lines
  ) {
    if (
      /^https?:\/\//i.test(
        rawLine
      )
    ) {
      continue;
    }

    const title =
      cleanTelegramTitle(
        rawLine
      );

    if (!title) {
      continue;
    }

    if (
      /^(читать|подробнее|узнать|узнайте|в статье|журнал домклик)\b/i.test(
        title
      )
    ) {
      continue;
    }

    if (
      /^домклик в max/i.test(
        title
      )
    ) {
      continue;
    }

    if (
      title.length >= 10
    ) {
      return title;
    }
  }

  if (
    articleLinks &&
    articleLinks.length
  ) {
    for (
      const link of articleLinks
    ) {
      const title =
        cleanTelegramTitle(
          link.text || ""
        );

      if (
        title &&
        title.length >= 20 &&
        !/^(читать|подробнее|узнать|узнайте|журнал)/i.test(
          title
        )
      ) {
        return title;
      }
    }
  }

  return "";
}


function extractTelegramDescription(
  text,
  title
) {
  const lines =
    String(text || "")
      .split("\n")
      .map(line =>
        line.trim()
      )
      .filter(Boolean);

  const normalizedTitle =
    normalizeText(title);

  let titleFound = false;

  const body = [];

  for (
    const rawLine of lines
  ) {
    const line =
      cleanTelegramTitle(
        rawLine
      );

    if (!line) {
      continue;
    }

    if (!titleFound) {
      if (
        normalizeText(line) ===
        normalizedTitle
      ) {
        titleFound = true;
      }

      continue;
    }

    if (
      /домклик в max/i.test(
        line
      )
    ) {
      continue;
    }

    if (
      /please open telegram/i.test(
        line
      )
    ) {
      continue;
    }

    if (
      /^➡️/u.test(
        rawLine
      )
    ) {
      continue;
    }

    if (
      /^https?:\/\//i.test(
        line
      )
    ) {
      continue;
    }

    body.push(line);
  }

  return body
    .join(" ")
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function extractDomclickTelegramPosts(
  html,
  source,
  days
) {
  const blocks =
    extractTelegramBlocks(
      html
    );

  const items = [];

  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  for (
    const block of blocks
  ) {
    try {
      const links =
        extractDomclickArticleLinks(
          block
        );

      if (!links.length) {
        continue;
      }

      diagnostics.candidates++;

      const articleLinks =
        links
          .map(link => ({
            url: absoluteUrl(
              link.url,
              "https://blog.domclick.ru/"
            ),
            text: link.text
          }))
          .filter(link =>
            isDomclickArticleUrl(
              link.url
            )
          );

      if (
        !articleLinks.length
      ) {
        diagnostics.rejected++;
        continue;
      }

      const date =
        extractTelegramDate(
          block
        );

      if (
        !date ||
        !isRecent(date, days)
      ) {
        diagnostics.rejected++;
        continue;
      }

      diagnostics.recentCandidates++;

      const text =
        extractTelegramText(
          block
        );

      if (!text) {
        diagnostics.failed++;
        continue;
      }

      const title =
        getTelegramTitle(
          text,
          articleLinks
        );

      if (!title) {
        diagnostics.failed++;
        continue;
      }

      const description =
        extractTelegramDescription(
          text,
          title
        );

      const url =
        articleLinks[0].url;

      const image =
        extractTelegramImage(
          block
        );

      items.push({
        id: makeId(url),

        sourceId:
          source.id,

        source:
          source.name,

        category:
          source.category,

        topic:
          detectTopic(
            title,
            description
          ),

        title,
        description,

        url,

        image,

        date:
          getDateOnly(date),

        publishedAt:
          date.toISOString()
      });
    } catch {
      diagnostics.failed++;
    }
  }

  return {
    items,
    diagnostics
  };
}


async function processDomclick(
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

  /*
   * Блог Домклика.
   */

  try {
    const html =
      await fetchText(
        source.url
      );

    const links =
      extractLinks(html);

    const candidates = [];

    for (
      const link of links
    ) {
      const url =
        absoluteUrl(
          link.url,
          "https://blog.domclick.ru/"
        );

      if (
        !isDomclickArticleUrl(
          url
        )
      ) {
        continue;
      }

      const title =
        cleanText(link.text);

      if (
        !title ||
        title.length < 10
      ) {
        continue;
      }

      candidates.push({
        url,
        title
      });
    }

    diagnostics.attempts.push({
      method: "blog",
      status: "ok",
      candidates:
        candidates.length
    });

    if (
      candidates.length
    ) {
      diagnostics.candidates +=
        candidates.length;

      const items = [];

      for (
        const candidate of candidates
      ) {
        try {
          const html =
            await fetchText(
              candidate.url
            );

          const jsonLdData =
            extractJsonLd(html);

          const jsonLd =
            findArticleJsonLd(
              jsonLdData
            );

          const title =
            cleanText(
              jsonLd?.headline
            ) ||
            cleanText(
              extractMeta(
                html,
                [
                  "og:title",
                  "twitter:title"
                ]
              )
            ) ||
            candidate.title;

          const description =
            cleanText(
              jsonLd?.description
            ) ||
            cleanText(
              extractMeta(
                html,
                [
                  "og:description",
                  "description",
                  "twitter:description"
                ]
              )
            );

          const date =
            extractArticleDate(
              html,
              candidate.url,
              jsonLd
            );

          if (
            !date ||
            !isRecent(date, days)
          ) {
            diagnostics.rejected++;
            continue;
          }

          diagnostics.recentCandidates++;

          const image =
            cleanText(
              jsonLd?.image?.url ||
              jsonLd?.image
            ) ||
            extractMeta(
              html,
              [
                "og:image",
                "twitter:image"
              ]
            );

          items.push({
            id: makeId(
              candidate.url
            ),

            sourceId:
              source.id,

            source:
              source.name,

            category:
              source.category,

            topic:
              detectTopic(
                title,
                description
              ),

            title,
            description,

            url:
              candidate.url,

            image,

            date:
              getDateOnly(date),

            publishedAt:
              date.toISOString()
          });
        } catch {
          diagnostics.failed++;
        }
      }

      if (items.length) {
        return {
          items,
          diagnostics
        };
      }
    }
  } catch (error) {
    diagnostics.attempts.push({
      method: "blog",
      status: "failed",
      error:
        error.message ||
        "Unknown error",
      httpStatus:
        error.httpStatus ||
        null
    });
  }

  /*
   * Telegram Домклика.
   */

  try {
    const html =
      await fetchText(
        source.telegramUrl
      );

    const telegram =
      extractDomclickTelegramPosts(
        html,
        source,
        days
      );

    diagnostics.candidates +=
      telegram.diagnostics.candidates;

    diagnostics.recentCandidates +=
      telegram.diagnostics.recentCandidates;

    diagnostics.rejected +=
      telegram.diagnostics.rejected;

    diagnostics.failed +=
      telegram.diagnostics.failed;

    diagnostics.attempts.push({
      method: "telegram",
      status: "ok",
      candidates:
        telegram.items.length
    });

    return {
      items:
        telegram.items,

      diagnostics
    };
  } catch (error) {
    diagnostics.attempts.push({
      method: "telegram",
      status: "failed",
      error:
        error.message ||
        "Unknown error",
      httpStatus:
        error.httpStatus ||
        null
    });

    return {
      items: [],
      diagnostics
    };
  }
}


/* =========================================================
   YANDEX REALTY
   ========================================================= */

function isYandexArticleUrl(
  url
) {
  return /realty\.yandex\.ru\/journal\/post\//i.test(
    String(url || "")
  );
}


function extractYandexCandidates(
  html,
  source
) {
  const links =
    extractLinks(html);

  const candidates = [];

  for (
    const link of links
  ) {
    const url =
      absoluteUrl(
        link.url,
        source.url
      );

    if (
      !url ||
      !isYandexArticleUrl(
        url
      )
    ) {
      continue;
    }

    const title =
      cleanText(link.text);

    if (
      !title ||
      title.length < 10
    ) {
      continue;
    }

    candidates.push({
      url,
      title
    });
  }

  const unique = [];
  const seen = new Set();

  for (
    const item of candidates
  ) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);

    unique.push(item);
  }

  return unique;
}


async function processYandexCandidate(
  candidate,
  source,
  days
) {
  try {
    const html =
      await fetchText(
        candidate.url
      );

    const jsonLdData =
      extractJsonLd(html);

    const jsonLd =
      findArticleJsonLd(
        jsonLdData
      );

    const title =
      cleanText(
        jsonLd?.headline
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:title",
            "twitter:title"
          ]
        )
      ) ||
      candidate.title;

    const description =
      cleanText(
        jsonLd?.description
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:description",
            "description",
            "twitter:description"
          ]
        )
      );

    if (
      !isYandexRelevant(
        title,
        description
      )
    ) {
      return null;
    }

    const date =
      extractArticleDate(
        html,
        candidate.url,
        jsonLd
      );

    if (
      !date ||
      !isRecent(date, days)
    ) {
      return null;
    }

    let image =
      cleanText(
        jsonLd?.image?.url ||
        jsonLd?.image
      ) ||
      extractMeta(
        html,
        [
          "og:image",
          "twitter:image"
        ]
      );

    /*
     * Если JSON-LD image — массив.
     */

    if (
      Array.isArray(
        jsonLd?.image
      )
    ) {
      image =
        cleanText(
          jsonLd.image[0]?.url ||
          jsonLd.image[0]
        ) ||
        image;
    }

    return {
      id: makeId(
        candidate.url
      ),

      sourceId:
        source.id,

      source:
        source.name,

      category:
        source.category,

      topic:
        detectTopic(
          title,
          description
        ),

      title,
      description,

      url:
        candidate.url,

      image,

      date:
        getDateOnly(date),

      publishedAt:
        date.toISOString()
    };
  } catch {
    return null;
  }
}


async function processYandexRealty(
  source,
  days
) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  try {
    const html =
      await fetchText(
        source.url
      );

    const candidates =
      extractYandexCandidates(
        html,
        source
      );

    diagnostics.candidates =
      candidates.length;

    const items = [];

    const batchSize = 6;

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
            candidate =>
              processYandexCandidate(
                candidate,
                source,
                days
              )
          )
        );

      for (
        const item of results
      ) {
        if (item) {
          diagnostics.recentCandidates++;
          items.push(item);
        } else {
          diagnostics.rejected++;
        }
      }

      if (
        i + batchSize <
        candidates.length
      ) {
        await sleep(100);
      }
    }

    return {
      items,
      diagnostics
    };
  } catch (error) {
    return {
      items: [],

      diagnostics: {
        ...diagnostics,

        failed: 1,

        error:
          error.message ||
          "Unknown error",

        httpStatus:
          error.httpStatus ||
          null
      }
    };
  }
}


/* =========================================================
   CIAN
   ========================================================= */

function isCianArticleUrl(
  url
) {
  const value =
    String(url || "");

  return (
    /cian\.ru\/magazine\//i.test(
      value
    ) &&
    !/[?&]tag=/i.test(value)
  );
}


function extractCianCandidates(
  html,
  source
) {
  const links =
    extractLinks(html);

  const candidates = [];

  for (
    const link of links
  ) {
    const url =
      absoluteUrl(
        link.url,
        source.url
      );

    if (
      !url ||
      !isCianArticleUrl(url)
    ) {
      continue;
    }

    const title =
      cleanText(link.text);

    if (
      !title ||
      title.length < 10
    ) {
      continue;
    }

    /*
     * Исключаем служебные ссылки.
     */

    if (
      /^(все новости|показать больше|войти|разместить|подробнее|все материалы)$/i.test(
        title
      )
    ) {
      continue;
    }

    candidates.push({
      url,
      title
    });
  }

  const unique = [];
  const seen = new Set();

  for (
    const item of candidates
  ) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);

    unique.push(item);
  }

  return unique;
}


async function processCianCandidate(
  candidate,
  source,
  days
) {
  try {
    const html =
      await fetchText(
        candidate.url
      );

    const jsonLdData =
      extractJsonLd(html);

    const jsonLd =
      findArticleJsonLd(
        jsonLdData
      );

    const title =
      cleanText(
        jsonLd?.headline
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:title",
            "twitter:title"
          ]
        )
      ) ||
      candidate.title;

    const description =
      cleanText(
        jsonLd?.description
      ) ||
      cleanText(
        extractMeta(
          html,
          [
            "og:description",
            "description",
            "twitter:description"
          ]
        )
      );

    if (
      !isCianRelevant(
        title,
        description
      )
    ) {
      return null;
    }

    const date =
      extractArticleDate(
        html,
        candidate.url,
        jsonLd
      );

    if (
      !date ||
      !isRecent(date, days)
    ) {
      return null;
    }

    let image =
      cleanText(
        jsonLd?.image?.url ||
        jsonLd?.image
      ) ||
      extractMeta(
        html,
        [
          "og:image",
          "twitter:image"
        ]
      );

    if (
      Array.isArray(
        jsonLd?.image
      )
    ) {
      image =
        cleanText(
          jsonLd.image[0]?.url ||
          jsonLd.image[0]
        ) ||
        image;
    }

    return {
      id: makeId(
        candidate.url
      ),

      sourceId:
        source.id,

      source:
        source.name,

      category:
        source.category,

      topic:
        detectTopic(
          title,
          description
        ),

      title,
      description,

      url:
        candidate.url,

      image,

      date:
        getDateOnly(date),

      publishedAt:
        date.toISOString()
    };
  } catch {
    return null;
  }
}


async function processCian(
  source,
  days
) {
  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  try {
    const html =
      await fetchText(
        source.url
      );

    const candidates =
      extractCianCandidates(
        html,
        source
      );

    diagnostics.candidates =
      candidates.length;

    const items = [];

    const batchSize = 6;

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
            candidate =>
              processCianCandidate(
                candidate,
                source,
                days
              )
          )
        );

      for (
        const item of results
      ) {
        if (item) {
          diagnostics.recentCandidates++;
          items.push(item);
        } else {
          diagnostics.rejected++;
        }
      }

      if (
        i + batchSize <
        candidates.length
      ) {
        await sleep(100);
      }
    }

    return {
      items,
      diagnostics
    };
  } catch (error) {
    return {
      items: [],

      diagnostics: {
        ...diagnostics,

        failed: 1,

        error:
          error.message ||
          "Unknown error",

        httpStatus:
          error.httpStatus ||
          null
      }
    };
  }
}


/* =========================================================
   GENERIC SOURCE PROCESSING
   ========================================================= */

async function processSource(
  source,
  days
) {
  if (
    source.type === "yandexrealty"
  ) {
    return processYandexRealty(
      source,
      days
    );
  }

  if (
    source.type === "cian"
  ) {
    return processCian(
      source,
      days
    );
  }

  const diagnostics = {
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  try {
    const html =
      await fetchText(
        source.url
      );

    let candidates = [];

    if (
      source.type === "n1"
    ) {
      candidates =
        extractN1Candidates(
          html,
          source
        );
    } else if (
      source.type === "krasdom"
    ) {
      candidates =
        extractKrasdomCandidates(
          html,
          source
        );
    } else if (
      source.type === "domrf"
    ) {
      candidates =
        extractDomrfCandidates(
          html,
          source
        );
    }

    diagnostics.candidates =
      candidates.length;

    const items = [];

    const batchSize = 6;

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
            candidate => {
              if (
                source.type === "n1"
              ) {
                return processN1Candidate(
                  candidate,
                  source,
                  days
                );
              }

              if (
                source.type ===
                "krasdom"
              ) {
                return processKrasdomCandidate(
                  candidate,
                  source,
                  days
                );
              }

              if (
                source.type ===
                "domrf"
              ) {
                return processDomrfCandidate(
                  candidate,
                  source,
                  days
                );
              }

              return null;
            }
          )
        );

      for (
        const item of results
      ) {
        if (item) {
          diagnostics.recentCandidates++;
          items.push(item);
        } else {
          diagnostics.rejected++;
        }
      }

      if (
        i + batchSize <
        candidates.length
      ) {
        await sleep(100);
      }
    }

    return {
      items,
      diagnostics
    };
  } catch (error) {
    return {
      items: [],

      diagnostics: {
        ...diagnostics,

        failed: 1,

        error:
          error.message ||
          "Unknown error",

        httpStatus:
          error.httpStatus ||
          null
      }
    };
  }
}


/* =========================================================
   REMOVE DUPLICATES
   ========================================================= */

function removeDuplicates(
  items
) {
  const result = [];

  const urls = new Set();

  for (
    const item of items
  ) {
    const normalizedUrl =
      String(
        item.url || ""
      )
        .trim()
        .replace(
          /\/+$/,
          ""
        )
        .toLowerCase();

    if (
      normalizedUrl &&
      urls.has(
        normalizedUrl
      )
    ) {
      continue;
    }

    let duplicate = false;

    for (
      const existing of result
    ) {
      if (
        isNearDuplicate(
          item.title,
          existing.title
        )
      ) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      continue;
    }

    if (
      normalizedUrl
    ) {
      urls.add(
        normalizedUrl
      );
    }

    result.push(item);
  }

  return result;
}


/* =========================================================
   BALANCE SOURCES
   ========================================================= */

function balanceSources(
  items,
  limit
) {
  const groups =
    new Map();

  for (
    const item of items
  ) {
    if (
      !groups.has(
        item.sourceId
      )
    ) {
      groups.set(
        item.sourceId,
        []
      );
    }

    groups
      .get(item.sourceId)
      .push(item);
  }

  for (
    const group of groups.values()
  ) {
    group.sort(
      (a, b) =>
        new Date(
          b.publishedAt
        ).getTime() -
        new Date(
          a.publishedAt
        ).getTime()
    );
  }

  const result = [];

  /*
   * Первый проход:
   * по одной новости от каждого источника.
   */

  let added = true;

  while (
    result.length < limit &&
    added
  ) {
    added = false;

    for (
      const source of SOURCES
    ) {
      const group =
        groups.get(
          source.id
        );

      if (
        !group ||
        !group.length
      ) {
        continue;
      }

      const item =
        group.shift();

      if (!item) {
        continue;
      }

      result.push(item);

      added = true;

      if (
        result.length >=
        limit
      ) {
        break;
      }
    }
  }

  /*
   * Второй проход:
   * остальные новости по дате.
   */

  const rest = [];

  for (
    const group of groups.values()
  ) {
    rest.push(
      ...group
    );
  }

  rest.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ).getTime() -
      new Date(
        a.publishedAt
      ).getTime()
  );

  for (
    const item of rest
  ) {
    if (
      result.length >= limit
    ) {
      break;
    }

    result.push(item);
  }

  result.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ).getTime() -
      new Date(
        a.publishedAt
      ).getTime()
  );

  return result.slice(
    0,
    limit
  );
}


/* =========================================================
   CATEGORY
   ========================================================= */

function filterByCategory(
  items,
  category
) {
  if (
    !category ||
    category === "all"
  ) {
    return items;
  }

  return items.filter(
    item =>
      item.category ===
      category
  );
}


/* =========================================================
   API
   ========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    const requestUrl =
      new URL(
        req.url,
        `https://${
          req.headers.host ||
          "localhost"
        }`
      );

    const category =
      requestUrl.searchParams.get(
        "category"
      ) || "all";

    const requestedLimit =
      Number(
        requestUrl.searchParams.get(
          "limit"
        )
      );

    const limit =
      Number.isFinite(
        requestedLimit
      ) &&
      requestedLimit > 0
        ? Math.min(
            Math.floor(
              requestedLimit
            ),
            MAX_LIMIT
          )
        : DEFAULT_LIMIT;

    const requestedDays =
      Number(
        requestUrl.searchParams.get(
          "days"
        )
      );

    const days =
      Number.isFinite(
        requestedDays
      ) &&
      requestedDays > 0
        ? Math.min(
            Math.floor(
              requestedDays
            ),
            30
          )
        : DEFAULT_DAYS;

    try {
      const sourceResults =
        await Promise.all(
          SOURCES.map(
            async source => {
              if (
                source.type ===
                "domclick"
              ) {
                const result =
                  await processDomclick(
                    source,
                    days
                  );

                return {
                  source,
                  ...result
                };
              }

              const result =
                await processSource(
                  source,
                  days
                );

              return {
                source,
                ...result
              };
            }
          )
        );

      let allItems = [];

      const diagnostics = {};

      for (
        const result of sourceResults
      ) {
        allItems.push(
          ...result.items
        );

        diagnostics[
          result.source.id
        ] =
          result.diagnostics;
      }

      /*
       * Дубли.
       */

      allItems =
        removeDuplicates(
          allItems
        );

      /*
       * Категория.
       */

      let filteredItems =
        filterByCategory(
          allItems,
          category
        );

      /*
       * Балансировка источников.
       */

      filteredItems =
        balanceSources(
          filteredItems,
          limit
        );

      /*
       * Финальная сортировка.
       */

      filteredItems.sort(
        (a, b) =>
          new Date(
            b.publishedAt
          ).getTime() -
          new Date(
            a.publishedAt
          ).getTime()
      );

      /*
       * CDN cache.
       */

      res.setHeader(
        "Cache-Control",
        "s-maxage=60, stale-while-revalidate=120"
      );

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      return res
        .status(200)
        .json({
          ok: true,

          category,

          count:
            filteredItems.length,

          items:
            filteredItems.slice(
              0,
              limit
            ),

          sources:
            diagnostics
        });
    } catch (error) {
      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Unknown error",

          category,

          count: 0,

          items: [],

          sources: {}
        });
    }
  };
