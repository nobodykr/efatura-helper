// The injected profile reader in extension mode must use only in-memory state before handing the
// summary to the service worker. It must never create a second copy in an official site's storage.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const src = readFileSync(process.argv[2], "utf8");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://faturas.portaldasfinancas.gov.pt/x"
});
const w = dom.window;
let storageTouches = 0;
const pageStorage = {
  getItem() { storageTouches++; throw new Error("official-page storage read"); },
  setItem() { storageTouches++; throw new Error("official-page storage write"); },
  removeItem() { storageTouches++; throw new Error("official-page storage removal"); }
};
Object.defineProperty(w, "localStorage", { configurable: true, value: pageStorage });
w.__FB_PROFILE = 1;
w.__FISCALIDADE_CONFIG__ = {
  extension: true, publicOrigin: "https://fiscalida.de", apiBase: "https://fiscalida.de/api/v1",
  extensionSettings: { shareShapes: true }
};
const messages = [];
const contributions = [];
const chromeMock = { runtime: { sendMessage(msg) { messages.push(msg); } } };
const jsonResponse = (body) => Promise.resolve({
  ok: true, headers: { get: () => "application/json" }, text: () => Promise.resolve(JSON.stringify(body))
});
function fetchMock(url) {
  if (/obterDocumentosAdquirente/.test(String(url)))
    return jsonResponse({ linhas: [], totalElementos: 0 });
  if (/\/api\/v1\/contributions\/shapes$/.test(String(url))) {
    contributions.push(JSON.parse(arguments[1].body));
    return Promise.resolve({ ok: true });
  }
  throw new Error("unexpected request: " + url);
}

global.window = w; global.document = w.document; global.location = w.location;
global.localStorage = pageStorage; global.navigator = w.navigator; global.DOMParser = w.DOMParser;
global.fetch = fetchMock; global.chrome = chromeMock; global.alert = () => {};
eval(src);

setTimeout(() => {
  if (storageTouches !== 0) throw new Error("extension profile touched official-page localStorage");
  const saved = messages.find((m) => m && m.type === "fb-profile-save" && m.partition === "efatura");
  if (!saved) throw new Error("extension profile was not handed to the service worker");
  if (!saved.data || saved.data.totalFaturas !== 0) throw new Error("unexpected extension profile payload");
  if (contributions.length !== 1 || contributions[0].consent !== true)
    throw new Error("explicit structure contribution was not sent exactly once");
  const keys = Object.keys(contributions[0].shapes || {});
  if (keys.length !== 1 || keys[0] !== "efatura.documents.v1")
    throw new Error("structure contribution did not use a stable endpoint ID");
  if (/obterDocumentos|portaldasfinancas|\d{9}/.test(JSON.stringify(contributions[0])))
    throw new Error("raw endpoint or identifier leaked in structure contribution");
  console.log("  extension tool kept profile out of official-page storage");
}, 1200);

