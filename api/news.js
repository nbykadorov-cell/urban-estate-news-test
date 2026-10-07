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


// ============================================================
// HTML / URL
// ============================================================

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

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "erid",
      "from",
      "source"
    ].forEach(key => {
      u.searchParams.delete(key);
    });

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


// ============================================================
// DATE
// ============================================================

function normalizeDate(value) {
  if (!value) {
    return "";
  }

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
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(date || "")
  );
}


function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function isFutureDate(date) {
  if (!isValidDate(date)) {
    return false;
  }

  return date > getToday();
}


function isWithinDays(date, days) {
  if (!isValidDate(date)) {
    return false;
  }

  const articleDate =
    new Date(date + "T00:00:00Z");

  const now =
    new Date();

  const diff =
    (
      now.getTime() -
      articleDate.getTime()
    ) /
    (1000 * 60 * 60 * 24);

  return (
    diff >= 0 &&
    diff <= days
  );
}


// ============================================================
// META
// ============================================================

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

  for (const regex of patterns) {
    const match =
      html.match(regex);

    if (
      match &&
      match[1]
    ) {
      return decodeHtmlEntities(
        match[1]
      ).trim();
    }
  }

  return "";
}


function extractTitle(html) {
  const ogTitle =
    extractMeta(
      html,
      "og:title"
    );

  if (ogTitle) {
    return cleanText(
      ogTitle
    );
  }

  const titleMatch =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  if (titleMatch) {
    return cleanText(
      titleMatch[1]
    );
  }

  return "";
}


function extractDescription(html) {
  return (
    extractMeta(
      html,
      "og:description"
    ) ||
    extractMeta(
      html,
      "description"
    ) ||
    ""
  );
}


function extractImage(html) {
  return (
    extractMeta(
      html,
      "og:image"
    ) ||
    extractMeta(
      html,
      "twitter:image"
    ) ||
    ""
  );
}


function extractCanonical(
  html,
  fallbackUrl
) {
  const match =
    html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

  if (
    match &&
    match[1]
  ) {
    return absoluteUrl(
      decodeHtmlEntities(
        match[1]
      ),
      fallbackUrl
    );
  }

  return fallbackUrl;
}


// ============================================================
// JSON-LD
// ============================================================

function extractPublishedAt(html) {
  const scripts =
    html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    );

  if (!scripts) {
    return null;
  }

  for (const script of scripts) {
    const body =
      script
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
      const json =
        JSON.parse(body);

      const items =
        Array.isArray(json)
          ? json
          : [json];

      for (const item of items) {
        if (
          !item ||
          typeof item !== "object"
        ) {
          continue;
        }

        const value =
          item.datePublished ||
          item.dateCreated ||
          item.dateModified;

        if (!value) {
          continue;
        }

        const date =
          normalizeDate(
            value
          );

        if (
          date &&
          !isFutureDate(date)
        ) {
          return {
            date,
            publishedAt: value
          };
        }
      }

    } catch {
      // Некорректный JSON-LD
    }
  }

  return null;
}


// ============================================================
// VISIBLE DATE
// ============================================================

