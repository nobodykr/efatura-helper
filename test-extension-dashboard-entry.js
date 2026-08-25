// The local invoice dashboard must be directly reachable from e-Fatura, including on the first
// consented read, and must not appear on unrelated profile partitions.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const bar = readFileSync("extension/bar.js", "utf8");
const contract = readFileSync("profile-contract.js", "utf8");

function harness(url) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, runScripts: "outside-only" });
  const w = dom.window;
  const state = {}, messages = [], opened = [];
  w.open = function (url) { opened.push(url); return { focus() {} }; };
  w.chrome = { runtime: { sendMessage(message) { messages.push(message); } }, storage: { local: {
    get(key, callback) { callback({}); },
    set(value, callback) { Object.assign(state, value); if (callback) callback(); }
  } } };
  w.eval(contract); w.eval(bar);
  return { w, state, messages, opened };
}
function button(w, label) {
  return [...w.document.querySelectorAll("button")].find((item) => item.textContent === label);
}
function assert(ok, message) { if (!ok) throw new Error(message); }

const efatura = harness("https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action");
const entry = button(efatura.w, "Painel de faturas");
assert(entry, "first-run e-Fatura bar is missing the invoice dashboard action");
entry.click();
assert(efatura.state["fiscalidade-consent-v1"]?.localAnalysis === true, "dashboard click did not record local-read consent");
assert(efatura.messages.length === 1 && efatura.messages[0].type === "fb-run" && efatura.messages[0].mode === "dashboard",
  "dashboard click did not request the isolated dashboard reader");
assert(efatura.opened.length === 0, "local invoice dashboard unnecessarily opened the public profile");

const rendas = harness("https://imoveis.portaldasfinancas.gov.pt/arrendamento/consultarContratos/locador");
assert(!button(rendas.w, "Painel de faturas"), "invoice dashboard action escaped onto a non-e-Fatura partition");
console.log("  first-run invoice dashboard entry is scoped to e-Fatura");
