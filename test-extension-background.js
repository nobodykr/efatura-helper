// Service-worker gate: an allowed page still cannot inject tool.js without stored consent, and
// extension settings are passed only after that check.
const vm = require("vm");
const { readFileSync } = require("fs");
let listener;
let state = {};
let sessionState = {};
const executions = [];
const writes = [];
const tabUpdates = [];
const tabCreates = [];
let actionListener;
let alarmListener;
let sessionAccessLevel;
let sessionWriteFails = false;
const alarms = {};
const chrome = {
  runtime: {
    id: "id",
    get lastError() { return sessionWriteFails ? { message: "quota" } : undefined; },
    onMessage: { addListener(fn) { listener = fn; } },
    onInstalled: { addListener() {} },
    getURL: (x) => "chrome-extension://id/" + x
  },
  action: { onClicked: { addListener(fn) { actionListener = fn; } } },
  tabs: {
    create(spec, cb) { tabCreates.push(spec); if (cb) cb({ id: 99, url: spec.url }); },
    query(query, cb) {
      if (String(query.url || "").startsWith("https://faturas.portaldasfinancas.gov.pt/"))
        cb([{ id: 7, url: "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action", active: false },
          { id: 9, url: "https://faturas.portaldasfinancas.gov.pt/x", active: true }]);
      else cb([]);
    },
    update(id, spec, cb) { tabUpdates.push({ id, spec }); if (cb) cb({ id, url: spec.url }); }
  },
  scripting: { executeScript(spec) { executions.push(spec); return Promise.resolve(); } },
  alarms: {
    create(name, info) { alarms[name] = info; },
    clear(name) { delete alarms[name]; },
    onAlarm: { addListener(fn) { alarmListener = fn; } }
  },
  storage: {
    local: {
      get(keys, cb) { cb(Object.assign({}, state)); },
      set(value, cb) { Object.assign(state, value); writes.push(value); if (cb) cb(); },
      remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete state[k]); }
    },
    session: {
      get(key, cb) { cb({ [key]: sessionState[key] }); },
      set(value, cb) { if (!sessionWriteFails) Object.assign(sessionState, value); if (cb) cb(); },
      remove(key, cb) { delete sessionState[key]; if (cb) cb(); },
      setAccessLevel(value) { sessionAccessLevel = value.accessLevel; return Promise.resolve(); }
    }
  }
};
vm.runInNewContext(readFileSync("extension/background.js", "utf8"), { chrome, URL, Set, Date, JSON, Object, Array });
if (!listener) throw new Error("background listener not registered");
if (!actionListener) throw new Error("toolbar reopen listener not registered");
if (!alarmListener || sessionAccessLevel !== "TRUSTED_CONTEXTS") throw new Error("session snapshot hardening was not initialized");
const sender = { id: "id", frameId: 0, url: "https://faturas.portaldasfinancas.gov.pt/x",
  tab: { id: 7, url: "https://faturas.portaldasfinancas.gov.pt/x" } };
listener({ type: "fb-run", mode: "profile" }, sender, () => {});
if (executions.length) throw new Error("tool injected without consent");
state["fiscalidade-consent-v1"] = { version: 1, localAnalysis: true };
state["fiscalidade-settings-v1"] = { wide: true };
listener({ type: "fb-run", mode: "profile" }, sender, () => {});