function extractVisibleDate(html) {
  const patterns = [
    /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
    /\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g
  ];

  for (const regex of patterns) {
    const matches =
      html.match(regex);

    if (!matches) {
      continue;
    }

    for (const value of matches) {
      const date =
        normalizeDate(value);

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


// ============================================================
// FETCH
// ============================================================

async function fetchHtml(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 12000);

  try {
    const response =
      await fetch(
        url,
        {
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
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();

  } finally {
    clearTimeout(
      timeout
    );
  }
}


// ============================================================
// TOPIC
// ============================================================

function getTopicCategory(title) {
  const text =
    String(title || "")
      .toLowerCase();

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


// ============================================================
// ДОМ.РФ — ФИЛЬТР РЕЛЕВАНТНОСТИ
// ============================================================

function isRelevantDomrfArticle(
  title,
  description
) {
  const titleText =
    cleanText(title)
      .toLowerCase();

  const descriptionText =
    cleanText(description)
      .toLowerCase();

  const text =
    `${titleText} ${descriptionText}`;


  // ----------------------------------------------------------
  // 1. Явно нерелевантные темы
  // ----------------------------------------------------------

  const irrelevantPatterns = [
    /пенси[яйи]/,
    /пенсионер/,
    /пенсионн/,
    /пособи[яй]/,
    /социальн.*выплат/,
    /праздник/,
    /выходн.*дн/,
    /рабоч.*дн/,
    /новогод/,
    /ноябр/,
    /декабр/,
    /январ/,
    /как отдыхаем/,
    /отдыхать/,
    /путешеств/,
    /туризм/,
    /погода/,
    /рецепт/,
    /еда/,
    /продукт/,
    /здоровь/,
    /медицин/,
    /лекарств/,
    /спорт/,
    /футбол/,
    /пенсионн.*накоплен/,
    /накопительн.*пенси/,
    /стар.*вещ/,
    /вещи.*выбрасыв/,
    /мошенничеств.*телефон/,
    /телефон.*мошенничеств/
  ];


  const hasIrrelevantTopic =
    irrelevantPatterns.some(
      regex =>
        regex.test(text)
    );


  /*
   * Если одновременно есть сильный
   * признак недвижимости — не отбрасываем.
   *
   * Например:
   * "Пенсионер купил квартиру..."
   *
   * Такая новость всё-таки может быть
   * полезна для риелтора.
   */

  const strongRealEstatePatterns = [
    /недвижим/,
    /квартир/,
    /жиль/,
    /ипотек/,
    /ипотеч/,
    /новостро/,
    /застройщик/,
    /застройщики/,
    /девелопер/,
    /вторичн/,
    /аренд/,
    /долев/,
    /дольщик/,
    /маткапитал/,
    /материнск.*капитал/,
    /росреестр/,
    /егрн/,
    /кадастр/,
    /ижс/,
    /земельн.*участ/,
    /земельный участок/,
    /домовлад/,
    /жкх/,
    /жку/,
    /коммунальн.*услуг/,
    /капремонт/
  ];


  const strongRealEstateCount =
    strongRealEstatePatterns.filter(
      regex =>
        regex.test(text)
    ).length;


  /*
   * Явно нерелевантная новость
   * без недвижимости.
   */

  if (
    hasIrrelevantTopic &&
    strongRealEstateCount === 0
  ) {
    return false;
  }


  // ----------------------------------------------------------
  // 2. Сильные признаки
  // ----------------------------------------------------------

  const strongKeywords = [
    /недвижим/,
    /жиль/,
    /квартир/,
    /ипотек/,
    /ипотеч/,
    /новостро/,
    /застройщик/,
    /застройщики/,
    /девелопер/,
    /вторичн/,
    /аренд/,
    /долев/,
    /дольщик/,
    /маткапитал/,
    /материнск.*капитал/,
    /семейн.*ипотек/,
    /ставк.*ипотек/,
    /рефинанс/,
    /росреестр/,
    /егрн/,
    /кадастр/,
    /ижс/,
    /земельн/,
    /земельный участок/,
    /загородн/,
    /домовлад/,
    /жкх/,
    /жку/,
    /коммунальн/,
    /капремонт/,
    /жилищн/,
    /налог.*недвиж/,
    /налог.*квартир/,
    /налог.*жиль/,
    /вычет.*ипотек/,
    /вычет.*квартир/,
    /господдерж.*жиль/,
    /господдерж.*ипотек/
  ];


  let score = 0;


  for (
    const regex of strongKeywords
  ) {
    if (
      regex.test(titleText)
    ) {
      score += 4;
    } else if (
      regex.test(descriptionText)
    ) {
      score += 2;
    }
  }


  // ----------------------------------------------------------
  // 3. Контекстные слова
  // ----------------------------------------------------------

  const contextualKeywords = [
    /госуслуг/,
    /правительств/,
    /госдум/,
    /минфин/,
    /минстрой/,
    /налог/,
    /банк/,
    /банки/,
    /кредит/,
    /закон/,
    /регистрац/,
    /ограничен/,
    /собственник/,
    /собственност/,
    /право пользован/
  ];


  for (
    const regex of contextualKeywords
  ) {
    if (
      regex.test(text)
    ) {
      score += 1;
    }
  }


  // ----------------------------------------------------------
  // 4. Сильный контекст недвижимости
  // ----------------------------------------------------------

  const realEstateContext = [
    /недвижим/,
    /квартир/,
    /жиль/,
    /ипотек/,
    /дом/,
    /участк/,
    /застрой/,
    /аренд/,
    /егрн/,
    /росреестр/,
    /жку/,
    /жкх/,
    /собственник/,
    /собственност/
  ];


  let realEstateContextCount = 0;


  for (
    const regex of realEstateContext
  ) {
    if (
      regex.test(text)
    ) {
      realEstateContextCount++;
    }
  }


  // ----------------------------------------------------------
  // 5. Специальные полезные темы
  // ----------------------------------------------------------

  /*
   * Материнский капитал.
   *
   * Само слово "маткапитал"
   * уже достаточно сильный признак,
   * даже если в описании напрямую
   * не написано "квартира".
   */

  if (
    /маткапитал|материнск.*капитал/.test(
      text
    )
  ) {
    return true;
  }


  /*
   * ЖКХ / коммунальные услуги.
   */

  if (
    /жкх|жку|коммунальн.*услуг/.test(
      text
    )
  ) {
    return true;
  }


  /*
   * ЕГРН / Росреестр.
   */

  if (
    /егрн|росреестр|кадастр/.test(
      text
    )
  ) {
    return true;
  }


  /*
   * Собственник + регистрация/ограничения
   * обычно относится к недвижимости.
   */

  if (
    /собственник|собственност/.test(text) &&
    /регистрац|ограничен|егрн|недвижим|квартир|жиль/.test(text)
  ) {
    return true;
  }


  // ----------------------------------------------------------
  // 6. Финальное решение по score
  // ----------------------------------------------------------

  /*
   * Достаточно сильный сигнал.
   */

  if (
    score >= 4
  ) {
    return true;
  }


  /*
   * Два и более признака недвижимости.
   */

  if (
    realEstateContextCount >= 2
  ) {
    return true;
  }


  /*
   * Контекстная тема + недвижимость.
   */

  const hasContextual =
    contextualKeywords.some(
      regex =>
        regex.test(text)
    );


  if (
    hasContextual &&
    realEstateContextCount >= 1
  ) {
    return true;
  }


  return false;
}


// ============================================================
// LINKS
// ============================================================

function extractLinks(
  html,
  baseUrl
) {
  const result = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    const url =
      absoluteUrl(
        match[1],
        baseUrl
      );

    if (!url) {
      continue;
    }

    result.push(url);
  }

  return result;
}


// ============================================================
// 161.RU / 93.RU
// ============================================================

function isN1ArticleUrl(
  url,
  host
) {
  const escapedHost =
    host === "161.ru"
      ? "161"
      : "93";

  const regex =
    new RegExp(
      `^https://${escapedHost}\\.ru/text/realty/20\\d{2}/\\d{2}/\\d{2}/\\d+/?$`,
      "i"
    );

  return regex.test(
    url
  );
}


async function fetchN1List(
  source
) {
  const html =
    await fetchHtml(
      source.listUrl
    );

  const links =
    extractLinks(
      html,
      source.listUrl
    );

  const unique =
    new Map();


  for (
    const url of links
  ) {
    const clean =
      normalizeUrl(url);

    const valid =
      isN1ArticleUrl(
        clean,
        source.id === "161ru"
          ? "161.ru"
          : "93.ru"
      );

    if (!valid) {
      continue;
    }


    const dateMatch =
      clean.match(
        /\/(20\d{2})\/(\d{2})\/(\d{2})\//
      );


    const date =
      dateMatch
        ? [
            dateMatch[1],
            dateMatch[2],
            dateMatch[3]
          ].join("-")
        : "";


    unique.set(
      clean,
      {
        url: clean,
        date
      }
    );
  }


  return Array.from(
    unique.values()
  )
    .sort((a, b) =>
      String(b.date).localeCompare(
        String(a.date)
      )
    )
    .slice(0, 40);
}


// ============================================================
// КРАСДОМ
// ============================================================

function isKrasdomArticleUrl(
  url
) {
  try {
    const u =
      new URL(url);

    if (
      u.hostname !==
      "krasdom.ru"
    ) {
      return false;
    }


    if (
      !/^\/news\/[^/]+/i.test(
        u.pathname
      )
    ) {
      return false;
    }


    if (
      u.pathname ===
      "/news/" ||
      u.pathname ===
      "/news"
    ) {
      return false;
    }


    return true;

  } catch {
    return false;
  }
}


async function fetchKrasdomList(
  source
) {
  const html =
    await fetchHtml(
      source.listUrl
    );

  const links =
    extractLinks(
      html,
      source.listUrl
    );

  const unique =
    new Set();


  for (
    const url of links
  ) {
    const clean =
      normalizeUrl(url);

    if (
      isKrasdomArticleUrl(
        clean
      )
    ) {
      unique.add(
        clean
      );
    }
  }


  return Array.from(
    unique
  )
    .slice(0, 40)
    .map(url => ({
      url,
      date: ""
    }));
}


// ============================================================
// ДОМКЛИК
// ============================================================

function isDomclickArticleUrl(
  url
) {
  try {
    const u =
      new URL(url);

    if (
      u.hostname !==
      "blog.domclick.ru"
    ) {
      return false;
    }


    const path =
      u.pathname;


    if (
      path === "/" ||
      path === "/novosti" ||
      path === "/novosti/"
    ) {
      return false;
    }


    if (
      /^\/(search|tag|tags|author|authors|category|categories|page|login|register|about|contacts)(\/|$)/i.test(
        path
      )
    ) {
      return false;
    }


    if (
      /^\/(novosti|news|articles|article|post|posts|journal)\//i.test(
        path
      )
    ) {
      return true;
    }


    const parts =
      path
        .split("/")
        .filter(Boolean);


    if (
      parts.length >= 2
    ) {
      const last =
        parts[
          parts.length - 1
        ];

      if (
        last.length >= 8 &&
        /[a-zа-я0-9]/i.test(
          last
        )
      ) {
        return true;
      }
    }


    return false;

  } catch {
    return false;
  }
}


async function fetchDomclickList(
  source
) {
  const html =
    await fetchHtml(
      source.listUrl
    );

  const links =
    extractLinks(
      html,
      source.listUrl
    );

  const unique =
    new Set();


  for (
    const url of links
  ) {
    const clean =
      normalizeUrl(url);

    if (
      isDomclickArticleUrl(
        clean
      )
    ) {
      unique.add(
        clean
      );
    }
  }


  return Array.from(
    unique
  )
    .slice(0, 40)
    .map(url => ({
      url,
      date: ""
    }));
}


// ============================================================
// ДОМ.РФ
// ============================================================

function isDomrfArticleUrl(
  url
) {
  try {
    const u =
      new URL(url);

    const host =
      u.hostname.toLowerCase();


    const validHost =
      host ===
      "xn--h1alcedd.xn--d1aqf.xn--p1ai";


    if (!validHost) {
      return false;
    }


    const path =
      u.pathname;


    if (
      !/^\/news\/.+/i.test(
        path
      )
    ) {
      return false;
    }


    if (
      path === "/news/" ||
      path === "/news"
    ) {
      return false;
    }


    if (
      /^\/news\/(rss|search|tag|tags|page|category)(\/|$)/i.test(
        path
      )
    ) {
      return false;
    }


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


async function fetchDomrfList(
  source
) {
  const html =
    await fetchHtml(
      source.listUrl
    );

  const links =
    extractLinks(
      html,
      source.listUrl
    );

  const unique =
    new Set();


  for (
    const url of links
  ) {
    const clean =
      normalizeUrl(url);

    if (
      isDomrfArticleUrl(
        clean
      )
    ) {
      unique.add(
        clean
      );
    }
  }


  return Array.from(
    unique
  )
    .slice(0, 50)
    .map(url => ({
      url,
      date: ""
    }));
}


// ============================================================
// BAD TITLES
// ============================================================

function isBadArticleTitle(
  title
) {
  const t =
    normalizeTitle(
      title
    );


  if (!t) {
    return true;
  }


  if (
    t.length < 15
  ) {
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


  return badTitles.includes(
    t
  );
}


// ============================================================
// ARTICLE
// ============================================================

async function parseArticle(
  source,
  candidate
) {
  try {
    const html =
      await fetchHtml(
        candidate.url
      );


    let title =
      extractTitle(
        html
      );


    let description =
      extractDescription(
        html
      );


    let image =
      extractImage(
        html
      );


    let url =
      extractCanonical(
        html,
        candidate.url
      );


    title =
      cleanText(
        title
      );


    description =
      cleanText(
        description
      );


    let date = "";
    let publishedAt = "";


    const jsonLdDate =
      extractPublishedAt(
        html
      );


    if (jsonLdDate) {
      date =
        jsonLdDate.date;

      publishedAt =
        jsonLdDate.publishedAt;
    }


    if (!date) {
      date =
        normalizeDate(
          candidate.date
        );
    }


    if (!date) {
      date =
        extractVisibleDate(
          html
        );
    }


    if (
      isFutureDate(date)
    ) {
      return {
        status: "rejected",
        reason: "future_date"
      };
    }


    if (!date) {
      return {
        status: "rejected",
        reason: "no_date"
      };
    }


    if (
      isBadArticleTitle(
        title
      )
    ) {
      return {
        status: "rejected",
        reason: "bad_title"
      };
    }


    /*
     * Главный фильтр ДОМ.РФ.
     */

    if (
      source.id === "domrf" &&
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


    if (
      source.id === "domrf" &&
      !isDomrfArticleUrl(
        url
      )
    ) {
      return {
        status: "rejected",
        reason: "bad_canonical"
      };
    }


    if (image) {
      image =
        absoluteUrl(
          image,
          url
        );
    } else {
      image = "";
    }


    return {
      status: "ok",

      item: {
        source:
          source.name,

        sourceId:
          source.id,

        category:
          source.category,

        title,

        description,

        url:
          normalizeUrl(
            url
          ),

        image,

        date,

        publishedAt:
          publishedAt ||
          `${date}T00:00:00Z`
      }
    };

  } catch {
    return {
      status: "failed"
    };
  }
}


// ============================================================
// SOURCE PROCESSING
// ============================================================

async function processSource(
  source,
  limit,
  days
) {
  let candidates = [];


  try {
    if (
      source.type === "n1"
    ) {
      candidates =
        await fetchN1List(
          source
        );
    }


    if (
      source.type === "krasdom"
    ) {
      candidates =
        await fetchKrasdomList(
          source
        );
    }


    if (
      source.type === "domclick"
    ) {
      candidates =
        await fetchDomclickList(
          source
        );
    }


    if (
      source.type === "domrf"
    ) {
      candidates =
        await fetchDomrfList(
          source
        );
    }

  } catch (error) {
    return {
      items: [],

      diagnostics: {
        id:
          source.id,

        name:
          source.name,

        count: 0,

        candidates: 0,

        recentCandidates: 0,

        rejected: 0,

        failed: 1,

        error:
          String(
            error?.message ||
            error
          )
      }
    };
  }


  const prepared =
    candidates.filter(
      candidate => {
        if (
          !candidate.date
        ) {
          return true;
        }


        if (
          isFutureDate(
            candidate.date
          )
        ) {
          return false;
        }


        return isWithinDays(
          candidate.date,
          days
        );
      }
    );


  const items = [];

  let failed = 0;
  let rejected = 0;


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
        batch.map(
          candidate =>
            parseArticle(
              source,
              candidate
            )
        )
      );


    for (
      const result of results
    ) {
      if (
        !result
      ) {
        failed++;
        continue;
      }


      if (
        result.status ===
        "failed"
      ) {
        failed++;
        continue;
      }


      if (
        result.status ===
        "rejected"
      ) {
        rejected++;
        continue;
      }


      const item =
        result.item;


      if (
        !item
      ) {
        failed++;
        continue;
      }


      if (
        isFutureDate(
          item.date
        )
      ) {
        rejected++;
        continue;
      }


      if (
        !isWithinDays(
          item.date,
          days
        )
      ) {
        rejected++;
        continue;
      }


      items.push(
        item
      );
    }


    if (
      items.length >=
      Math.max(
        limit,
        10
      )
    ) {
      break;
    }
  }


  items.sort(
    (a, b) =>
      String(
        b.date
      ).localeCompare(
        String(
          a.date
        )
      )
  );


  const finalItems =
    items.slice(
      0,
      limit
    );


  return {
    items:
      finalItems,

    diagnostics: {
      id:
        source.id,

      name:
        source.name,

      count:
        finalItems.length,

      candidates:
        candidates.length,

      recentCandidates:
        prepared.length,

      rejected,

      failed
    }
  };
}


// ============================================================
// DUPLICATES
// ============================================================

function removeDuplicates(
  items
) {
  const usedUrls =
    new Set();

  const usedTitles =
    new Set();

  const result = [];


  for (
    const item of items
  ) {
    const url =
      normalizeUrl(
        item.url
      );


    const title =
      normalizeTitle(
        item.title
      );


    if (
      url &&
      usedUrls.has(
        url
      )
    ) {
      continue;
    }


    if (
      title &&
      usedTitles.has(
        title
      )
    ) {
      continue;
    }


    if (url) {
      usedUrls.add(
        url
      );
    }


    if (title) {
      usedTitles.add(
        title
      );
    }


    result.push(
      item
    );
  }


  return result;
}


// ============================================================
// CATEGORY
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


  if (
    category ===
    "krasnodar"
  ) {
    return (
      item.category ===
      "krasnodar"
    );
  }


  if (
    category ===
    "rostov"
  ) {
    return (
      item.category ===
      "rostov"
    );
  }


  const topic =
    getTopicCategory(
      item.title
    );


  if (
    category ===
    "mortgage"
  ) {
    return (
      topic ===
      "mortgage"
    );
  }


  if (
    category ===
    "newbuildings"
  ) {
    return (
      topic ===
      "newbuildings"
    );
  }


  if (
    category ===
    "laws"
  ) {
    return (
      topic ===
      "laws"
    );
  }


  if (
    category ===
    "realty"
  ) {
    return (
      topic ===
      "realty"
    );
  }


  return true;
}


// ============================================================
// HANDLER
// ============================================================

module.exports =
  async function handler(
    req,
    res
  ) {
    try {
      const category =
        String(
          req.query?.category ||
          "all"
        ).toLowerCase();


      const limit =
        Math.min(
          Math.max(
            Number(
              req.query?.limit ||
              15
            ),
            1
          ),
          50
        );


      const days =
        Math.min(
          Math.max(
            Number(
              req.query?.days ||
              7
            ),
            1
          ),
          30
        );


      const sources =
        Object.values(
          SOURCE_CONFIG
        );


      let selectedSources =
        sources;


      if (
        category ===
        "krasnodar"
      ) {
        selectedSources =
          sources.filter(
            source =>
              source.category ===
              "krasnodar"
          );
      }


      if (
        category ===
        "rostov"
      ) {
        selectedSources =
          sources.filter(
            source =>
              source.category ===
              "rostov"
          );
      }


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

      const diagnostics =
        [];


      for (
        const result of results
      ) {
        allItems =
          allItems.concat(
            result.items
          );

        diagnostics.push(
          result.diagnostics
        );
      }


      allItems =
        allItems.filter(
          item =>
            matchesCategory(
              item,
              category
            )
        );


      allItems =
        removeDuplicates(
          allItems
        );


      allItems.sort(
        (a, b) => {
          const dateA =
            new Date(
              a.publishedAt ||
              `${a.date}T00:00:00Z`
            ).getTime();


          const dateB =
            new Date(
              b.publishedAt ||
              `${b.date}T00:00:00Z`
            ).getTime();


          return (
            dateB -
            dateA
          );
        }
      );


      allItems =
        allItems.slice(
          0,
          limit
        );


      res.setHeader(
        "Cache-Control",
        "s-maxage=300, stale-while-revalidate=600"
      );


      res.status(
        200
      ).json({
        ok: true,

        category,

        count:
          allItems.length,

        items:
          allItems,

        sources:
          diagnostics
      });


    } catch (error) {
      res.status(
        500
      ).json({
        ok: false,

        error:
          String(
            error?.message ||
            error
          )
      });
    }
  };
