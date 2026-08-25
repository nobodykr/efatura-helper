// First-run privacy boundary for the content bar. Before consent it may read extension-owned
// storage and render controls, but must not inspect account state, use page storage, fetch, inject,
// navigate or send a runtime message.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");

const src = readFileSync("extension/bar.js", "utf8");
const contract = readFileSync("profile-contract.js", "utf8");
const dom = new JSDOM("<!doctype html><html><head></head><body><p id=account>private</p></body></html>", {
  url: "https://faturas.portaldasfinancas.gov.pt/x", runScripts: "outside-only"
});
const w = dom.window;
let fetches = 0, pageStorageReads = 0, messages = 0, writes = 0;
w.fetch = function () { fetches++; throw new Error("fetch before consent"); };
Object.defineProperty(w, "localStorage", { configurable: true, value: {
  getItem() { pageStorageReads++; throw new Error("page storage before consent"); },
  setItem() { pageStorageReads++; throw new Error("page storage before consent"); }
}});
const extensionState = {};
w.open = function () { return { focus() {} }; };
w.chrome = { runtime: { sendMessage() { messages++; } }, storage: { local: {
  get(keys, cb) { cb(Object.assign({}, extensionState)); },
  set(value, cb) { Object.assign(extensionState, value); writes++; if (cb) cb(); }
}}};
w.eval(contract); w.eval(src);

function assert(ok, message) { if (!ok) throw new Error(message); }
assert(fetches === 0, "bar fetched before consent");
assert(pageStorageReads === 0, "bar read official-page storage before consent");
assert(messages === 0, "bar messaged the background before a user action");
assert(writes === 0, "bar wrote extension state before a user action");
assert(/não lê esta página/.test(w.document.getElementById("fb-ext-summary").textContent), "consent copy missing");
assert(!w.document.querySelector('script[src],link[href^="http"],img[src^="http"]'), "remote asset inserted before consent");

const allow = [...w.document.querySelectorAll("button")].find((b) => /Ler e voltar/.test(b.textContent));
assert(allow, "first-run guided read button missing");
allow.click();
assert(writes === 1 && extensionState["fiscalidade-consent-v1"].localAnalysis === true, "consent not stored");
assert(fetches === 0 && pageStorageReads === 0 && messages === 1, "guided click did work outside the background gate");
console.log("  extension first-run boundary passed");
