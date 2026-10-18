const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const PREFIX = "urban-estate:max:message:";
const INDEX = "urban-estate:max:message-ids";

const GROUPS = {
  "-72201455059710": { city: "Краснодар", category: "МКД" },
  "-72201528984318": { city: "Краснодар", category: "ИЖС" },
  "-77585146495742": { city: "Краснодар", category: "Побережье" },
  "-71978515874558": { city: "Ростов", category: "МКД" },
  "-78729160737534": { city: "Ростов", category: "ИЖС" },
  "-72201477210878": { city: "Крым", category: "МКД" },
  "-77585125589758": { city: "Новороссия", category: "МКД" }
};

async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Не заданы переменные Redis");
  const path = [command, ...args].map(x => encodeURIComponent(String(x))).join("/");
  const response = await fetch(`${REDIS_URL.replace(/\/$/, "")}/${path}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `Redis HTTP ${response.status}`);
  return data.result;
}

function clean(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/^[\s•·▪▫◦🌐🟣🗂♟📱📞☎️📲]+/u, "")
    .trim();
}

function isSeparator(line) {
  return /^\s*[—–−-]{3,}\s*$/.test(String(line || ""));
}

/*
 * MAX returns formatted hyperlinks in body.markup as:
 * { type: "link", from: 0, length: 12, url: "https://..." }
 * The visible label is a slice of body.text, not a property on the markup item.
 * This parser keeps line offsets so a hidden URL is assigned to the correct section.
 */
function getLinesWithSections(text) {
  const rawLines = String(text || "").split(/\r?\n/);
  const lines = [];
  let offset = 0;
  let section = 0;

  for (const raw of rawLines) {
    const line = {
      text: raw,
      trimmed: raw.trim(),
      start: offset,
      end: offset + raw.length,
      section,
      separator: isSeparator(raw)
    };
    lines.push(line);
    offset += raw.length + 1;
    if (line.separator) section++;
  }
  return lines;
}

function getMarkupLinks(publication, text, lines) {
  const markup = Array.isArray(publication.markup) ? publication.markup : [];
  const result = [];

  for (const item of markup) {
    if (!item || String(item.type || "").toLowerCase() !== "link") continue;
    const url = item.url || item.href || item.payload?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;

    const from = Number(item.from);
    const length = Number(item.length);
    let title = "";
    let lineIndex = -1;
    let section = -1;

    if (Number.isFinite(from) && Number.isFinite(length) && length > 0 && from >= 0) {
      // JS string indexes are UTF-16 offsets, matching MAX's text markup offsets.
      title = text.slice(from, from + length).trim();
      lineIndex = lines.findIndex(line => from >= line.start && from <= line.end);
      if (lineIndex >= 0) section = lines[lineIndex].section;
    }

    result.push({ url, title: clean(title), from: Number.isFinite(from) ? from : Number.MAX_SAFE_INTEGER, length, lineIndex, section });
  }

  return result.sort((a, b) => a.from - b.from);
}

function getPlainTextLinks(text, lines) {
  const result = [];
  const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
  let match;
  while ((match = urlRe.exec(text)) !== null) {
    const url = match[0].replace(/[.,!?;:]+$/, "");
    if (!url) continue;
    const from = match.index;
    const lineIndex = lines.findIndex(line => from >= line.start && from <= line.end);
    result.push({
      url,
      title: "",
      from,
      length: match[0].length,
      lineIndex,
      section: lineIndex >= 0 ? lines[lineIndex].section : -1
    });
  }
  return result;
}

function allLinks(publication, text, lines) {
  const markupLinks = getMarkupLinks(publication, text, lines);
  const links = [...markupLinks];
  const seen = new Set(markupLinks.map(x => `${x.from}:${x.url}`));

  for (const item of [...(publication.links || []), ...(publication.cards || [])]) {
    if (!item || !/^https?:\/\//i.test(String(item.url || ""))) continue;
    const url = String(item.url);
    if (links.some(x => x.url === url)) continue;
    const plain = getPlainTextLinks(url, lines)[0];
    const lineIndex = plain?.lineIndex ?? -1;
    links.push({
      url,
      title: clean(item.title || ""),
      from: Number.isFinite(Number(item.from)) ? Number(item.from) : Number.MAX_SAFE_INTEGER,
      length: 0,
      lineIndex,
      section: lineIndex >= 0 ? lines[lineIndex].section : -1
    });
  }

  for (const link of getPlainTextLinks(text, lines)) {
    const key = `${link.from}:${link.url}`;
    if (!seen.has(key) && !links.some(x => x.url === link.url && x.from === link.from)) links.push(link);
  }

  return links.sort((a, b) => a.from - b.from);
}

function linksBySection(sectionNumber, lines, links) {
  const sectionLines = lines.filter(line => !line.separator && line.section === sectionNumber);
  const selected = links.filter(link => {
    if (link.section >= 0) return link.section === sectionNumber;
    // Fallback for stored link cards that don't contain source offsets: match the visible label.
    if (!link.title) return false;
    return sectionLines.some(line => line.trimmed.toLocaleLowerCase("ru").includes(link.title.toLocaleLowerCase("ru")));
  });

  const used = new Set();
  const result = [];
  for (const link of selected) {
    const uniqueKey = `${link.from}:${link.url}`;
    if (used.has(uniqueKey)) continue;
    used.add(uniqueKey);

    let title = clean(link.title);
    if (!title && link.lineIndex >= 0) {
      const line = lines[link.lineIndex];
      title = clean(line?.trimmed || "");
    }
    // Если URL был напечатан непосредственно в строке, убираем его из подписи.
    title = clean(title.replace(link.url, ""));
    if (!title) title = "Открыть ссылку";
    result.push({ title, url: link.url });
  }

  return result;
}

function contactsFrom(lines) {
  const contactLines = lines
    .filter(line => !line.separator && line.section === 2)
    .map(line => line.trimmed)
    .filter(Boolean);

  const result = [];
  const phoneRe = /\+?\d[\d\s().-]{7,}\d/;

  let pendingPhones = [];

  function flush(name = "") {
    if (!pendingPhones.length) return;

    result.push({
      name: clean(name) || "Менеджер",
      phones: [...pendingPhones]
    });

    pendingPhones = [];
  }

  for (const rawLine of contactLines) {
    const line = clean(rawLine);
    const match = line.match(phoneRe);

    if (match) {
      const phone = match[0].replace(/[^\d+]/g, "");
      const remainder = clean(line.replace(match[0], ""));

      pendingPhones.push(phone);

      // Если имя написано в той же строке, сразу завершаем контакт.
      if (remainder) flush(remainder);

      continue;
    }

    // Строка без телефона после нескольких номеров — имя менеджера.
    if (pendingPhones.length) {
      flush(line);
    }
  }

  flush();

  return result;
}

function imageUrl(attachments) {
  const found = [];
  const visited = new Set();
  function walk(value, parentKey = "") {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) return value.forEach(item => walk(item, parentKey));
    const type = String(value.type || "").toLowerCase();
    const imageLike = /image|photo|picture/.test(type) || /image|photo|preview|thumbnail/i.test(parentKey);
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && /^https?:\/\//i.test(child) && (imageLike || /url|src/i.test(key))) {
        found.push({ url: child, priority: imageLike ? 2 : 1 });
      } else if (child && typeof child === "object") walk(child, key);
    }
  }
  walk(attachments);
  found.sort((a, b) => b.priority - a.priority);
  return found[0]?.url || "";
}

function parse(publication) {
  const chatId = String(publication.chatId || "");
  const meta = GROUPS[chatId];
  if (!meta) return null;

  const text = String(publication.text || "");
  const lines = getLinesWithSections(text);
  const firstContentLine = lines.find(line => !line.separator && line.section === 0 && line.trimmed);
  const name = clean(firstContentLine?.trimmed || "")
    .replace(/\s*[–—-]\s*название застройщика\s*$/i, "")
    .replace(/^название застройщика\s*[:—-]?\s*/i, "")
    .trim();
  if (!name) return null;

  const links = allLinks(publication, text, lines);
  const firstLineIndex = lines.indexOf(firstContentLine);
  const linkedLineIndexes = new Set(
    links
      .filter(link => link.lineIndex >= 0)
      .map(link => link.lineIndex)
  );
  
  const descriptionLine = lines.find((line, index) =>
    index > firstLineIndex &&
    line.section === 0 &&
    !line.separator &&
    line.trimmed &&
    !linkedLineIndexes.has(index) &&
    !/^https?:\/\//i.test(line.trimmed)
  );
  
  const comment = lines
    .filter(line => line.section >= 3 && !line.separator)
    .map(line => line.trimmed)
    .filter(Boolean)
    .join("\n");
  return {
    id: String(publication.messageId || ""),
    name,
    city: meta.city,
    category: meta.category,
    chatId,
    groups: linksBySection(0, lines, links).filter(link => {
      // В первой секции первая строка — название застройщика, не ссылка.
      return Boolean(link.url);
    }).filter(link => {
      const linkObj = links.find(x => x.url === link.url && x.section === 0);
      return linkObj && (linkObj.lineIndex !== lines.indexOf(firstContentLine));
    }),
    resources: linksBySection(1, lines, links),
    contacts: contactsFrom(lines),
    image: imageUrl(publication.attachments || []),
    updatedAt: Number(publication.updatedAt || 0)
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }

  try {
    const ids = await redis("SMEMBERS", INDEX) || [];
    const list = [];
    for (const id of ids) {
      const raw = await redis("GET", `${PREFIX}${id}`);
      if (!raw) continue;
      try {
        const publication = typeof raw === "string" ? JSON.parse(raw) : raw;
        const developer = parse(publication);
        if (developer) list.push(developer);
      } catch (error) {
        console.error("Invalid MAX publication:", id, error?.message);
      }
    }

    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const unique = new Map();
    for (const developer of list) {
      const key = `${developer.chatId}:${developer.name.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim()}`;
      if (!unique.has(key)) unique.set(key, developer);
    }
    const developers = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({
      ok: true,
      count: developers.length,
      cities: ["Краснодар", "Ростов", "Крым", "Новороссия"],
      categoriesByCity: {
        "Краснодар": ["МКД", "ИЖС", "Побережье"],
        "Ростов": ["МКД", "ИЖС"],
        "Крым": ["МКД"],
        "Новороссия": ["МКД"]
      },
      developers
    }));
  } catch (error) {
    console.error("Developers API error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "Failed to load developers" }));
  }
};
