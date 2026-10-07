const SOURCE_CONFIG = {
  "161ru": {
    id: "161ru",
    name: "161.RU",
    category: "rostov",
    listUrl: "https://161.ru/text/realty/",
    type: "n1"
  },

  "93ru": {
    id: "93ru",
    name: "93.RU",
    category: "krasnodar",
    listUrl: "https://93.ru/text/realty/",
    type: "n1"
  },

  "krasdom": {
    id: "krasdom",
    name: "КРАСДОМ",
    category: "krasnodar",
    listUrl: "https://krasdom.ru/news/",
    type: "krasdom"
  },

  "domclick": {
    id: "domclick",
    name: "Домклик",
    category: "federal",
    listUrl: "https://blog.domclick.ru/novosti",
    type: "domclick"
  },

  "domrf": {
    id: "domrf",
    name: "ДОМ.РФ",
    category: "federal",
    listUrl: "https://спроси.дом.рф/news/",
    type: "domrf"
  }
};


// ------------------------------------------------------------
// HTML / URL HELPERS
// ------------------------------------------------------------

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return _;
      }
    });
}


function cleanText(str) {
  return decodeHtmlEntities(
    String(str || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}


function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}


function normalizeUrl(url) {
  try {
    const u = new URL(url);

    u.hash = "";

    // Убираем tracking-параметры
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "erid",
      "from",
      "source"
    ].forEach(k => u.searchParams.delete(k));

    let result = u.href;

    if (result.endsWith("/")) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return String(url || "");
  }
}


function normalizeTitle(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


// ------------------------------------------------------------
// DATE
// ------------------------------------------------------------

function normalizeDate(value) {
  if (!value) return "";

  const text = String(value).trim();

  let m = text.match(
    /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
  );

  if (m) {
    return [
      m[1],
      String(m[2]).padStart(2, "0"),
      String(m[3]).padStart(2, "0")
    ].join("-");
  }

  m = text.match(
    /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/
  );

  if (m) {
    return [
      m[3],
      String(m[2]).padStart(2, "0"),
      String(m[1]).padStart(2, "0")
    ].join("-");
  }

  return "";
}


function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}


function getToday() {
  return new Date().toISOString().slice(0, 10);
}


function isFutureDate(date) {
  if (!isValidDate(date)) return false;

  return date > getToday();
}


function isWithinDays(date, days) {
  if (!isValidDate(date)) return false;

  const d = new Date(date + "T00:00:00Z");
  const now = new Date();

  const diff =
    (now.getTime() - d.getTime()) /
    (1000 * 60 * 60 * 24);

  return diff >= 0 && diff <= days;
}


// ------------------------------------------------------------
// HTML META
// ------------------------------------------------------------

function extractMeta(html, key) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    )
  ];

  for (const re of patterns) {
    const m = html.match(re);

    if (m && m[1]) {
      return decodeHtmlEntities(m[1]).trim();
    }
  }

  return "";
}


function extractTitle(html) {
  const og = extractMeta(html, "og:title");

  if (og) {
    return cleanText(og);
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (title) {
    return cleanText(title[1]);
  }

  return "";
}


function extractDescription(html) {
  return (
    extractMeta(html, "og:description") ||
    extractMeta(html, "description") ||
    ""
  );
}


function extractImage(html) {
  return (
    extractMeta(html, "og:image") ||
    extractMeta(html, "twitter:image") ||
    ""
  );
}


function extractCanonical(html, fallbackUrl) {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
  );

  if (m && m[1]) {
    return absoluteUrl(
      decodeHtmlEntities(m[1]),
      fallbackUrl
    );
  }

  return fallbackUrl;
}


// ------------------------------------------------------------
// JSON-LD DATE
// ------------------------------------------------------------

function extractPublishedAt(html) {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  if (scripts) {
    for (const script of scripts) {
      const body = script
        .replace(
          /<script[^>]*>/i,
          ""
        )
        .replace(
          /<\/script>\s*$/i,
          ""
        )
        .trim();

      try {
        const json = JSON.parse(body);

        const arr = Array.isArray(json)
          ? json
          : [json];

        for (const item of arr) {
          if (!item || typeof item !== "object") {
            continue;
          }

          if (
            item.datePublished ||
            item.dateCreated ||
            item.dateModified
          ) {
            const value =
              item.datePublished ||
              item.dateCreated ||
              item.dateModified;

            const date = normalizeDate(value);

            if (date && !isFutureDate(date)) {
              return {
                date,
                publishedAt: value
              };
            }
          }
        }
      } catch {
        // Некоторые страницы содержат невалидный JSON-LD
      }
    }
  }

  return null;
}


