// Guards the per-year expense and IVA rules in year_snapshots.json (the rules that carry a
// source_id). Each verified rule-year must chain value -> dre_text -> legal_sources expect strings,
// which fiscal-monitor verify_sources.mjs re-checks on the live DRE page (expect on the current page,
// expect_by_year[Y] on the wording in force on 1 January and 31 December of Y). An unverified year
// carries no value, so a reader can only answer "unknown". Offline: no network.
//   node test-rule-registry.js
const fs = require("fs");

const snap = JSON.parse(fs.readFileSync("year_snapshots.json", "utf8"));
const legal = JSON.parse(fs.readFileSync("legal_sources.json", "utf8"));

let fails = 0;
const bad = (m) => { console.log("  FAIL " + m); fails++; };
const ok = (m) => console.log("  ok   " + m);

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase();
const ptNum = (n, unit) => {
  if (n === undefined) return "";
  if (unit === "EUR" && Number.isInteger(n)) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (unit === "EUR") return n.toFixed(2).replace(".", ",");
  return String(n).replace(".", ",") + (unit === "%" ? " %" : "");
};
const NUMERIC = ["EUR", "%", "coeficiente", "IAS"];
const printedAliases = (n, unit) => unit === "EUR" && Number.isInteger(n)
  ? [...new Set([ptNum(n, unit), String(n)])]
  : unit === "%" && n === 100 ? [ptNum(n, unit), "totalidade do iva"] : [ptNum(n, unit)];
const printed = (r) => !NUMERIC.includes(r.unit) ? []
  : (typeof r.value === "number" ? [r.value] : Object.values(r.value || {})).map((v) => printedAliases(v, r.unit));
