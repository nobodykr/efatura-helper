/* Fiscalidade extension service worker. No remote code and no request-body logging. */
"use strict";

var ALLOWED_HOSTS = new Set([
  "faturas.portaldasfinancas.gov.pt", "imoveis.portaldasfinancas.gov.pt",
  "sitfiscal.portaldasfinancas.gov.pt", "irs.portaldasfinancas.gov.pt", "www.seg-social.pt"
]);
var CONSENT_KEY = "fiscalidade-consent-v1";
var SETTINGS_KEY = "fiscalidade-settings-v1";
var LEGACY_HIDE_KEY = "fiscalidade-bar-hidden-v1";
var INVOICE_SNAPSHOT_KEY = "fatura-boa-invoice-snapshot-v1";

function senderAllowed(sender) {
  try {
    var url = new URL(sender && sender.tab && sender.tab.url);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  }
  catch (e) { return false; }
}
function extensionSender(sender) {
  try {
    var url = new URL(sender && sender.url);
    return sender.id === chrome.runtime.id && url.protocol === "chrome-extension:" && url.hostname === chrome.runtime.id;
  }
  catch (e) { return false; }
}
function endOfDay() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
function openExtensionPage(file) {
  var url = chrome.runtime.getURL(file);
  chrome.tabs.query({ url: chrome.runtime.getURL("*") }, function (tabs) {
    var exact = (tabs || []).filter(function (tab) { return tab.url === url; })[0];
    var reusable = exact || (tabs || []).filter(function (tab) {
      return /\/(?:invoices|profile)\.html(?:#.*)?$/.test(tab.url || "");
    })[0];
    if (reusable && reusable.id != null) chrome.tabs.update(reusable.id, { url: url, active: true });
    else chrome.tabs.create({ url: url });
  });
}
function tabAllowed(tab) {
  try {
    var url = new URL(tab && tab.url);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  }
  catch (e) { return false; }
}
function openInvoicePage() { openExtensionPage("invoices.html"); }
function openPublicPage(path) {
  chrome.tabs.create({ url: "https://fiscalida.de" + path });
}
function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  var proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function cleanSettings(input) {
  if (!plainObject(input)) return {};
  var out = {};
  ["wide", "share", "shareShapes"].forEach(function (key) {
    if (typeof input[key] === "boolean") out[key] = input[key];
  });
  if (typeof input.member === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(input.member)) out.member = input.member;
  if (plainObject(input.classifierProfile)) {
    var profile = {};
    ["joint", "mono", "sitOk"].forEach(function (key) {
      if (typeof input.classifierProfile[key] === "boolean") profile[key] = input.classifierProfile[key];
    });
    if (typeof input.classifierProfile.room === "string" && /^[a-f0-9]{32,128}$/i.test(input.classifierProfile.room))
      profile.room = input.classifierProfile.room.toLowerCase();
    out.classifierProfile = profile;
  }
  return out;
}

function cleanString(value, max) {
  if (value === undefined || value === null) return "";
  var out = String(value);
  return out.length <= max ? out : out.slice(0, max);
}
function cleanNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  var number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 1e12 ? number : null;
}
function cleanSectors(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (sector) { return cleanString(sector, 3).toUpperCase(); })
    .filter(function (sector, index, all) { return /^C[0-9]{2}$/.test(sector) && all.indexOf(sector) === index; })
    .slice(0, 20);
}
function cleanInvoiceSnapshot(input, sourceTabId) {
  if (!plainObject(input) || input.version !== 1 || !Array.isArray(input.invoices) || input.invoices.length > 20000)
    return null;
  var year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  var invoices = [];
  for (var i = 0; i < input.invoices.length; i++) {
    var row = input.invoices[i];
    if (!plainObject(row)) return null;
    invoices.push({
      id: cleanString(row.id, 120),
      date: cleanString(row.date, 32),
      issuerNif: cleanString(row.issuerNif, 24),
      issuerName: cleanString(row.issuerName, 300),
      totalCents: cleanNumber(row.totalCents),
      vatCents: cleanNumber(row.vatCents),
      taxBaseCents: cleanNumber(row.taxBaseCents),
      status: cleanString(row.status, 12).toUpperCase(),
      sector: cleanString(row.sector, 3).toUpperCase(),
      scope: cleanString(row.scope, 32).toLowerCase(),
      activity: cleanString(row.activity, 160)
    });
  }
  var issuerSectors = {};
  if (plainObject(input.issuerSectors)) {
    Object.keys(input.issuerSectors).slice(0, 10000).forEach(function (nif) {
      if (/^[0-9]{9}$/.test(nif)) issuerSectors[nif] = cleanSectors(input.issuerSectors[nif]);
    });
  }
  var snapshot = {
    version: 1,
    year: year,
    fetchedAt: cleanString(input.fetchedAt, 40),
    expiresAt: endOfDay(),
    complete: input.complete === true,
    mapUnavailable: input.mapUnavailable === true,
    sourceTabId: Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null,
    invoices: invoices,
    issuerSectors: issuerSectors
  };
  try { if (JSON.stringify(snapshot).length > 8 * 1024 * 1024) return null; }
  catch (e) { return null; }
  return snapshot;
}

