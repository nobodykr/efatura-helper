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
  ceil[m[1]] = { rate: Number(m[2]), base: m[3], cap: m[4] ? Number(m[4]) : null, perTaxpayer: /perTaxpayer: true/.test(m[0]) };
const rendasAno = {};
const raM = tool.match(/RENDAS_CAP_ANO = \{([^}]*)\}/);
if (raM) for (const [, y, v] of raM[1].matchAll(/(\d{4}): (\d+)/g)) rendasAno[y] = Number(v);
const potCap = Number((tool.match(/POT_CAP = (\d+)/) || [])[1]);
const setorDesde = {};
const sdM = tool.match(/SETOR_DESDE = \{([^}]*)\}/);
if (sdM) for (const [, c, y] of sdM[1].matchAll(/(C\d+): (\d{4})/g)) setorDesde[c] = Number(y);
const taxaAno = {};
const taM = tool.match(/TAXA_ANO = \{((?:[^{}]|\{[^}]*\})*)\}/);
if (taM) for (const [, c, body] of taM[1].matchAll(/(C\d+): \{([^}]*)\}/g))
  for (const [, y, v] of body.matchAll(/(\d{4}): ([\d.]+)/g)) (taxaAno[c] ||= {})[y] = Number(v);
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
// The 78.º-F family now has a dedicated per-year rule for every rate.
const IVA78F_BASE = ["C01", "C02", "C03", "C04", "C09", "C13", "C14", "C15"];
const SNAP_KEY = { C05: "cirs78c_1_saude_pct", C06: "cirs78d_1_educacao_pct", C07: "cirs78e_1_pct",
  C08: "cirs84_1_lares_pct", C10: "cirs78f_3_passes_pct", C11: "cirs78f_ginasios_pct",
  C12: "cirs78f_7_jornais_revistas_pct", C99: "cirs78b_1_despesas_gerais_pct" };
