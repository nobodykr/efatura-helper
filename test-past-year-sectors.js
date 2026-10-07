// A past-year re-audit must use the art. 78.o-F wording of THAT income year: C11 ginasios at 15%
// in 2023 (30% only from 2024), and C13 livros, C14 artes, C15 museus offered only from 2026.
// Runs the real tool.js functions (extracted by name), not a copy of their logic.
const fs = require("fs");
const vm = require("vm");

let fails = 0;
const bad = (m) => { console.log("  FAIL " + m); fails++; };
const ok = (m) => console.log("  ok   " + m);

const src = fs.readFileSync(process.argv[2] || "tool.js", "utf8");
// One top-level statement starting at `head`, up to its balanced closing brace.
function block(head) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error("not found in tool.js: " + head);
  let i = src.indexOf("{", at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(at, i + 1) + ";";
}
const line = (head) => { const at = src.indexOf(head); return src.slice(at, src.indexOf("\n", at)); };
const code = [line("var POT = "), block("var CEIL = {"), line("var POT_CAP = "),
  line("var SETOR_DESDE = "), line("var TAXA_ANO = "), line("function emVigor("), line("function taxaAno("),
  line("function c99Rate("), block("function capFor("), block("function deductionFor("),
  block("function usedSoFar("), line("function isAttributed("), block("function movablesAndRecoverable(")].join("\n");
const t = {};
vm.runInNewContext(code + "\nthis.usedSoFar = usedSoFar; this.mr = movablesAndRecoverable;", t);

// One registered C11 invoice: 10,00 EUR of VAT.
const gym = [{ actividadeEmitente: "C11", estadoBeneficio: "R", valorTotalIva: 1000, valorTotal: 5348, nifEmitente: "500000001" }];
const g23 = t.usedSoFar(gym, {}, 2023).iva78F, g24 = t.usedSoFar(gym, {}, 2024).iva78F;
if (Math.abs(g23 - 1.5) > 1e-9) bad(`C11 2023 deve deduzir 15% do IVA (1,50), deu ${g23}`); else ok("C11 em 2023: 15% (78.º-F n.º 1 f))");
if (Math.abs(g24 - 3) > 1e-9) bad(`C11 2024 deve deduzir 30% do IVA (3,00), deu ${g24}`); else ok("C11 a partir de 2024: 30% (78.º-F n.º 8)");

// A C99 invoice from a bookshop (CAE maps to C13), with C99 already over its 250 EUR ceiling so the
// move costs nothing there. Moving it to C13 only exists from 2026.
const book = [{ actividadeEmitente: "C99", estadoBeneficio: "R", valorTotalIva: 600, valorTotal: 10600, nifEmitente: "500000002" },
  { actividadeEmitente: "C99", estadoBeneficio: "R", valorTotalIva: 0, valorTotal: 100000, nifEmitente: "500000003" }];
const map = { "500000002": ["C13"] };
for (const [ano, want] of [[2023, 0], [2024, 0], [2025, 0], [2026, 1], [undefined, 1]]) {
  const n = t.mr(book, map, {}, null, null, ano).movR.length;
  const label = ano === undefined ? "ano corrente" : String(ano);
  if (n !== want) bad(`C13 ${label}: esperava ${want} movimento(s), deu ${n}`);
  else ok(`C13 ${label}: ${want ? "oferecido" : "não oferecido (só desde 2026)"}`);
}

console.log(fails ? `\n  ${fails} FALHA(S) nos setores por ano` : "\n  re-auditoria usa a redação de cada ano");
process.exit(fails ? 1 : 0);
