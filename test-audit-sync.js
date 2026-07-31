// Guards audit-manifest.json against drift and staleness: it must have ZERO recorded drift, cover
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

// 1. no drift
if (Array.isArray(manifest.drift) && manifest.drift.length)
  bad(`audit-manifest.json records ${manifest.drift.length} drift: ${manifest.drift.join(" | ")}`);
else ok("no drift recorded");

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

// 4. version stamp matches
const fb = (tool.match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1];
if (manifest.tool_version !== fb) bad(`manifest tool_version ${manifest.tool_version} != FB_VERSION ${fb} - stale, re-run make-audit.mjs`);

console.log(fails ? `\n  ${fails} FAILED - audit-manifest.json is stale or inconsistent; run \`node make-audit.mjs\``
                  : "\n  audit-manifest.json is in sync with tool.js and drift-free");
process.exit(fails ? 1 : 0);