for (const c of IVA78F_BASE) SNAP_KEY[c] = "cirs78f_1_iva_pct";
const years = Object.keys(snap.years).sort();
function snapFor(code) {
  const key = SNAP_KEY[code];
  if (!key) return null;
  const perYear = {};
  for (const y of years) {
    const r = snap.years[y].rules && snap.years[y].rules[key];
    if (r) perYear[y] = { verified: !!r.verified, value: r.value, source_law: r.source_law };
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
    const expNum = src.expect.flatMap((x) => [...String(x).matchAll(/(?<!\d)(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d+)?(?!\d)/g)]
      .map((m) => Number(m[0].replace(/[ .]/g, "").replace(",", ".")))).filter((n) => n > 10);
    // C07's effective ceiling (900, via the DL 97/2026 transitional norm) legitimately differs from
    // the base article value on the consolidated page (800) - that is the transitional, not drift;
    // year_snapshots + test-deducoes-sync already guarantee tool<->verified consistency for C07.
    if (code !== "C07" && ceilingNow != null && expNum.length && !expNum.includes(ceilingNow))
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
  if (n === undefined) return "";
  if (unit === "EUR" && Number.isInteger(n)) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (unit === "EUR") return n.toFixed(2).replace(".", ",");
  return String(n).replace(".", ",") + (unit === "%" ? " %" : "");
};
const NUMERIC_UNITS = ["EUR", "%", "coeficiente", "IAS"];
const printedAliases = (n, unit) => unit === "EUR" && Number.isInteger(n)
  ? [...new Set([ptNum(n, unit), String(n)])]
  : unit === "%" && n === 100 ? [ptNum(n, unit), "totalidade do iva"] : [ptNum(n, unit)];
const printed = (r) => !NUMERIC_UNITS.includes(r.unit) ? []
  : typeof r.value === "number" ? [printedAliases(r.value, r.unit)]
  : r.value && typeof r.value === "object" && Object.values(r.value).every((v) => typeof v === "number")
    ? Object.values(r.value).map((v) => printedAliases(v, r.unit)) : [];
const hasPrinted = (text, n, unit) => printedAliases(n, unit).some((p) => {
  p = normTxt(p);
  return unit === "EUR" ? new RegExp(`(^|\\D)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(text) : text.includes(p);
});
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
                   source_url: (srcById[r.source_id] || {}).url || null, source_law: r.source_law || null,
                   in_force: r.in_force !== false, in_force_from_display: r.in_force_from_display || null };
    if (r.derived) perYear[y].derived = r.derived;
    if (r.unit === "cae") perYear[y].dre_text = r.dre_text || [];
    const src = srcById[r.source_id];
    if (!src) { drift.push(`regra ${key} ${y}: source_id ${r.source_id} não existe em legal_sources.json`); continue; }
    if (r.in_force === false) {
      // Did not exist in that year's wording: no value, a later start date, and an absence check on DRE.
      if (r.value !== null) drift.push(`regra ${key} ${y}: não existia mas tem valor ${JSON.stringify(r.value)}`);
      if (!(r.in_force_from > `${y}-12-31`)) drift.push(`regra ${key} ${y}: não existia mas in_force_from ${r.in_force_from} não é posterior ao ano`);
      if (!((src.expect_absent_by_year || {})[y] || []).length) drift.push(`regra ${key} ${y}: não existia sem expect_absent_by_year em ${src.id}`);
      continue;
    }
    if (r.verified !== true) {
      if (r.value !== null) drift.push(`regra ${key} ${y}: não verificada mas tem valor ${JSON.stringify(r.value)}`);
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
        drift.push(`regra ${key} ${y}: "${t}" não está nos expect de ${src.id} - o verify_sources não o confirma`);
    const said = normTxt((r.dre_text || []).join(" | "));
    if (r.derived) {
      // A value computed from several DRE strings: each string is checked, then the arithmetic.
      const dv = r.derived;
      if (dv.kind === "phase_in") {
        if (!hasPrinted(said, dv.to, r.unit)) drift.push(`regra ${key} ${y}: destino ${dv.to} não aparece no dre_text`);
        const fromRule = RULE_YEARS[dv.from_year] && RULE_YEARS[dv.from_year][dv.from_rule];
        if (!fromRule || fromRule.verified !== true || fromRule.value !== dv.from)
          drift.push(`regra ${key} ${y}: origem ${dv.from_year}.${dv.from_rule} não confirma ${dv.from}`);
      } else if (!hasPrinted(said, dv.base, r.unit)) drift.push(`regra ${key} ${y}: base ${dv.base} não aparece no dre_text`);
      for (const t of dv.texts || []) {
        const ts = srcById[t.source_id] || {};
        const tpool = [].concat(ts.expect || [], (ts.expect_by_year || {})[y] || [], t.on ? (ts.expect_on_date || {})[t.on] || [] : []).map(normTxt);
        if (!tpool.some((e) => e.includes(normTxt(t.text)))) drift.push(`regra ${key} ${y}: "${t.text}" não está nos expect de ${t.source_id}`);
      }
      const pct = dv.kind === "phase_in" ? dv.share_pct : dv.rate_pct;
      if (!(dv.texts || []).some((t) => normTxt(t.text).includes(normTxt(pct + " %")))) drift.push(`regra ${key} ${y}: taxa ${pct} % não aparece nos textos`);
      const value = dv.kind === "phase_in" ? Math.round((dv.from + dv.share_pct / 100 * (dv.to - dv.from)) * 100) / 100
        : Math.round(dv.base * (100 + dv.rate_pct)) / 100;
      if (value !== r.value) drift.push(`regra ${key} ${y}: ${dv.formula} != ${r.value}`);
    } else if (r.unit === "cae") {
      for (const [alinea, codes] of Object.entries(r.value || {}))
        for (const token of String(codes).split(/\s+/)) {
          const found = /^\d+$/.test(token) ? new RegExp(`(^|\\D)${token}(?!\\d)`).test(said)
            : new RegExp(`\\bseccao ${normTxt(token)}\\b`).test(said);
          if (!found) drift.push(`regra ${key} ${y}: entrada CAE da alínea ${alinea}) não aparece no dre_text`);
        }
    } else for (const forms of printed(r))
      if (!forms.some((p) => {
        p = normTxt(p);
        return r.unit === "EUR" ? new RegExp(`(^|\\D)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(said) : said.includes(p);
      })) drift.push(`regra ${key} ${y}: valor ${forms.join(" ou ")} não aparece no dre_text`);
  }
  const src = first && srcById[first.source_id];
  ruleRows.push({ key, article: first ? first.article : null, source_id: first ? first.source_id : null,
                  source_url: src ? src.url : null, years: perYear });
}

