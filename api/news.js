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


// =========================================================
// TEXT
// =========================================================

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
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return " ";
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}


function cleanTitle(value) {
  return cleanText(value)
    .replace(/^[⭐️🔥✅✏️📝🏠📌📢🔔🎯]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanDescription(value) {
  return cleanText(value)
    .replace(/Please open Telegram to view this post/gi, "")
    .replace(/VIEW IN TELEGRAM/gi, "")
    .replace(/\b[\d\s]+views?\b/gi, "")
    .replace(/\b[\d\s]+просмотр(?:а|ов)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}


// =========================================================
// URL
// =========================================================

function normalizeUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    u.hash = "";

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "yclid"
    ].forEach(key => {
      u.searchParams.delete(key);
    });

    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}


function absoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
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


// =========================================================
// FETCH
// =========================================================

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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/154.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",

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


// =========================================================
// META
// =========================================================

function extractMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

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
      const json = JSON.parse(
        match[1].trim()
      );

      if (Array.isArray(json)) {
        result.push(...json);
      } else if (
        json &&
        Array.isArray(json["@graph"])
      ) {
        result.push(...json["@graph"]);
      } else {
        result.push(json);
      }
    } catch {}
  }

  return result;
}


function extractArticleJsonLd(html) {
  const items = extractJsonLd(html);

  return (
    items.find(item => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const type = item["@type"];

      if (Array.isArray(type)) {
        return type.some(t =>
          /article|newsarticle|blogposting/i.test(
            String(t)
          )
        );
      }

      return /article|newsarticle|blogposting/i.test(
        String(type || "")
      );
    }) || null
  );
}


// =========================================================
// DATE
// =========================================================

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

  const match = String(url).match(
    /\/(20\d{2})\/(\d{2})\/(\d{2})\/\d+(?:\/)?(?:\?|$)/
  );

  if (!match) {
    return null;
  }

  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
      0,
      0
    )
  );
}


function isRecent(date, days) {
  if (!date) return false;

  const now = Date.now();

  const min =
    now -
    days *
      24 *
      60 *
      60 *
      1000;

  const max =
    now +
    24 *
      60 *
      60 *
      1000;

  return (
    date.getTime() >= min &&
    date.getTime() <= max
  );
}


// =========================================================
// ARTICLE DATA
// =========================================================

function extractArticleData(html, url) {
  const jsonLd =
    extractArticleJsonLd(html);

  let title =
    (jsonLd &&
      (jsonLd.headline ||
        jsonLd.name)) ||
    extractMeta(html, [
      "og:title",
      "twitter:title"
    ]);

  let description =
    (jsonLd &&
      (
        jsonLd.description ||
        jsonLd.abstract
      )) ||
    extractMeta(html, [
      "og:description",
      "description",
      "twitter:description"
    ]);

  let image = "";

  if (jsonLd) {
    if (typeof jsonLd.image === "string") {
      image = jsonLd.image;
    } else if (
      jsonLd.image &&
      typeof jsonLd.image === "object"
    ) {
      image = jsonLd.image.url || "";
    }
  }

  image =
    image ||
    extractMeta(html, [
      "og:image",
      "twitter:image"
    ]);

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
    ]);

  let date =
    parseDate(publishedAt);

  if (!date) {
    date = dateFromUrl(url);
  }

  return {
    title: cleanTitle(title),
    description: cleanDescription(description),
    image: absoluteUrl(image, url),
    publishedAt: date
      ? date.toISOString()
      : null
  };
}


// =========================================================
// TOPICS
// =========================================================

