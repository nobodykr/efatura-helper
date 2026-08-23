// Contribution choices on the extension-owned profile are independent, off by default and stored
// only in chrome.storage.local. Merely opening the page must not call the network.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const html = readFileSync("extension/profile.html", "utf8").replace(/<script src="profile\.js"><\/script>/, "");
const dom = new JSDOM(html, { url: "chrome-extension://test/profile.html", runScripts: "outside-only" });
const w = dom.window;
const state = {};
const sessionState = { "fatura-boa-invoice-snapshot-v1": { version: 1 } };
let fetches = 0;
let opened = "";
const runtimeMessages = [];
w.fetch = () => { fetches++; throw new Error("profile page fetched unexpectedly"); };
w.chrome = { runtime: {
  getURL(path) { return "chrome-extension://test/" + path; },
  getManifest() { return { version: "0.7.0.2", version_name: "0.7.0-dev.2" }; },
  sendMessage(message) { runtimeMessages.push(message); }
}, tabs: { create(value) { opened = value.url; } }, storage: {
  local: {
    get(keys, cb) { cb(Object.assign({}, state)); },
    set(value, cb) { Object.assign(state, value); if (cb) cb(); },
    remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete state[k]); if (cb) cb(); },
    clear(cb) { Object.keys(state).forEach((k) => delete state[k]); if (cb) cb(); }
  },
  session: { remove(key, cb) { delete sessionState[key]; if (cb) cb(); } }
}};
w.eval(readFileSync("extension/crc-parser.js", "utf8"));
w.eval(readFileSync("extension/profile.js", "utf8"));
const merchants = w.document.getElementById("share-merchants");
const shapes = w.document.getElementById("share-shapes");
if (merchants.checked || shapes.checked) throw new Error("contribution choice enabled by default");
merchants.checked = true; merchants.onchange();
shapes.checked = true; shapes.onchange();
const saved = state["fiscalidade-settings-v1"] || {};
if (saved.share !== true || saved.shareShapes !== true) throw new Error("independent choices not stored");
if (fetches !== 0) throw new Error("changing a preference uploaded data immediately");
w.document.getElementById("return-efatura-profile").onclick();
if (runtimeMessages.length !== 1 || runtimeMessages[0].type !== "fb-return-to-efatura") throw new Error("profile navigation did not return through the reusable e-Fatura tab");
w.document.getElementById("open-crc").onclick();
if (opened !== "https://www.bportugal.pt/area-cidadao/formulario/227") throw new Error("CRC button did not open the reviewed official page");
w.FiscalidadeCrcProfile.storeCrcSummary({
  schema: "credit-responsibilities.v1", source: "bportugal-crc", reference_month: "2026-07",
  effective_debt_eur: 99371.01, overdue_debt_eur: 0, potential_credit_eur: 15550,
  contracts: 6, institutions: 1, roles: { debtor_present: true, guarantor_present: false },
  flags: { arrears: false, judicial: null, renegotiated: null }, parsed_at: "2026-08-23T12:00:00.000Z",
  filename: "must-not-survive.pdf", raw_text: "must-not-survive", nif: "must-not-survive"
});
const profile = state["fiscalidade-profile-v1"];
const storedText = JSON.stringify(profile);
if (!profile || profile.version !== 1 || !profile.documents.crc) throw new Error("CRC summary was not stored in the local profile");
if (/must-not-survive|filename|raw_text|nif/.test(storedText)) throw new Error("CRC file metadata, text or identifier survived storage sanitization");
const localEnd = new Date(); localEnd.setHours(23, 59, 59, 999);
if (profile.expiresAt > localEnd.getTime() || profile.expiresAt <= Date.now()) throw new Error("CRC summary retention is not bounded by the local day");
const summaryText = w.document.getElementById("crc-summary").textContent;
if (!/Dívida efetiva/.test(summaryText) || !/Crédito potencial não é dívida utilizada/.test(summaryText)) throw new Error("CRC debt and potential credit are not clearly distinguished");
if (fetches !== 0) throw new Error("CRC import contacted a remote service");
w.document.getElementById("erase").click();
if (sessionState["fatura-boa-invoice-snapshot-v1"]) throw new Error("manual erase retained the invoice dashboard snapshot");
console.log("  extension choices and CRC summary remain explicit, local and end-of-day only");
