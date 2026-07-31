// Regenerate audit-manifest.json from the CODE + DATA, for the public /auditoria page and the
// audit kit. GENERATED, never hand-curated: every row is derived by joining, on the deduction code
// (C01..C15, C99), the four sources of truth so an auditor sees the SAME claim from all angles:
//
//   deducoes.html        what we TELL people        (rate + ceiling shown to users)
//   tool.js CEIL/RENDAS  what we COMPUTE with        (+ the exact code location)
//   year_snapshots.json  what we VERIFIED per year   (verified flag, source_law, effective years)
//   legal_sources.json   the official DRE source     (url + the `expect` strings for the content check)
//
// It reuses the exact parse shapes from test-deducoes-sync.js (keep them in sync). It does NOT
// invent numbers; where the sources disagree it records the disagreement in `drift` rather than
// hiding it - surfacing drift is the whole point.
import { readFileSync, writeFileSync } from "fs";

const page = readFileSync("deducoes.html", "utf8");
const tool = readFileSync("tool.js", "utf8");
const snap = JSON.parse(readFileSync("year_snapshots.json", "utf8"));
const legal = JSON.parse(readFileSync("legal_sources.json", "utf8"));
const fbVersion = (tool.match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";

// ---- parse the three code/data sources (regexes lifted verbatim from test-deducoes-sync.js) ----
const rows = {};
const rowRe = /<td class="c">(C\d+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g;
for (let m; (m = rowRe.exec(page)); ) {
  const [, code, nome, valor, artigo] = m;
  const pct = (valor.match(/(\d+)%/) || [])[1];
  const capM = valor.replace(/\s/g, " ").match(/ate ([\d.,]+) ?&euro;/);
  rows[code] = {
    nome,
    pct: pct ? Number(pct) : null,
    cap: capM ? Number(capM[1].replace(".", "").replace(",", ".")) : null,
    iva: /do IVA/.test(valor),
    artigo: artigo.replace(/&ordm;/g, "º").replace(/art\.\s*/i, "").trim(),
  };
}

const ceil = {};
const ceilRe = /(C\d+): \{ rate: ([\d.]+), base: "(iva|total)"(?:, pot: POT)?(?:, cap: ([\d.]+))?(?:, perTaxpayer: true)?\s*\}/g;
for (let m; (m = ceilRe.exec(tool)); )
  ceil[m[1]] = { rate: Number(m[2]), base: m[3], cap: m[4] ? Number(m[4]) : null };
const rendasAno = {};
const raM = tool.match(/RENDAS_CAP_ANO = \{([^}]*)\}/);
if (raM) for (const [, y, v] of raM[1].matchAll(/(\d{4}): (\d+)/g)) rendasAno[y] = Number(v);
const potCap = Number((tool.match(/POT_CAP = (\d+)/) || [])[1]);
// Sector names come from tool.js SECTORS (properly accented via \u escapes), not the accent-less
// deducoes.html cells, so the public /auditoria page reads correctly in Portuguese.
const sectors = {};
const secBlock = (tool.match(/var SECTORS = \{([\s\S]*?)\};/) || [])[1] || "";
for (const [, code, name] of secBlock.matchAll(/(C\d+):\s*"([^"]*)"/g)) {
  try { sectors[code] = JSON.parse('"' + name + '"'); } catch { sectors[code] = name; }
}
// Last-resort source: the consolidated CIRS, so EVERY row links to an official page (never a dead cell).
const CIRS_CONSOLIDATED = "https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2014-70048167";

// ---- legal_sources: map each deduction code to its source entry (by the codes named in `governs`) ----
const srcByCode = {};
for (const s of legal.sources)
  for (const code of (s.governs || "").match(/C\d+/g) || []) if (!srcByCode[code]) srcByCode[code] = s;

