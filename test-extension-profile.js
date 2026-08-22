// Contribution choices on the extension-owned profile are independent, off by default and stored
// only in chrome.storage.local. Merely opening the page must not call the network.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const html = readFileSync("extension/profile.html", "utf8").replace(/<script src="profile\.js"><\/script>/, "");
const dom = new JSDOM(html, { url: "chrome-extension://test/profile.html", runScripts: "outside-only" });
const w = dom.window;
const state = {};
let fetches = 0;
w.fetch = () => { fetches++; throw new Error("profile page fetched unexpectedly"); };
w.chrome = { storage: { local: {
  get(keys, cb) { cb(Object.assign({}, state)); },
  set(value, cb) { Object.assign(state, value); if (cb) cb(); },
  remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete state[k]); if (cb) cb(); },
  clear(cb) { Object.keys(state).forEach((k) => delete state[k]); if (cb) cb(); }
}}};
w.eval(readFileSync("extension/profile.js", "utf8"));
const merchants = w.document.getElementById("share-merchants");
const shapes = w.document.getElementById("share-shapes");
if (merchants.checked || shapes.checked) throw new Error("contribution choice enabled by default");
merchants.checked = true; merchants.onchange();
shapes.checked = true; shapes.onchange();
const saved = state["fiscalidade-settings-v1"] || {};
if (saved.share !== true || saved.shareShapes !== true) throw new Error("independent choices not stored");
if (fetches !== 0) throw new Error("changing a preference uploaded data immediately");
console.log("  extension contribution choices are explicit and off by default");
