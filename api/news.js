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
   BASIC HELPERS
========================================================= */

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
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanTitle(value) {
  let text = cleanText(value);

  text = text
    .replace(/\s*[-–—|]\s*(Новости|Журнал|Циан\.Журнал).*$/i, "")
    .replace(/\s+Новости рынка недвижимости.*$/i, "")
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
    .replace(/\b\d[\d\s]*просмотров\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}


/*
 * ВАЖНО:
 * Эта функция отсутствовала в предыдущей версии.
 * Именно из-за неё сейчас падали 161.RU, 93.RU,
 * КРАСДОМ, ДОМ.РФ и Яндекс.
 */
function stripTracking(url) {
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
      "from_tg",
      "ref",
      "source",
      "source_index",
      "ysclid",
      "yclid"
    ];

    removeParams.forEach(name => {
      u.searchParams.delete(name);
    });

    return u.toString();
  } catch {
    return url;
  }
}


function normalizeUrl(url, baseUrl) {
  if (!url) return "";

  try {
    const absolute = new URL(url, baseUrl);

    if (!/^https?:$/i.test(absolute.protocol)) {
      return "";
    }

    absolute.hash = "";

    return stripTracking(absolute.toString());
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


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
          "ru-RU,ru;q=0.9,en;q=0.8"
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   HTML META
========================================================= */

function extractMeta(html, key) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}


function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match
    ? cleanTitle(match[1])
    : "";
}


function extractCanonical(html, baseUrl) {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
  );

  if (!match) return "";

  return normalizeUrl(match[1], baseUrl);
}


function extractImage(html, baseUrl) {
  const candidates = [
    extractMeta(html, "og:image"),
    extractMeta(html, "twitter:image")
  ];

  for (const value of candidates) {
    if (!value) continue;

    try {
      const url = new URL(value, baseUrl).toString();

      if (
        !url.includes("telegram.org/img/emoji") &&
        !url.includes("emoji/")
      ) {
        return url;
      }
    } catch {}
  }

  return "";
}


/* =========================================================
   JSON-LD
========================================================= */

function extractJsonLd(html) {
  const blocks = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());

      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else {
        blocks.push(parsed);
      }
    } catch {}
  }

  return blocks;
}


function findArticleJsonLd(html) {
  const blocks = extractJsonLd(html);

  for (const block of blocks) {
    if (!block) continue;

    if (
      block["@type"] === "Article" ||
      block["@type"] === "NewsArticle" ||
      block["@type"] === "BlogPosting"
    ) {
      return block;
    }

    if (Array.isArray(block["@graph"])) {
      const found = block["@graph"].find(item =>
        item &&
        (
          item["@type"] === "Article" ||
          item["@type"] === "NewsArticle" ||
          item["@type"] === "BlogPosting"
        )
      );

      if (found) return found;
    }
  }

  return null;
}


/* =========================================================
   DATES
========================================================= */

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  return null;
}


function extractDate(html) {
  const article = findArticleJsonLd(html);

  if (article) {
    const value =
      article.datePublished ||
      article.dateCreated ||
      article.dateModified;

    const date = parseDate(value);

    if (date) return date;
  }

  const candidates = [
    extractMeta(html, "article:published_time"),
    extractMeta(html, "datePublished"),
    extractMeta(html, "date"),
    extractMeta(html, "publish-date")
  ];

  for (const value of candidates) {
    const date = parseDate(value);

    if (date) return date;
  }

  const datetimeMatch = html.match(
    /<time[^>]+datetime=["']([^"']+)["']/i
  );

  if (datetimeMatch) {
    const date = parseDate(datetimeMatch[1]);

    if (date) return date;
  }

  return null;
}


/*
 * Для 161.RU и 93.RU дата часто находится прямо в URL:
 * /text/realty/2026/10/07/76683200
 */
