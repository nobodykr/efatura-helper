// Closing the extension bar must affect only the current page. Re-evaluating bar.js (the toolbar
// action used by background.js) must recreate it even when an old persistent hide key exists.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const src = readFileSync("extension/bar.js", "utf8");
const contract = readFileSync("profile-contract.js", "utf8");
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
w.open = function () { return { focus() {} }; };
w.chrome = { runtime: { sendMessage(message) { messages.push(message); } }, storage: { local: {
  get(keys, callback) { callback(Object.assign({}, state)); },
  set(value, callback) { Object.assign(state, value); writes.push(value); if (callback) callback(); }
}}};

function assert(ok, message) { if (!ok) throw new Error(message); }
w.eval(contract); w.eval(src);
assert(w.document.getElementById("fb-ext-bar"), "legacy hidden key still suppresses the bar");
const close = w.document.querySelector('[aria-label="Fechar a barra Fiscalidade"]');
close.click();
assert(!w.document.getElementById("fb-ext-bar"), "close did not remove the current-page bar");
assert(writes.length === 0, "closing the bar persisted hidden state");
w.eval(src);
assert(w.document.getElementById("fb-ext-bar"), "bar could not be reopened on the same page");
w.eval(src);
assert(w.document.querySelectorAll("#fb-ext-bar").length === 1, "toolbar reopen duplicated the bar");
const read = [...w.document.querySelectorAll("button")].find((button) => /Ler e voltar/.test(button.textContent));
assert(read, "single guided read action missing after reopen");
const invoices = [...w.document.querySelectorAll("button")].find((button) => /Painel de faturas/.test(button.textContent));
assert(invoices, "e-Fatura invoice dashboard action missing after reopen");
read.click();
assert(messages.some((message) => message.type === "fb-run" && message.mode === "profile"), "guided action did not request a profile read");
invoices.click();
assert(messages.some((message) => message.type === "fb-run" && message.mode === "dashboard"), "invoice action did not request a dashboard read");
assert(![...w.document.querySelectorAll("button")].some((button) => /Adicionar ao perfil|Analisar faturas/.test(button.textContent)),
  "retired duplicate e-Fatura actions survived in the bar");
console.log("  extension close and toolbar reopen lifecycle passed");
