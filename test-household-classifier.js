// Household regression: merged totals must rebuild the classifier, while every PUT must continue
// to publish only this account's contribution (never the previously merged household total).
// Synthetic data and a fully mocked household service; no account or network access.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rows = [
  { estadoBeneficio: "R", nifEmitente: "500000301", nomeEmitente: "Education filler",
    actividadeEmitente: "C06", valorTotal: 256667, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-01", idDocumento: "base" },
  { estadoBeneficio: "P", nifEmitente: "500000302", nomeEmitente: "Pending",
    valorTotal: 10000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-02-01", idDocumento: "p1" },
];
const caemap = { "500000301": ["C06"], "500000302": ["C06", "C05"] };
const puts = [];
const merged = { C05: 0, C06: 800, C07: 0, C08: 0, C99: 0, POT: 0 };

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
global.fetch = (u, opt = {}) => {
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
  if (s.includes("/households/") && opt.method === "PUT") {
    puts.push(JSON.parse(opt.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }
  if (s.includes("/households/"))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ merged, members: 2 }) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}),
    text: () => Promise.resolve("") });
};
localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));

eval(fs.readFileSync(process.argv[2] || "tool.js", "utf8"));

function selected() {
  const x = (window.__efhPend || []).findIndex(r => r.idDocumento === "p1");
  const el = x >= 0 && document.querySelector('.efh-sec[data-i="' + x + '"]');
  return el && el.value;
}

setTimeout(() => {
  const before = selected();
  document.getElementById("efh-join").click();
  setTimeout(() => {
    const after = selected();
    const firstOwn = puts[0] && Math.abs(puts[0].C06 - 770) < 0.02;
    const joined = /2 membro/.test((document.getElementById("efh-hh") || {}).textContent || "");
    // Repeat the refresh from the rebuilt UI. The second PUT must still be EUR770, not merged EUR800.
    document.getElementById("efh-join").click();
    setTimeout(() => {
      const secondOwn = puts[1] && Math.abs(puts[1].C06 - 770) < 0.02;
      console.log("  account-only suggestion before merge is C06:", before === "C06");
      console.log("  merged full C06 ceiling rebuilds suggestion to C05:", after === "C05");
      console.log("  household status reflects merged snapshot:", joined);
      console.log("  first and repeated PUT remain account-only:", firstOwn && secondOwn);
      const pass = before === "C06" && after === "C05" && joined && firstOwn && secondOwn;
      console.log(pass ? "  PASS - household totals neither stale nor double-counted" : "  *** FAIL");
      if (!pass) process.exit(1);
    }, 700);
  }, 700);
}, 600);
