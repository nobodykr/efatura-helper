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
// The 78.º-F "% do IVA" family shares one per-year verification recorded under iva_conjunto
// (article 78.º-F, base rate 15%, shared 250 EUR cap - verified 2023-2025). Only the sectors that
// ACTUALLY apply that base 15% rate are mapped here. C10 (transportes 100%), C11 (ginasios 30%) and
// C12 (jornais 100%) apply a SPECIAL rate that neither iva_conjunto (pct 15) nor cirs-78f.expect
// ("15 %") confirms, so they are deliberately left unmapped (Verif/Anos stay "-") until that
// specific rate is documentally verified - see Taiga #79. Greening them would be green-but-wrong.
const IVA78F_BASE = ["C01", "C02", "C03", "C04", "C09", "C13", "C14", "C15"];
const SNAP_KEY = { C05: "saude", C06: "educacao", C08: "lares", C99: "despesas_gerais", C07: "imoveis_rendas" };
for (const c of IVA78F_BASE) SNAP_KEY[c] = "iva_conjunto";
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

// ---- expense and IVA rules (year_snapshots rules that carry a source_id), one row per rule ----
// Each verified rule-year must be traceable: value -> dre_text (the DRE wording it was read from) ->
// one of the source's expect / expect_by_year strings, which fiscal-monitor verify_sources.mjs checks
// on the live DRE page. Anything that does not chain is drift.
const RULE_YEARS = { ...Object.fromEntries(years.map((y) => [y, snap.years[y].rules || {}])),
                     2026: (snap.current_values_2026_verified_isolation || {}).rules || {} };
const srcById = Object.fromEntries(legal.sources.map((s) => [s.id, s]));
const normTxt = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase();
const ptNum = (n, unit) => {
  if (unit === "EUR" && Number.isInteger(n)) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (unit === "EUR") return n.toFixed(2).replace(".", ",");
  return String(n).replace(".", ",") + (unit === "%" ? " %" : "");
};
const NUMERIC_UNITS = ["EUR", "%", "coeficiente", "IAS"];
const printed = (r) => !NUMERIC_UNITS.includes(r.unit) ? []
  : typeof r.value === "number" ? [ptNum(r.value, r.unit)]
  : r.value && typeof r.value === "object" && Object.values(r.value).every((v) => typeof v === "number")
    ? Object.values(r.value).map((v) => ptNum(v, r.unit)) : [];
const ruleRows = [];
const ruleKeys = [...new Set(Object.values(RULE_YEARS).flatMap((rs) => Object.keys(rs).filter((k) => rs[k] && rs[k].source_id)))];
for (const key of ruleKeys) {
  const perYear = {};
  let first = null;
  for (const [y, rs] of Object.entries(RULE_YEARS)) {
    const r = rs[key];
    if (!r) { drift.push(`regra ${key}: sem entrada para ${y}`); continue; }
    first = first || r;
    perYear[y] = { value: r.value, unit: r.unit ?? null, verified: r.verified === true, source_id: r.source_id,
                   source_url: (srcById[r.source_id] || {}).url || null, source_law: r.source_law || null };
    const src = srcById[r.source_id];
    if (!src) { drift.push(`regra ${key} ${y}: source_id ${r.source_id} nao existe em legal_sources.json`); continue; }
    if (r.verified !== true) {
      if (r.value !== null) drift.push(`regra ${key} ${y}: nao verificada mas tem valor ${JSON.stringify(r.value)}`);
      continue;
    }
    // A past year is read from that year's wording (expect_by_year), never from today's page, unless
    // the rule says its text is a note on today's page that names the year (dre_text_scope).
    const byYear = (src.expect_by_year || {})[y] || [];
    const pool = (y !== "2026" && src.expect_by_year && r.dre_text_scope !== "current_page" ? byYear
      : [].concat(src.expect || [], byYear)).map(normTxt);
    if (!(r.dre_text || []).length) drift.push(`regra ${key} ${y}: verificada sem dre_text`);
    for (const t of r.dre_text || [])
      if (!pool.some((e) => e.includes(normTxt(t))))
        drift.push(`regra ${key} ${y}: "${t}" nao esta nos expect de ${src.id} - o verify_sources nao o confirma`);
    const said = normTxt((r.dre_text || []).join(" | "));
    for (const p of printed(r))
      if (!said.includes(normTxt(p))) drift.push(`regra ${key} ${y}: valor ${p} nao aparece no dre_text`);
  }
  const src = first && srcById[first.source_id];
  ruleRows.push({ key, article: first ? first.article : null, source_id: first ? first.source_id : null,
                  source_url: src ? src.url : null, years: perYear });
}
// One value, one place: the copies that predate the per-year rules must agree with them.
const latestVerified = (key) => Object.entries(RULE_YEARS).filter(([, rs]) => rs[key] && rs[key].verified).map(([, rs]) => rs[key]).pop();
const lim = latestVerified("civa53_limiar");
const limCopy = snap.civa && snap.civa.art53_isencao && snap.civa.art53_isencao.limiar_eur;
if (lim && limCopy !== lim.value) drift.push(`civa.art53_isencao.limiar_eur ${limCopy} != civa53_limiar ${lim.value}`);
for (const [y, blk] of Object.entries(snap.escaloes_irs || {})) {
  if (!/^\d{4}$/.test(y) || !RULE_YEARS[y] || blk.deducao_especifica_catA == null) continue;
  const d = RULE_YEARS[y].cirs25_1a_deducao_especifica;
  if (!d || !d.verified) continue;
  // A multiple of the IAS is not turned into euros here: for 2025 the AT applied 4 104 EUR, not 8,54 x
  // that year's IAS (escaloes_irs.2025._deducao_especifica). Only a rule stated in euros is compared.
  const want = d.unit === "EUR" ? d.value : null;
  if (want !== null && Math.abs(blk.deducao_especifica_catA - want) > 0.005)
    drift.push(`escaloes_irs.${y}.deducao_especifica_catA ${blk.deducao_especifica_catA} != art. 25.º n.º 1 a) ${want}`);
}
const e26 = (snap.escaloes_irs || {})["2026"];
if (e26 && e26.verified) {
  const pool = (srcById[e26.source_id] || {}).expect || [];
  const said = normTxt(pool.join(" | "));
  e26.continente.forEach(([limit, rate], i) => {
    for (const p of [limit === null ? null : ptNum(limit, "EUR"), (rate * 100).toFixed(2).replace(".", ",")])
      if (p && !said.includes(normTxt(p))) drift.push(`escaloes_irs.2026 escalao ${i + 1}: ${p} nao esta nos expect de ${e26.source_id}`);
  });
}

const manifest = {
  _generated: `make-audit.mjs a partir de deducoes.html + tool.js + year_snapshots.json + legal_sources.json (versão do tool.js ${fbVersion})`,
  _disclaimer: "GERADO automaticamente do código e das fontes, não curado. Cada linha é verificável: siga a fonte legal (DRE) e confirme o valor. Correr test-audit-sync.js garante que este ficheiro não desviou do código.",
  tool_version: fbVersion,
  rows: out,
  rules: ruleRows,
  drift,
};
writeFileSync("audit-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`audit-manifest.json -> ${out.length} rows, ${ruleRows.length} rules, ${drift.length} drift`);
if (drift.length) drift.forEach((d) => console.log("  DRIFT " + d));