function detectTopic(
  title,
  description = ""
) {
  const text =
    `${title} ${description}`.toLowerCase();

  if (
    /ипотек|ставк|ключев|кредит|банк|семейн.*ипотек|платеж/.test(
      text
    )
  ) {
    return "mortgage";
  }

  if (
    /закон|законодатель|госдум|госуслуг|егрн|кадастров|право|документ|налог|юрид|росреестр/.test(
      text
    )
  ) {
    return "legislation";
  }

  if (
    /новостро|застройщик|девелоп|жк |жилой комплекс|строительств|долгостро/.test(
      text
    )
  ) {
    return "newbuildings";
  }

  if (
    /ростов|ростов-на-дону|аксай|ростовск/.test(
      text
    )
  ) {
    return "rostov";
  }

  if (
    /краснодар|кубан|краснодарск|сочи|адыге/.test(
      text
    )
  ) {
    return "krasnodar";
  }

  return "realty";
}


// =========================================================
// FOREIGN FILTER
// =========================================================

function isForeignContent(
  title,
  description = "",
  url = ""
) {
  const text =
    `${title} ${description} ${url}`.toLowerCase();

  const foreignPatterns = [
    "лондон",
    "англи",
    "великобритани",
    "британ",

    "сша",
    "америк",
    "нью-йорк",
    "майами",
    "калифорни",
    "флорид",

    "япони",
    "токио",
    "осак",

    "турци",
    "стамбул",
    "антали",

    "оаэ",
    "дубай",
    "абу-даби",

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

    "польш",
    "польша",

    "кита",
    "китай",
    "пекин",
    "шанхай",

    "сингапур",

    "таиланд",
    "бангкок",

    "австрали",
    "канад",
    "мексик",
    "бразили",

    "индонези",

    "коре"
  ];

  return foreignPatterns.some(
    pattern =>
      text.includes(pattern)
  );
}


// =========================================================
// LINK EXTRACTION
// =========================================================

function extractAllAnchors(
  html,
  baseUrl
) {
  const result = [];

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const url =
      absoluteUrl(
        match[1],
        baseUrl
      );

    if (!url) continue;

    result.push({
      url,
      text: cleanText(match[2])
    });
  }

  return result;
}


