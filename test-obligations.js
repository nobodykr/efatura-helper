// Verifies deriveObligations() in perfil.html turns a detected profile into the right obligations,
// and attaches the real agenda deadline. Extracts the two pure functions from the page source and
// evals them (no DOM needed) so it tests the ACTUAL shipped code.
//   node test-obligations.js perfil.html
const fs = require("fs");
const src = fs.readFileSync(process.argv[2] || "perfil.html", "utf8");
let failures = 0;
function ok(name, cond) { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failures++; }

// pull the two functions out of the <script> by name
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  // balance braces from the first {
  let j = src.indexOf("{", i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (!depth) { k++; break; } } }
  return src.slice(i, k);
}
eval(grab("agendaMatch"));
eval(grab("deriveObligations"));

function titles(obs) { return obs.map(o => o.titulo); }

// Cat B + F + IMI, a debt, an SS not-regularized, and an agenda with an IRS deadline
const prof = {
  categorias: [{ cat: "B" }, { cat: "F" }, { cat: "IMI" }],
  detalhes: {
    efatura: { porClassificar: 8, totalFaturas: 40 },
    rendas: { activos: 1 },
    patrimonio: { imoveis: 2 },
    situacao: { dividas: { n: 1 }, agenda: { proximos: [{ data: "2026-06-30", desc: "Entrega da declaracao de IRS Modelo 3" }] } },
    ss: { estado: "NAO REGULARIZADA" }
  }
};
const obs = deriveObligations(prof);
const T = titles(obs);

ok("IRS annual present", T.includes("Entregar a declaração de IRS"));
ok("e-Fatura validation present", T.some(t => /Validar faturas/.test(t)));
ok("Cat B -> Anexo B", T.includes("IRS - Anexo B"));
ok("Cat B -> IVA", T.some(t => /IVA/.test(t)));
ok("Cat B -> Seguranca Social trimestral", T.some(t => /Segurança Social - trimestral/.test(t)));
ok("Cat F -> Anexo F", T.includes("IRS - Anexo F"));
ok("Cat F -> recibos de renda", T.some(t => /recibos de renda/.test(t)));
ok("IMI present", T.includes("IMI"));
ok("debt -> regularizar dividas", T.some(t => /Regularizar dívidas/.test(t)));
ok("SS not-regularized -> regularizar SS", T.some(t => /Regularizar Segurança Social/.test(t)));
const irsOb = obs.find(o => o.titulo === "Entregar a declaração de IRS");
ok("IRS obligation picked up the agenda deadline", irsOb && irsOb.prazo && irsOb.prazo.data === "2026-06-30");

// A bare consumer (no categories) still gets IRS + e-Fatura, nothing else
const bare = deriveObligations({ categorias: [], detalhes: { efatura: { porClassificar: 2 } } });
ok("bare profile: only IRS + e-Fatura", titles(bare).length === 2 && titles(bare).every(t => /IRS|Validar faturas/.test(t)));
// SS regularizada -> no regularize item
const reg = deriveObligations({ categorias: [], detalhes: { ss: { estado: "REGULARIZADA" } } });
ok("SS regularizada -> no regularize obligation", !titles(reg).some(t => /Regularizar Segurança/.test(t)));

console.log(failures ? ("\n  " + failures + " FAILED") : "\n  all passed");
process.exit(failures ? 1 : 0);
