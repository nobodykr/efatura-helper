// CROSS-CHECK: deducoes.html + DEDUCOES.md (what we TELL people)
//              == tool.js CEIL (what we COMPUTE with)
//              == year_snapshots.json (what we VERIFIED against the law).
//
//   node test-deducoes-sync.js
//
// WHY THIS EXISTS. The ceilings lived in three files with no tiebreaker, and both drifted:
// tool.js shipped C07 cap=900 (no year's real value) while the page said 502, and the page shipped
// 15% for passes/ginasios/jornais while the law (art. 78.o-F n.3/n.8/n.7, in force) says 100/30/100.
// Each error survived because nothing compared the three sources. On 2026-07-28 untangling them took
// two DRE passes and one retraction; this file turns that class of drift into a red X at commit time.
//
// The page is parsed with the same regex shape it is written in - if the table's HTML shape changes,
// this test FAILS LOUDLY rather than silently checking nothing (see the row-count assert).
const fs = require("fs");

const page = fs.readFileSync("deducoes.html", "utf8");
const markdown = fs.readFileSync("DEDUCOES.md", "utf8");
const tool = fs.readFileSync("tool.js", "utf8");
const snap = JSON.parse(fs.readFileSync("year_snapshots.json", "utf8"));

let fails = 0;
const bad = (msg) => { console.log("  FAIL " + msg); fails++; };
const ok = (msg) => console.log("  ok   " + msg);

/* ---- 1. parse the page table ------------------------------------------------------------- */
const rows = {};
const rowRe = /<td class="c">(C\d+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g;
for (let m; (m = rowRe.exec(page)); ) {
  const [, code, nome, valor, base] = m;
  const pct = (valor.match(/(\d+)%/) || [])[1];               // first rate on the row
  const capM = valor.replace(/\s/g, " ").match(/ate ([\d.,]+) ?&euro;/);
  rows[code] = { nome, pct: pct ? Number(pct) : null,
                 cap: capM ? Number(capM[1].replace(".", "").replace(",", ".")) : null,
                 iva: /do IVA/.test(valor), base };
}
if (Object.keys(rows).length !== 16)
  bad(`page table: expected 16 rows, parsed ${Object.keys(rows).length} - the HTML shape changed, fix the regex before trusting anything below`);
else ok("page table parsed: 16 rows");

/* ---- 1b. parse the Markdown table -------------------------------------------------------- */
const mdRows = {};
for (const line of markdown.split(/\r?\n/)) {
  const m = line.match(/^\|\s*(C\d+)\s*\|[^|]*\|\s*([^|]+?)\s*\|/);
  if (!m) continue;
  const value = m[2];
  const pct = (value.match(/(\d+)%/) || [])[1];
  const capM = value.match(/at[eé]\s+([\d.,]+)\s+EUR/i);
  mdRows[m[1]] = {
    pct: pct ? Number(pct) : null,
    cap: capM ? Number(capM[1].replace(".", "").replace(",", ".")) : null,
    iva: /do IVA/.test(value)
  };
}
if (Object.keys(mdRows).length !== 16)
  bad(`Markdown table: expected 16 rows, parsed ${Object.keys(mdRows).length}`);
else ok("Markdown table parsed: 16 rows");

if (!/C09 a C15/.test(page) || !/C09 a C15/.test(markdown))
  bad("shared IVA ceiling must explicitly include every sector through C15 in page and Markdown");
else ok("shared IVA ceiling includes C15 in page and Markdown");

for (const [code, r] of Object.entries(rows)) {
  const md = mdRows[code];
  if (!md) { bad(`${code} is on the page but missing from DEDUCOES.md`); continue; }
  if (r.pct !== md.pct) bad(`${code} rate: page says ${r.pct}%, Markdown says ${md.pct}%`);
  if (r.iva !== md.iva) bad(`${code} base differs between page and Markdown`);
  if (r.cap !== md.cap) bad(`${code} cap: page says ${r.cap}, Markdown says ${md.cap}`);
}
for (const code of Object.keys(mdRows))
  if (!rows[code]) bad(`${code} is in DEDUCOES.md but missing from the page`);

/* ---- 2. parse tool.js CEIL + RENDAS_CAP_ANO ---------------------------------------------- */
const ceil = {};
const ceilRe = /(C\d+): \{ rate: ([\d.]+), base: "(iva|total)"(?:, pot: POT)?(?:, cap: ([\d.]+))?(?:, perTaxpayer: true)?\s*\}/g;
for (let m; (m = ceilRe.exec(tool)); )
  ceil[m[1]] = { rate: Number(m[2]), base: m[3], cap: m[4] ? Number(m[4]) : null };
const rendasAno = {};
const raM = tool.match(/RENDAS_CAP_ANO = \{([^}]*)\}/);
if (raM) for (const [, y, v] of raM[1].matchAll(/(\d{4}): (\d+)/g)) rendasAno[y] = Number(v);
const potCap = Number((tool.match(/POT_CAP = (\d+)/) || [])[1]);
if (Object.keys(ceil).length < 15) bad(`tool.js CEIL: parsed only ${Object.keys(ceil).length} sectors - regex out of sync with the code`);
else ok(`tool.js parsed: ${Object.keys(ceil).length} CEIL sectors, POT_CAP=${potCap}, RENDAS_CAP_ANO ${JSON.stringify(rendasAno)}`);

