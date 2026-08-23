// Dashboard mode reuses the complete e-Fatura read, sends one normalized session snapshot and
// performs only the existing privacy-preserving sector-bucket lookup.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const src = readFileSync(process.argv[2], "utf8");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action"
});
const w = dom.window;
w.__FB_DASHBOARD = 1;
w.__FISCALIDADE_CONFIG__ = { extension: true, extensionSettings: {}, apiBase: "https://fiscalida.de/api/v1", offersUrl: "chrome-extension://id/offers.json" };
const requests = [], messages = [];
function response(body) { return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)), headers: { get: () => "application/json" } }); }
function fetchMock(url) {
  const value = String(url); requests.push(value);
  if (value.includes("obterDocumentosAdquirente.action")) return response({ linhas: [{
    idDocumento: "doc-1", dataEmissaoDocumento: "2026-08-22", nifEmitente: "500000009",
    nomeEmitente: "Farm&aacute;cia Teste", valorTotal: 1234, valorTotalIva: 100,
    estadoBeneficio: "R", actividadeEmitente: "C05"
  }], totalElementos: 1 });
  if (value.includes("/api/v1/map/buckets/009")) return response({ "500000009": ["C05", "C99"] });
  if (value.includes("offers.json")) return response({ offers: [] });
  throw new Error("unexpected request: " + value);
}
const chromeMock = { runtime: { sendMessage(message, callback) { messages.push(message); if (callback) callback({ ok: true }); } } };
global.window=w;global.document=w.document;global.location=w.location;global.navigator=w.navigator;
global.DOMParser=w.DOMParser;global.Event=w.Event;global.fetch=fetchMock;global.chrome=chromeMock;global.alert=()=>{};
eval(src);
setTimeout(() => {
  const message = messages.find((item) => item.type === "fb-invoice-snapshot");
  if (!message || message.snapshot.invoices.length !== 1) throw new Error("normalized snapshot missing");
  if (message.snapshot.invoices[0].issuerName !== "Farmácia Teste") throw new Error("issuer name was not decoded");
  if (message.snapshot.issuerSectors["500000009"].join(",") !== "C05,C99") throw new Error("existing bucket sectors missing");
  if (requests.some((url) => /\/nif\/500000009/.test(url))) throw new Error("exact-NIF dependency introduced");
  console.log("  extension dashboard snapshot reused the bucketed reader");
}, 1200);
