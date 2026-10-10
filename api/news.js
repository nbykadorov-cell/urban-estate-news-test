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
CLEANERS
========================================================= */
function cleanText(value) {
if (!value) return "";
return String(value)
.replace(/<script[\s\S]*?<\/script>/gi, " ")
.replace(/<style[\s\S]*?<\/style>/gi, " ")
.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
.replace(/<br\s*\/?>/gi, "\n")
.replace(/<\/p>/gi, "\n")
.replace(/<\/div>/gi, "\n")
.replace(/<\/li>/gi, "\n")
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
.replace(/[ \t]+/g, " ")
.replace(/\n\s+/g, "\n")
.trim();
}
/*
* Финальная очистка заголовков.
*
* Здесь специально собраны различные варианты:
* ДОМ.РФ
* СПРОСИ.ДОМ.РФ
* 161.RU
* 93.RU
* Домклик
* Яндекс
* и прочие хвосты.
*/
function cleanTitle(value) {
let text = cleanText(value);
if (!text) return "";
text = text
.replace(/^новости\s*[-—:]\s*/i, "")
/* 161.RU */
.replace(/\s*\|\s*161\.RU.*$/i, "")
.replace(/\s*[-—]\s*161\.RU.*$/i, "")
/* 93.RU */
.replace(/\s*\|\s*93\.RU.*$/i, "")
.replace(/\s*[-—]\s*93\.RU.*$/i, "")
/* ДОМ.РФ */
.replace(/\s*[-—|]\s*Новости\s+на\s+СПРОСИ\.ДОМ\.РФ.*$/i, "")
.replace(/\s*[-—|]\s*Новости\s+СПРОСИ\.ДОМ\.РФ.*$/i, "")
.replace(/\s*[-—|]\s*СПРОСИ\.ДОМ\.РФ.*$/i, "")
.replace(/\s*[-—|]\s*Новости\s+на\s+ДОМ\.РФ.*$/i, "")
.replace(/\s*[-—|]\s*Новости\s+ДОМ\.РФ.*$/i, "")
.replace(/\s*[-—|]\s*ДОМ\.РФ.*$/i, "")
/* Домклик */
.replace(/\s*[-—|]\s*Домклик.*$/i, "")
.replace(/\s*[-—|]\s*Домклик\.ру.*$/i, "")
/* Яндекс Недвижимость */
.replace(
/\s*[-—|]\s*Новости.*в\s+Журнале\s+Недвижимости.*$/i,
""
)
.replace(
/\s*[-—|]\s*Журнал\s+Недвижимости.*$/i,
""
)
/* Общие технические хвосты */
.replace(/\s*\|\s*Новости.*$/i, "")
.replace(/\s*[-—]\s*Новости\s*$/i, "")
.replace(/\s+/g, " ")
.trim();
return text;
}
function cleanDescription(value) {
let text = cleanText(value);
if (!text) return "";
text = text
.replace(/please open telegram to view this post/gi, "")
.replace(/view in telegram/gi, "")
.replace(/\b\d+(?:\.\d+)?[KК]?\s*views?\b/gi, "")
.replace(
/\s*-\s*Новости\.\s*.*?в Журнале Недвижимости\.?\s*$/i,
""
)
.replace(
/\s*в Журнале Недвижимости\.?\s*$/i,
""
)
.replace(
/��\s*Домклик в MAX.*$/i,
""
)
.replace(
/➡️\s*(Читать статью|Читать новость|Подробнее).*$/i,
""
)
.replace(/\s+/g, " ")
.trim();
return text;
}
function escapeRegExp(value) {
return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/* =========================================================
URL
========================================================= */
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
"ref",
"erid"
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
META
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
function extractH1(html) {
if (!html) return "";
const match =
html.match(
/<h1\b[^>]*>([\s\S]*?)<\/h1>/i
);
if (!match || !match[1]) {
return "";
}
return cleanTitle(match[1]);
}
function extractTitle(html) {
const h1 = extractH1(html);
if (h1) {
return h1;
}
const og =
extractMeta(
html,
["og:title", "twitter:title"]
);
if (og) {
return cleanTitle(og);
}
const title =
html.match(
/<title[^>]*>([\s\S]*?)<\/title>/i
);
if (title) {
return cleanTitle(title[1]);
}
return "";
}
function extractDescription(html) {
return cleanDescription(
extractMeta(
html,
[
"description",
"og:description",
"twitter:description"
]
)
);
}
function extractImage(html, baseUrl, sourceKey = "") {
  const metaImage = extractMeta(html, [
    "og:image",
    "og:image:url",
    "twitter:image"
  ]);
  const badImage = /(?:logo|favicon|sprite|icon|avatar|placeholder|default|no[-_]?image|empty|stub|banner-default|ring-sprosi|sprosi\.domrf)/i;
  const candidates = extractImageCandidates(html, baseUrl);
  const normalizedMeta = metaImage ? normalizeUrl(metaImage, baseUrl) : "";

  if (sourceKey === "161ru" || sourceKey === "93ru") {
    const isNewsCdn = url => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host === "hsmedia.ru" || host.endsWith(".hsmedia.ru") ||
          host === "161.ru" || host.endsWith(".161.ru") ||
          host === "93.ru" || host.endsWith(".93.ru");
      } catch {
        return false;
      }
    };
    const goodCandidates = candidates.filter(url => isNewsCdn(url) && !badImage.test(url));

    // На страницах 161.RU/93.RU og:image иногда содержит общую заглушку.
    // Если в разметке есть другие CDN-картинки, выбираем их вместо og:image.
    const nonMetaCandidate = goodCandidates.find(url => url !== normalizedMeta);
    if (nonMetaCandidate) return nonMetaCandidate;
    if (normalizedMeta && !badImage.test(normalizedMeta)) return normalizedMeta;
    return goodCandidates[0] || candidates.find(url => !badImage.test(url)) || "";
  }

  if (sourceKey === "domrf") {
    const preferred = candidates.find(url =>
      /\/upload\/medialibrary\//i.test(url) && !badImage.test(url)
    );
    if (preferred) return preferred;

    const articleImage = candidates.find(url =>
      !badImage.test(url) && !/(?:ring-sprosi|sprosi\.domrf|domrf[^/]*logo)/i.test(url)
    );
    if (articleImage) return articleImage;
    if (normalizedMeta && !badImage.test(normalizedMeta)) return normalizedMeta;
    return "";
  }

  if (sourceKey === "domclick") {
    const telegramCdn = candidates.find(url => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return (host === "cdn-telegram.org" || host.endsWith(".cdn-telegram.org") ||
          host === "telesco.pe" || host.endsWith(".telesco.pe")) && !badImage.test(url);
      } catch {
        return false;
      }
    });
    if (telegramCdn) return telegramCdn;
  }

  return normalizedMeta && !badImage.test(normalizedMeta)
    ? normalizedMeta
    : candidates.find(url => !badImage.test(url)) || "";
}