function runToolInTab(tabId, mode, sendResponse) {
  chrome.storage.local.get([CONSENT_KEY, SETTINGS_KEY], function (stored) {
    var consent = stored && stored[CONSENT_KEY];
    if (!consent || consent.version !== 1 || consent.localAnalysis !== true || tabId == null) {
      if (sendResponse) sendResponse({ ok: false, error: "consent_required" });
      return;
    }
    var target = { tabId: tabId };
    var settings = cleanSettings(stored && stored[SETTINGS_KEY]);
    chrome.scripting.executeScript({ target: target, func: function (runMode, localSettings) {
      if (runMode === "profile") window.__FB_PROFILE = 1;
      else try { delete window.__FB_PROFILE; } catch (e) { window.__FB_PROFILE = 0; }
      if (runMode === "dashboard") window.__FB_DASHBOARD = 1;
      else try { delete window.__FB_DASHBOARD; } catch (e) { window.__FB_DASHBOARD = 0; }
      window.__FISCALIDADE_CONFIG__ = Object.assign({}, window.__FISCALIDADE_CONFIG__ || {}, {
        extension: true, extensionSettings: localSettings || {}
      });
    }, args: [mode, settings] }).then(function () {
      return chrome.scripting.executeScript({ target: target, files: ["profile-contract.js"] });
    }).then(function () {
      return chrome.scripting.executeScript({ target: target, files: ["tool.js"] });
    }).then(function () {
      if (sendResponse) sendResponse({ ok: true });
    }).catch(function () {
      if (sendResponse) sendResponse({ ok: false, error: "injection_failed" });
    });
  });
}

if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.remove(LEGACY_HIDE_KEY);
});

if (chrome.action && chrome.action.onClicked) chrome.action.onClicked.addListener(function (tab) {
  if (!tabAllowed(tab) || tab.id == null) { openPublicPage("/perfil"); return; }
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["profile-contract.js"] })
    .then(function () { return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["bar.js"] }); });
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "fb-open-profile" && (senderAllowed(sender) || extensionSender(sender))) { openPublicPage("/perfil"); return; }
  if (msg.type === "fb-open-privacy" && (senderAllowed(sender) || extensionSender(sender))) { openPublicPage("/privacidade"); return; }

  if (msg.type === "fb-dashboard-refresh" && extensionSender(sender)) {
    chrome.tabs.query({ url: "https://faturas.portaldasfinancas.gov.pt/*" }, function (tabs) {
      var tab = (tabs || []).filter(function (candidate) { return candidate.active; })[0] || (tabs || [])[0];
      if (!tab || tab.id == null) { sendResponse({ ok: false, error: "efatura_tab_required" }); return; }
      runToolInTab(tab.id, "dashboard", sendResponse);
    });
    return true;
  }
  if (msg.type === "fb-return-to-efatura" && extensionSender(sender)) {
    var invoice = plainObject(msg.invoice) ? msg.invoice : null;
    var documentId = invoice ? cleanString(invoice.id, 120) : "";
    var documentDate = invoice ? cleanString(invoice.date, 32) : "";
    chrome.storage.session.get(INVOICE_SNAPSHOT_KEY, function (stored) {
      var current = stored && stored[INVOICE_SNAPSHOT_KEY];
      var preferredId = current && Number.isInteger(current.sourceTabId) ? current.sourceTabId : null;
      chrome.tabs.query({ url: "https://faturas.portaldasfinancas.gov.pt/*" }, function (tabs) {
        var tab = (tabs || []).filter(function (candidate) { return candidate.id === preferredId; })[0] ||
          (tabs || []).filter(function (candidate) { return candidate.active; })[0] || (tabs || [])[0];
        var url = "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action";
        if (documentId && documentDate) url = "https://faturas.portaldasfinancas.gov.pt/detalheDocumentoAdquirente.action?idDocumento=" +
          encodeURIComponent(documentId) + "&dataEmissaoDocumento=" + encodeURIComponent(documentDate);
        if (tab && tab.id != null)
          chrome.tabs.update(tab.id, { url: url, active: true }, function () { sendResponse({ ok: true, reused: true }); });
        else chrome.tabs.create({ url: url }, function () { sendResponse({ ok: true, reused: false }); });
      });
    });
    return true;
  }
  if (!senderAllowed(sender)) return;

  if (msg.type === "fb-run") {
    runToolInTab(sender.tab && sender.tab.id, msg.mode === "profile" ? "profile" : msg.mode === "dashboard" ? "dashboard" : "classifier", sendResponse);
    return true;
  }

  if (msg.type === "fb-invoice-snapshot") {
    var snapshot = cleanInvoiceSnapshot(msg.snapshot, sender.tab && sender.tab.id);
    if (!snapshot || !chrome.storage.session) { sendResponse({ ok: false, error: "invalid_snapshot" }); return; }
    chrome.storage.session.set({ [INVOICE_SNAPSHOT_KEY]: snapshot }, function () {
      sendResponse({ ok: true });
      openInvoicePage();
    });
    return true;
  }

  if (msg.type === "fb-settings-save" && plainObject(msg.settings)) {
    var allowed = cleanSettings(msg.settings);
    if (JSON.stringify(allowed).length > 12000) return;
    chrome.storage.local.get(SETTINGS_KEY, function (stored) {
      var current = cleanSettings(stored && stored[SETTINGS_KEY]);
      chrome.storage.local.set({ [SETTINGS_KEY]: Object.assign({}, current, allowed) });
    });
    return;
  }

  if (msg.type === "fb-settings-clear") {
    chrome.storage.local.remove(SETTINGS_KEY);
    return;
  }
});
