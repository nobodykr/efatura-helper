// Service-worker gate: an allowed page still cannot inject tool.js without stored consent, and
// extension settings are passed only after that check.
const vm = require("vm");
const { readFileSync } = require("fs");
let listener;
let state = {};
const executions = [];
const writes = [];
const chrome = {
  runtime: { onMessage: { addListener(fn) { listener = fn; } }, getURL: (x) => "chrome-extension://id/" + x },
  tabs: { create() {} },
  scripting: { executeScript(spec) { executions.push(spec); return Promise.resolve(); } },
  storage: { local: {
    get(keys, cb) { cb(Object.assign({}, state)); },
    set(value, cb) { Object.assign(state, value); writes.push(value); if (cb) cb(); },
    remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete state[k]); }
  }}
};
vm.runInNewContext(readFileSync("extension/background.js", "utf8"), { chrome, URL, Set, Date, JSON, Object });
if (!listener) throw new Error("background listener not registered");
const sender = { tab: { id: 7, url: "https://faturas.portaldasfinancas.gov.pt/x" } };
listener({ type: "fb-run", mode: "profile" }, sender, () => {});
if (executions.length) throw new Error("tool injected without consent");
state["fiscalidade-consent-v1"] = { version: 1, localAnalysis: true };
state["fiscalidade-settings-v1"] = { wide: true };
listener({ type: "fb-run", mode: "profile" }, sender, () => {});

setTimeout(() => {
  if (executions.length !== 2 || !executions[0].func || executions[1].files[0] !== "tool.js")
    throw new Error("consented injection sequence is not config then packaged tool.js");
  if (executions[0].args[1].wide !== true) throw new Error("extension settings not passed to tool");
  const before = executions.length;
  listener({ type: "fb-run", mode: "profile" }, { tab: { id: 8, url: "https://example.com/" } }, () => {});
  if (executions.length !== before) throw new Error("disallowed sender injected the tool");
  listener({ type: "fb-settings-save", settings: { wide: false, secretUnexpected: "drop" } }, sender, () => {});
  const saved = writes[writes.length - 1]["fiscalidade-settings-v1"];
  if (saved.secretUnexpected !== undefined || saved.wide !== false) throw new Error("settings allowlist failed");
  console.log("  extension background consent and sender gates passed");
}, 0);