/* ---- 3. page vs tool.js, sector by sector ------------------------------------------------ */
for (const [code, r] of Object.entries(rows)) {
  const c = ceil[code];
  if (!c) { bad(`${code} is on the page but not in tool.js CEIL`); continue; }
  if (r.pct !== null && Math.round(c.rate * 100) !== r.pct)
    bad(`${code} rate: page says ${r.pct}%, tool.js computes with ${c.rate * 100}%`);
  if (r.iva !== (c.base === "iva"))
    bad(`${code} base: page says ${r.iva ? "IVA" : "total"}, tool.js uses ${c.base}`);
  // caps: C99 is per-taxpayer 250 (page and tool agree by construction); pot sectors share POT_CAP
  if (r.cap !== null && c.cap !== null && r.cap !== c.cap)
    bad(`${code} cap: page says ${r.cap}, tool.js caps at ${c.cap}`);
}
for (const code of Object.keys(ceil))
  if (!rows[code]) bad(`${code} is in tool.js CEIL but missing from the page - users cannot see it exists`);

/* ---- 4. both vs year_snapshots (the DRE/AT-verified layer) ------------------------------- */
// current-year values (the flat CEIL caps) must match the LATEST snapshot trajectory
const nowYear = Object.keys(rendasAno).sort().pop();
const SNAP_MAP = { C05: ["saude", "ceiling"], C06: ["educacao", "ceiling"],
                   C08: ["lares", "ceiling"], C99: ["despesas_gerais", "ceiling"] };
const lastSnapYear = Object.keys(snap.years).sort().pop();
const rules = snap.years[lastSnapYear].rules;
for (const [code, [key, capField]] of Object.entries(SNAP_MAP)) {
  const s = rules[key];
  if (!s) { bad(`snapshot ${lastSnapYear} has no '${key}'`); continue; }
  if (Math.round(ceil[code].rate * 100) !== s.pct)
    bad(`${code} rate vs snapshot ${lastSnapYear}: tool ${ceil[code].rate * 100}% != verified ${s.pct}%`);
  if (ceil[code].cap !== null && ceil[code].cap !== s[capField])
    bad(`${code} cap vs snapshot ${lastSnapYear}: tool ${ceil[code].cap} != verified ${s[capField]}`);
}
// C07 per-year: snapshot base_ceiling must equal RENDAS_CAP_ANO for every stored year
for (const [y, blk] of Object.entries(snap.years)) {
  const v = blk.rules.imoveis_rendas && blk.rules.imoveis_rendas.base_ceiling;
  if (v == null) continue;
  if (rendasAno[y] == null) bad(`RENDAS_CAP_ANO has no entry for ${y} (snapshot says ${v})`);
  else if (rendasAno[y] !== v) bad(`C07 ${y}: RENDAS_CAP_ANO ${rendasAno[y]} != snapshot ${v}`);
}
// the flat C07 cap is the CURRENT-year value - it must equal the newest RENDAS_CAP_ANO entry
if (ceil.C07.cap !== rendasAno[nowYear])
  bad(`C07 flat cap ${ceil.C07.cap} != RENDAS_CAP_ANO[${nowYear}]=${rendasAno[nowYear]} - the current-year view disagrees with the year map`);
// the shared IVA pot
if ((rules.iva_conjunto || {}).ceiling !== potCap)
  bad(`POT_CAP ${potCap} != snapshot iva_conjunto ${(rules.iva_conjunto || {}).ceiling}`);

console.log(fails ? `\n  ${fails} FAILED - the four sources disagree; fix the DATA, not this test`
                  : "\n  page == Markdown == CEIL == year_snapshots: all four sources agree");
process.exit(fails ? 1 : 0);
