/* Fiscalidade extension service worker. No remote code and no request-body logging. */
"use strict";

var ALLOWED_HOSTS = new Set([
  "faturas.portaldasfinancas.gov.pt", "imoveis.portaldasfinancas.gov.pt",
  "sitfiscal.portaldasfinancas.gov.pt", "irs.portaldasfinancas.gov.pt", "www.seg-social.pt"
]);
var PARTITIONS = new Set(["efatura", "rendas", "situacao", "atividade", "atividade_integrada",
  "irs", "movfin", "recibos", "declaracoes", "deducoes", "despesas_atividade", "ss", "patrimonio"]);
var PROFILE_KEY = "fiscalidade-profile-v1";
var CONSENT_KEY = "fiscalidade-consent-v1";
var SETTINGS_KEY = "fiscalidade-settings-v1";

function senderAllowed(sender) {
  try { return !!(sender && sender.tab && ALLOWED_HOSTS.has(new URL(sender.tab.url).hostname)); }
  catch (e) { return false; }
}
function endOfDay() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
function openExtensionPage(file) { chrome.tabs.create({ url: chrome.runtime.getURL(file) }); }

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "fb-open-profile") { openExtensionPage("profile.html"); return; }
  if (msg.type === "fb-open-privacy") { openExtensionPage("profile.html#privacy"); return; }
  if (!senderAllowed(sender)) return;

  if (msg.type === "fb-run") {
    chrome.storage.local.get([CONSENT_KEY, SETTINGS_KEY], function (stored) {
      var c = stored && stored[CONSENT_KEY];
      if (!c || c.version !== 1 || c.localAnalysis !== true || !sender.tab || sender.tab.id == null) return;
      var target = { tabId: sender.tab.id };
      var runTool = function () { chrome.scripting.executeScript({ target: target, files: ["tool.js"] }); };
      var settings = stored && stored[SETTINGS_KEY];
      if (!settings || typeof settings !== "object") settings = {};
      chrome.scripting.executeScript({ target: target, func: function (profileMode, localSettings) {
        if (profileMode) window.__FB_PROFILE = 1;
        else try { delete window.__FB_PROFILE; } catch (e) { window.__FB_PROFILE = 0; }
        window.__FISCALIDADE_CONFIG__ = Object.assign({}, window.__FISCALIDADE_CONFIG__ || {}, {
          extension: true, extensionSettings: localSettings || {}
        });
      }, args: [msg.mode === "profile", settings] }).then(runTool);
    });
    return;
  }

  if (msg.type === "fb-settings-save" && msg.settings && typeof msg.settings === "object") {
    var allowed = {}, keys = ["classifierProfile", "wide", "member", "share", "shareShapes"];
    keys.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(msg.settings, k)) allowed[k] = msg.settings[k]; });
    if (JSON.stringify(allowed).length > 12000) return;
    chrome.storage.local.get(SETTINGS_KEY, function (stored) {
      var current = stored && stored[SETTINGS_KEY];
      if (!current || typeof current !== "object") current = {};
      chrome.storage.local.set({ [SETTINGS_KEY]: Object.assign({}, current, allowed) });
    });
    return;
  }

  if (msg.type === "fb-settings-clear") {
    chrome.storage.local.remove([PROFILE_KEY, SETTINGS_KEY]);
    return;
  }

  if (msg.type === "fb-profile-save" && PARTITIONS.has(msg.partition) && msg.data && typeof msg.data === "object") {
    chrome.storage.local.get(PROFILE_KEY, function (stored) {
      var p = stored && stored[PROFILE_KEY];
      if (!p || p.version !== 1 || Date.now() >= Number(p.expiresAt || 0))
        p = { version: 1, partitions: {}, expiresAt: endOfDay() };
      p.partitions[msg.partition] = {
        status: "done", fetchedAt: new Date().toISOString(), data: msg.data,
        shape: (msg.shape && typeof msg.shape === "object") ? msg.shape : {}
      };
      p.expiresAt = endOfDay();
      chrome.storage.local.set({ [PROFILE_KEY]: p }, function () {
        sendResponse({ ok: true });
        openExtensionPage("profile.html");
      });
    });
    return true;
  }
});