function extractLinks(
  html,
  baseUrl,
  sourceKey
) {
  const anchors =
    extractAllAnchors(
      html,
      baseUrl
    );

  const result = [];

  for (const anchor of anchors) {
    let url =
      stripTracking(anchor.url);

    try {
      const u = new URL(url);

      const pathname =
        u.pathname;


      // -------------------------
      // 161.RU
      // -------------------------

      if (sourceKey === "161ru") {
        if (
          !/^\/text\/realty\/20\d{2}\/\d{2}\/\d{2}\/\d+\/?$/i.test(
            pathname
          )
        ) {
          continue;
        }

        if (
          /\/comments(?:\/|$)/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // 93.RU
      // -------------------------

      if (sourceKey === "93ru") {
        if (
          !/^\/text\/realty\/20\d{2}\/\d{2}\/\d{2}\/\d+\/?$/i.test(
            pathname
          )
        ) {
          continue;
        }

        if (
          /\/comments(?:\/|$)/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // КРАСДОМ
      // -------------------------

      if (sourceKey === "krasdom") {
        if (
          !/^\/news\/\d+\/?$/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // ДОМ.РФ
      // -------------------------

      if (sourceKey === "domrf") {
        if (
          !/^\/news\/[^/?#]+/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // Яндекс
      // -------------------------

      if (sourceKey === "yandexrealty") {
        if (
          !/^\/journal\/post\/[^/]+\/?$/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // ЦИАН
      // -------------------------

      if (sourceKey === "cian") {
        if (
          !/^\/novosti-[^/]+-\d+\/?$/i.test(
            pathname
          )
        ) {
          continue;
        }
      }


      // -------------------------
      // Домклик
      // -------------------------

      if (sourceKey === "domclick") {
        if (
          !/^https?:\/\/blog\.domclick\.ru\//i.test(
            url
          )
        ) {
          continue;
        }

        if (
          /\/videos\//i.test(url)
        ) {
          continue;
        }

        if (
          !/\/post\//i.test(url)
        ) {
          continue;
        }
      }

      result.push({
        url,
        anchorText: anchor.text
      });

    } catch {}
  }


  const unique =
    new Map();

  for (const item of result) {
    const normalized =
      normalizeUrl(item.url);

    if (!normalized) continue;

    if (!unique.has(normalized)) {
      unique.set(
        normalized,
        {
          ...item,
          url: normalized
        }
      );
    }
  }

  return Array.from(
    unique.values()
  );
}


// =========================================================
// GENERIC SOURCES
// =========================================================

async function parseGenericSource(
  sourceKey,
  days
) {
  const source =
    SOURCES[sourceKey];

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const links = [];

  for (const sourceUrl of source.urls) {
    const page =
      await fetchText(
        sourceUrl
      );

    if (!page.ok) {
      stats.failed++;
      continue;
    }

    const found =
      extractLinks(
        page.text,
        page.url || sourceUrl,
        sourceKey
      );

    links.push(...found);
  }


  const unique =
    new Map();

  for (const link of links) {
    if (!unique.has(link.url)) {
      unique.set(
        link.url,
        link
      );
    }
  }

  const candidates =
    Array.from(
      unique.values()
    );

  stats.candidates =
    candidates.length;

  const items = [];


  for (const link of candidates) {
    let date =
      dateFromUrl(
        link.url
      );

    if (
      date &&
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    const article =
      await fetchText(
        link.url
      );

    if (!article.ok) {
      stats.failed++;
      continue;
    }


    const data =
      extractArticleData(
        article.text,
        article.url ||
          link.url
      );


    if (!data.title) {
      stats.rejected++;
      continue;
    }


    if (
      !date &&
      data.publishedAt
    ) {
      date =
        new Date(
          data.publishedAt
        );
    }


    if (
      !date ||
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    stats.recentCandidates++;


    items.push({
      id: makeId(
        link.url
      ),

      source: sourceKey,

      sourceName:
        source.name,

      title:
        data.title,

      description:
        data.description,

      url:
        normalizeUrl(
          link.url
        ),

      image:
        data.image || "",

      publishedAt:
        date.toISOString(),

      topic:
        detectTopic(
          data.title,
          data.description
        )
    });
  }


  return {
    items,
    stats
  };
}


// =========================================================
// YANDEX
// =========================================================

async function parseYandexRealty(
  days
) {
  const source =
    SOURCES.yandexrealty;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };

  const page =
    await fetchText(
      source.urls[0]
    );

  if (!page.ok) {
    stats.failed++;
    return {
      items: [],
      stats
    };
  }


  const links =
    extractLinks(
      page.text,
      page.url ||
        source.urls[0],
      "yandexrealty"
    );

  stats.candidates =
    links.length;


  const items = [];


  for (const link of links) {
    const article =
      await fetchText(
        link.url
      );

    if (!article.ok) {
      stats.failed++;
      continue;
    }


    const data =
      extractArticleData(
        article.text,
        article.url ||
          link.url
      );


    if (!data.title) {
      stats.rejected++;
      continue;
    }


    if (
      isForeignContent(
        data.title,
        data.description,
        link.url
      )
    ) {
      stats.rejected++;
      continue;
    }


    const date =
      data.publishedAt
        ? new Date(
            data.publishedAt
          )
        : null;


    if (
      !date ||
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    let description =
      cleanDescription(
        data.description
      )
        .replace(
          /\s*[-–—]\s*Новости\.[\s\S]*$/i,
          ""
        )
        .replace(
          /\s*в Журнале Недвижимости\.?$/i,
          ""
        )
        .trim();


    stats.recentCandidates++;


    items.push({
      id: makeId(
        link.url
      ),

      source:
        "yandexrealty",

      sourceName:
        source.name,

      title:
        cleanTitle(
          data.title
        ),

      description,

      url:
        normalizeUrl(
          link.url
        ),

      image:
        data.image || "",

      publishedAt:
        date.toISOString(),

      topic:
        detectTopic(
          data.title,
          description
        )
    });
  }


  return {
    items,
    stats
  };
}


// =========================================================
// DOMCLICK
// =========================================================

function extractDomclickUrlsFromHtml(
  html
) {
  const urls =
    new Set();

  const regex =
    /href=["'](https?:\/\/blog\.domclick\.ru\/[^"']+)["']/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    let url =
      match[1];

    url =
      url.replace(
        /[),.;!?]+$/g,
        ""
      );

    if (
      /\/videos\//i.test(
        url
      )
    ) {
      continue;
    }

    if (
      !/\/post\//i.test(
        url
      )
    ) {
      continue;
    }

    urls.add(
      normalizeUrl(url)
    );
  }

  return Array.from(
    urls
  );
}


function extractTelegramPostBlocks(
  html
) {
  const blocks = [];

  const regex =
    /<div[^>]+class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*tgme_widget_message_wrap|<\/main>|<\/body>)/gi;

  let match;

  while (
    (match = regex.exec(html))
  ) {
    blocks.push(
      match[1]
    );
  }

  return blocks;
}


function extractTelegramDate(
  block
) {
  const match =
    block.match(
      /datetime=["']([^"']+)["']/i
    );

  return match
    ? parseDate(match[1])
    : null;
}


function extractTelegramText(
  block
) {
  const match =
    block.match(
      /class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );

  return match
    ? cleanText(match[1])
    : "";
}


function extractTelegramImage(
  block
) {
  const patterns = [
    /background-image:url\(["']?([^"')]+)["']?\)/i,
    /background-image:\s*url\(([^)]+)\)/i
  ];

  for (
    const regex of patterns
  ) {
    const match =
      block.match(regex);

    if (
      match &&
      match[1]
    ) {
      return match[1]
        .replace(
          /^["']|["']$/g,
          ""
        )
        .trim();
    }
  }

  return "";
}


async function parseDomclick(
  days
) {
  const source =
    SOURCES.domclick;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0,
    attempts: []
  };


  // -------------------------------------------------------
  // Прямой блог
  // -------------------------------------------------------

  const direct =
    await fetchText(
      source.urls[0]
    );

  stats.attempts.push({
    url: source.urls[0],
    status: direct.status,
    ok: direct.ok
  });


  const links =
    new Map();


  if (direct.ok) {
    const directUrls =
      extractDomclickUrlsFromHtml(
        direct.text
      );

    for (
      const url of directUrls
    ) {
      links.set(
        url,
        {
          url,
          telegramDate: null,
          telegramText: "",
          telegramImage: ""
        }
      );
    }
  }


  // -------------------------------------------------------
  // Telegram
  // -------------------------------------------------------

  if (!links.size) {
    const telegram =
      await fetchText(
        source.telegramUrl
      );

    stats.attempts.push({
      url: source.telegramUrl,
      status: telegram.status,
      ok: telegram.ok
    });


    if (telegram.ok) {
      const blocks =
        extractTelegramPostBlocks(
          telegram.text
        );


      for (
        const block of blocks
      ) {
        const date =
          extractTelegramDate(
            block
          );


        if (
          !date ||
          !isRecent(
            date,
            days
          )
        ) {
          continue;
        }


        const text =
          extractTelegramText(
            block
          );


        const image =
          extractTelegramImage(
            block
          );


        /*
         * ВАЖНО:
         * ссылка Домклика обычно находится
         * не в тексте, а в href HTML.
         */
        const urls =
          extractDomclickUrlsFromHtml(
            block
          );


        for (
          const url of urls
        ) {
          if (
            !links.has(url)
          ) {
            links.set(
              url,
              {
                url,
                telegramDate:
                  date,
                telegramText:
                  text,
                telegramImage:
                  image
              }
            );
          }
        }
      }
    }
  }


  stats.candidates =
    links.size;


  const items = [];


  for (
    const link of links.values()
  ) {
    let title = "";
    let description = "";
    let image =
      link.telegramImage || "";

    let date =
      link.telegramDate || null;


    /*
     * Сначала всегда пытаемся
     * получить настоящий материал Домклика.
     */
    const article =
      await fetchText(
        link.url
      );


    if (article.ok) {
      const data =
        extractArticleData(
          article.text,
          article.url ||
            link.url
        );


      title =
        data.title;

      description =
        data.description;


      if (
        data.image
      ) {
        image =
          data.image;
      }


      if (
        data.publishedAt
      ) {
        date =
          new Date(
            data.publishedAt
          );
      }
    }


    /*
     * Если статья недоступна,
     * используем Telegram только
     * как резервный источник.
     */
    if (
      !title &&
      link.telegramText
    ) {
      const text =
        cleanText(
          link.telegramText
        )
          .replace(
            /➡️\s*Читать новость.*$/i,
            ""
          )
          .replace(
            /➡️\s*Узнать.*$/i,
            ""
          )
          .trim();


      /*
       * Сначала пытаемся отделить
       * заголовок от первого предложения.
       */
      const lines =
        text
          .split(/\n+/)
          .map(x => x.trim())
          .filter(Boolean);


      if (
        lines.length > 1
      ) {
        title =
          lines[0];

        description =
          lines
            .slice(1)
            .join(" ");
      } else {
        const match =
          text.match(
            /^(.{10,180}?[.!?])\s+(.+)$/u
          );

        if (match) {
          title =
            match[1];

          description =
            match[2];
        } else {
          title =
            text.slice(
              0,
              180
            );

          description =
            text.slice(
              180
            );
        }
      }
    }


    if (!title) {
      stats.rejected++;
      continue;
    }


    if (
      !date ||
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    title =
      cleanTitle(
        title
      )
        .replace(
          /\s*➡️.*$/u,
          ""
        )
        .trim();


    description =
      cleanDescription(
        description
      )
        .replace(
          /\s*➡️.*$/u,
          ""
        )
        .trim();


    stats.recentCandidates++;


    items.push({
      id: makeId(
        link.url
      ),

      source:
        "domclick",

      sourceName:
        source.name,

      title,

      description,

      url:
        normalizeUrl(
          link.url
        ),

      image,

      publishedAt:
        date.toISOString(),

      topic:
        detectTopic(
          title,
          description
        )
    });
  }


  return {
    items,
    stats
  };
}


// =========================================================
// DOMRF
// =========================================================

async function parseDomrf(
  days
) {
  const source =
    SOURCES.domrf;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };


  const page =
    await fetchText(
      source.urls[0]
    );


  if (!page.ok) {
    stats.failed++;
    return {
      items: [],
      stats
    };
  }


  const links =
    extractLinks(
      page.text,
      page.url ||
        source.urls[0],
      "domrf"
    );


  stats.candidates =
    links.length;


  const items = [];


  for (
    const link of links
  ) {
    const article =
      await fetchText(
        link.url
      );


    if (!article.ok) {
      stats.failed++;
      continue;
    }


    const data =
      extractArticleData(
        article.text,
        article.url ||
          link.url
      );


    if (!data.title) {
      stats.rejected++;
      continue;
    }


    let date =
      data.publishedAt
        ? new Date(
            data.publishedAt
          )
        : null;


    /*
     * Дополнительный поиск даты
     * для ДОМ.РФ.
     */
    if (!date) {
      const datePatterns = [
        /"datePublished"\s*:\s*"([^"]+)"/i,
        /"publishedAt"\s*:\s*"([^"]+)"/i,
        /"date"\s*:\s*"([^"]+)"/i,
        /datetime=["']([^"']+)["']/i
      ];


      for (
        const regex of datePatterns
      ) {
        const match =
          article.text.match(
            regex
          );

        if (
          match &&
          parseDate(match[1])
        ) {
          date =
            parseDate(
              match[1]
            );

          break;
        }
      }
    }


    if (
      !date ||
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    stats.recentCandidates++;


    items.push({
      id: makeId(
        link.url
      ),

      source:
        "domrf",

      sourceName:
        source.name,

      title:
        data.title,

      description:
        data.description,

      url:
        normalizeUrl(
          link.url
        ),

      image:
        data.image || "",

      publishedAt:
        date.toISOString(),

      topic:
        detectTopic(
          data.title,
          data.description
        )
    });
  }


  return {
    items,
    stats
  };
}


// =========================================================
// CIAN
// =========================================================

function extractXmlTag(
  xml,
  tag
) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    xml.match(regex);

  return match
    ? cleanText(match[1])
    : "";
}