function extractDateFromNewsUrl(url) {
  const match = url.match(
    /\/text\/realty\/(\d{4})\/(\d{2})\/(\d{2})\/\d+/i
  );

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


/*
 * ДОМ.РФ может отдавать дату в URL или странице.
 */
function extractDateFromDomRfUrl(url) {
  const match = url.match(
    /\/news\/.*?(\d{4})[-/](\d{2})[-/](\d{2})/i
  );

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


/* =========================================================
   LINKS
========================================================= */

function extractAllAnchors(html, baseUrl) {
  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const href = normalizeUrl(match[1], baseUrl);

    if (!href) continue;

    const text = cleanText(match[2]);

    result.push({
      url: href,
      text
    });
  }

  return result;
}


function isLikelyArticleTitle(title) {
  if (!title) return false;

  if (title.length < 20) return false;

  const bad = [
    "подробнее",
    "читать далее",
    "все новости",
    "главная",
    "новости",
    "каталог",
    "меню",
    "войти",
    "регистрация"
  ];

  const lower = title.toLowerCase();

  return !bad.some(item => lower === item);
}


/* =========================================================
   FOREIGN / IRRELEVANT CONTENT
========================================================= */

function isForeignContent(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();

  const patterns = [
    /\bлондон\b/,
    /\bвеликобритани/,
    /\bангли/,
    /\bяпони/,
    /\bтокио\b/,
    /\bтурци/,
    /\bстамбул/,
    /\bдубай/,
    /\bоаэ/,
    /\bсша\b/,
    /\bамерикан/,
    /\bсоединенн(?:ые|ых)\s+штат/,
    /\bсингапур/,
    /\bтаиланд/,
    /\bбали\b/,
    /\bиндонези/,
    /\bкипр/,
    /\bиспан/,
    /\bфранци/,
    /\bитал/,
    /\bгермани/,
    /\bкатар/,
    /\bсаудовск(?:ая|ой)\s+араби/,
    /\bзарубежн(?:ое|ая|ых|ый)\s+жиль/
  ];

  return patterns.some(pattern => pattern.test(text));
}


/* =========================================================
   TOPIC
========================================================= */

function classifyTopic(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();

  if (
    /ипотек|ключев(?:ая|ой)\s+ставк|ставк[аи]|кредит|заем|займ|банк|семейн(?:ая|ой)\s+ипотек/.test(text)
  ) {
    return "mortgage";
  }

  if (
    /закон|законодатель|росреестр|госуслуг|документ|договор|юрист|юридичес|налог|льгот|жку|капитальн(?:ый|ого)\s+ремонт/.test(text)
  ) {
    return "legislation";
  }

  if (
    /новостро|застройщик|девелопер|первичк|жк\b|жил(?:ой|ого)\s+комплекс/.test(text)
  ) {
    return "newbuild";
  }

  if (
    /квартир|жиль|недвижим|дом\b|участк|аренд|продаж|покупк|вторичк/.test(text)
  ) {
    return "realty";
  }

  return "realty";
}


/* =========================================================
   ARTICLE EXTRACTION
========================================================= */

async function extractArticleData(url, fallbackTitle = "") {
  try {
    const response = await fetchText(url);

    if (!response.ok) {
      return {
        title: cleanTitle(fallbackTitle),
        description: "",
        image: "",
        publishedAt: null
      };
    }

    const html = response.text;

    const article = findArticleJsonLd(html);

    let title =
      cleanTitle(
        article?.headline ||
        extractMeta(html, "og:title") ||
        extractTitleTag(html) ||
        fallbackTitle
      );

    let description =
      cleanDescription(
        article?.description ||
        extractMeta(html, "og:description") ||
        extractMeta(html, "description")
      );

    let image =
      article?.image?.url ||
      article?.image ||
      extractImage(html, url);

    if (Array.isArray(image)) {
      image = image[0];
    }

    if (image) {
      try {
        image = new URL(image, url).toString();
      } catch {
        image = "";
      }
    }

    if (
      image &&
      (
        image.includes("telegram.org/img/emoji") ||
        image.includes("/emoji/")
      )
    ) {
      image = "";
    }

    let publishedAt =
      parseDate(
        article?.datePublished ||
        article?.dateCreated ||
        extractMeta(html, "article:published_time")
      );

    if (!publishedAt) {
      publishedAt = extractDate(html);
    }

    return {
      title,
      description,
      image,
      publishedAt
    };

  } catch {
    return {
      title: cleanTitle(fallbackTitle),
      description: "",
      image: "",
      publishedAt: null
    };
  }
}


/* =========================================================
   SOURCE-SPECIFIC LINK FILTER
========================================================= */

function isAllowedArticleUrl(sourceKey, url) {
  if (!url) return false;

  let u;

  try {
    u = new URL(url);
  } catch {
    return false;
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (sourceKey === "161ru") {
    if (host !== "161.ru" && host !== "www.161.ru") {
      return false;
    }

    if (!/^\/text\/realty\/\d{4}\/\d{2}\/\d+\/\d+/i.test(path)) {
      return false;
    }

    if (/\/comments/i.test(path)) {
      return false;
    }

    return true;
  }


  if (sourceKey === "93ru") {
    if (host !== "93.ru" && host !== "www.93.ru") {
      return false;
    }

    if (!/^\/text\/realty\/\d{4}\/\d{2}\/\d+\/\d+/i.test(path)) {
      return false;
    }

    if (/\/comments/i.test(path)) {
      return false;
    }

    return true;
  }


  if (sourceKey === "krasdom") {
    if (host !== "krasdom.ru" && host !== "www.krasdom.ru") {
      return false;
    }

    if (!/^\/news\/\d+/i.test(path)) {
      return false;
    }

    return true;
  }


  if (sourceKey === "domrf") {
    if (!host.includes("дом.рф") && !host.includes("xn--h1alcedd")) {
      return false;
    }

    if (!/^\/news\//i.test(path)) {
      return false;
    }

    return true;
  }


  if (sourceKey === "yandexrealty") {
    if (
      host !== "realty.yandex.ru" &&
      host !== "www.realty.yandex.ru"
    ) {
      return false;
    }

    if (!/^\/journal\/post\//i.test(path)) {
      return false;
    }

    return true;
  }


  if (sourceKey === "cian") {
    if (!host.endsWith("cian.ru")) {
      return false;
    }

    /*
     * Основной формат:
     * https://www.cian.ru/novosti-...-345697
     */

    if (
      /^\/novosti-[^/]+-\d+/i.test(path)
    ) {
      return true;
    }

    /*
     * Возможный региональный формат:
     * https://krasnodar.cian.ru/magazine/...
     */

    if (
      /^\/magazine\/.+/i.test(path)
    ) {
      return true;
    }

    return false;
  }


  if (sourceKey === "domclick") {
    if (
      host !== "blog.domclick.ru" &&
      host !== "www.blog.domclick.ru"
    ) {
      return false;
    }

    /*
     * Видео не должны попадать в новостную ленту.
     */

    if (/^\/videos\//i.test(path)) {
      return false;
    }

    /*
     * Исключаем служебные страницы.
     */

    if (
      /^\/novosti\/?$/i.test(path) ||
      /^\/$/i.test(path)
    ) {
      return false;
    }

    return path.split("/").filter(Boolean).length >= 2;
  }


  return false;
}


/* =========================================================
   GENERIC SOURCE PARSER
========================================================= */

async function parseGenericSource(sourceKey, source) {
  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const response = await fetchText(source.url);

  if (!response.ok) {
    stats.failed = 1;

    stats.error = `HTTP ${response.status}`;

    return {
      items: [],
      stats
    };
  }

  const anchors = extractAllAnchors(
    response.text,
    source.url
  );

  const unique = new Map();

  for (const anchor of anchors) {
    if (!isAllowedArticleUrl(sourceKey, anchor.url)) {
      continue;
    }

    const url = stripTracking(anchor.url);

    if (!url) continue;

    if (!unique.has(url)) {
      unique.set(url, anchor);
    }
  }

  stats.candidates = unique.size;

  const now = Date.now();
  const maxAge = DEFAULT_DAYS * 24 * 60 * 60 * 1000;

  const items = [];

  for (const [url, anchor] of unique) {
    try {
      const data = await extractArticleData(
        url,
        anchor.text
      );

      let publishedAt = data.publishedAt;

      if (!publishedAt) {
        publishedAt = extractDateFromNewsUrl(url);
      }

      if (!publishedAt && sourceKey === "domrf") {
        publishedAt = extractDateFromDomRfUrl(url);
      }

      if (!publishedAt) {
        stats.rejected++;
        continue;
      }

      const age = now - publishedAt.getTime();

      if (
        age < 0 ||
        age > maxAge
      ) {
        stats.rejected++;
        continue;
      }

      let title = cleanTitle(data.title || anchor.text);

      let description = cleanDescription(
        data.description || ""
      );

      if (!isLikelyArticleTitle(title)) {
        stats.rejected++;
        continue;
      }

      if (
        (
          sourceKey === "yandexrealty" ||
          sourceKey === "cian"
        ) &&
        isForeignContent(title, description)
      ) {
        stats.rejected++;
        continue;
      }

      if (
        sourceKey === "domclick" &&
        /(^|\s)(видео|video)(\s|$)/i.test(title)
      ) {
        stats.rejected++;
        continue;
      }

      stats.recentCandidates++;

      items.push({
        id: makeId(url),
        source: sourceKey,
        sourceName: source.name,
        title,
        description,
        url,
        image: data.image || "",
        publishedAt: publishedAt.toISOString(),
        topic: classifyTopic(
          title,
          description
        )
      });

    } catch {
      stats.rejected++;
    }
  }

  return {
    items,
    stats
  };
}


/* =========================================================
   DOMCLICK
========================================================= */

function extractDomclickUrlsFromHtml(html) {
  const urls = new Set();

  const anchors = extractAllAnchors(
    html,
    "https://blog.domclick.ru/"
  );

  for (const anchor of anchors) {
    if (
      isAllowedArticleUrl(
        "domclick",
        anchor.url
      )
    ) {
      urls.add(
        stripTracking(anchor.url)
      );
    }
  }

  return [...urls];
}


function extractTelegramPostBlocks(html) {
  const blocks = [];

  const regex =
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;

  let match;

  while ((match = regex.exec(html))) {
    blocks.push(match[0]);
  }

  return blocks;
}


function extractTelegramDate(block) {
  const match = block.match(
    /<time[^>]+datetime=["']([^"']+)["']/i
  );

  if (!match) return null;

  return parseDate(match[1]);
}


function extractTelegramText(block) {
  const match = block.match(
    /class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  if (!match) return "";

  return cleanDescription(match[1]);
}


function extractTelegramImage(block) {
  const matches = [
    ...block.matchAll(
      /background-image:url\(["']?([^"')]+)["']?\)/gi
    )
  ];

  for (const match of matches) {
    const url = match[1];

    if (
      !url.includes("telegram.org/img/emoji") &&
      !url.includes("/emoji/")
    ) {
      return url;
    }
  }

  return "";
}


function extractDomclickBlogUrlsFromBlock(block) {
  const urls = new Set();

  const regex =
    /href=["'](https?:\/\/(?:www\.)?blog\.domclick\.ru\/[^"']+)["']/gi;

  let match;

  while ((match = regex.exec(block))) {
    const url = normalizeUrl(
      match[1],
      "https://blog.domclick.ru/"
    );

    if (
      url &&
      isAllowedArticleUrl("domclick", url)
    ) {
      urls.add(url);
    }
  }

  return [...urls];
}


async function parseDomclick() {
  const stats = {
    name: SOURCES.domclick.name,
    category: SOURCES.domclick.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };

  const items = [];
  const seen = new Set();

  /*
   * Сначала пытаемся получить официальный блог.
   */

  try {
    const blog = await fetchText(
      SOURCES.domclick.url
    );

    stats.attempts.push({
      url: SOURCES.domclick.url,
      status: blog.status,
      ok: blog.ok
    });

    if (blog.ok) {
      const urls =
        extractDomclickUrlsFromHtml(
          blog.text
        );

      stats.candidates += urls.length;

      for (const url of urls) {
        if (seen.has(url)) continue;

        seen.add(url);

        const data =
          await extractArticleData(url);

        const publishedAt =
          data.publishedAt;

        if (!publishedAt) {
          continue;
        }

        const age =
          Date.now() -
          publishedAt.getTime();

        if (
          age < 0 ||
          age > DEFAULT_DAYS * 86400000
        ) {
          stats.rejected++;
          continue;
        }

        const title =
          cleanTitle(data.title);

        const description =
          cleanDescription(
            data.description
          );

        if (!isLikelyArticleTitle(title)) {
          stats.rejected++;
          continue;
        }

        if (
          /\/videos\//i.test(url)
        ) {
          stats.rejected++;
          continue;
        }

        items.push({
          id: makeId(url),
          source: "domclick",
          sourceName: "Домклик",
          title,
          description,
          url,
          image: data.image || "",
          publishedAt:
            publishedAt.toISOString(),
          topic: classifyTopic(
            title,
            description
          )
        });

        stats.recentCandidates++;
      }
    }

  } catch (error) {
    stats.attempts.push({
      url: SOURCES.domclick.url,
      status: 0,
      ok: false
    });
  }


  /*
   * Основной fallback — официальный Telegram Домклика.
   */

  try {
    const telegramUrl =
      "https://t.me/s/domclick";

    const tg =
      await fetchText(telegramUrl);

    stats.attempts.push({
      url: telegramUrl,
      status: tg.status,
      ok: tg.ok
    });

    if (tg.ok) {
      const blocks =
        extractTelegramPostBlocks(
          tg.text
        );

      for (const block of blocks) {
        const date =
          extractTelegramDate(block);

        if (!date) continue;

        const age =
          Date.now() -
          date.getTime();

        if (
          age < 0 ||
          age > DEFAULT_DAYS * 86400000
        ) {
          continue;
        }

        const urls =
          extractDomclickBlogUrlsFromBlock(
            block
          );

        /*
         * Если в посте есть ссылка на статью,
         * используем именно статью, а не Telegram-пост.
         */

        if (urls.length) {
          for (const url of urls) {
            if (seen.has(url)) continue;

            seen.add(url);

            const data =
              await extractArticleData(url);

            const title =
              cleanTitle(data.title);

            const description =
              cleanDescription(
                data.description
              );

            if (!isLikelyArticleTitle(title)) {
              continue;
            }

            if (/\/videos\//i.test(url)) {
              continue;
            }

            let image =
              data.image ||
              extractTelegramImage(block);

            if (
              image &&
              (
                image.includes(
                  "telegram.org/img/emoji"
                ) ||
                image.includes("/emoji/")
              )
            ) {
              image = "";
            }

            const publishedAt =
              data.publishedAt || date;

            items.push({
              id: makeId(url),
              source: "domclick",
              sourceName: "Домклик",
              title,
              description,
              url,
              image,
              publishedAt:
                publishedAt.toISOString(),
              topic: classifyTopic(
                title,
                description
              )
            });

            stats.recentCandidates++;
          }

          continue;
        }

        /*
         * Если ссылки на статью нет,
         * не превращаем Telegram-пост
         * в новость — иначе в ленту будут
         * попадать рекламные и служебные посты.
         */
      }
    }

  } catch {}

  /*
   * Удаляем дубли.
   */

  const unique = new Map();

  for (const item of items) {
    if (!unique.has(item.url)) {
      unique.set(item.url, item);
    }
  }

  const result = [...unique.values()]
    .sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );

  stats.candidates = Math.max(
    stats.candidates,
    result.length
  );

  stats.recentCandidates =
    result.length;

  return {
    items: result,
    stats
  };
}


/* =========================================================
   CIAN RSS
========================================================= */

function extractCianRssUrl(html) {
  const patterns = [
    /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return normalizeUrl(
        match[1],
        "https://krasnodar.cian.ru/magazine/"
      );
    }
  }

  /*
   * Дополнительный поиск обычной ссылки RSS.
   */

  const links =
    extractAllAnchors(
      html,
      "https://krasnodar.cian.ru/magazine/"
    );

  for (const link of links) {
    if (
      /rss/i.test(link.url) ||
      /rss/i.test(link.text)
    ) {
      return link.url;
    }
  }

  return "";
}


function extractXmlTag(block, tag) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match = block.match(regex);

  return match
    ? cleanText(match[1])
    : "";
}


