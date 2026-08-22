// Regression proof that a correction's recoverable amount is NET of deduction lost in its source.
// Synthetic setup: C99 currently contributes EUR260. Moving a EUR100 invoice to Education adds
// EUR30 there but drops C99 from its EUR250 cap to EUR225, losing EUR25. Net recovery = EUR5.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rows = [
  { estadoBeneficio: "R", nifEmitente: "500000201", nomeEmitente: "C99 base",
    actividadeEmitente: "C99", valorTotal: 64286, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-01", idDocumento: "base" },
  { estadoBeneficio: "R", nifEmitente: "500000202", nomeEmitente: "Movable",
    actividadeEmitente: "C99", valorTotal: 10000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-02", idDocumento: "move" },
];
const caemap = { "500000201": ["C99"], "500000202": ["C06", "C99"] };
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://faturas.portaldasfinancas.gov.pt/x",
});
const { window } = dom;
global.window = window; global.document = window.document; global.location = window.location;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = v; },
};
window.localStorage = global.localStorage;
global.crypto = { getRandomValues: a => a, subtle: {} };
global.TextEncoder = require("util").TextEncoder;
global.DOMParser = window.DOMParser; global.alert = () => {};
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.fetch = (u) => {
  const s = String(u);
  if (s.includes("/api/v1/map/buckets/")) {
    const bucket = s.split("/api/v1/map/buckets/")[1].split("?")[0];
    const out = {};
    for (const nif in caemap) if (nif.slice(-3) === bucket) out[nif] = caemap[nif];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(out) });
  }
  if (s.includes("obterDocumentosAdquirente"))
    return Promise.resolve({ ok: true, headers: { get: () => "application/json" },
      text: () => Promise.resolve(JSON.stringify({ linhas: rows })) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}),
    text: () => Promise.resolve("") });
};
localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));

eval(fs.readFileSync(process.argv[2] || "tool.js", "utf8"));

setTimeout(() => {
  const actionable = window.__efhPend || [];
  const ids = actionable.map(x => x.idDocumento);
  const i = ids.indexOf("move");
  const selected = i >= 0 && document.querySelector('.efh-sec[data-i="' + i + '"]').value;
  const resumo = (document.getElementById("efh-resumo") || {}).textContent || "";
  const netFive = /Podes recuperar\D*5\.00/.test(resumo);
  const notGrossThirty = !/Podes recuperar\D*30\.00/.test(resumo);
  console.log("  correction surfaced to C06:", selected === "C06");
  console.log("  recoverable is net EUR5.00:", netFive);
  console.log("  gross target EUR30.00 is not claimed:", notGrossThirty);
  const pass = selected === "C06" && netFive && notGrossThirty;
  console.log(pass ? "  PASS - source deduction loss is included" : "  *** FAIL");
  if (!pass) process.exit(1);
}, 600);