function extractXmlItems(
  xml
) {
  const items = [];

  const regex =
    /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match;

  while (
    (match = regex.exec(xml))
  ) {
    const block =
      match[1];


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
        "date"
      );


    let image = "";


    const enclosure =
      block.match(
        /<enclosure[^>]+url=["']([^"']+)["']/i
      );


    if (
      enclosure
    ) {
      image =
        enclosure[1];
    }


    const media =
      block.match(
        /<media:content[^>]+url=["']([^"']+)["']/i
      );


    if (
      !image &&
      media
    ) {
      image =
        media[1];
    }


    if (
      title &&
      link
    ) {
      items.push({
        title,
        link,
        description,
        pubDate,
        image
      });
    }
  }


  return items;
}


async function findCianRssUrl(
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
      );


    if (
      /rss/i.test(href) ||
      /rss/i.test(text)
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


  const candidates = [
    "https://www.cian.ru/rss/",
    "https://www.cian.ru/rss/novosti/",
    "https://krasnodar.cian.ru/rss/"
  ];


  for (
    const url of candidates
  ) {
    const response =
      await fetchText(
        url
      );

    if (
      response.ok &&
      /<item[\s>]/i.test(
        response.text
      )
    ) {
      return (
        response.url ||
        url
      );
    }
  }


  return "";
}


