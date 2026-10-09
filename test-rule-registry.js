// Guards the per-year expense and IVA rules in year_snapshots.json (the rules that carry a
// source_id). Each verified rule-year must chain value -> dre_text -> legal_sources expect strings,
// which fiscal-monitor verify_sources.mjs re-checks on the live DRE page (expect on the current page,
// expect_by_year[Y] on the wording in force on 1 January and 31 December of Y). An unverified year
// carries no value, so a reader can only answer "unknown". Offline: no network.
//   node test-rule-registry.js
const fs = require("fs");
const vm = require("vm");

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
NUMERIC.push("pp", "RMMG");
const PT_WORD = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove", "vinte"];
const PT_MONTH = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dateParts = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const [year, month, day] = value.split("-");
  return { display: `${day}/${month}/${year}`, long: `${Number(day)} de ${PT_MONTH[Number(month) - 1]} de ${year}` };
};
const hasInForceEvidence = (r, sources) => {
  const evidence = r.in_force_evidence, date = dateParts(r.in_force_from);
  return date && Array.isArray(evidence) && evidence.length > 0
    && evidence.every((t) => t && typeof t.text === "string" && t.text.trim()
      && ((sources[t.source_id] || {}).expect || []).some((e) => norm(e).includes(norm(t.text))))
    && evidence.some((t) => norm(t.text).includes(norm(r.in_force_from)) || norm(t.text).includes(norm(date.long)));
};
const printedAliases = (n, unit) => unit === "pp"
  ? [`${n} pontos percentuais`, ...(PT_WORD[n] ? [`${PT_WORD[n]} pontos percentuais`] : [])]
  : unit === "RMMG" ? [`${ptNum(n)} vezes`]
  : unit === "EUR" && Number.isInteger(n)
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
        if (!((so.expect_absent_by_year || {})[y] || []).length && !hasInForceEvidence(r, src)) problems.push(`${key} ${y}: not in force without ${so.id}.expect_absent_by_year`);
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
      if (r.in_force_from > `${y}-12-31`) problems.push(`${key} ${y}: verified before entering into force`);
      if (r.unit === "data") {
        const date = dateParts(r.value);
        if (!date || r.value_display !== date.display || !said.includes(norm(date.long)))
          problems.push(`${key} ${y}: invalid date, display or DRE long form`);
      }
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
const auditCode = fs.readFileSync("make-audit.mjs", "utf8").replace(/^import .*;$/m, "");
const auditDrift = (s) => {
  let manifest;
  vm.runInNewContext(auditCode, {
    readFileSync: (file, encoding) => file === "year_snapshots.json" ? JSON.stringify(s) : fs.readFileSync(file, encoding),
    writeFileSync: (file, contents) => { manifest = JSON.parse(contents); },
    console: { log() {} },
  });
  return manifest.drift;
};
if (auditDrift(snap).length) bad("audit generator reports drift for the shipped registry");
const mutations = [
  ["date value and display agree but differ from DRE", (s) => { Object.assign(s.current_values_2026_verified_isolation.rules.ebf45c_1_auferidos_ate, { value: "2028-12-31", value_display: "31/12/2028" }); }],
  ["invalid calendar date", (s) => { Object.assign(s.current_values_2026_verified_isolation.rules.ebf45c_1_auferidos_ate, { value: "2029-02-31", value_display: "31/02/2029" }); }],
  ["evidence date differs despite being after the year", (s) => { s.years["2025"].rules.ebf45c_1_taxa_pct.in_force_from = "2027-01-01"; }],
  ["wrong percentage-point reduction", (s) => { s.years["2025"].rules.cirs72_4_reducao_pp.value = 14; }],
  ["wrong percentage-point renewal object", (s) => { s.current_values_2026_verified_isolation.rules.cirs72_3_renovacao_pp.value.por_renovacao = 3; }],
  ["wrong RMMG multiplier", (s) => { s.current_values_2026_verified_isolation.rules.dl97_2_2a_limite_renda_rmmg.value = 3; }],
  ["wrong end date", (s) => { s.current_values_2026_verified_isolation.rules.ebf45c_1_auferidos_ate.value = "2028-12-31"; }],
  ["wrong date display", (s) => { s.current_values_2026_verified_isolation.rules.ebf45c_1_auferidos_ate.value_display = "30/12/2029"; }],
  ["EBF 45.º-C claimed for 2025", (s) => { Object.assign(s.years["2025"].rules.ebf45c_1_taxa_pct, { verified: true, in_force: true, value: 10, dre_text: s.current_values_2026_verified_isolation.rules.ebf45c_1_taxa_pct.dre_text }); }],
  ["missing not-in-force evidence", (s) => { delete s.years["2025"].rules.ebf45c_1_taxa_pct.in_force_evidence; }],
  ["evidence text not checked by DRE", (s) => { s.years["2025"].rules.ebf45c_1_taxa_pct.in_force_evidence[0].text = "texto inventado"; }],
  ["evidence does not name the start date", (s) => { s.years["2025"].rules.ebf45c_1_taxa_pct.in_force_from = "2025-01-01"; }],
  ["habitational rate claimed for all of 2023", (s) => { s.years["2023"].rules.cirs72_2_habitacional_pct.value = 25; }],
  ["own-home rent deduction claimed for all of 2024", (s) => { s.years["2024"].rules.cirs41_8_rendas_habitacao_propria.value = true; }],
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
  if (!auditDrift(s).length) bad(`audit generator does not catch: ${name}`);
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

const NEEDED_CATF = [
  "cirs72_1e_prediais_pct", "cirs72_2_habitacional_pct", "cirs72_3_reducao_pp",
  "cirs72_3_renovacao_pp", "cirs72_4_reducao_pp", "cirs72_5_reducao_pp",
  "cirs72_13_englobamento_opcao", "cirs72_20_perda_reducoes", "cirs72_23_exclusao_renda_elevada",
  "cirs72_24_reducao_adicional_pp", "lei56_2023_50_7_contratos_abrangidos", "lei56_2023_50_8_ambito_n2",
  "ebf45c_1_taxa_pct", "ebf45c_1_auferidos_ate", "ebf45c_1_condicoes",
  "dl97_2_2a_limite_renda_rmmg", "dl97_2_2a_rmmg_2026", "dl97_2_3_atualizacao_portaria",
  "dl97_3_valor_renda_mensal", "cirs41_1_gastos_dedutiveis", "cirs41_1_exclusao_gastos_financeiros",
  "cirs41_1_outras_exclusoes", "cirs41_2_condominio", "cirs41_3_permilagem",
  "cirs41_4_imputacao_vpt_area", "cirs41_5_imi_selo_ano", "cirs41_6_sublocacao",
  "cirs41_7_obras_24_meses_antes", "cirs41_8_rendas_habitacao_propria", "cirs41_comprovacao_documental"
];
const missingCatF = NEEDED_CATF.filter((k) => Object.values(ry).some((rs) => !rs[k]));
if (missingCatF.length) bad("Category F rules missing in some year: " + missingCatF.join(", ")); else ok(`${NEEDED_CATF.length} Category F rules present for 2023 to 2026`);
for (const [y, rs] of Object.entries(ry)) {
  if (y !== "2026" && rs.ebf45c_1_taxa_pct.in_force !== false) bad(`${y}: EBF 45.º-C must not be in force`);
  if (rs.cirs41_1_exclusao_gastos_financeiros.verified !== true) bad(`${y}: financial expenses exclusion must be verified`);
  for (const [key, r] of Object.entries(rs)) {
    if (r.rmmg_reference_year !== undefined && r.rmmg_reference_year !== "2026") bad(`${y} ${key}: RMMG reference must be 2026`);
    if ((key.startsWith("ebf45c_") || key.startsWith("dl97_")) && key !== "dl97_2_2a_rmmg_2026"
      && (r.unit === "EUR" || Object.keys(r).some((k) => /(?:cap|limite|ceiling).*eur|eur.*(?:cap|limite|ceiling)/i.test(k))))
      bad(`${y} ${key}: EBF 45.º-C must not store a euro cap`);
  }
}
if (ry["2026"].dl97_2_2a_limite_renda_rmmg.rmmg_reference_year !== "2026") bad("RMMG multiplier must reference 2026");

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
pins.push(
  ["2024", "cirs72_2_habitacional_pct", 25],
  ["2025", "cirs72_2_habitacional_pct", 25],
  ["2026", "cirs72_2_habitacional_pct", 25],
  ["2023", "cirs72_2_habitacional_pct", null],
  ["2025", "cirs72_1e_prediais_pct", 28],
  ["2026", "cirs72_1e_prediais_pct", 28],
  ["2025", "cirs72_3_reducao_pp", 10],
  ["2025", "cirs72_4_reducao_pp", 15],
  ["2025", "cirs72_5_reducao_pp", 20],
  ["2025", "cirs72_24_reducao_adicional_pp", 5],
  ["2026", "ebf45c_1_taxa_pct", 10],
  ["2025", "ebf45c_1_taxa_pct", null],
  ["2026", "dl97_2_2a_limite_renda_rmmg", 2.5],
  ["2026", "dl97_2_2a_rmmg_2026", 920],
  ["2026", "ebf45c_1_auferidos_ate", "2029-12-31"]
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