const hasPrinted = (text, n, unit) => printedAliases(n, unit).some((p) => {
  p = norm(p);
  return unit === "EUR" ? new RegExp(`(^|\\D)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(text) : text.includes(p);
});

function ruleYears(s) {
  const out = {};
  for (const y of Object.keys(s.years)) out[y] = s.years[y].rules || {};
  out["2026"] = (s.current_values_2026_verified_isolation || {}).rules || {};
  return out;
}

// Returns the list of problems; empty means every verified value is traceable to a checked string.
function check(s, l) {
  const problems = [];
  const src = Object.fromEntries(l.sources.map((x) => [x.id, x]));
  const ry = ruleYears(s);
  const keys = [...new Set(Object.values(ry).flatMap((rs) => Object.keys(rs).filter((k) => rs[k] && rs[k].source_id)))];
  for (const key of keys) {
    for (const [y, rs] of Object.entries(ry)) {
      const r = rs[key];
      if (!r) { problems.push(`${key}: no entry for ${y}`); continue; }
      const so = src[r.source_id];
      if (!so) { problems.push(`${key} ${y}: unknown source_id ${r.source_id}`); continue; }
      if (r.in_force === false) {
        if (r.value !== null) problems.push(`${key} ${y}: not in force but carries a value`);
        if (r.verified !== true || !r.source_law) problems.push(`${key} ${y}: not in force without verified + source_law`);
        if (!(r.in_force_from > `${y}-12-31`) || !r.in_force_from_display) problems.push(`${key} ${y}: not in force needs a later in_force_from and its display`);
        if (!((so.expect_absent_by_year || {})[y] || []).length) problems.push(`${key} ${y}: not in force without ${so.id}.expect_absent_by_year`);
        continue;
      }
      if (r.verified !== true) {
        if (r.value !== null) problems.push(`${key} ${y}: unverified but carries a value`);
        if (!r.note) problems.push(`${key} ${y}: unverified without a note saying why`);
        continue;
      }
      if (!r.source_law) problems.push(`${key} ${y}: verified without source_law`);
      const byYear = (so.expect_by_year || {})[y] || [];
      const pool = (y !== "2026" && so.expect_by_year && r.dre_text_scope !== "current_page" ? byYear
        : [].concat(so.expect || [], byYear)).map(norm);
      if (r.dre_text_scope === "current_page" && !(r.dre_text || []).every((t) => t.includes(y)))
        problems.push(`${key} ${y}: a current-page text must name the year it applies to`);
      if (!(r.dre_text || []).length) problems.push(`${key} ${y}: verified without dre_text`);
      for (const t of r.dre_text || [])
        if (!pool.some((e) => e.includes(norm(t)))) problems.push(`${key} ${y}: dre_text "${t}" is not one of ${so.id}'s checked strings`);
      const said = norm((r.dre_text || []).join(" | "));
      if (r.derived) {
        const dv = r.derived;
        if (dv.kind === "phase_in") {
          if (!hasPrinted(said, dv.to, r.unit)) problems.push(`${key} ${y}: phase-in target ${dv.to} is not in its dre_text`);
          const fromRule = ry[dv.from_year] && ry[dv.from_year][dv.from_rule];
          if (!fromRule || fromRule.verified !== true || fromRule.value !== dv.from)
            problems.push(`${key} ${y}: phase-in origin ${dv.from_year}.${dv.from_rule} does not verify ${dv.from}`);
        } else if (!hasPrinted(said, dv.base, r.unit)) problems.push(`${key} ${y}: derived base ${dv.base} is not in its dre_text`);
        for (const t of dv.texts || []) {
          const ts = src[t.source_id] || {};
          const tpool = [].concat(ts.expect || [], (ts.expect_by_year || {})[y] || [], t.on ? (ts.expect_on_date || {})[t.on] || [] : []).map(norm);
          if (!tpool.some((e) => e.includes(norm(t.text)))) problems.push(`${key} ${y}: derived text "${t.text}" is not one of ${t.source_id}'s checked strings`);
        }
        const pct = dv.kind === "phase_in" ? dv.share_pct : dv.rate_pct;
        if (!(dv.texts || []).some((t) => norm(t.text).includes(norm(pct + " %")))) problems.push(`${key} ${y}: rate ${pct} % is not in the derived texts`);
        const value = dv.kind === "phase_in" ? Math.round((dv.from + dv.share_pct / 100 * (dv.to - dv.from)) * 100) / 100
          : Math.round(dv.base * (100 + dv.rate_pct)) / 100;
        if (value !== r.value) problems.push(`${key} ${y}: ${dv.formula} != ${r.value}`);
      } else if (r.unit === "cae") {
        for (const [alinea, codes] of Object.entries(r.value || {}))
          for (const token of String(codes).split(/\s+/)) {
            const found = /^\d+$/.test(token) ? new RegExp(`(^|\\D)${token}(?!\\d)`).test(said)
              : new RegExp(`\\bseccao ${norm(token)}\\b`).test(said);
            if (!found) problems.push(`${key} ${y}: CAE entry for alinea ${alinea}) is not in its dre_text`);
          }
      } else for (const forms of printed(r)) if (!forms.some((p) => {
        p = norm(p);
        return r.unit === "EUR" ? new RegExp(`(^|\\D)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(said) : said.includes(p);
      })) problems.push(`${key} ${y}: value ${forms.join(" or ")} is not in its dre_text`);
    }
    if (!s._structure.includes(key)) problems.push(`${key}: not documented in _structure`);
  }
  return { problems, keys };
}

// 1. the shipped registry chains cleanly
const { problems, keys } = check(snap, legal);
if (problems.length) problems.forEach(bad); else ok(`${keys.length} rules x 4 years: every verified value chains to a DRE-checked string`);

// 2. the check catches what it exists for (mutations on deep copies)
const clone = (o) => JSON.parse(JSON.stringify(o));
const mutations = [
  ["wrong value", (s) => { s.current_values_2026_verified_isolation.rules.civa53_limiar.value = 14000; }],
  ["another year's value carried into an unverified year", (s) => { s.years["2025"].rules.civa53_3_sem_deducao.value = true; }],
  ["2024 deduction not equal to 4 104 x 1,06", (s) => { s.years["2024"].rules.cirs25_1a_deducao_especifica.value = 4104; }],
  ["derived rate not checked on DRE", (s) => { s.years["2024"].rules.cirs25_1a_deducao_especifica.derived.texts[1].text = "taxa de 6 % inventada"; }],
  ["phase-in value wrong", (s) => { s.years["2025"].rules.cirs78e_rendas_limite_ano.value = 750; }],
  ["phase-in origin differs from referenced rule", (s) => { s.years["2025"].rules.cirs78e_rendas_limite_ano.derived.from = 500; }],
  ["phase-in share text not checked", (s) => { s.years["2025"].rules.cirs78e_rendas_limite_ano.derived.texts[1].text = "a) 60 % em 2025"; }],
  ["CAE value missing from DRE text", (s) => { s.current_values_2026_verified_isolation.rules.cirs78f_1_setores.value.l = "9999"; }],
  ["integer EUR alias does not accept wrong value", (s) => { s.years["2025"].rules.cirs78e_1a_rendas_limite.value = 1000; }],
  ["integer EUR boundary rejects 100 inside 1100", (s) => { s.years["2025"].rules.cirs78e_4a_rendas_limite_majorado.value = 100; }],
  ["not in force but the start date is inside the year", (s) => { s.years["2024"].rules.cirs31_15_prazo_portal.in_force_from = "2024-07-01"; }],
  ["not in force without a DRE absence check", (s) => { s.years["2023"].rules.civa53_3_sem_deducao.source_id = "civa-23"; }],
  ["dre_text not checked by verify_sources", (s) => { s.years["2023"].rules.cirs33_5_habitacao_pct.dre_text = ["25 % das despesas da casa"]; }],
  ["missing year", (s) => { delete s.years["2025"].rules.ias; }],
  ["deadline claimed for 2024", (s) => { Object.assign(s.years["2024"].rules.cirs31_15_prazo_portal, { verified: true, value: { month_end: 2, year_offset: 1 }, source_law: "x", dre_text: ["até ao final do mês de fevereiro do ano seguinte ao da sua emissão"] }); }],
];
for (const [name, mutate] of mutations) {
  const s = clone(snap);
  mutate(s);
  if (check(s, legal).problems.length) ok(`catches: ${name}`); else bad(`does not catch: ${name}`);
}

// 3. what slices 1 and 3 read is present for every year (verified or explicitly unknown)
const ry = ruleYears(snap);
const NEEDED = ["ias", "cirs25_1a_deducao_especifica", "cirs31_1_coeficientes", "cirs31_13_justificacao_pct", "cirs31_14_parcial_pct",
  "cirs31_15_prazo_portal", "cirs31_16_valores_declarados", "cirs32_remissao_circ", "cirs33_5_habitacao_pct", "cirs78b_4_fora_atividade",
  "civa19_direito_deducao", "civa20_operacoes_dedutiveis", "civa21_exclusoes_pct", "civa23_utilizacao_mista", "civa53_limiar", "civa53_3_sem_deducao"];
const missing = NEEDED.filter((k) => Object.values(ry).some((rs) => !rs[k]));
if (missing.length) bad("rules missing in some year: " + missing.join(", ")); else ok(`${NEEDED.length} rules present for 2023 to 2026`);

const NEEDED_PERSONAL = ["cirs78b_1_despesas_gerais_pct", "cirs78b_1_despesas_gerais_limite", "cirs78b_1_limite_por_sujeito_passivo",
  "cirs78b_9_monoparental_pct", "cirs78b_9_monoparental_limite", "cirs78c_1_saude_pct", "cirs78c_1_saude_limite",
  "cirs78d_1_educacao_pct", "cirs78d_1_educacao_limite", "cirs78d_11_rendas_estudante_limite", "cirs78d_11_rendas_estudante_acrescimo",
  "cirs78e_1_pct", "cirs78e_1a_rendas_limite", "cirs78e_4a_rendas_limite_majorado", "cirs78e_rendas_limite_ano",
  "cirs78e_4a_rendas_limite_majorado_ano", "cirs78e_1b_juros_limite", "cirs78e_5a_juros_limite_majorado",
  "cirs78f_1_iva_pct", "cirs78f_1_limite_agregado", "cirs78f_3_passes_pct", "cirs78f_6_medicamentos_veterinarios_pct",
  "cirs78f_7_jornais_revistas_pct", "cirs78f_ginasios_pct", "cirs78f_1_setores", "cirs84_1_lares_pct", "cirs84_1_lares_limite"];
const missingPersonal = NEEDED_PERSONAL.filter((k) => Object.values(ry).some((rs) => !rs[k]));
if (missingPersonal.length) bad("personal rules missing in some year: " + missingPersonal.join(", ")); else ok(`${NEEDED_PERSONAL.length} personal rules present for 2023 to 2026`);

// 4. pinned values read from DRE on 2026-10-07 (a change here must come with a new DRE reading);
//    the 2024 deduction is 4 104 x 1,06 (n.º 7 of Lei 32/2024, Portaria 421/2023)
const pins = [["2023", "civa53_limiar", 13500], ["2024", "civa53_limiar", 14500], ["2025", "civa53_limiar", 15000], ["2026", "civa53_limiar", 15000],
  ["2023", "ias", 480.43], ["2024", "ias", 509.26], ["2025", "ias", 522.5], ["2026", "ias", 537.13],
  ["2023", "cirs25_1a_deducao_especifica", 4104], ["2024", "cirs25_1a_deducao_especifica", 4350.24], ["2026", "cirs25_1a_deducao_especifica", 8.54],
  ["2026", "cirs31_13_justificacao_pct", 15], ["2026", "cirs31_14_parcial_pct", 25], ["2026", "cirs33_5_habitacao_pct", 25],
  ["2023", "cirs31_15_prazo_portal", null], ["2024", "cirs31_15_prazo_portal", null], ["2025", "cirs31_15_prazo_portal", null]];
pins.push(
  ...[[2023, 502, 800, 15, 300], [2024, 600, 900, 30, 400], [2025, 700, 1000, 30, 400], [2026, 900, 1050, 30, 400]]
    .flatMap(([y, rent, raised, gym, student]) => [[String(y), "cirs78e_rendas_limite_ano", rent], [String(y), "cirs78e_4a_rendas_limite_majorado_ano", raised],
      [String(y), "cirs78f_ginasios_pct", gym], [String(y), "cirs78d_11_rendas_estudante_limite", student]]),
  ...["2023", "2024", "2025", "2026"].flatMap((y) => [[y, "cirs78b_1_despesas_gerais_limite", 250], [y, "cirs78b_9_monoparental_pct", 45], [y, "cirs84_1_lares_limite", 403.75]])
);
for (const [y, k, v] of pins) if (ry[y][k].value !== v) bad(`${y} ${k}: ${JSON.stringify(ry[y][k].value)} != ${v}`);
if (ry["2026"].cirs31_14_parcial_pct.applies_to_alineas.join() !== "c,d,e") bad("art. 31.º n.º 14 applies only to alíneas c) to e)");
ok("pinned DRE readings unchanged");

// 5. the old aggregate entries remain equal to their replacement rules during migration
for (const y of ["2023", "2024", "2025"]) {
  const old = snap.years[y].rules, newer = ry[y];
  const equal = (oldValue, key) => { if (oldValue !== newer[key].value) bad(`${y}: migrated ${key} ${newer[key].value} != ${oldValue}`); };
  equal(old.despesas_gerais.pct, "cirs78b_1_despesas_gerais_pct");
  equal(old.despesas_gerais.ceiling, "cirs78b_1_despesas_gerais_limite");
  if (old.despesas_gerais.pct_monoparental != null) equal(old.despesas_gerais.pct_monoparental, "cirs78b_9_monoparental_pct");
  if (old.despesas_gerais.ceiling_monoparental != null) equal(old.despesas_gerais.ceiling_monoparental, "cirs78b_9_monoparental_limite");
  for (const [oldKey, prefix] of [["saude", "cirs78c_1_saude"], ["educacao", "cirs78d_1_educacao"], ["lares", "cirs84_1_lares"]]) {
    equal(old[oldKey].pct, `${prefix}_pct`); equal(old[oldKey].ceiling, `${prefix}_limite`);
  }
  equal(old.iva_conjunto.pct, "cirs78f_1_iva_pct"); equal(old.iva_conjunto.ceiling, "cirs78f_1_limite_agregado");
  equal(old.imoveis_rendas.pct, "cirs78e_1_pct"); equal(old.imoveis_rendas.base_ceiling, "cirs78e_rendas_limite_ano");
  equal(old.imoveis_rendas.sub_limites.juros_base, "cirs78e_1b_juros_limite");
  equal(old.imoveis_rendas.sub_limites.majoracao, "cirs78e_5a_juros_limite_majorado");
}
ok("old aggregate entries equal their replacement personal rules");

// 6. the 2026 brackets and the dedicated pages
const e26 = snap.escaloes_irs["2026"];
if (!e26 || e26.continente.length !== 9 || e26.continente[0][0] !== 8342 || e26.continente[8][1] !== 0.48) bad("escaloes_irs.2026 is not the Lei 73-A/2025 table");
else ok("escaloes_irs.2026: 9 brackets from CIRS 68.º (Lei 73-A/2025)");
for (const s of legal.sources.filter((x) => x.dre_versao_id))
  if (!s.url.endsWith("-" + s.dre_versao_id)) bad(`${s.id}: url does not point at the dedicated page ${s.dre_versao_id}`);
ok("new sources point at dedicated article pages");

console.log(fails ? `\n  ${fails} FAILED` : "\n  rule registry: every value traceable to DRE, unknown years carry no value");
process.exit(fails ? 1 : 0);
