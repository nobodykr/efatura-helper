// Verifies reAudit() in perfil.html: given a year's ceilings + per-category spend, computes how much
// of each deduction ceiling is still free (recoverable). Extracts the pure function from the page
// source and evals it, so it tests the ACTUAL shipped code.
//   node test-reaudit.js perfil.html
const fs = require("fs");
const src = fs.readFileSync(process.argv[2] || "perfil.html", "utf8");
let failures = 0;
function ok(name, cond) { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failures++; }
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  let j = src.indexOf("{", i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (!depth) { k++; break; } } }
  return src.slice(i, k);
}
eval(grab("reAudit"));

// A 2024-shaped rules object (verified values from year_snapshots.json)
const rules2024 = {
  despesas_gerais: { pct: 35, ceiling: 250 },
  saude: { pct: 15, ceiling: 1000 },
  educacao: { pct: 30, ceiling: 800 },
  imoveis_rendas: { pct: 15, base_ceiling: 600 },   // uses base_ceiling, not ceiling
  lares: { pct: 25, ceiling: 403.75 },
  iva_conjunto: { pct: 15, ceiling: 250 },
  unsourced: { pct: null, ceiling: null },           // must be skipped
};

// saude: spend 3000 -> deductible min(1000, 15%*3000=450)=450, headroom 550, PARCIAL
let a = reAudit(rules2024, { saude: 3000 });
let saude = a.rows.find(r => r.cat === "saude");
ok("saude deductible = 450 (15% of 3000, under 1000 cap)", saude.deductible === 450);
ok("saude headroom = 550", saude.headroom === 550);
ok("saude status PARCIAL", saude.status === "PARCIAL");

// saude maxed: spend 10000 -> deductible capped at 1000, headroom 0, MAXED
let b = reAudit(rules2024, { saude: 10000 });
let saudeMax = b.rows.find(r => r.cat === "saude");
ok("saude capped at 1000 when 15% exceeds it", saudeMax.deductible === 1000);
ok("saude headroom 0 when maxed", saudeMax.headroom === 0);
ok("saude status MAXED", saudeMax.status === "MAXED");

// educacao untouched -> VAZIO, full headroom 800
let edu = reAudit(rules2024, {}).rows.find(r => r.cat === "educacao");
ok("educacao VAZIO when no spend", edu.status === "VAZIO");
ok("educacao headroom = full 800", edu.headroom === 800);

// despesas gerais: spend 1000 -> 35% = 350 > 250 cap -> deductible 250, MAXED
let dg = reAudit(rules2024, { despesas_gerais: 1000 }).rows.find(r => r.cat === "despesas_gerais");
ok("despesas gerais capped at 250", dg.deductible === 250 && dg.status === "MAXED");

// rendas uses base_ceiling (600) not ceiling
let rd = reAudit(rules2024, { imoveis_rendas: 1000 }).rows.find(r => r.cat === "imoveis_rendas");
ok("rendas reads base_ceiling 600", rd.ceiling === 600);

// unsourced category is skipped entirely
ok("unsourced category skipped", !reAudit(rules2024, {}).rows.find(r => r.cat === "unsourced"));

// totalHeadroom sums the free room across categories
let all = reAudit(rules2024, { saude: 3000 });   // saude 550 free, everything else full
const expected = 250 + 550 + 800 + 600 + 403.75 + 250;
ok("totalHeadroom sums free room (" + expected + ")", Math.abs(all.totalHeadroom - expected) < 0.01);

console.log(failures ? ("\n  " + failures + " FAILED") : "\n  all re-audit tests passed");
process.exit(failures ? 1 : 0);