// ---- year_snapshots: which rule key + which years an article is verified in ----
const SNAP_KEY = { C05: "saude", C06: "educacao", C08: "lares", C99: "despesas_gerais", C07: "imoveis_rendas" };
const years = Object.keys(snap.years).sort();
function snapFor(code) {
  const key = SNAP_KEY[code];
  if (!key) return null;
  const perYear = {};
  for (const y of years) {
    const r = snap.years[y].rules && snap.years[y].rules[key];
    if (r) perYear[y] = { verified: !!r.verified, ceiling: r.ceiling ?? r.base_ceiling, pct: r.pct, source_law: r.source_law };
  }
  return Object.keys(perYear).length ? perYear : null;
}

// ---- build one row per deduction code, and collect drift ----
const drift = [];
const out = [];
for (const code of Object.keys(ceil).sort()) {
  const c = ceil[code];
  const p = rows[code] || {};
  const src = srcByCode[code];
  const sn = snapFor(code);
  const isPot = c.base === "iva";
  const ceilingNow = code === "C07" ? rendasAno[Object.keys(rendasAno).sort().pop()] : isPot ? potCap : c.cap;
  const article = (src && src.expect && src.expect[0]) || p.artigo || null;
  // Prefer the article-specific DRE page (article_pages) over the generic consolidated-law URL.
  const sourceUrl = (article && snap.article_pages && snap.article_pages[article]) || (src && src.url) || CIRS_CONSOLIDATED;

  const row = {
    code,
    sector: sectors[code] || p.nome || code,
    rate: Math.round(c.rate * 100) + "%",
    base: isPot ? "% do IVA" : "% do valor",
    ceiling_eur: ceilingNow ?? null,
    ceiling_note: isPot ? `teto CONJUNTO de ${potCap} EUR (art. 78.º-F) partilhado por C01-C04, C09-C15`
      : code === "C07" ? `por ano de rendimento (2026 = ${rendasAno["2026"] ?? "?"}); ver year_snapshots`
      : code === "C99" ? `${potCap === undefined ? "" : ""}${c.cap} EUR por sujeito passivo` : `${c.cap} EUR`,
    code_location: code === "C07" ? "tool.js: CEIL.C07 + RENDAS_CAP_ANO" : isPot ? "tool.js: CEIL." + code + " (pot iva78F) + POT_CAP" : "tool.js: CEIL." + code,
    article,
    source_url: sourceUrl,
    source_id: (src && src.id) || null,
    source_expect: (src && src.expect) || null,
    verified: sn ? Object.values(sn).some((v) => v.verified) : null,
    effective_years: sn ? Object.keys(sn) : null,
    source_law: sn ? Object.values(sn).map((v) => v.source_law).filter(Boolean).slice(-1)[0] || null : null,
  };
  out.push(row);

  // drift: does the source's expected ceiling still match what the tool applies?
  if (src && src.expect) {
    const expNum = src.expect.map((x) => Number(String(x).replace(/[^\d]/g, ""))).filter((n) => n > 10);
    // C07's effective ceiling (900, via the DL 97/2026 transitional norm) legitimately differs from
    // the base article value on the consolidated page (800) - that is the transitional, not drift;
    // year_snapshots + test-deducoes-sync already guarantee tool<->verified consistency for C07.
    if (code !== "C07" && ceilingNow != null && expNum.length && !expNum.includes(Math.floor(ceilingNow)))
      drift.push(`${code}: tool aplica ${ceilingNow} EUR mas legal_sources[${src.id}].expect diz ${JSON.stringify(src.expect)} - reconciliar`);
  }
}

const manifest = {
  _generated: `make-audit.mjs a partir de deducoes.html + tool.js + year_snapshots.json + legal_sources.json (versão do tool.js ${fbVersion})`,
  _disclaimer: "GERADO automaticamente do código e das fontes, não curado. Cada linha é verificável: siga a fonte legal (DRE) e confirme o valor. Correr test-audit-sync.js garante que este ficheiro não desviou do código.",
  tool_version: fbVersion,
  rows: out,
  drift,
};
writeFileSync("audit-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`audit-manifest.json -> ${out.length} rows, ${drift.length} drift`);
if (drift.length) drift.forEach((d) => console.log("  DRIFT " + d));
