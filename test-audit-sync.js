// Guards audit-manifest.json against staleness: it must report every known drift, cover
// all 16 sectors, and every row's rate/ceiling must still match what tool.js actually computes with.
// If someone changes tool.js (a rate/ceiling) without re-running `node make-audit.mjs`, this FAILS -
// so the public /auditoria page can never quietly disagree with the code.
//   node test-audit-sync.js
const fs = require("fs");

const tool = fs.readFileSync("tool.js", "utf8");
let manifest;
try { manifest = JSON.parse(fs.readFileSync("audit-manifest.json", "utf8")); }
catch (e) { console.log("  FAIL audit-manifest.json missing or invalid - run `node make-audit.mjs`"); process.exit(1); }

let fails = 0;
const bad = (m) => { console.log("  FAIL " + m); fails++; };
const ok = (m) => console.log("  ok   " + m);

// re-parse tool.js the same way make-audit.mjs / test-deducoes-sync.js do
const ceil = {};
const ceilRe = /(C\d+): \{ rate: ([\d.]+), base: "(iva|total)"(?:, pot: POT)?(?:, cap: ([\d.]+))?(?:, perTaxpayer: true)?\s*\}/g;
for (let m; (m = ceilRe.exec(tool)); )
  ceil[m[1]] = { rate: Number(m[2]), base: m[3], cap: m[4] ? Number(m[4]) : null };
const rendasAno = {};
const raM = tool.match(/RENDAS_CAP_ANO = \{([^}]*)\}/);
if (raM) for (const [, y, v] of raM[1].matchAll(/(\d{4}): (\d+)/g)) rendasAno[y] = Number(v);
const potCap = Number((tool.match(/POT_CAP = (\d+)/) || [])[1]);
const nowRenda = rendasAno[Object.keys(rendasAno).sort().pop()];
const setorDesde = {};
const sdM = tool.match(/SETOR_DESDE = \{([^}]*)\}/);
if (sdM) for (const [, c, y] of sdM[1].matchAll(/(C\d+): (\d{4})/g)) setorDesde[c] = Number(y);
const taxaAno = {};
const taM = tool.match(/TAXA_ANO = \{((?:[^{}]|\{[^}]*\})*)\}/);
if (taM) for (const [, c, body] of taM[1].matchAll(/(C\d+): \{([^}]*)\}/g))
  for (const [, y, v] of body.matchAll(/(\d{4}): ([\d.]+)/g)) (taxaAno[c] ||= {})[y] = Number(v);

// 1. drift is shown on /auditoria, never filtered. tool.js follows each year's wording (SETOR_DESDE,
//    TAXA_ANO, RENDAS_CAP_ANO), so known drift is empty; anything reported is new drift and fails.
const KNOWN_DRIFT = [];
if (!Array.isArray(manifest.drift)) bad("manifest drift is not an array");
else {
  const unknown = manifest.drift.filter((d) => !KNOWN_DRIFT.includes(d));
  const gone = KNOWN_DRIFT.filter((d) => !manifest.drift.includes(d));
  if (unknown.length) bad(`new drift: ${unknown.join(" | ")}`);
  if (gone.length) bad(`known drift no longer reported (fixed? remove it from KNOWN_DRIFT): ${gone.join(" | ")}`);
  if (!unknown.length && !gone.length) ok(`${manifest.drift.length} known drift entries, all visible, no new drift`);
}

// 2. coverage
const rows = manifest.rows || [];
if (rows.length !== 16) bad(`expected 16 rows, manifest has ${rows.length}`);
else ok("16 rows");

// 3. every row still matches tool.js
for (const r of rows) {
  const c = ceil[r.code];
  if (!c) { bad(`${r.code} in manifest but not in tool.js CEIL`); continue; }
  const rate = Math.round(c.rate * 100) + "%";
  if (r.rate !== rate) bad(`${r.code} rate: manifest ${r.rate} != tool.js ${rate} - re-run make-audit.mjs`);
  const expected = r.code === "C07" ? nowRenda : c.base === "iva" ? potCap : c.cap;
  if (r.ceiling_eur !== expected)
    bad(`${r.code} ceiling: manifest ${r.ceiling_eur} != tool.js ${expected} - re-run make-audit.mjs`);
}
if (!fails) ok("every manifest row matches tool.js (rate + ceiling)");

// 3b. one personal-deduction comparison per code and year, with every mismatch in drift
const personal = manifest.personal || [];
if (personal.length !== Object.keys(ceil).length * 4) bad(`expected ${Object.keys(ceil).length * 4} personal rows, manifest has ${personal.length}`);
for (const r of personal) {
  const c = ceil[r.code], expectedCap = r.code === "C07" ? rendasAno[r.year] : c.base === "iva" ? potCap : c.cap;
  const rate = (taxaAno[r.code] || {})[r.year] ?? c.rate;
  if (r.tool_value.rate_pct !== Math.round(rate * 100) || r.tool_value.cap_eur !== expectedCap)
    bad(`${r.code} ${r.year}: personal tool value is stale`);
  if ("sector_in_force" in r.tool_value && r.tool_value.sector_in_force !== !(setorDesde[r.code] > Number(r.year)))
    bad(`${r.code} ${r.year}: personal sector_in_force is stale`);
  if (r.match !== (JSON.stringify(r.tool_value) === JSON.stringify(r.registry_value)))
    bad(`${r.code} ${r.year}: personal match flag is stale`);
  if (!r.match && !manifest.drift.some((d) => d.startsWith(`${r.code} ${r.year}:`)))
    bad(`${r.code} ${r.year}: mismatch is missing from drift`);
}
if (!fails) ok(`${personal.length} personal rows match tool.js and expose every mismatch`);

// 4. version stamp matches
const fb = (tool.match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1];
if (manifest.tool_version !== fb) bad(`manifest tool_version ${manifest.tool_version} != FB_VERSION ${fb} - stale, re-run make-audit.mjs`);

// 5. the expense and IVA rules on /auditoria are the registry's, year by year
const snap = JSON.parse(fs.readFileSync("year_snapshots.json", "utf8"));
const ry = Object.fromEntries(Object.keys(snap.years).map((y) => [y, snap.years[y].rules || {}]));
ry["2026"] = (snap.current_values_2026_verified_isolation || {}).rules || {};
const regKeys = [...new Set(Object.values(ry).flatMap((rs) => Object.keys(rs).filter((k) => rs[k] && rs[k].source_id)))].sort();
const manRules = manifest.rules || [];
if (manRules.map((r) => r.key).sort().join() !== regKeys.join()) bad(`manifest rules ${manRules.length} != registry rules ${regKeys.length} - re-run make-audit.mjs`);
for (const r of manRules)
  for (const [y, v] of Object.entries(r.years || {})) {
    const reg = ry[y] && ry[y][r.key];
    if (!reg || JSON.stringify(reg.value) !== JSON.stringify(v.value) || (reg.verified === true) !== v.verified)
      bad(`${r.key} ${y}: manifest ${JSON.stringify(v.value)} differs from year_snapshots - re-run make-audit.mjs`);
  }
if (!fails) ok(`${manRules.length} expense/IVA rules match year_snapshots for every year`);

console.log(fails ? `\n  ${fails} FAILED - audit-manifest.json is stale or inconsistent; run \`node make-audit.mjs\``
                  : "\n  audit-manifest.json is in sync with tool.js and keeps drift visible");
process.exit(fails ? 1 : 0);
