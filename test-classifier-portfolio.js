// Regression proof for the classifier portfolio:
//   - pending suggestions reserve shared ceiling room instead of spending it repeatedly;
//   - C99 uses the 45% monoparental rate.
// All invoice and merchant data below is synthetic; fetch is fully mocked.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rows = [
  // 30% of EUR2566.67 = EUR770.00 already used in Education, leaving EUR30.
  { estadoBeneficio: "R", nifEmitente: "500000101", nomeEmitente: "Education filler",
    actividadeEmitente: "C06", valorTotal: 256667, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-01", idDocumento: "base" },
  { estadoBeneficio: "P", nifEmitente: "500000102", nomeEmitente: "Pending one",
    valorTotal: 10000, valorTotalIva: 0, dataEmissaoDocumento: "2026-02-01", idDocumento: "p1" },
  { estadoBeneficio: "P", nifEmitente: "500000103", nomeEmitente: "Pending two",
    valorTotal: 10000, valorTotalIva: 0, dataEmissaoDocumento: "2026-02-02", idDocumento: "p2" },
  { estadoBeneficio: "P", nifEmitente: "500000104", nomeEmitente: "Pending general",
    valorTotal: 10000, valorTotalIva: 0, dataEmissaoDocumento: "2026-02-03", idDocumento: "p3" },
];
const caemap = {
  "500000101": ["C06"],
  "500000102": ["C06", "C05"],
  "500000103": ["C06", "C05"],
  "500000104": ["C99"],
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
localStorage.setItem("efh-profile", JSON.stringify({ mono: true, joint: false }));

eval(fs.readFileSync(process.argv[2] || "tool.js", "utf8"));

setTimeout(() => {
  const actionable = window.__efhPend || [];
  const selected = {};
  actionable.forEach((x, i) => {
    const el = document.querySelector('.efh-sec[data-i="' + i + '"]');
    selected[x.idDocumento] = el && el.value;
  });
  const splitRoom = selected.p1 === "C06" && selected.p2 === "C05";
  const monoC99 = selected.p3 === "C99";
  const resumo = (document.getElementById("efh-resumo") || {}).textContent || "";
  // EUR30 education + EUR15 health + EUR45 monoparental general expenses.
  const totalIs90 = /Podes recuperar\D*90\.00/.test(resumo);
  console.log("  scarce C06 room allocated once, next invoice falls to C05:", splitRoom);
  console.log("  monoparental C99 candidate retained:", monoC99);
  console.log("  portfolio total uses 45% C99 rate (EUR90.00 total):", totalIs90);
  const pass = splitRoom && monoC99 && totalIs90;
  console.log(pass ? "  PASS - pending suggestions share one ceiling budget" : "  *** FAIL");
  if (!pass) process.exit(1);
}, 600);
