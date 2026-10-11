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

const clean = s => String(s || "").replace(/^[\s•·▪▫◦🌐🟣🗂♟📱📞☎️📲]+/u, "").trim();
function splitSections(text) {
  const out = [[]];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (/^\s*[—–−-]{3,}\s*$/.test(line)) { if (out.length < 3) out.push([]); }
    else out[out.length - 1].push(line.trim());
  }
  while (out.length < 3) out.push([]);
  return out.slice(0, 3).map(a => a.filter(Boolean));
}
function allLinks(p) {
  const map = new Map();
  for (const x of [...(p.links || []), ...(p.cards || [])]) {
    if (x && /^https?:\/\//i.test(String(x.url || ""))) {
      const old = map.get(x.url) || {};
      map.set(x.url, { url: x.url, title: String(x.title || old.title || "") });
    }
  }
  for (const x of (p.markup || [])) {
    const url = x?.url || x?.href || x?.payload?.url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      map.set(url, { url, title: String(x.text || x.value || x.payload?.text || map.get(url)?.title || "") });
    }
  }
  for (const raw of (String(p.text || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [])) {
    const url = raw.replace(/[.,!?;:]+$/, "");
    if (url && !map.has(url)) map.set(url, { url, title: "" });
  }
  return [...map.values()];
}
function sectionLinks(lines, links) {
  const used = new Set(), result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matches = (line.match(/https?:\/\/[^\s<>"')\]]+/gi) || [])
      .map(raw => raw.replace(/[.,!?;:]+$/, ""))
      .map(url => links.find(x => x.url === url) || { url, title: "" });
    if (!matches.length) {
      const x = links.find(x => x.title && line.toLowerCase().includes(x.title.toLowerCase()) && !used.has(x.url));
      if (x) matches = [x];
    }
    for (const x of matches) {
      if (!x.url || used.has(x.url)) continue;
      used.add(x.url);
      let title = clean(line.replace(x.url, ""));
      if (!title || title === line) title = clean(x.title);
      if (!title && i > 0) title = clean(lines[i - 1]);
      result.push({ title: title || "Открыть ссылку", url: x.url });
    }
  }
  return result;
}
function contactsFrom(lines) {
  const result = [], phoneRe = /(\+?\d[\d\s().-]{7,}\d)/;
  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]), m = line.match(phoneRe);
    if (!m) continue;
    const phone = m[1].replace(/[^\d+]/g, "");
    let name = clean(line.replace(m[1], ""));
    if (!name && i + 1 < lines.length && !phoneRe.test(lines[i + 1]) && !/^https?:\/\//i.test(lines[i + 1])) name = clean(lines[++i]);
    result.push({ name: name || "Менеджер", phone });
  }
  return result;
}
function imageUrl(attachments) {
  const found = [];
  function walk(x, parentKey = "") {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(y => walk(y, parentKey));
    const type = String(x.type || "").toLowerCase();
    const imageLike = /image|photo|picture/.test(type) || /image|photo|preview|thumbnail/i.test(parentKey);
    for (const [key, val] of Object.entries(x)) {
      if (typeof val === "string" && /^https?:\/\//i.test(val) && (imageLike || /url|src/i.test(key))) found.push({ url: val, priority: imageLike ? 2 : 1 });
      else if (val && typeof val === "object") walk(val, key);
    }
  }
  walk(attachments);
  found.sort((a, b) => b.priority - a.priority);
  return found[0]?.url || "";
}
function parse(p) {
  const chatId = String(p.chatId || ""), meta = GROUPS[chatId];
  if (!meta) return null;
  const parts = splitSections(p.text || "");
  const name = clean(parts[0][0] || "")
    .replace(/\s*[–—-]\s*название застройщика\s*$/i, "")
    .replace(/^название застройщика\s*[:—-]?\s*/i, "").trim();
  if (!name) return null;
  const links = allLinks(p);
  return {
    id: String(p.messageId || ""), name, city: meta.city, category: meta.category, chatId,
    groups: sectionLinks(parts[0].slice(1), links),
    resources: sectionLinks(parts[1], links),
    contacts: contactsFrom(parts[2]),
    image: imageUrl(p.attachments || []),
    updatedAt: Number(p.updatedAt || 0)
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Content-Type", "application/json; charset=utf-8"); return res.end(JSON.stringify({ ok: false, error: "Method not allowed" })); }
  try {
    const ids = await redis("SMEMBERS", INDEX) || [], list = [];
    for (const id of ids) {
      const raw = await redis("GET", `${PREFIX}${id}`);
      if (!raw) continue;
      try { const p = typeof raw === "string" ? JSON.parse(raw) : raw; const d = parse(p); if (d) list.push(d); }
      catch (e) { console.error("Invalid MAX publication:", id); }
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const unique = new Map();
    for (const d of list) {
      const key = `${d.chatId}:${d.name.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim()}`;
      if (!unique.has(key)) unique.set(key, d);
    }
    const developers = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    res.statusCode = 200; res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: true, count: developers.length,
      cities: ["Краснодар", "Ростов", "Крым", "Новороссия"],
      categoriesByCity: { "Краснодар": ["МКД", "ИЖС", "Побережье"], "Ростов": ["МКД", "ИЖС"], "Крым": ["МКД"], "Новороссия": ["МКД"] }, developers }));
  } catch (e) {
    console.error("Developers API error:", e); res.statusCode = 500; res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "Failed to load developers" }));
  }
};