// tool.js uses today's constants for every historical re-audit. Keep that visible against each
// year's personal-deduction registry instead of silently treating the latest year as universal.
const RATE_KEY = { C05: "cirs78c_1_saude_pct", C06: "cirs78d_1_educacao_pct", C07: "cirs78e_1_pct",
  C08: "cirs84_1_lares_pct", C10: "cirs78f_3_passes_pct", C11: "cirs78f_ginasios_pct",
  C12: "cirs78f_7_jornais_revistas_pct", C99: "cirs78b_1_despesas_gerais_pct" };
for (const code of IVA78F_BASE) RATE_KEY[code] = "cirs78f_1_iva_pct";
const CAP_KEY = { C05: "cirs78c_1_saude_limite", C06: "cirs78d_1_educacao_limite", C07: "cirs78e_rendas_limite_ano",
  C08: "cirs84_1_lares_limite", C99: "cirs78b_1_despesas_gerais_limite" };
for (const code of Object.keys(ceil).filter((c) => ceil[c].base === "iva")) CAP_KEY[code] = "cirs78f_1_limite_agregado";
const SECTOR_ALINEAS = { C01: ["a"], C02: ["b"], C03: ["c"], C04: ["d"], C09: ["e"], C13: ["g"],
  C14: ["h", "i", "j"], C15: ["k", "l"] };
const personal = [];
for (const code of Object.keys(ceil).sort()) for (const y of ["2023", "2024", "2025", "2026"]) {
  const rs = RULE_YEARS[y], rateRule = rs[RATE_KEY[code]], capRule = rs[CAP_KEY[code]];
  const toolRate = (taxaAno[code] || {})[y] ?? ceil[code].rate;
  const toolValue = { rate_pct: Math.round(toolRate * 100), cap_eur: code === "C07" ? rendasAno[y] : ceil[code].base === "iva" ? potCap : ceil[code].cap };
  const registryValue = { rate_pct: rateRule.value, cap_eur: capRule.value };
  const ruleKeys = [RATE_KEY[code], CAP_KEY[code]];
  const rules = [rateRule, capRule];
  if (code === "C99") {
    const perRule = rs.cirs78b_1_limite_por_sujeito_passivo;
    toolValue.per_taxpayer = ceil[code].perTaxpayer;
    registryValue.per_taxpayer = perRule.value;
    ruleKeys.push("cirs78b_1_limite_por_sujeito_passivo"); rules.push(perRule);
  }
  const alineas = y === "2023" && code === "C11" ? ["f"] : SECTOR_ALINEAS[code];
  if (alineas) {
    const sectorRule = rs.cirs78f_1_setores;
    toolValue.sector_in_force = !(setorDesde[code] > Number(y));
    registryValue.sector_in_force = alineas.some((a) => Object.hasOwn(sectorRule.value, a));
    ruleKeys.push("cirs78f_1_setores"); rules.push(sectorRule);
  }
  const verified = rules.every((r) => r && r.verified === true);
  const match = JSON.stringify(toolValue) === JSON.stringify(registryValue);
  personal.push({ code, sector: sectors[code] || rows[code]?.nome || code, year: y, tool_value: toolValue,
    registry_value: registryValue, rule_key: ruleKeys.join(" + "), verified, match });
  if (!verified) drift.push(`${code} ${y}: comparação pessoal usa uma regra por verificar`);
  if (toolValue.rate_pct !== registryValue.rate_pct)
    drift.push(`${code} ${y}: tool.js aplica ${toolValue.rate_pct}% mas o registo diz ${registryValue.rate_pct}% (${rateRule.article.replace(/^CIRS /, "")})`);
  if (toolValue.cap_eur !== registryValue.cap_eur)
    drift.push(`${code} ${y}: tool.js aplica teto de ${toolValue.cap_eur} EUR mas o registo diz ${registryValue.cap_eur} EUR (${capRule.article.replace(/^CIRS /, "")})`);
  if (toolValue.per_taxpayer !== registryValue.per_taxpayer)
    drift.push(`${code} ${y}: limite por sujeito passivo difere entre tool.js e o registo (${rules[2].article.replace(/^CIRS /, "")})`);
  if (toolValue.sector_in_force !== registryValue.sector_in_force) {
    const labels = alineas.map((a) => a + ")").join(alineas.length > 1 ? ", " : "");
    drift.push(`${code} ${y}: setor não existia nesse ano (78.º-F n.º 1 ${labels} só desde 2026)`);
  }
}

