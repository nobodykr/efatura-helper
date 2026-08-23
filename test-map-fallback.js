// A public merchant-map outage must not erase a successful e-Fatura read or blame the login.
// The classifier continues from local history/defaults and labels that reduced evidence clearly.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");

const row = {
  estadoBeneficio: "P", nifEmitente: "500000009", nomeEmitente: "Fixture",
  valorTotal: 1000, valorTotalIva: 230, dataEmissaoDocumento: "2026-08-01", idDocumento: "map-down-1"
};
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://faturas.portaldasfinancas.gov.pt/x"
});
const w = dom.window;
global.window = w; global.document = w.document; global.location = w.location;
global.navigator = w.navigator; global.DOMParser = w.DOMParser; global.alert = () => {};
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }
};
w.localStorage = global.localStorage;
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));
global.fetch = (url) => {
  const value = String(url);
  if (value.includes("/api/v1/map/buckets/")) return Promise.reject(new TypeError("Failed to fetch"));
  if (value.endsWith("offers.json")) return Promise.reject(new TypeError("Failed to fetch"));
  if (value.includes("obterDocumentosAdquirente")) return Promise.resolve({
    ok: true, headers: { get: () => "application/json" },
    text: () => Promise.resolve(JSON.stringify({ linhas: [row], totalElementos: 1 }))
  });
  throw new Error("unexpected request " + value);
};

eval(readFileSync(process.argv[2] || "tool.js", "utf8"));

setTimeout(() => {
  const body = (document.getElementById("efh-body") || {}).textContent || "";
  const rows = w.__efhPend || [];
  const warning = document.getElementById("efh-map-warning");
  const pass = rows.length === 1 && !!warning && /Faturas lidas/.test(body) &&
    /mapa p\u00fablico de atividades/.test(body) && !/Erro a ler faturas/.test(body);
  console.log("  successful invoice read survives merchant-map outage:", rows.length === 1);
  console.log("  degraded evidence is labelled in the widget:", !!warning);
  console.log("  login is not blamed for the optional outage:", !/Erro a ler faturas/.test(body));
  dom.window.close();
  if (!pass) process.exit(1);
}, 1200);