function parseCianRss(xml) {
  const items = [];

  const regex =
    /<item\b[\s\S]*?<\/item>/gi;

  let match;

  while ((match = regex.exec(xml))) {
    const block = match[0];

    const title =
      cleanTitle(
        extractXmlTag(block, "title")
      );

    const description =
      cleanDescription(
        extractXmlTag(block, "description")
      );

    const link =
      normalizeUrl(
        extractXmlTag(block, "link"),
        "https://www.cian.ru/"
      );

    const pubDate =
      parseDate(
        extractXmlTag(block, "pubDate")
      );

    let image = "";

    const enclosure =
      block.match(
        /<enclosure[^>]+url=["']([^"']+)["']/i
      );

    if (enclosure) {
      image = enclosure[1];
    }

    if (!image) {
      const media =
        block.match(
          /<(?:media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i
        );

      if (media) {
        image = media[1];
      }
    }

    if (!link || !title) {
      continue;
    }

    items.push({
      title,
      description,
      url: link,
      image,
      publishedAt: pubDate
    });
  }

  return items;
}


async function parseCian() {
  const stats = {
    name: SOURCES.cian.name,
    category: SOURCES.cian.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const result = [];

  try {
    const page =
      await fetchText(
        SOURCES.cian.url
      );

    if (!page.ok) {
      stats.failed = 1;
      stats.error =
        `HTTP ${page.status}`;

      return {
        items: [],
        stats
      };
    }

    let rssUrl =
      extractCianRssUrl(page.text);

    if (rssUrl) {
      try {
        const rss =
          await fetchText(rssUrl);

        if (rss.ok) {
          const rssItems =
            parseCianRss(rss.text);

          stats.candidates =
            rssItems.length;

          for (const item of rssItems) {
            if (!item.publishedAt) {
              stats.rejected++;
              continue;
            }

            const age =
              Date.now() -
              item.publishedAt.getTime();

            if (
              age < 0 ||
              age > DEFAULT_DAYS * 86400000
            ) {
              stats.rejected++;
              continue;
            }

            if (
              isForeignContent(
                item.title,
                item.description
              )
            ) {
              stats.rejected++;
              continue;
            }

            result.push({
              id: makeId(item.url),
              source: "cian",
              sourceName: "ЦИАН",
              title: cleanTitle(item.title),
              description:
                cleanDescription(
                  item.description
                ),
              url: stripTracking(
                item.url
              ),
              image:
                item.image || "",
              publishedAt:
                item.publishedAt.toISOString(),
              topic: classifyTopic(
                item.title,
                item.description
              )
            });

            stats.recentCandidates++;
          }

          return {
            items: result,
            stats
          };
        }
      } catch {}
    }

    /*
     * Если RSS не сработал — парсим
     * непосредственно ссылки страницы.
     */

    const anchors =
      extractAllAnchors(
        page.text,
        SOURCES.cian.url
      );

    const unique =
      new Map();

    for (const anchor of anchors) {
      if (
        !isAllowedArticleUrl(
          "cian",
          anchor.url
        )
      ) {
        continue;
      }

      if (
        isForeignContent(
          anchor.text,
          ""
        )
      ) {
        continue;
      }

      if (!unique.has(anchor.url)) {
        unique.set(
          anchor.url,
          anchor
        );
      }
    }

    stats.candidates =
      unique.size;

    for (const [url, anchor] of unique) {
      const data =
        await extractArticleData(
          url,
          anchor.text
        );

      if (!data.publishedAt) {
        stats.rejected++;
        continue;
      }

      const age =
        Date.now() -
        data.publishedAt.getTime();

      if (
        age < 0 ||
        age > DEFAULT_DAYS * 86400000
      ) {
        stats.rejected++;
        continue;
      }

      if (
        isForeignContent(
          data.title,
          data.description
        )
      ) {
        stats.rejected++;
        continue;
      }

      result.push({
        id: makeId(url),
        source: "cian",
        sourceName: "ЦИАН",
        title:
          cleanTitle(data.title),
        description:
          cleanDescription(
            data.description
          ),
        url,
        image:
          data.image || "",
        publishedAt:
          data.publishedAt.toISOString(),
        topic:
          classifyTopic(
            data.title,
            data.description
          )
      });

      stats.recentCandidates++;
    }

  } catch (error) {
    stats.failed = 1;
    stats.error =
      error?.message || String(error);
  }

  return {
    items: result,
    stats
  };
}


/* =========================================================
   DEDUPLICATION
========================================================= */

function dedupeItems(items) {
  const map = new Map();

  for (const item of items) {
    const key =
      item.url ||
      `${item.source}:${item.title}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}


/* =========================================================
   BALANCE SOURCES
========================================================= */

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
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    );
  }

  const result = [];

  const sources =
    [...groups.keys()];

  let index = 0;

  while (
    result.length < limit &&
    sources.length
  ) {
    let added = false;

    for (
      let i = 0;
      i < sources.length &&
      result.length < limit;
      i++
    ) {
      const source =
        sources[
          (index + i) %
          sources.length
        ];

      const list =
        groups.get(source);

      if (!list.length) {
        continue;
      }

      result.push(
        list.shift()
      );

      added = true;
    }

    if (!added) break;

    index++;
  }

  /*
   * Возвращаем общий порядок по дате.
   */

  return result
    .sort(
      (a, b) =>
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
    )
    .slice(0, limit);
}


/* =========================================================
   CATEGORY FILTER
========================================================= */

function filterCategory(items, category) {
  if (!category || category === "all") {
    return items;
  }

  return items.filter(
    item =>
      item.topic === category ||
      item.source === category ||
      item.sourceName === category
  );
}


/* =========================================================
   API
========================================================= */

module.exports = async function handler(req, res) {

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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const category =
    String(
      req.query.category ||
      "all"
    ).trim();

  const limitRaw =
    Number(
      req.query.limit ||
      DEFAULT_LIMIT
    );

  const limit =
    Math.max(
      1,
      Math.min(
        MAX_LIMIT,
        Number.isFinite(limitRaw)
          ? limitRaw
          : DEFAULT_LIMIT
      )
    );

  const daysRaw =
    Number(
      req.query.days ||
      DEFAULT_DAYS
    );

  const days =
    Math.max(
      1,
      Math.min(
        30,
        Number.isFinite(daysRaw)
          ? daysRaw
          : DEFAULT_DAYS
      )
    );

  try {

    /*
     * Запускаем источники параллельно.
     */

    const [
      result161,
      result93,
      resultKrasdom,
      resultDomrf,
      resultDomclick,
      resultYandex,
      resultCian
    ] = await Promise.allSettled([

      parseGenericSource(
        "161ru",
        SOURCES["161ru"]
      ),

      parseGenericSource(
        "93ru",
        SOURCES["93ru"]
      ),

      parseGenericSource(
        "krasdom",
        SOURCES.krasdom
      ),

      parseGenericSource(
        "domrf",
        SOURCES.domrf
      ),

      parseDomclick(),

      parseGenericSource(
        "yandexrealty",
        SOURCES.yandexrealty
      ),

      parseCian()

    ]);


    function getResult(
      promiseResult,
      sourceKey
    ) {
      if (
        promiseResult.status === "fulfilled"
      ) {
        return promiseResult.value;
      }

      return {
        items: [],
        stats: {
          name:
            SOURCES[sourceKey].name,
          category:
            SOURCES[sourceKey].category,
          candidates: 0,
          recentCandidates: 0,
          rejected: 0,
          failed: 1,
          error:
            promiseResult.reason?.message ||
            String(
              promiseResult.reason
            )
        }
      };
    }


    const parsed161 =
      getResult(
        result161,
        "161ru"
      );

    const parsed93 =
      getResult(
        result93,
        "93ru"
      );

    const parsedKrasdom =
      getResult(
        resultKrasdom,
        "krasdom"
      );

    const parsedDomrf =
      getResult(
        resultDomrf,
        "domrf"
      );

    const parsedDomclick =
      getResult(
        resultDomclick,
        "domclick"
      );

    const parsedYandex =
      getResult(
        resultYandex,
        "yandexrealty"
      );

    const parsedCian =
      getResult(
        resultCian,
        "cian"
      );


    let items = [
      ...parsed161.items,
      ...parsed93.items,
      ...parsedKrasdom.items,
      ...parsedDomrf.items,
      ...parsedDomclick.items,
      ...parsedYandex.items,
      ...parsedCian.items
    ];


    /*
     * Дополнительная проверка возраста.
     */

    const maxAge =
      days * 86400000;

    items =
      items.filter(item => {

        const date =
          new Date(
            item.publishedAt
          );

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return false;
        }

        const age =
          Date.now() -
          date.getTime();

        return (
          age >= 0 &&
          age <= maxAge
        );
      });


    items =
      dedupeItems(items);


    items =
      filterCategory(
        items,
        category
      );


    items =
      balanceItems(
        items,
        limit
      );


    const sources = {
      "161ru":
        parsed161.stats,

      "93ru":
        parsed93.stats,

      krasdom:
        parsedKrasdom.stats,

      domrf:
        parsedDomrf.stats,

      domclick:
        parsedDomclick.stats,

      yandexrealty:
        parsedYandex.stats,

      cian:
        parsedCian.stats
    };


    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );


    return res.status(200).json({
      ok: true,
      category,
      count: items.length,
      items,
      sources
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        String(error)
    });
  }
};