setTimeout(() => {
  if (executions.length !== 3 || !executions[0].func ||
      executions[1].files[0] !== "profile-contract.js" || executions[2].files[0] !== "tool.js")
    throw new Error("consented injection sequence is not config, contract, then packaged tool.js");
  if (executions[0].args[1].wide !== true) throw new Error("extension settings not passed to tool");
  const before = executions.length;
  listener({ type: "fb-run", mode: "profile" }, { id: "id", frameId: 0, url: "https://example.com/", tab: { id: 8, url: "https://example.com/" } }, () => {});
  if (executions.length !== before) throw new Error("disallowed sender injected the tool");
  listener({ type: "fb-run", mode: "profile" }, { id: "id", frameId: 0, url: "http://faturas.portaldasfinancas.gov.pt/", tab: { id: 8, url: "http://faturas.portaldasfinancas.gov.pt/" } }, () => {});
  if (executions.length !== before) throw new Error("non-HTTPS sender injected the tool");
  listener({ type: "fb-run", mode: "profile" }, { ...sender, id: "attacker" }, () => {});
  listener({ type: "fb-run", mode: "profile" }, { ...sender, frameId: 2 }, () => {});
  listener({ type: "fb-run", mode: "profile" }, { ...sender, url: "https://faturas.portaldasfinancas.gov.pt/x",
    tab: { id: 7, url: "https://imoveis.portaldasfinancas.gov.pt/arrendamento" } }, () => {});
  if (executions.length !== before) throw new Error("wrong-extension or subframe sender injected the tool");
  listener({ type: "fb-settings-save", settings: {
    wide: false, secretUnexpected: "drop", member: "bad", classifierProfile: {
      joint: true, room: "ab".repeat(32), unexpected: "drop"
    }
  } }, sender, () => {});
  const saved = writes[writes.length - 1]["fiscalidade-settings-v1"];
  if (saved.secretUnexpected !== undefined || saved.wide !== false || saved.member !== undefined ||
      saved.classifierProfile.unexpected !== undefined || saved.classifierProfile.room !== "ab".repeat(32))
    throw new Error("settings schema validation failed");

  let snapshotResponse;
  listener({ type: "fb-invoice-snapshot", snapshot: {
    version: 1, year: 2026, fetchedAt: "2026-08-23T12:00:00.000Z", complete: true,
    invoices: [{ id: "document 1", date: "2026-08-20", issuerNif: "500000009", issuerName: "Restaurante Exemplo", totalCents: 1200 }],
    issuerSectors: { "500000009": ["C03"] }
  } }, sender, (response) => { snapshotResponse = response; });
  const storedSnapshot = sessionState["fatura-boa-invoice-snapshot-v1"];
  if (!snapshotResponse || snapshotResponse.ok !== true || !storedSnapshot || storedSnapshot.sourceTabId !== 7)
    throw new Error("invoice snapshot did not retain its originating e-Fatura tab in session storage");
  if (!alarms["fatura-boa-invoice-snapshot-expiry"] ||
      alarms["fatura-boa-invoice-snapshot-expiry"].when !== storedSnapshot.expiresAt)
    throw new Error("invoice snapshot did not schedule active end-of-day deletion");

  const otherPortal = { id: "id", frameId: 0, url: "https://imoveis.portaldasfinancas.gov.pt/arrendamento",
    tab: { id: 11, url: "https://imoveis.portaldasfinancas.gov.pt/arrendamento" } };
  let rejectedSnapshot;
  listener({ type: "fb-invoice-snapshot", snapshot: { version: 1, year: 2026, invoices: [] } }, otherPortal,
    (response) => { rejectedSnapshot = response; });
  if (!rejectedSnapshot || rejectedSnapshot.error !== "invalid_sender")
    throw new Error("non-e-Fatura portal could write an invoice snapshot");
  let rejectedMode;
  listener({ type: "fb-run", mode: "dashboard" }, otherPortal, (response) => { rejectedMode = response; });
  if (!rejectedMode || rejectedMode.error !== "invalid_mode")
    throw new Error("non-e-Fatura portal could start the invoice dashboard reader");

  const tabCreateCount = tabCreates.length;
  sessionWriteFails = true;
  let failedWrite;
  listener({ type: "fb-invoice-snapshot", snapshot: {
    version: 1, year: 2026, fetchedAt: "2026-08-23T12:00:00.000Z", complete: true,
    invoices: [{ id: "document 2", date: "2026-08-21", issuerNif: "500000009", issuerName: "Example", status: "P" }]
  } }, sender, (response) => { failedWrite = response; });
  sessionWriteFails = false;
  if (!failedWrite || failedWrite.error !== "storage_failed" || tabCreates.length !== tabCreateCount)
    throw new Error("failed session storage write still reported success or opened the dashboard");

  const extensionSender = { id: "id", url: "chrome-extension://id/invoices.html" };
  let returnResponse;
  listener({ type: "fb-return-to-efatura", invoice: { id: "document 1", date: "2026-08-20" } }, extensionSender,
    (response) => { returnResponse = response; });
  const lastUpdate = tabUpdates[tabUpdates.length - 1];
  if (!returnResponse || returnResponse.reused !== true || !lastUpdate || lastUpdate.id !== 7 ||
      !/detalheDocumentoAdquirente\.action\?idDocumento=document%201&dataEmissaoDocumento=2026-08-20/.test(lastUpdate.spec.url))
    throw new Error("dashboard did not reuse the original e-Fatura tab for invoice navigation");
  const beforeUnsafeReturn = tabUpdates.length;
  listener({ type: "fb-return-to-efatura", invoice: { id: "x", date: "2026-08-20" } }, sender, () => {});
  if (tabUpdates.length !== beforeUnsafeReturn) throw new Error("portal content script could invoke extension-only navigation");
  alarmListener({ name: "fatura-boa-invoice-snapshot-expiry" });
  if (sessionState["fatura-boa-invoice-snapshot-v1"] || alarms["fatura-boa-invoice-snapshot-expiry"])
    throw new Error("end-of-day alarm did not delete the invoice snapshot");
  console.log("  extension background consent and sender gates passed");
}, 0);