// ------------------------------------------------------------
// VISIBLE DATE
// ------------------------------------------------------------

function extractVisibleDate(html) {
  const patterns = [
    /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
    /\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g
  ];

  for (const re of patterns) {
    const matches = html.match(re);

    if (!matches) continue;

    for (const value of matches) {
      const date = normalizeDate(value);

      if (
        date &&
        !isFutureDate(date)
      ) {
        return date;
      }
    }
  }

  return "";
}


// ------------------------------------------------------------
// FETCH
// ------------------------------------------------------------

async function fetchHtml(url) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; UrbanEstateNewsBot/1.0)",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "ru-RU,ru;q=0.9,en;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
}


// ------------------------------------------------------------
// TOPIC
// ------------------------------------------------------------

function getTopicCategory(title) {
  const text = String(title || "").toLowerCase();

  if (
    /ипотек|ипотеч|семейн.*ипотек|ставк.*кредит|кредит|рефинанс|банк|банки/.test(
      text
    )
  ) {
    return "mortgage";
  }

  if (
    /новострой|новостроек|застройщик|застройщики|девелопер|жк |жилой комплекс|строительств|домов|дольщик|долев/.test(
      text
    )
  ) {
    return "newbuildings";
  }

  if (
    /закон|законодатель|росреестр|госдум|минфин|правительств|налог|штраф|правил|изменен|регулирован/.test(
      text
    )
  ) {
    return "laws";
  }

  return "realty";
}


// ------------------------------------------------------------
// ARTICLE LINK EXTRACTION
// ------------------------------------------------------------

function extractLinks(html, baseUrl) {
  const result = [];

  const re =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;

  let m;

  while ((m = re.exec(html))) {
    const url = absoluteUrl(m[1], baseUrl);

    if (!url) continue;

    result.push(url);
  }

  return result;
}


// ------------------------------------------------------------
// 161.RU / 93.RU
// ------------------------------------------------------------

function isN1ArticleUrl(url, host) {
  const escapedHost =
    host === "161.ru"
      ? "161"
      : "93";

  const re = new RegExp(
    `^https://${escapedHost}\\.ru/text/realty/20\\d{2}/\\d{2}/\\d{2}/\\d+/?$`,
    "i"
  );

  return re.test(url);
}


async function fetchN1List(source) {
  const html = await fetchHtml(source.listUrl);

  const links = extractLinks(
    html,
    source.listUrl
  );

  const unique = new Map();

  for (const url of links) {
    const clean = normalizeUrl(url);

    if (
      !isN1ArticleUrl(
        clean,
        source.id === "161ru"
          ? "161.ru"
          : "93.ru"
      )
    ) {
      continue;
    }

    unique.set(clean, {
      url: clean,
      date:
        clean.match(
          /\/(20\d{2})\/(\d{2})\/(\d{2})\//
        )
          ? clean
              .match(
                /\/(20\d{2})\/(\d{2})\/(\d{2})\//
              )
              .slice(1)
              .join("-")
          : ""
    });
  }

  return Array.from(unique.values())
    .sort((a, b) =>
      String(b.date).localeCompare(
        String(a.date)
      )
    )
    .slice(0, 40);
}


// ------------------------------------------------------------
// КРАСДОМ
// ------------------------------------------------------------

