// Closing the extension bar must affect only the current page. Re-evaluating bar.js (the toolbar
// action used by background.js) must recreate it even when an old persistent hide key exists.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const src = readFileSync("extension/bar.js", "utf8");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action",
  runScripts: "outside-only"
});
const w = dom.window;
const state = {
  "fiscalidade-consent-v1": { version: 1, localAnalysis: true },
  "fiscalidade-bar-hidden-v1": true
};
const messages = [], writes = [];
w.chrome = { runtime: { sendMessage(message) { messages.push(message); } }, storage: { local: {
  get(keys, callback) { callback(Object.assign({}, state)); },
  set(value, callback) { Object.assign(state, value); writes.push(value); if (callback) callback(); }
}}};

function assert(ok, message) { if (!ok) throw new Error(message); }
w.eval(src);
assert(w.document.getElementById("fb-ext-bar"), "legacy hidden key still suppresses the bar");
const close = w.document.querySelector('[aria-label="Fechar a barra Fiscalidade"]');
close.click();
assert(!w.document.getElementById("fb-ext-bar"), "close did not remove the current-page bar");
assert(writes.length === 0, "closing the bar persisted hidden state");
w.eval(src);
assert(w.document.getElementById("fb-ext-bar"), "bar could not be reopened on the same page");
w.eval(src);
assert(w.document.querySelectorAll("#fb-ext-bar").length === 1, "toolbar reopen duplicated the bar");
const dashboard = [...w.document.querySelectorAll("button")].find((button) => /Painel de faturas/.test(button.textContent));
assert(dashboard, "dashboard action missing after reopen");
dashboard.click();
assert(messages.some((message) => message.type === "fb-run" && message.mode === "dashboard"), "dashboard action did not request a read");
console.log("  extension close and toolbar reopen lifecycle passed");