async function parseCian(
  days
) {
  const source =
    SOURCES.cian;

  const stats = {
    name: source.name,
    category: source.category,
    candidates: 0,
    recentCandidates: 0,
    rejected: 0,
    failed: 0
  };


  const page =
    await fetchText(
      source.urls[0]
    );


  if (!page.ok) {
    stats.failed++;
    return {
      items: [],
      stats
    };
  }


  const rssUrl =
    await findCianRssUrl(
      page.text,
      page.url ||
        source.urls[0]
    );


  let rssItems = [];


  if (rssUrl) {
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


    if (rss.ok) {
      rssItems =
        extractXmlItems(
          rss.text
        );
    }
  }


  if (
    !rssItems.length
  ) {
    const links =
      extractLinks(
        page.text,
        page.url ||
          source.urls[0],
        "cian"
      );


    rssItems =
      links.map(
        item => ({
          title:
            item.anchorText,

          link:
            item.url,

          description:
            "",

          pubDate:
            null,

          image:
            ""
        })
      );
  }


  const unique =
    new Map();


  for (
    const item of rssItems
  ) {
    const url =
      normalizeUrl(
        item.link
      );


    if (!url) {
      continue;
    }


    if (
      !/^https?:\/\/(?:www\.)?cian\.ru\/novosti-/i.test(
        url
      )
    ) {
      continue;
    }


    if (
      !unique.has(url)
    ) {
      unique.set(
        url,
        {
          ...item,
          link: url
        }
      );
    }
  }


  stats.candidates =
    unique.size;


  const items = [];


  for (
    const item of unique.values()
  ) {
    let date =
      parseDate(
        item.pubDate
      );


    if (
      date &&
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    const article =
      await fetchText(
        item.link
      );


    if (!article.ok) {
      stats.failed++;
      continue;
    }


    const data =
      extractArticleData(
        article.text,
        article.url ||
          item.link
      );


    const title =
      data.title ||
      cleanTitle(
        item.title
      );


    const description =
      data.description ||
      cleanDescription(
        item.description
      );


    if (!title) {
      stats.rejected++;
      continue;
    }


    /*
     * ЦИАН также имеет материалы
     * про зарубежную недвижимость.
     * Их не показываем.
     */
    if (
      isForeignContent(
        title,
        description,
        item.link
      )
    ) {
      stats.rejected++;
      continue;
    }


    if (
      !date &&
      data.publishedAt
    ) {
      date =
        new Date(
          data.publishedAt
        );
    }


    if (
      !date ||
      !isRecent(
        date,
        days
      )
    ) {
      stats.rejected++;
      continue;
    }


    stats.recentCandidates++;


    items.push({
      id: makeId(
        item.link
      ),

      source:
        "cian",

      sourceName:
        source.name,

      title,

      description,

      url:
        normalizeUrl(
          item.link
        ),

      image:
        data.image ||
        absoluteUrl(
          item.image,
          item.link
        ) ||
        "",

      publishedAt:
        date.toISOString(),

      topic:
        detectTopic(
          title,
          description
        )
    });
  }


  return {
    items,
    stats
  };
}


// =========================================================
// DEDUPE
// =========================================================

function dedupeItems(
  items
) {
  const map =
    new Map();


  for (
    const item of items
  ) {
    const key =
      normalizeUrl(
        item.url
      ) ||
      `${item.source}:${item.title.toLowerCase()}`;


    if (
      !map.has(key)
    ) {
      map.set(
        key,
        item
      );
    }
  }


  return Array.from(
    map.values()
  );
}


// =========================================================
// BALANCE
// =========================================================

function balanceItems(
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
    const list of groups.values()
  ) {
    list.sort(
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


  while (
    result.length < limit
  ) {
    let added =
      false;


    for (
      const list of groups.values()
    ) {
      if (
        !list.length
      ) {
        continue;
      }


      result.push(
        list.shift()
      );

      added =
        true;


      if (
        result.length >= limit
      ) {
        break;
      }
    }


    if (!added) {
      break;
    }
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


// =========================================================
// API
// =========================================================

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
      "GET,OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );


    if (
      req.method === "OPTIONS"
    ) {
      return res
        .status(204)
        .end();
    }


    const requestedLimit =
      Number(
        req.query.limit
      ) ||
      DEFAULT_LIMIT;


    const limit =
      Math.min(
        Math.max(
          requestedLimit,
          1
        ),
        MAX_LIMIT
      );


    const days =
      Math.min(
        Math.max(
          Number(
            req.query.days
          ) ||
            DEFAULT_DAYS,
          1
        ),
        30
      );


    const category =
      String(
        req.query.category ||
          "all"
      ).toLowerCase();


    const parsers = [
      [
        "161ru",
        () =>
          parseGenericSource(
            "161ru",
            days
          )
      ],

      [
        "93ru",
        () =>
          parseGenericSource(
            "93ru",
            days
          )
      ],

      [
        "krasdom",
        () =>
          parseGenericSource(
            "krasdom",
            days
          )
      ],

      [
        "domrf",
        () =>
          parseDomrf(
            days
          )
      ],

      [
        "domclick",
        () =>
          parseDomclick(
            days
          )
      ],

      [
        "yandexrealty",
        () =>
          parseYandexRealty(
            days
          )
      ],

      [
        "cian",
        () =>
          parseCian(
            days
          )
      ]
    ];


    const results =
      await Promise.all(
        parsers.map(
          async (
            [key, parser]
          ) => {
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
                  name:
                    SOURCES[key]
                      .name,

                  category:
                    SOURCES[key]
                      .category,

                  candidates: 0,

                  recentCandidates: 0,

                  rejected: 0,

                  failed: 1,

                  error:
                    error.message
                }
              };
            }
          }
        )
      );


    const allItems = [];

    const sources = {};


    for (
      const result of results
    ) {
      sources[
        result.key
      ] =
        result.stats;


      for (
        const item of result.items
      ) {
        allItems.push(
          item
        );
      }
    }


    let items =
      dedupeItems(
        allItems
      );


    // -----------------------------------------
    // Category filter
    // -----------------------------------------

    if (
      category &&
      category !== "all"
    ) {
      items =
        items.filter(
          item =>
            item.topic ===
              category ||
            item.source ===
              category
        );
    }


    // -----------------------------------------
    // Balance sources
    // -----------------------------------------

    items =
      balanceItems(
        items,
        limit
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
        count:
          items.length,
        items,
        sources
      });
  };
