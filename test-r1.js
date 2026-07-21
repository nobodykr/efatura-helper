// R1 safety proof: already-attributed rows are surfaced for CORRECTION only when a different
// REGISTERED sector genuinely pays more. A C99-only merchant (no alternative) must NEVER appear -
// that is the "declare groceries as Saude" footgun the whole design guards against.
//   npm i jsdom && node test-r1.js [path-to-tool.js]
const { JSDOM } = require("jsdom"); const fs = require("fs");

// Rows are all already-attributed (R). Big C99 invoice fills the 250 despesas-gerais cap, so a
// further C99 invoice earns nothing at C99 - and the optimiser moves it iff a registered
// alternative has room.
const rows = [
  { estadoBeneficio: "R", nifEmitente: "1", nomeEmitente: "C99 grande", actividadeEmitente: "C99",
    valorTotal: 200000, valorTotalIva: 0, dataEmissaoDocumento: "2026-01-01", idDocumento: "a" },
  { estadoBeneficio: "R", nifEmitente: "2", nomeEmitente: "Tem C05 tambem", actividadeEmitente: "C99",
    valorTotal: 100000, valorTotalIva: 0, dataEmissaoDocumento: "2026-01-02", idDocumento: "b" },
  { estadoBeneficio: "R", nifEmitente: "3", nomeEmitente: "So C99", actividadeEmitente: "C99",
    valorTotal: 50000, valorTotalIva: 0, dataEmissaoDocumento: "2026-01-03", idDocumento: "c" },
];
// merchant 2 is registered for C05 as well as C99; 1 and 3 are C99-only
const caemap = { "1": ["C99"], "2": ["C05", "C99"], "3": ["C99"] };

const dom = new JSDOM("<!doctype html><body></body>", { url: "https://faturas.portaldasfinancas.gov.pt/x" });
const { window } = dom;
global.window = window; global.document = window.document; global.location = window.location;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
window.localStorage = global.localStorage;
global.crypto = { getRandomValues: a => a, subtle: {} };
global.TextEncoder = require("util").TextEncoder;
global.DOMParser = window.DOMParser; global.alert = () => {};
global.fetch = (u) => {
  const s = String(u);
  if (s.includes("sectors.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(caemap) });
  if (s.includes("obterDocumentosAdquirente")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ linhas: rows }) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
};
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));
eval(fs.readFileSync(process.argv[2] || "/mnt/data/apps/efatura-helper/tool.js", "utf8"));

setTimeout(() => {
  const d = window.document;
  const pend = window.__efhPend || [];
  const ids = pend.map(x => x.idDocumento);
  console.log("  actionable ids:", ids.join(", ") || "(none)");
  const hasB = ids.includes("b");
  const noA = !ids.includes("a");
  const noC = !ids.includes("c");
  console.log("  movable C99->C05 row 'b' surfaced:", hasB);
  console.log("  C99-only row 'a' (fills cap) NOT surfaced:", noA);
  console.log("  C99-only row 'c' (no alternative) NOT surfaced:", noC, "<- the footgun guard");

  // and row b must pre-select C05, with the 'corrigir' badge
  let bPre = null, badge = false;
  if (hasB) {
    const i = ids.indexOf("b");
    const sel = d.querySelector('.efh-sec[data-i="' + i + '"]');
    bPre = sel && sel.value;
    badge = /corrigir/.test(d.querySelector("#efh-pane-d").innerHTML);
  }
  console.log("  row 'b' pre-selected sector:", bPre, "(expected C05)");
  console.log("  'corrigir' badge present:", badge);

  // The recoverable number MUST be the movable gain (b -> C05 = 15% of 1000 = 150), NOT the raw
  // C99 overflow (o.wasted = 1225-250 = 975). Showing the overflow was the bug the user caught.
  const resumo = (d.getElementById("efh-resumo") || {}).textContent || "";
  const showsRecoverable = /Podes recuperar\D*150/.test(resumo);
  const noOverflowClaim = !/975/.test(resumo);   // must not present the overflow as recoverable
  console.log("  Resumo recoverable = movable gain (~150), not overflow:", showsRecoverable);
  console.log("  overflow (975) NOT shown as recoverable:", noOverflowClaim);

  const pass = hasB && noA && noC && bPre === "C05" && badge && showsRecoverable && noOverflowClaim;
  console.log(pass ? "  PASS - only genuinely movable rows offered, recoverable is the real gain"
                   : "  *** FAIL");
  if (!pass) process.exit(1);
}, 500);