function isKrasdomArticleUrl(url) {
  try {
    const u = new URL(url);

    if (u.hostname !== "krasdom.ru") {
      return false;
    }

    if (!/^\/news\/[^/]+/i.test(u.pathname)) {
      return false;
    }

    if (u.pathname === "/news/") {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}


async function fetchKrasdomList(source) {
  const html = await fetchHtml(
    source.listUrl
  );

  const links = extractLinks(
    html,
    source.listUrl
  );

  const unique = new Set();

  for (const url of links) {
    const clean = normalizeUrl(url);

    if (!isKrasdomArticleUrl(clean)) {
      continue;
    }

    unique.add(clean);
  }

  return Array.from(unique)
    .slice(0, 40)
    .map(url => ({
      url,
      date: ""
    }));
}


// ------------------------------------------------------------
// ДОМКЛИК
// ------------------------------------------------------------

function isDomclickArticleUrl(url) {
  try {
    const u = new URL(url);

    if (
      u.hostname !== "blog.domclick.ru"
    ) {
      return false;
    }

    const path = u.pathname;

    if (
      path === "/" ||
      path === "/novosti" ||
      path === "/novosti/"
    ) {
      return false;
    }

    // Исключаем служебные разделы
    if (
      /^\/(search|tag|tags|author|authors|category|categories|page|login|register|about|contacts)(\/|$)/i.test(
        path
      )
    ) {
      return false;
    }

    // Приоритет новостным/статейным URL
    if (
      /^\/(novosti|news|articles|article|post|posts|journal)\//i.test(
        path
      )
    ) {
      return true;
    }

    // Остальные глубокие URL тоже разрешаем,
    // но только если это похоже на slug статьи
    const parts = path
      .split("/")
      .filter(Boolean);

    if (parts.length >= 2) {
      const last = parts[parts.length - 1];

      if (
        last.length >= 8 &&
        /[a-zа-я0-9]/i.test(last)
      ) {
        return true;
      }
    }

    return false;

  } catch {
    return false;
  }
}


async function fetchDomclickList(source) {
  const html = await fetchHtml(
    source.listUrl
  );

  const links = extractLinks(
    html,
    source.listUrl
  );

  const unique = new Set();

  for (const url of links) {
    const clean = normalizeUrl(url);

    if (
      isDomclickArticleUrl(clean)
    ) {
      unique.add(clean);
    }
  }

  return Array.from(unique)
    .slice(0, 40)
    .map(url => ({
      url,
      date: ""
    }));
}


// ------------------------------------------------------------
// ДОМ.РФ
// ------------------------------------------------------------

function isDomrfArticleUrl(url) {
  try {
    const u = new URL(url);

    const host =
      u.hostname.toLowerCase();

    /*
     * URL.hostname автоматически переводит
     * кириллический домен в punycode.
     *
     * Для спроси.дом.рф:
     *
     * xn--h1alcedd.xn--d1aqf.xn--p1ai
     */

    const validHost =
      host ===
        "xn--h1alcedd.xn--d1aqf.xn--p1ai" ||
      host === "спроси.дом.рф";

    if (!validHost) {
      return false;
    }

    const path = u.pathname;

    /*
     * КЛЮЧЕВОЕ ИЗМЕНЕНИЕ:
     * разрешаем ТОЛЬКО /news/...
     */

    if (
      !/^\/news\/.+/i.test(path)
    ) {
      return false;
    }

    if (
      path === "/news/" ||
      path === "/news"
    ) {
      return false;
    }

    /*
     * Исключаем возможные служебные
     * вложенные разделы.
     */

    if (
      /^\/news\/(rss|search|tag|tags|page|category)(\/|$)/i.test(
        path
      )
    ) {
      return false;
    }

    /*
     * Не принимаем файлы.
     */

    if (
      /\.(xml|rss|json|jpg|jpeg|png|gif|webp|svg|pdf|css|js)$/i.test(
        path
      )
    ) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}


async function fetchDomrfList(source) {
  const html = await fetchHtml(
    source.listUrl
  );

  const links = extractLinks(
    html,
    source.listUrl
  );

  const unique = new Set();

  for (const url of links) {
    const clean = normalizeUrl(url);

    if (
      isDomrfArticleUrl(clean)
    ) {
      unique.add(clean);
    }
  }

  return Array.from(unique)
    .slice(0, 50)
    .map(url => ({
      url,
      date: ""
    }));
}


// ------------------------------------------------------------
// ARTICLE PARSER
// ------------------------------------------------------------

function isBadArticleTitle(title) {
  const t = normalizeTitle(title);

  if (!t) return true;

  if (t.length < 15) {
    return true;
  }

  const badTitles = [
    "все публикации",
    "новости",
    "новости недвижимости",
    "дом.рф",
    "спроси.дом.рф",
    "консультационный центр дом.рф",
    "инструкции",
    "главная"
  ];

  return badTitles.includes(t);
}


async function parseArticle(
  source,
  candidate
) {
  try {
    const html = await fetchHtml(
      candidate.url
    );

    let title =
      extractTitle(html);

    let description =
      extractDescription(html);

    let image =
      extractImage(html);

    let url =
      extractCanonical(
        html,
        candidate.url
      );

    title = cleanText(title);
    description = cleanText(
      description
    );

    /*
     * Сначала пытаемся получить
     * дату из JSON-LD.
     */

    let date = "";
    let publishedAt = "";

    const jsonLdDate =
      extractPublishedAt(html);

    if (jsonLdDate) {
      date = jsonLdDate.date;
      publishedAt =
        jsonLdDate.publishedAt;
    }

    /*
     * Если JSON-LD нет,
     * используем дату кандидата.
     */

    if (!date) {
      date = normalizeDate(
        candidate.date
      );
    }

    /*
     * Затем видимая дата.
     */

    if (!date) {
      date =
        extractVisibleDate(html);
    }

    /*
     * Будущие даты запрещаем.
     */

    if (isFutureDate(date)) {
      date = "";
      publishedAt = "";
    }

    /*
     * Если даты нет, такую страницу
     * не добавляем для источников,
     * где дата обязательна.
     */

    if (!date) {
      return null;
    }

    /*
     * ДОМ.РФ — дополнительная защита:
     * canonical тоже должен оставаться
     * внутри news.
     */

    if (
      source.id === "domrf" &&
      !isDomrfArticleUrl(url)
    ) {
      url = candidate.url;
    }

    /*
     * Проверяем заголовок.
     */

    if (isBadArticleTitle(title)) {
      return null;
    }

    /*
     * Если canonical внезапно ведет
     * на служебную страницу ДОМ.РФ —
     * не принимаем такую запись.
     */

    if (
      source.id === "domrf" &&
      !isDomrfArticleUrl(url)
    ) {
      return null;
    }

    if (!image) {
      image = "";
    } else {
      image = absoluteUrl(
        image,
        url
      );
    }

    return {
      source: source.name,
      sourceId: source.id,
      category: source.category,
      title,
      description,
      url: normalizeUrl(url),
      image,
      date,
      publishedAt:
        publishedAt ||
        `${date}T00:00:00Z`
    };

  } catch {
    return null;
  }
}


// ------------------------------------------------------------
// SOURCE PROCESSING
// ------------------------------------------------------------

async function processSource(
  source,
  limit,
  days
) {
  let candidates = [];

  try {
    if (source.type === "n1") {
      candidates =
        await fetchN1List(source);
    }

    if (source.type === "krasdom") {
      candidates =
        await fetchKrasdomList(source);
    }

    if (source.type === "domclick") {
      candidates =
        await fetchDomclickList(source);
    }

    if (source.type === "domrf") {
      candidates =
        await fetchDomrfList(source);
    }

  } catch (error) {
    return {
      items: [],
      diagnostics: {
        id: source.id,
        name: source.name,
        count: 0,
        candidates: 0,
        recentCandidates: 0,
        failed: 1,
        error: String(
          error?.message || error
        )
      }
    };
  }

  /*
   * Для источников, где дата уже есть
   * в URL, можно сразу отсечь старые.
   */

  const prepared =
    candidates.filter(candidate => {
      if (!candidate.date) {
        return true;
      }

      if (isFutureDate(candidate.date)) {
        return false;
      }

      return isWithinDays(
        candidate.date,
        days
      );
    });

  const items = [];
  let failed = 0;

  /*
   * Обрабатываем небольшими пачками,
   * чтобы не создавать слишком много
   * параллельных запросов.
   */

  const batchSize = 5;

  for (
    let i = 0;
    i < prepared.length;
    i += batchSize
  ) {
    const batch =
      prepared.slice(
        i,
        i + batchSize
      );

    const results =
      await Promise.all(
        batch.map(candidate =>
          parseArticle(
            source,
            candidate
          )
        )
      );

    for (const item of results) {
      if (!item) {
        failed++;
        continue;
      }

      if (isFutureDate(item.date)) {
        continue;
      }

      if (
        !isWithinDays(
          item.date,
          days
        )
      ) {
        continue;
      }

      items.push(item);
    }

    /*
     * Достаточно материалов.
     */

    if (
      items.length >=
      Math.max(limit, 10)
    ) {
      break;
    }
  }

  items.sort((a, b) =>
    String(b.date).localeCompare(
      String(a.date)
    )
  );

  const finalItems =
    items.slice(0, limit);

  return {
    items: finalItems,

    diagnostics: {
      id: source.id,
      name: source.name,
      count: finalItems.length,
      candidates: candidates.length,
      recentCandidates: prepared.length,
      failed
    }
  };
}


// ------------------------------------------------------------
// DUPLICATES
// ------------------------------------------------------------

function removeDuplicates(items) {
  const usedUrls = new Set();
  const usedTitles = new Set();

  const result = [];

  for (const item of items) {
    const url =
      normalizeUrl(item.url);

    const title =
      normalizeTitle(item.title);

    /*
     * Дубликат URL
     */

    if (
      url &&
      usedUrls.has(url)
    ) {
      continue;
    }

    /*
     * Дубликат заголовка.
     *
     * Это специально нужно для 93.RU
     * и 161.RU, где одна и та же статья
     * часто публикуется практически
     * одновременно.
     */

    if (
      title &&
      usedTitles.has(title)
    ) {
      continue;
    }

    if (url) {
      usedUrls.add(url);
    }

    if (title) {
      usedTitles.add(title);
    }

    result.push(item);
  }

  return result;
}


// ------------------------------------------------------------
// CATEGORY FILTER
// ------------------------------------------------------------

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

  /*
   * Региональные фильтры
   */

  if (
    category === "krasnodar"
  ) {
    return (
      item.category === "krasnodar"
    );
  }

  if (
    category === "rostov"
  ) {
    return (
      item.category === "rostov"
    );
  }

  /*
   * Тематические фильтры
   */

  const topic =
    getTopicCategory(
      item.title
    );

  if (
    category === "mortgage"
  ) {
    return topic === "mortgage";
  }

  if (
    category === "newbuildings"
  ) {
    return topic === "newbuildings";
  }

  if (
    category === "laws"
  ) {
    return topic === "laws";
  }

  if (
    category === "realty"
  ) {
    return topic === "realty";
  }

  return true;
}


// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

module.exports = async function handler(
  req,
  res
) {
  try {
    const category =
      String(
        req.query?.category ||
        "all"
      ).toLowerCase();

    const limit = Math.min(
      Math.max(
        Number(
          req.query?.limit || 15
        ),
        1
      ),
      50
    );

    const days = Math.min(
      Math.max(
        Number(
          req.query?.days || 7
        ),
        1
      ),
      30
    );

    const sources =
      Object.values(
        SOURCE_CONFIG
      );

    /*
     * Для конкретного регионального
     * фильтра не обязательно тянуть
     * федеральные источники.
     */

    let selectedSources =
      sources;

    if (
      category === "krasnodar"
    ) {
      selectedSources =
        sources.filter(
          s =>
            s.category ===
            "krasnodar"
        );
    }

    if (
      category === "rostov"
    ) {
      selectedSources =
        sources.filter(
          s =>
            s.category ===
            "rostov"
        );
    }

    /*
     * Для тематических категорий
     * оставляем все источники,
     * потому что тема определяется
     * по заголовку.
     */

    const results =
      await Promise.all(
        selectedSources.map(
          source =>
            processSource(
              source,
              limit,
              days
            )
        )
      );

    let allItems = [];

    const diagnostics = [];

    for (const result of results) {
      allItems =
        allItems.concat(
          result.items
        );

      diagnostics.push(
        result.diagnostics
      );
    }

    /*
     * Сначала фильтруем тему,
     * потом убираем дубли.
     */

    allItems =
      allItems.filter(item =>
        matchesCategory(
          item,
          category
        )
      );

    allItems =
      removeDuplicates(
        allItems
      );

    /*
     * Сортировка от новых к старым.
     */

    allItems.sort((a, b) => {
      const da =
        new Date(
          a.publishedAt ||
          `${a.date}T00:00:00Z`
        ).getTime();

      const db =
        new Date(
          b.publishedAt ||
          `${b.date}T00:00:00Z`
        ).getTime();

      return db - da;
    });

    allItems =
      allItems.slice(
        0,
        limit
      );

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    res.status(200).json({
      ok: true,
      category,
      count: allItems.length,
      items: allItems,
      sources: diagnostics
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error:
        String(
          error?.message ||
          error
        )
    });
  }
};
