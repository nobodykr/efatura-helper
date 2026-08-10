// Fiscalidade launcher bar - the SITE's own copy of the extension top bar (extension/bar.js).
// The extension paints its bar on the State pages it reads (e-Fatura, situacao, rendas, IRS,
// Seguranca Social); here, on our own pages, the same bar is a launcher: one click to the page
// of the Estado you need next. Works with or without the extension installed - if installed, you
// land on the State page and the extension's bar greets you there, same look, ready to read it.
// Self-contained, no framework, no network. Style mirrors bar.js exactly.
(function () {
  if (document.getElementById("fb-nav-bar")) return;
  var HIDE_KEY = "fb-nav-bar-hidden";
  try { if (localStorage.getItem(HIDE_KEY) === "1") return; } catch (e) {}

  // The next step is always a page of the Estado - the same partitions the extension reads.
  // Links open in a new tab so the user keeps this page; on the destination the extension bar
  // takes over. Hosts match extension/bar.js PARTS so continuity is exact.
  var DEST = [
    // e-Fatura via the Autenticacao.Gov login-redirect: if the user is logged out it sends them to
    // login and then straight to the acquirer document list (the exact page the tool reads); if
    // already logged in, acesso.gov.pt just forwards through. Better than the bare portal root.
    { label: "e-Fatura", url: "https://www.acesso.gov.pt/jsp/loginRedirectForm.jsp?path=consultarDocumentosAdquirente.action&partID=EFPF" },
    { label: "Situação fiscal", url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/" },
    { label: "Rendas", url: "https://imoveis.portaldasfinancas.gov.pt/arrendamento/" },
    { label: "Recibos verdes", url: "https://irs.portaldasfinancas.gov.pt/" },
    { label: "Segurança Social", url: "https://www.seg-social.pt/" }
  ];

  if (!document.getElementById("fb-nav-style")) {
    var st = document.createElement("style"); st.id = "fb-nav-style";
    st.textContent =
      "#fb-nav-bar{position:fixed;top:0;left:0;right:0;z-index:2147483646;height:44px;display:flex;" +
      "align-items:center;gap:14px;padding:0 16px;background:#fff;color:#2B363C;" +
      "border-bottom:1px solid #d5dae1;font:400 14px/1.2 'IBM Plex Sans',system-ui,'Segoe UI',Roboto,sans-serif}" +
      "#fb-nav-bar .fb-brand{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;" +
      "letter-spacing:.11em;font-weight:600;color:#034ad8;text-transform:uppercase;flex:none}" +
      "#fb-nav-bar .fb-lead{color:#6b7780;font-size:.88rem;flex:none}" +
      "#fb-nav-bar .fb-dests{flex:1;min-width:0;display:flex;align-items:center;gap:8px;" +
      "overflow-x:auto;scrollbar-width:none}" +
      "#fb-nav-bar .fb-dests::-webkit-scrollbar{display:none}" +
      "#fb-nav-bar a.fb-dest{flex:none;color:#034ad8;text-decoration:none;font-weight:600;" +
      "font-size:.88rem;padding:5px 11px;border:1px solid #cdd6ef;border-radius:6px;white-space:nowrap}" +
      "#fb-nav-bar a.fb-dest:hover{background:#eef2ff;border-color:#034ad8}" +
      "#fb-nav-bar .fb-x{background:none;border:0;color:#6b7780;font-size:18px;cursor:pointer;" +
      "padding:4px 8px;flex:none;line-height:1}" +
      "@media(max-width:640px){#fb-nav-bar .fb-lead{display:none}}";
    document.documentElement.appendChild(st);
  }

  var bar = document.createElement("div");
  bar.id = "fb-nav-bar";

  var brand = document.createElement("span");
  brand.className = "fb-brand";
  brand.textContent = "FISCALIDADE";

  var lead = document.createElement("span");
  lead.className = "fb-lead";
  lead.textContent = "Próximo passo:";

  var dests = document.createElement("div");
  dests.className = "fb-dests";
  DEST.forEach(function (d) {
    var a = document.createElement("a");
    a.className = "fb-dest";
    a.href = d.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = d.label;
    dests.appendChild(a);
  });

  var x = document.createElement("button");
  x.className = "fb-x";
  x.textContent = "×";
  x.title = "Fechar (Alt+clique: não voltar a mostrar)";
  x.addEventListener("click", function (ev) {
    if (ev.altKey) { try { localStorage.setItem(HIDE_KEY, "1"); } catch (e) {} }
    bar.remove();
    document.documentElement.style.marginTop = "";
  });

  bar.appendChild(brand); bar.appendChild(lead); bar.appendChild(dests); bar.appendChild(x);
  document.documentElement.appendChild(bar);
  document.documentElement.style.marginTop = "44px";
})();
