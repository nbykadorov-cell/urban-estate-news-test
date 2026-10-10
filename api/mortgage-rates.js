// Urban Estate — standard market mortgage rates for new-build apartments.
// Fetches the official bank pages, extracts advertised rates and falls back to
// the last manually verified official-page snapshot if a source is unavailable.

const BANKS = [
  {
    id: "sberbank", name: "Сбербанк", shortName: "Сбербанк",
    url: "https://domclick.ru/ipoteka",
    fallbackRate: 15.2,
    conditions: "Минимальная ставка программы «Новостройка»; условия зависят от объекта и параметров кредита.",
    patterns: [/ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /процентная ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "vtb", name: "ВТБ", shortName: "ВТБ",
    url: "https://www.vtb.ru/personal/ipoteka/novostrojki/",
    fallbackRate: 18.0,
    conditions: "На странице программы для новостроек; персональные скидки могут изменить ставку.",
    patterns: [/ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /процентная ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "alfa", name: "Альфа-Банк", shortName: "Альфа-Банк",
    url: "https://alfabank.ru/get-money/mortgage/novostrojki/",
    fallbackRate: 17.59,
    conditions: "От 17,59% при сумме кредита от 10 млн ₽ и первоначальном взносе от 50%.",
    patterns: [/от\s*(\d{1,2}[,.]\d{1,3})\s*%\s*при сумме кредита/gi, /ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "sovcom", name: "Совкомбанк", shortName: "Совкомбанк",
    url: "https://sovcombank.ru/apply/ipoteka/ipoteka-s-nizkim-procentom/",
    fallbackRate: 18.49,
    conditions: "Рыночная ипотека на новостройку; льготные программы в сравнение не включены.",
    patterns: [/новостройка[\s\S]{0,220}?ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "domrf", name: "Банк ДОМ.РФ", shortName: "ДОМ.РФ",
    url: "https://domrfbank.ru/press/private-clients/ipoteka-ot-16-6-bank-dom-rf-vvel-skidku-po-kreditam-ot-8-mln-rubley/",
    fallbackRate: 16.6,
    conditions: "От 16,6% для зарплатных клиентов при взносе от 50% и крупной сумме кредита; для остальных — от 16,8%.",
    patterns: [/минимальная ставка[\s\S]{0,180}?от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /ставка[\s\S]{0,90}?от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "tbank", name: "Т-Банк", shortName: "Т-Банк",
    url: "https://www.tbank.ru/mortgage/",
    fallbackRate: 16.9,
    conditions: "Стандартная программа на новостройки; семейные и другие льготные программы исключены.",
    patterns: [/ипотека на новостройки[\s\S]{0,220}?ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "uralsib", name: "Уралсиб", shortName: "Уралсиб",
    url: "https://uralsib.ru/blog/bank-uralsib-snizil-stavki-po-ipoteke_25",
    fallbackRate: 17.89,
    conditions: "Рыночная ипотека на строящееся или готовое жильё; ставка зависит от условий банка.",
    patterns: [/по ставке\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "metallinvest", name: "Металлинвестбанк", shortName: "Металлинвестбанк",
    url: "https://www.metallinvestbank.ru/private/mortgage/flats/",
    fallbackRate: 17.4,
    conditions: "Ипотека на квартиру или апартаменты; размер ставки зависит от условий кредитования.",
    patterns: [/процентная ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  },
  {
    id: "kuban", name: "Кубань Кредит", shortName: "Кубань Кредит",
    url: "https://kk.ru/mortgage/novostroyka-ot-partnyerov/",
    fallbackRate: 15.0,
    conditions: "От 15% при покупке объекта у застройщика-партнёра банка; для других объектов ставка выше.",
    patterns: [/при приобретении объектов застройщиков-партнеров[\s\S]{0,300}?от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi, /процентная ставка\s*от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%/gi]
  }
];

function decodeText(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&comma;/gi, ",")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return ""; } })
    .replace(/\s+/g, " ")
    .trim();
}

function parseRate(html, bank) {
  const text = decodeText(html);
  const found = [];
  const patterns = bank.patterns.concat([
    // Some bank pages render the value before its label, e.g. "От 18,0% Ставка".
    /от\s*(\d{1,2}(?:[,.]\d{1,3})?)\s*%\s*(?:годовых\s*)?(?:процентная\s+)?ставка/gi
  ]);
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = Number(String(match[1]).replace(",", "."));
      // Exclude subsidized programs (family, IT, etc.) and implausible values.
      if (Number.isFinite(value) && value >= 10 && value <= 35) found.push(value);
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
    }
  }
  if (!found.length) return null;
  // The widget compares the lowest advertised market rate found on the source page.
  return Math.min(...found);
}

function formatRate(rate) {
  return Number(rate).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).replace(/\u00a0/g, " ");
}

async function fetchBank(bank) {
  try {
    const response = await fetch(bank.url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UrbanEstateRates/1.0; +https://urban-estate-news-test.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7"
      },
      signal: AbortSignal.timeout(6500)
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    const rate = parseRate(html, bank);
    if (rate === null) throw new Error("Не удалось надёжно извлечь ставку со страницы");
    return {
      id: bank.id, name: bank.name, rate: formatRate(rate), rateValue: rate,
      url: bank.url, conditions: bank.conditions, live: true, verifiedOn: new Date().toISOString()
    };
  } catch (error) {
    return {
      id: bank.id, name: bank.name, rate: formatRate(bank.fallbackRate), rateValue: bank.fallbackRate,
      url: bank.url, conditions: bank.conditions, live: false,
      verifiedOn: "2026-10-10", error: "Источник временно недоступен; показано последнее подтверждённое значение"
    };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const results = await Promise.all(BANKS.map(fetchBank));
  const liveCount = results.filter(item => item.live).length;
  return res.status(200).json({
    ok: true,
    product: "standard-new-build-mortgage",
    checkedAt: new Date().toISOString(),
    liveCount,
    totalCount: results.length,
    banks: results
  });
};

module.exports.BANKS = BANKS;
module.exports.parseRate = parseRate;
module.exports.decodeText = decodeText;