// One value, one place: the copies that predate the per-year rules must agree with them.
const latestVerified = (key) => Object.entries(RULE_YEARS).filter(([, rs]) => rs[key] && rs[key].verified).map(([, rs]) => rs[key]).pop();
const lim = latestVerified("civa53_limiar");
const limCopy = snap.civa && snap.civa.art53_isencao && snap.civa.art53_isencao.limiar_eur;
if (lim && limCopy !== lim.value) drift.push(`civa.art53_isencao.limiar_eur ${limCopy} != civa53_limiar ${lim.value}`);
for (const y of years) {
  const old = snap.years[y].rules.imoveis_rendas.sub_limites.juros_limite_global;
  const phased = RULE_YEARS[y].cirs78e_4a_rendas_limite_majorado_ano.value;
  if (old !== phased) drift.push(`rendas ${y}: registo antigo usa ${old} EUR mas cirs78e_4a_rendas_limite_majorado_ano diz ${phased} EUR (78.º-E n.º 4 a), faseado pela Lei 36/2024)`);
}
for (const [y, blk] of Object.entries(snap.escaloes_irs || {})) {
  if (!/^\d{4}$/.test(y) || !RULE_YEARS[y] || blk.deducao_especifica_catA == null) continue;
  const d = RULE_YEARS[y].cirs25_1a_deducao_especifica, ias = RULE_YEARS[y].ias;
  if (!d || !d.verified) continue;
  const want = d.unit === "IAS" ? (ias && ias.verified ? Math.round(d.value * ias.value * 100) / 100 : null) : d.value;
  if (want !== null && Math.abs(blk.deducao_especifica_catA - want) > 0.005)
    drift.push(`escaloes_irs.${y}.deducao_especifica_catA ${blk.deducao_especifica_catA} != art. 25.º n.º 1 a) ${want}`);
}
const e26 = (snap.escaloes_irs || {})["2026"];
if (e26 && e26.verified) {
  const pool = (srcById[e26.source_id] || {}).expect || [];
  const said = normTxt(pool.join(" | "));
  e26.continente.forEach(([limit, rate], i) => {
    for (const p of [limit === null ? null : ptNum(limit, "EUR"), (rate * 100).toFixed(2).replace(".", ",")])
      if (p && !said.includes(normTxt(p))) drift.push(`escaloes_irs.2026 escalão ${i + 1}: ${p} não está nos expect de ${e26.source_id}`);
  });
}

const manifest = {
  _generated: `make-audit.mjs a partir de deducoes.html + tool.js + year_snapshots.json + legal_sources.json (versão do tool.js ${fbVersion})`,
  _disclaimer: "GERADO automaticamente do código e das fontes, não curado. Cada linha é verificável: siga a fonte legal (DRE) e confirme o valor. Correr test-audit-sync.js garante que este ficheiro não desviou do código.",
  tool_version: fbVersion,
  rows: out,
  rules: ruleRows,
  personal,
  drift,
};
writeFileSync("audit-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`audit-manifest.json -> ${out.length} rows, ${ruleRows.length} rules, ${drift.length} drift`);
if (drift.length) drift.forEach((d) => console.log("  DRIFT " + d));
