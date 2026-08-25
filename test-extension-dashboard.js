// The extension-owned dashboard renders a real session snapshot, filters it, and switches to a
// visibly fictional demo without fetching or persisting account data.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const html = readFileSync("extension/invoices.html", "utf8").replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
const src = readFileSync("extension/invoices.js", "utf8");
const dom = new JSDOM(html, { url: "chrome-extension://id/invoices.html", runScripts: "outside-only" });
const w = dom.window;
const snapshot = {
  version: 1, year: 2026, fetchedAt: "2026-08-23T12:00:00.000Z", expiresAt: Date.now() + 60000,
  complete: true, mapUnavailable: false, issuerSectors: { "500000009": ["C03", "C99"] },
  invoices: [
    { id: "a", date: "2026-08-20", issuerNif: "500000009", issuerName: "Farmácia & Companhia <img id=invoice-xss>", totalCents: 1200, vatCents: 100, status: "P", sector: "", scope: "profissional", activity: "Consultoria" },
    { id: "b", date: "2026-07-10", issuerNif: "500000009", issuerName: "Farmácia & Companhia <img id=invoice-xss>", totalCents: 800, vatCents: 50, status: "R", sector: "C03", scope: "pessoal", activity: "" }
  ]
};
let storageListener, messages = [], fetches = 0;
w.fetch = function () { fetches++; throw new Error("dashboard fetched"); };
w.chrome = {
  runtime: { getManifest() { return { version: "0.7.0.2", version_name: "0.7.0-dev.2" }; }, sendMessage(message, cb) { messages.push(message); if (cb) cb({ ok: true }); } },
  storage: {
    session: { get(key, cb) { cb({ [key]: snapshot }); }, remove() {} },
    onChanged: { addListener(fn) { storageListener = fn; } }
  }
};
w.eval(src);
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(storageListener, "dashboard did not listen for refreshed session snapshots");
assert(w.document.querySelectorAll(".issuer-card").length === 1, "issuer grouping failed");
assert(/2 faturas lidas/.test(w.document.getElementById("snapshot-status").textContent), "snapshot status missing");
assert(/Farmácia & Companhia/.test(w.document.getElementById("issuer-list").textContent), "issuer name not rendered safely");
assert(!w.document.getElementById("invoice-xss") && /<img id=invoice-xss>/.test(w.document.getElementById("issuer-list").textContent), "invoice text reached the dashboard as HTML");
assert(/C03 - Alojamento\/restauração/.test(w.document.getElementById("issuer-list").textContent), "C03 canonical sector label missing");
assert(!w.document.querySelector("a[target='_blank']"), "dashboard still opens navigation in a new tab");
w.document.getElementById("status-filter").value = "pending";
w.document.getElementById("status-filter").dispatchEvent(new w.Event("change"));
assert(/1 fatura/.test(w.document.getElementById("result-count").textContent), "pending filter failed");
w.document.querySelector(".official-link").click();
assert(messages.length === 1 && messages[0].type === "fb-return-to-efatura" && messages[0].invoice.id === "a", "invoice action did not request original-tab navigation");
w.document.getElementById("demo").click();
assert(!w.document.getElementById("demo-warning").hidden && /DADOS FICTÍCIOS/.test(w.document.body.textContent), "demo is not clearly labelled");
assert(fetches === 0 && messages.length === 1, "rendering or demo mode caused an external action");
console.log("  extension dashboard rendering and demo isolation passed");
