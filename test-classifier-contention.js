// Pending classifications and attributed corrections share target ceilings. The headline must not
// let both claim the same remaining room. Synthetic: Education has EUR30 left; both a pending
// invoice and a C99 correction could consume it. Pending is reserved first, so total remains EUR30.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rows = [
  { estadoBeneficio: "R", nifEmitente: "500000401", nomeEmitente: "C99 filler",
    actividadeEmitente: "C99", valorTotal: 100000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-01", idDocumento: "c99base" },
  { estadoBeneficio: "R", nifEmitente: "500000402", nomeEmitente: "Correction candidate",
    actividadeEmitente: "C99", valorTotal: 10000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-02", idDocumento: "move" },
  { estadoBeneficio: "R", nifEmitente: "500000403", nomeEmitente: "Education filler",
    actividadeEmitente: "C06", valorTotal: 256667, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-03", idDocumento: "edubase" },
  { estadoBeneficio: "P", nifEmitente: "500000404", nomeEmitente: "Pending",
    valorTotal: 10000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-02-01", idDocumento: "pending" },
];
const caemap = {
  "500000401": ["C99"],
  "500000402": ["C06", "C99"],
  "500000403": ["C06"],
  "500000404": ["C06"],
};
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
  const resumo = (document.getElementById("efh-resumo") || {}).textContent || "";
  const onlyPending = ids.length === 1 && ids[0] === "pending";
  const totalThirty = /Podes recuperar\D*30\.00/.test(resumo);
  const noDouble = !/Podes recuperar\D*60\.00/.test(resumo);
  console.log("  only mandatory pending row claims the last C06 room:", onlyPending);
  console.log("  combined headline remains EUR30.00:", totalThirty && noDouble);
  const pass = onlyPending && totalThirty && noDouble;
  console.log(pass ? "  PASS - pending and corrections cannot double-spend a ceiling" : "  *** FAIL");
  if (!pass) process.exit(1);
}, 600);
