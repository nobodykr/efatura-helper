/* Fiscalidade extension bar.
 *
 * Privacy invariant: before `localAnalysis` consent this file may read only chrome.storage.local.
 * It must not read page DOM/account storage, call fetch, navigate, inject tool.js, or load a remote
 * asset. Account reads happen only after consent and an explicit click on an analysis button.
 */
(function () {
  "use strict";

  var existing = document.getElementById("fb-ext-bar");
  if (existing) {
    existing.style.display = "flex";
    var firstButton = existing.querySelector("button");
    if (firstButton) firstButton.focus();
    return;
  }

  var CONSENT_KEY = "fiscalidade-consent-v1";
  var PARTS = [
    { host: "faturas.portaldasfinancas.gov.pt", id: "efatura", label: "e-Fatura", kind: "efatura" },
    { host: "imoveis.portaldasfinancas.gov.pt", path: "/arrendamento", id: "rendas", label: "Rendas", kind: "profile" },
    { host: "imoveis.portaldasfinancas.gov.pt", path: "/matrizesinter", id: "patrimonio", label: "Património", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/geral", id: "situacao", label: "Situação fiscal", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/atividade", id: "atividade", label: "Atividade", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/inffin", id: "irs", label: "IRS", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/movfin", id: "movfin", label: "Movimentos", kind: "profile" },
    { host: "irs.portaldasfinancas.gov.pt", id: "recibos", label: "Recibos verdes", kind: "profile" },
    { host: "www.seg-social.pt", id: "ss", label: "Segurança Social", kind: "profile" }
  ];

  function detect() {
    var here = PARTS.filter(function (p) { return location.host === p.host; });
    for (var i = 0; i < here.length; i++)
      if (here[i].path && location.pathname.indexOf(here[i].path) === 0) return here[i];
    for (var j = 0; j < here.length; j++) if (!here[j].path) return here[j];
    return null;
  }

  var part = detect();
  var bar = document.createElement("div");
  bar.id = "fb-ext-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Fiscalidade");
  bar.setAttribute("style",
    "position:fixed;top:0;left:0;right:0;z-index:2147483646;min-height:48px;display:flex;align-items:center;gap:12px;" +
    "padding:6px 16px;background:#fff;color:#2B363C;border-bottom:1px solid #d5dae1;" +
    "font:400 14px/1.25 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif");

  var brand = document.createElement("strong");
  brand.textContent = "FISCALIDADE";
  brand.setAttribute("style", "font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.09em;color:#034ad8");

  var summary = document.createElement("span");
  summary.id = "fb-ext-summary";
  summary.setAttribute("style", "color:#59676f;flex:1;min-width:120px");
  summary.textContent = "desligada até autorizares a leitura local";

  var actions = document.createElement("span");
  actions.setAttribute("style", "display:flex;align-items:center;gap:8px;flex-wrap:wrap");

  function button(label, primary) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("style", primary
      ? "background:#034ad8;border:1px solid #034ad8;color:#fff;padding:7px 13px;border-radius:6px;font:600 13px system-ui;cursor:pointer"
      : "background:#fff;border:1px solid #b8c2cc;color:#034ad8;padding:7px 11px;border-radius:6px;font:600 13px system-ui;cursor:pointer");
    return b;
  }

  function openProfile() { chrome.runtime.sendMessage({ type: "fb-open-profile" }); }

  function renderConsent() {
    actions.textContent = "";
    summary.textContent = "não lê esta página antes da tua autorização";
    var allow = button("Autorizar leituras locais", true);
    var privacy = button("Privacidade", false);
    allow.addEventListener("click", function () {
      var consent = { version: 1, localAnalysis: true, acknowledgedAt: new Date().toISOString() };
      chrome.storage.local.set({ [CONSENT_KEY]: consent }, renderEnabled);
    });
    privacy.addEventListener("click", function () { chrome.runtime.sendMessage({ type: "fb-open-privacy" }); });
    actions.appendChild(allow);
    actions.appendChild(privacy);
  }

  function run(mode) { chrome.runtime.sendMessage({ type: "fb-run", mode: mode }); }

  function renderEnabled() {
    actions.textContent = "";
    if (!part) {
      summary.textContent = "esta página não tem um leitor validado";
      var profileOnly = button("Abrir perfil", false);
      profileOnly.addEventListener("click", openProfile);
      actions.appendChild(profileOnly);
      return;
    }
    summary.textContent = part.label + ": pronta; só lê quando carregares no botão";
    var main = button(part.kind === "efatura" ? "Analisar faturas" : "Ler para o perfil", true);
    main.addEventListener("click", function () { run(part.kind === "efatura" ? "classifier" : "profile"); });
    actions.appendChild(main);
    if (part.kind === "efatura") {
      var invoices = button("Painel de faturas", false);
      invoices.addEventListener("click", function () { run("dashboard"); });
      actions.appendChild(invoices);
      var add = button("Adicionar ao perfil", false);
      add.addEventListener("click", function () { run("profile"); });
      actions.appendChild(add);
    }
    var profile = button("Ver perfil", false);
    profile.addEventListener("click", openProfile);
    actions.appendChild(profile);
  }

  var close = button("Fechar", false);
  close.setAttribute("aria-label", "Fechar a barra Fiscalidade");
  close.addEventListener("click", function () {
    bar.remove();
    document.documentElement.style.marginTop = "";
  });

  bar.appendChild(brand);
  bar.appendChild(summary);
  bar.appendChild(actions);
  bar.appendChild(close);

  /* Reading extension-owned state is allowed before consent; no page-origin state is touched. */
  chrome.storage.local.get(CONSENT_KEY, function (stored) {
    document.documentElement.appendChild(bar);
    document.documentElement.style.marginTop = "48px";
    var c = stored && stored[CONSENT_KEY];
    if (c && c.version === 1 && c.localAnalysis === true) renderEnabled();
    else renderConsent();
  });
})();