function extractImageCandidates(html, baseUrl) {
  const result = [];
  const seen = new Set();

  const add = value => {
    if (!value) return;

    let raw = String(value)
      .replace(/&amp;/gi, "&")
      .replace(/\\\//g, "/")
      .trim();

    /* srcset: берем первый URL */
    raw = raw
      .split(",")[0]
      .trim()
      .split(/\s+/)[0];

    const url = normalizeUrl(
      raw,
      baseUrl
    );

    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    result.push(url);
  };

  /* Обычные и lazy-loaded изображения. */
  const tagRegex =
    /<(?:img|source|video)\b[^>]*>/gi;

  let tagMatch;

  while (
    (tagMatch = tagRegex.exec(html))
  ) {
    const tag = tagMatch[0];

    const attrRegex =
      /\b(?:src|data-src|data-original|data-lazy-src|data-image|data-original-src|srcset|data-srcset)=(['"])([\s\S]*?)\1/gi;

    let attrMatch;

    while (
      (attrMatch = attrRegex.exec(tag))
    ) {
      add(attrMatch[2]);
    }

    /* Иногда картинка спрятана в style самого img/div. */
    const styleRegex =
      /background-image\s*:\s*url\(\s*(['"]?)(https?:\/\/[^"')\s]+)\1\s*\)/gi;

    let styleMatch;

    while (
      (styleMatch = styleRegex.exec(tag))
    ) {
      add(styleMatch[2]);
    }
  }

  /* CSS background-image во всем HTML. */
  const bgRegex =
    /background-image\s*:\s*url\(\s*(['"]?)(https?:\/\/[^"')\s]+)\1\s*\)/gi;

  let bgMatch;

  while (
    (bgMatch = bgRegex.exec(html))
  ) {
    add(bgMatch[2]);
  }

  /*
   * У 161.RU / 93.RU URL hsmedia может находиться
   * внутри JSON состояния страницы и не быть атрибутом img.
   */
  const hsmediaRegex =
    /https?:\\?\/\\?\/(?:[a-z0-9-]+\.)*hsmedia\.ru\\?\/[^"'\\\s<>\\]+/gi;

  let hsMatch;

  while (
    (hsMatch = hsmediaRegex.exec(html))
  ) {
    add(
      hsMatch[0]
        .replace(/\\\//g, "/")
        .replace(/\\u0026/gi, "&")
    );
  }

  /*
   * У ДОМ.РФ изображения часто встречаются в JS/JSON
   * как /upload/medialibrary/... без <img>.
   */
  const domrfRegex =
    /(?:https?:\\?\/\\?\/[^"'<>\\s]+)?\/upload\/medialibrary\/[a-z0-9_\-./%()]+/gi;

  let domrfMatch;

  while (
    (domrfMatch = domrfRegex.exec(html))
  ) {
    add(
      domrfMatch[0]
        .replace(/\\\//g, "/")
    );
  }

  return result;
}

/* =========================================================
JSON-LD
========================================================= */
function extractJsonLd(html) {
const result = [];
const regex =
/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = regex.exec(html))) {
const raw =
match[1]
.replace(/^\s*<!--/, "")
.replace(/-->\s*$/, "")
.trim();
if (!raw) {
continue;
}
try {
result.push(
JSON.parse(raw)
);
} catch {
try {
const fixed =
raw
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
const blocks =
extractJsonLd(html);
for (const block of blocks) {
const objects =
flattenJsonLd(block);
for (const obj of objects) {
const type =
Array.isArray(obj["@type"])
? obj["@type"].join(" ")
: String(obj["@type"] || "");
if (
/NewsArticle|Article|BlogPosting|ReportageNewsArticle/i.test(type)
) {
return obj;
}
}
}
return null;
}
/* =========================================================
DATES
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
if (!value) {
return null;
}
const date =
new Date(value);
return Number.isNaN(
date.getTime()
)
? null
: date;
}
function parseRussianDate(text) {
if (!text) {
return null;
}
const match =
String(text).match(
/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i
);
if (!match) {
return null;
}
const day =
Number(match[1]);
const month =
RU_MONTHS[
match[2].toLowerCase()
];
const year =
Number(match[3]);
if (
!Number.isInteger(day) ||
!Number.isInteger(month) ||
!Number.isInteger(year)
) {
return null;
}
const date =
new Date(
year,
month,
day
);
return Number.isNaN(
date.getTime()
)
? null
: date;
}
function extractDateFromText(html) {
if (!html) {
return null;
}
const clean =
cleanText(html);
const russian =
parseRussianDate(clean);
if (russian) {
return russian;
}
const numeric =
clean.match(
/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/
);
if (numeric) {
const date =
new Date(
Number(numeric[3]),
Number(numeric[2]) - 1,
Number(numeric[1])
);
if (!Number.isNaN(date.getTime())) {
return date;
}
}
const iso =
clean.match(
/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/
);
if (iso) {
const date =
new Date(
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
if (!url) {
return null;
}
let match =
url.match(
/\/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})(?:\/|$)/
);
if (match) {
const date =
new Date(
Number(match[1]),
Number(match[2]) - 1,
Number(match[3])
);
if (!Number.isNaN(date.getTime())) {
return date;
}
}
match =
url.match(
/[?&](?:date|published|published_at|publish_date)=(20\d{2})-(\d{1,2})-(\d{1,2})/i
);
if (match) {
const date =
new Date(
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
const values = [
article.datePublished,
article.dateCreated,
article.dateModified
];
for (const value of values) {
const date =
parseDate(value);
if (date) {
return date;
}
}
}
const metaDate =
extractMeta(
html,
[
"article:published_time",
"datePublished",
"date",
"publish-date",
"publication_date",
"article:modified_time"
]
);
const metaParsed =
parseDate(metaDate);
if (metaParsed) {
return metaParsed;
}
const timeRegex =
/<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi;
let timeMatch;
while (
(timeMatch =
timeRegex.exec(html))
) {
const date =
parseDate(timeMatch[1]);
if (date) {
return date;
}
}
const russian =
parseRussianDate(
cleanText(html)
);
if (russian) {
return russian;
}
return extractDateFromUrl(url);
}
/* =========================================================
LINKS
========================================================= */
function extractLinks(html, baseUrl) {
const result = [];
const regex =
/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
let match;
while (
(match =
regex.exec(html))
) {
const url =
normalizeUrl(
match[1],
baseUrl
);
if (url) {
result.push(url);
}
}
return [
...new Set(result)
];
}
/* =========================================================
ALLOWED URLS
========================================================= */
function isAllowed161(url) {
try {
const u =
new URL(url);
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
const u =
new URL(url);
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
const u =
new URL(url);
return (
u.hostname === "krasdom.ru" &&
/^\/news\/\d+/i.test(
u.pathname
)
);
} catch {
return false;
}
}
function isAllowedDomrf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const allowedHost = host === "xn--h1alcedd.xn--d1aqf.xn--p1ai" ||
      host.endsWith(".xn--h1alcedd.xn--d1aqf.xn--p1ai");
    if (!allowedHost || !/^https?:$/.test(u.protocol)) return false;

    // У ДОМ.РФ менялись URL материалов: разрешаем новостные разделы
    // и отдельные статьи, но не главную страницу/служебные страницы.
    return /^\/(?:news|press|article|articles|publication|publications)(?:\/|$)/i.test(u.pathname) &&
      !/^\/(?:news|press|article|articles|publication|publications)\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function isAllowedDomclick(url) {
try {
const u =
new URL(url);
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
return /^\/[^/]+\/.+/i.test(
u.pathname
);
} catch {
return false;
}
}
function isAllowedYandex(url) {
try {
const u =
new URL(url);
return (
u.hostname === "realty.yandex.ru" &&
/^\/journal\/(?:post|article)\//i.test(
u.pathname
)
);
} catch {
return false;
}
}
function isAllowedCian(url) {
try {
const u =
new URL(url);
if (
!/^(?:www\.)?cian\.ru$/i.test(
u.hostname
) &&
!/^(?:www\.)?krasnodar\.cian\.ru$/i.test(
u.hostname
)
) {
return false;
}
return (
/^\/novosti-[^/]+-\d+/i.test(
u.pathname
) ||
/^\/magazine\/.+/i.test(
u.pathname
)
);
} catch {
return false;
}
}
/* =========================================================
FILTERS
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
function isYandexForeignContent(item) {
const text =
[
item.title || "",
item.description || "",
item.url || ""
]
.join(" ")
.toLowerCase()
.replace(/ё/g, "е");
return YANDEX_FOREIGN_WORDS.some(
word =>
text.includes(word)
);
}
const DOMRF_RELEVANT_WORDS = [
"ипотек",
"ключев",
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
"банк",
"госуслуг"
];
function isDomrfRelevant(item) {
const text =
`${item.title} ${item.description}`
.toLowerCase()
.replace(/ё/g, "е");
return DOMRF_RELEVANT_WORDS.some(
word =>
text.includes(word)
);
}
/* =========================================================
TOPIC
========================================================= */
function classifyTopic(
title,
description
) {
const text =
`${title} ${description}`
.toLowerCase();
if (
/ипотек|ключев(ая|ой) ставк|банк|кредит|семейн(ая|ой) ипотек|ставк[аи]|рефинанс/i.test(
text
)
) {
return "Ипотека и банки";
}
if (
/закон|законодательств|госдум|правительств|путин|минфин|росреестр|маткапитал|налог|налогооблож|изменени[ея] правил|госуслуг/i.test(
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
ARTICLE DATA
========================================================= */
function extractArticleData(
html,
url,
sourceKey = ""
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
extractH1(html);
}
if (!title) {
title =
extractTitle(html);
}
if (!description) {
description =
extractDescription(html);
}
/*
 * Для источников с нестандартными изображениями всегда
 * запускаем source-specific extractor. Это важно для ДОМ.РФ:
 * JSON-LD может содержать одну и ту же служебную картинку
 * для всех материалов.
 */
if (
  sourceKey === "161ru" ||
  sourceKey === "93ru" ||
  sourceKey === "domrf"
) {
  const extractedImage =
    extractImage(
      html,
      url,
      sourceKey
    );

  if (extractedImage) {
    image = extractedImage;
  }
} else if (!image) {
  image =
    extractImage(
      html,
      url,
      sourceKey
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
title:
cleanTitle(title),
description:
cleanDescription(
description
),
image,
publishedAt
};
}
/* =========================================================
CREATE ITEM
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
const cleanUrl =
stripTracking(url);
if (!cleanUrl) {
return null;
}
/*
* Еще одна финальная очистка.
* Это важно для случаев, когда заголовок
* пришел из Telegram / JSON-LD / H1.
*/
const finalTitle =
cleanTitle(title);
const finalDescription =
cleanDescription(
description
);
if (!finalTitle) {
return null;
}
return {
id:
makeId(
source,
cleanUrl
),
source,
sourceName,
category,
topic:
classifyTopic(
finalTitle,
finalDescription
),
title:
finalTitle,
description:
finalDescription,
url:
cleanUrl,
image:
image || "",
publishedAt:
date.toISOString()
};
}
/* =========================================================
GENERIC SOURCE
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
urls.filter(
url => {
if (
sourceKey ===
"161ru"
) {
return isAllowed161(url);
}
if (
sourceKey ===
"93ru"
) {
return isAllowed93(url);
}
if (
sourceKey ===
"krasdom"
) {
return isAllowedKrasdom(url);
}
if (
sourceKey ===
"domrf"
) {
return isAllowedDomrf(url);
}
if (
sourceKey ===
"yandexrealty"
) {
return isAllowedYandex(url);
}
if (
sourceKey ===
"cian"
) {
return isAllowedCian(url);
}
return false;
}
);
urls =
[
...new Set(urls)
];
stats.candidates =
urls.length;
const items = [];
for (
const url of
urls.slice(0, 100)
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
url,
sourceKey
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
sourceKey,
sourceName:
source.name,
category:
source.category,
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
if (
sourceKey ===
"yandexrealty" &&
isYandexForeignContent(item)
) {
stats.rejected++;
continue;
}
/* Не отбрасываем новости ДОМ.РФ по ключевым словам: темы источника шире. */
items.push(item);
} catch {
stats.failed++;
}
}
return items;
}
/* =========================================================
TELEGRAM / DOMCLICK
========================================================= */
function extractTelegramPosts(html) {
const posts = [];
const regex =
/<div[^>]+class=["'][^"']*tgme_widget_message\b[^"']*["'][^>]*>/gi;
const starts = [];
let match;
while (
(match =
regex.exec(html))
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
posts.push({
html:
html.slice(
start,
end
),
start,
end
});
}
return posts;
}
function extractTelegramText(
block
) {
const match =
block.match(
/<div[^>]+class=["'][^"']*\btgme_widget_message_text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
);
if (!match) {
return "";
}
return cleanDescription(
match[1]
);
}
function extractTelegramDate(
block
) {
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
const result =
new Date(
timestamp >
10000000000
? timestamp
: timestamp * 1000
);
if (
!Number.isNaN(
result.getTime()
)
) {
return result;
}
}
}
return extractDateFromText(
block
);
}
function extractTelegramFallbackTitle(
block
) {
const text =
extractTelegramText(
block
);
if (!text) {
return "";
}
const lines =
text
.split(/\n+/)
.map(line =>
cleanText(line)
)
.filter(Boolean);
if (!lines.length) {
return "";
}
let title =
lines[0];
title =
title
.replace(/^⭐️\s*/u, "")
.replace(/^��\s*/u, "")
.replace(/^��\s*/u, "")
.replace(/^✏️\s*/u, "")
.replace(/^✅\s*/u, "")
.trim();
const separators = [
" ➡️ ",
" �� ",
" �� ",
" Подробнее",
" Читать статью",
" Читать новость"
];
for (
const separator of
separators
) {
const index =
title.indexOf(
separator
);
if (index > 20) {
title =
title.slice(
0,
index
);
break;
}
}
if (
title.length >
180
) {
const sentence =
title.match(
/^(.{20,180}?[.!?])\s/
);
if (sentence) {
title =
sentence[1];
} else {
title =
title.slice(
0,
177
) + "...";
}
}
return cleanTitle(
title
);
}
function extractTelegramImage(block) {
  if (!block) return "";
  const candidates = [];
  const add = value => {
    if (!value) return;
    const normalized = normalizeUrl(
      String(value).replace(/&amp;/gi, "&").replace(/\\\//g, "/"),
      "https://t.me/s/domclick"
    );
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  // Telegram часто помещает фото в background-image у .tgme_widget_message_photo_wrap.
  const bg = /background-image\s*:\s*url\(\s*(["']?)(https?:\/\/[^"')\s]+)\1\s*\)/gi;
  let match;
  while ((match = bg.exec(block))) add(match[2]);

  // Дополнительно обрабатываем обычные и lazy-loaded атрибуты.
  const tagRegex = /<(?:img|source|div)\b[^>]*>/gi;
  while ((match = tagRegex.exec(block))) {
    const tag = match[0];
    const attrs = /\b(?:src|data-src|data-original|srcset|data-srcset|style)=["']([^"']+)["']/gi;
    let attr;
    while ((attr = attrs.exec(tag))) {
      const value = attr[1];
      const urlMatch = value.match(/https?:\/\/[^\s,"')]+/i);
      if (urlMatch) add(urlMatch[0]);
    }
  }

  const good = candidates.find(url => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return (host === "cdn-telegram.org" || host.endsWith(".cdn-telegram.org") ||
        host === "telesco.pe" || host.endsWith(".telesco.pe")) &&
        !/(?:avatar|logo|icon|placeholder)/i.test(url);
    } catch {
      return false;
    }
  });
  return good || candidates.find(url => !/(?:avatar|logo|icon|placeholder)/i.test(url)) || "";
}

async function parseDomclick(
stats
) {
const items = [];
const attempts = [];
const blog =
await fetchText(
SOURCES.domclick.url
);
attempts.push({
url:
SOURCES.domclick.url,
status:
blog.status,
ok:
blog.ok
});
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
!telegram.ok ||
!telegram.text
) {
stats.attempts =
attempts;
return items;
}
const posts =
extractTelegramPosts(
telegram.text
);
const articleLinks = [];
for (
const post of
posts
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
const url =
normalizeUrl(
linkMatch[1],
"https://t.me/"
);
if (!url) {
continue;
}
if (
!isAllowedDomclick(
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
const unique =
new Map();
for (
const entry of
articleLinks
) {
if (
!unique.has(
entry.url
)
) {
unique.set(
entry.url,
entry
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
const entry of
links.slice(0, 50)
) {
try {
const url =
entry.url;
const post =
entry.post;
const telegramText =
extractTelegramText(
post.html
);
const telegramDate =
extractTelegramDate(
post.html
);
const article =
await fetchText(
url
);
let data = {
title: "",
description: "",
image: "",
publishedAt: null
};
if (
article.ok &&
article.text
) {
data =
extractArticleData(
article.text,
url,
"domclick"
);
}
if (
!data.publishedAt &&
telegramDate
) {
data.publishedAt =
telegramDate;
}
if (!data.title) {
data.title =
extractTelegramFallbackTitle(
post.html
);
}
if (
!data.description &&
telegramText
) {
data.description =
telegramText;
}
if (!data.image) {
  data.image = extractTelegramImage(post.html);
}
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
items.push(item);
} catch {
stats.failed++;
}
}
stats.attempts =
attempts;
return items;
}
/* =========================================================
CIAN
========================================================= */
function extractCianRssLinks(
html
) {
const result = [];
const regex =
/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
let match;
while (
(match =
regex.exec(html))
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
block.match(regex);
if (!match) {
return "";
}
return cleanText(
match[1].replace(
/<!\[CDATA\[([\s\S]*?)\]\]>/gi,
"$1"
)
);
}
function parseXmlItems(
xml
) {
const items = [];
const regex =
/<item\b[\s\S]*?<\/item>/gi;
let match;
while (
(match =
regex.exec(xml))
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
stripTracking(
link
),
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
rssLinks =
[
...new Set(rssLinks)
];
let rss = null;
for (
const rssUrl of
rssLinks
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
const article of
parsed
) {
if (
!article.pubDate
) {
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
const url of
links.slice(0, 100)
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
url,
"cian"
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
RECENT
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
Number.isNaN(
timestamp
)
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
DEDUPE
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
const item of
items
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
(existing.description || "").length +
(existing.image ? 100 : 0);
const newScore =
(item.description || "").length +
(item.image ? 100 : 0);
if (
newScore >
existingScore
) {
const index =
result.indexOf(
existing
);
if (index >= 0) {
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
BALANCE
========================================================= */
function balanceItems(
items,
limit
) {
if (
items.length <= limit
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
const item of
items
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
const list of
groups.values()
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
const list of
groups.values()
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
CATEGORY
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
topic === normalized ||
topic ===
String(
category
).toLowerCase()
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
candidates:
0,
recentCandidates:
0,
rejected:
0,
failed:
0
};
}
/* =========================================================
LOAD GENERIC
========================================================= */
async function loadGenericSource(
sourceKey
) {
const source =
SOURCES[sourceKey];
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
!page.ok ||
!page.text
) {
stats.failed++;
return {
items: [],
stats
};
}
const items =
await parseGenericSource(
sourceKey,
source,
page.text,
stats
);
return {
items,
stats
};
} catch {
stats.failed++;
return {
items: [],
stats
};
}
}
function getApiOrigin(req) {
  const forwardedProto =
    String(
      req.headers?.["x-forwarded-proto"] ||
        "https"
    )
      .split(",")[0]
      .trim();

  const protocol =
    /^https?$/i.test(
      forwardedProto
    )
      ? forwardedProto
      : "https";

  const host =
    String(
      req.headers?.host ||
        "urban-estate-news-test.vercel.app"
    ).trim();

  return `${protocol}://${host}`;
}

function applyImageProxy(items, req) {
  const apiOrigin =
    getApiOrigin(req);

  const proxySources =
    new Set([
      "161ru",
      "93ru",
      "domrf",
      "domclick"
    ]);

  return items.map(item => {
    if (
      !item?.image ||
      !proxySources.has(item.source)
    ) {
      return item;
    }

    return {
      ...item,
      image:
        `${apiOrigin}/api/image?source=${encodeURIComponent(item.source)}&url=${encodeURIComponent(item.image)}`
    };
  });
}

/* =========================================================
CATEGORY PERIOD
========================================================= */
function determineCategoryDays(
  items,
  category,
  limit
) {
  /*
   * Вкладка "Все" всегда остается строго за 7 дней.
   */
  if (
    !category ||
    category.toLowerCase() === "all"
  ) {
    return DEFAULT_DAYS;
  }

  const categoryItems =
    filterCategory(
      items,
      category
    );

  const sorted =
    dedupeItems(
      categoryItems,
      category
    ).sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );

  if (!sorted.length) {
    return DEFAULT_DAYS;
  }

  const targetIndex =
    Math.min(
      Math.max(0, limit - 1),
      sorted.length - 1
    );

  const newest =
    new Date(sorted[0].publishedAt);
  const target =
    new Date(sorted[targetIndex].publishedAt);

  const ageMs =
    Math.max(
      0,
      Date.now() - target.getTime()
    );

  const calculatedDays =
    Math.ceil(
      ageMs / (24 * 60 * 60 * 1000)
    );

  /* Не уменьшаем стандартные 7 дней. */
  return Math.min(
    365,
    Math.max(
      DEFAULT_DAYS,
      calculatedDays + 1
    )
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
Math.floor(
limit
)
)
);
days =
Math.max(
1,
Math.min(
30,
Math.floor(
days
)
)
);
const allItems = [];
const sourcesStats = {};

const genericKeys = [
  "161ru",
  "93ru",
  "krasdom",
  "domrf",
  "yandexrealty"
];

const genericResults =
  await Promise.all(
    genericKeys.map(
      key =>
        loadGenericSource(key)
    )
  );

genericResults.forEach(
  (result, index) => {
    const key =
      genericKeys[index];

    sourcesStats[key] =
      result.stats;

    for (const item of result.items) {
      allItems.push(item);
    }
  }
);

/* DOMCLICK */
{
  const source =
    SOURCES.domclick;
  const stats =
    createStats(source);

  try {
    const items =
      await parseDomclick(stats);

    for (const item of items) {
      allItems.push(item);
    }
  } catch {
    stats.failed++;
  }

  sourcesStats.domclick =
    stats;
}

/* CIAN */
{
  const source =
    SOURCES.cian;
  const stats =
    createStats(source);

  try {
    const items =
      await parseCian(stats);

    for (const item of items) {
      allItems.push(item);
    }
  } catch {
    stats.failed++;
  }

  sourcesStats.cian =
    stats;
}

/*
 * Для "Все" используем только последние 7 дней.
 * Для остальных категорий автоматически расширяем период
 * настолько, чтобы получить до 30 материалов, максимум за год.
 */
const effectiveDays =
  determineCategoryDays(
    allItems,
    category,
    limit
  );

const recentItems =
  allItems.filter(item =>
    isRecent(
      item.publishedAt,
      effectiveDays
    )
  );

/* Обновляем статистику после фактического периода выборки. */
for (const key of Object.keys(sourcesStats)) {
  const stats =
    sourcesStats[key];

  stats.recentCandidates =
    allItems.filter(
      item =>
        item.source === key &&
        isRecent(
          item.publishedAt,
          effectiveDays
        )
    ).length;
}

let filtered =
filterCategory(
recentItems,
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
const seenUrls =
new Set();
filtered =
filtered.filter(
item => {
const url =
stripTracking(
item.url
);
if (!url) {
return false;
}
if (
seenUrls.has(url)
) {
return false;
}
seenUrls.add(url);
return true;
}
);
res.setHeader(
"Cache-Control",
"s-maxage=60, stale-while-revalidate=120"
);
return res
.status(200)
.json({
ok: true,
category,
days: effectiveDays,
count:
Math.min(
filtered.length,
limit
),
items:
applyImageProxy(
filtered.slice(
0,
limit
),
req
),
sources:
sourcesStats
});
};
