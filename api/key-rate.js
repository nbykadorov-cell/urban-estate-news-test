// api/key-rate.js
// Serverless endpoint for the Urban Estate key-rate widget.
// Fetches the current key rate directly from the official Bank of Russia page.

const CBR_URL = "https://www.cbr.ru/hd_base/KeyRate/";

function stripHtml(value) {
    return String(value || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&comma;/gi, ",")
        .replace(/&amp;/gi, "&")
        .replace(/&#(\d+);/g, (_, code) => {
            try { return String.fromCodePoint(Number(code)); } catch (e) { return ""; }
        })
        .replace(/\s+/g, " ")
        .trim();
}

function parseKeyRate(html) {
    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    for (const row of rows) {
        const cells = row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        if (cells.length < 2) continue;

        const values = cells.map(cell => stripHtml(cell));
        const dateIndex = values.findIndex(value => /^\d{2}\.\d{2}\.\d{4}$/.test(value));
        if (dateIndex < 0) continue;

        // On the official key-rate page, the rate is the next table cell after the date.
        const rateText = values[dateIndex + 1] || "";
        const rateMatch = rateText.match(/^(\d{1,2}(?:[,.]\d{1,2})?)$/);
        if (!rateMatch) continue;

        return {
            date: values[dateIndex],
            rate: rateMatch[1].replace(".", ",")
        };
    }

    return null;
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

    try {
        const response = await fetch(CBR_URL, {
            method: "GET",
            headers: {
                "User-Agent": "UrbanEstatePortal/1.0 (key rate widget)",
                "Accept": "text/html,application/xhtml+xml"
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) throw new Error("Банк России вернул HTTP " + response.status);

        const html = await response.text();
        const parsed = parseKeyRate(html);
        if (!parsed) throw new Error("Не удалось найти таблицу ключевой ставки на странице Банка России");

        return res.status(200).json({
            ok: true,
            rate: parsed.rate,
            date: parsed.date,
            source: CBR_URL,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Key rate endpoint error:", error);
        return res.status(502).json({
            ok: false,
            error: "Не удалось получить ключевую ставку с сайта Банка России"
        });
    }
};

module.exports.parseKeyRate = parseKeyRate;
