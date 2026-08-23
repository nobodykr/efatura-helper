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
  try {
    var url = new URL(sender && sender.tab && sender.tab.url);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  }
  catch (e) { return false; }
}
function extensionSender(sender) { return !!(sender && sender.id === chrome.runtime.id); }
function endOfDay() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
function openExtensionPage(file) { chrome.tabs.create({ url: chrome.runtime.getURL(file) }); }
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

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "fb-open-profile" && (senderAllowed(sender) || extensionSender(sender))) { openExtensionPage("profile.html"); return; }
  if (msg.type === "fb-open-privacy" && (senderAllowed(sender) || extensionSender(sender))) { openExtensionPage("profile.html#privacy"); return; }
  if (!senderAllowed(sender)) return;

  if (msg.type === "fb-run") {
    chrome.storage.local.get([CONSENT_KEY, SETTINGS_KEY], function (stored) {
      var c = stored && stored[CONSENT_KEY];
      if (!c || c.version !== 1 || c.localAnalysis !== true || !sender.tab || sender.tab.id == null) return;
      var target = { tabId: sender.tab.id };
      var runTool = function () { chrome.scripting.executeScript({ target: target, files: ["tool.js"] }); };
      var settings = stored && stored[SETTINGS_KEY];
      settings = cleanSettings(settings);
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
    chrome.storage.local.remove([PROFILE_KEY, SETTINGS_KEY]);
    return;
  }

  if (msg.type === "fb-profile-save" && PARTITIONS.has(msg.partition) && plainObject(msg.data)) {
    var dataSize = 0, shapeSize = 0;
    try {
      dataSize = JSON.stringify(msg.data).length;
      shapeSize = msg.shape === undefined ? 0 : JSON.stringify(msg.shape).length;
    } catch (e) { return; }
    if (dataSize > 4 * 1024 * 1024 || shapeSize > 256 * 1024 ||
        (msg.shape !== undefined && !plainObject(msg.shape))) return;
    chrome.storage.local.get(PROFILE_KEY, function (stored) {
      var p = stored && stored[PROFILE_KEY];
      if (!p || p.version !== 1 || Date.now() >= Number(p.expiresAt || 0))
        p = { version: 1, partitions: {}, expiresAt: endOfDay() };
      p.partitions[msg.partition] = {
        status: "done", fetchedAt: new Date().toISOString(), data: msg.data,
        shape: msg.shape || {}
      };
      p.expiresAt = endOfDay();
      try { if (JSON.stringify(p).length > 9 * 1024 * 1024) return; } catch (e) { return; }
      chrome.storage.local.set({ [PROFILE_KEY]: p }, function () {
        sendResponse({ ok: true });
        openExtensionPage("profile.html");
      });
    });
    return true;
  }
});
