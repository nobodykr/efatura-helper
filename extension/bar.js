// Fiscalidade top bar - shown on every State page the tool reads (Portal das Financas + Seguranca
// Social). Design mirrors the site: white bar, hairline rule, blue mono eyebrow, 6px radius.
// On e-Fatura it self-loads a light year summary and the button runs the CLASSIFIER; on the other
// partitions (rendas, situacao, atividade, IRS, movimentos, recibos, patrimonio, Seguranca Social)
// the button runs the PROFILING read of that page, exactly like the favorito would. Same code
// (tool.js) either way; the only difference is a window.__FB_PROFILE flag set by the worker.
(function () {
  // Situacoes bridge: mirror the analyser's household answers between the portal localStorage
  // and chrome.storage.local so a first answer anywhere survives an origin clearing its storage.
  try {
    var raw = localStorage.getItem("efh-profile");
    var prof = raw ? JSON.parse(raw) : null;
    if (prof && prof.sitOk) {
      chrome.storage.local.set({ "fb-sit": { joint: !!prof.joint, mono: !!prof.mono, sitOk: true } });
    } else {
      chrome.storage.local.get("fb-sit", function (r) {
        var s = r && r["fb-sit"];
        if (!s || !s.sitOk) return;
        try {
          var cur = JSON.parse(localStorage.getItem("efh-profile") || "{}");
          if (cur.sitOk) return;
          cur.joint = !!s.joint; cur.mono = !!s.mono; cur.sitOk = true;
          localStorage.setItem("efh-profile", JSON.stringify(cur));
        } catch (e) {}
      });
    }
  } catch (e) {}

  if (document.getElementById("fb-ext-bar")) return;
  var HIDE_KEY = "fb-ext-bar-hidden";
  try { if (localStorage.getItem(HIDE_KEY) === "1") return; } catch (e) {}
  var YEAR = new Date().getFullYear();

  // Partition map - mirrors tool.js PARTITIONS (host + optional path to disambiguate shared hosts).
  // kind "efatura" = the faturas classifier; kind "profile" = a read for the full situacao profile.
  var PARTS = [
    { host: "faturas.portaldasfinancas.gov.pt", id: "efatura", label: "e-Fatura", kind: "efatura" },
    { host: "imoveis.portaldasfinancas.gov.pt", path: "/arrendamento", id: "rendas", label: "Rendas", kind: "profile" },
    { host: "imoveis.portaldasfinancas.gov.pt", path: "/matrizesinter", id: "patrimonio", label: "Património (IMI)", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/geral", id: "situacao", label: "Situação fiscal", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/atividade", id: "atividade", label: "Atividade", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/inffin", id: "irs", label: "IRS", kind: "profile" },
    { host: "sitfiscal.portaldasfinancas.gov.pt", path: "/movfin", id: "movfin", label: "Movimentos financeiros", kind: "profile" },
    { host: "irs.portaldasfinancas.gov.pt", id: "recibos", label: "Recibos verdes", kind: "profile" },
    { host: "www.seg-social.pt", id: "ss", label: "Segurança Social", kind: "profile" }
  ];
  function detect() {
    var here = PARTS.filter(function (p) { return location.host === p.host; });
    if (!here.length) return null;
    for (var i = 0; i < here.length; i++) {
      if (here[i].path && location.pathname.indexOf(here[i].path) === 0) return here[i];
    }
    // a partition with no path constraint, alone on its host
    for (var j = 0; j < here.length; j++) if (!here[j].path) return here[j];
    return null; // on a shared host but not on a known page -> just nudge
  }
  var part = detect();
  var isEf = !!part && part.kind === "efatura";
  var isProfile = !!part && part.kind === "profile";

  // brand fonts (self-hosted IBM Plex from the site; static download, sends nothing)
  if (!document.getElementById("fb-ext-fonts")) {
    var FH = "https://faturas.diogoandrade.com/fonts/";
    var fst = document.createElement("style"); fst.id = "fb-ext-fonts";
    fst.textContent = ["ibm-plex-sans-400-latin:IBM Plex Sans:400", "ibm-plex-sans-600-latin:IBM Plex Sans:600",
       "ibm-plex-mono-600-latin:IBM Plex Mono:600"].map(function (s) {
        var p = s.split(":");
        return "@font-face{font-family:'" + p[1] + "';font-style:normal;font-weight:" + p[2] +
          ";font-display:swap;src:url(" + FH + p[0] + ".woff2) format('woff2')}";
      }).join("");
    document.documentElement.appendChild(fst);
  }

  var bar = document.createElement("div");
  bar.id = "fb-ext-bar";
  bar.setAttribute("style",
    "position:fixed;top:0;left:0;right:0;z-index:2147483646;height:44px;display:flex;align-items:center;gap:14px;" +
    "padding:0 16px;background:#ffffff;color:#2B363C;border-bottom:1px solid #d5dae1;" +
    "font:400 14px/1.2 'IBM Plex Sans',system-ui,'Segoe UI',Roboto,sans-serif");

  var brand = document.createElement("span");
  brand.textContent = "FISCALIDADE";
  brand.setAttribute("style",
    "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;letter-spacing:.11em;" +
    "font-weight:600;color:#034ad8;text-transform:uppercase");

  var summary = document.createElement("span");
  summary.id = "fb-ext-summary";
  summary.setAttribute("style", "color:#6b7780;font-size:.88rem;flex:1;min-width:0;overflow:hidden;" +
    "text-overflow:ellipsis;white-space:nowrap");
  summary.textContent = isEf ? "a ler o teu ano..."
    : isProfile ? ("Carrega em Ler para juntar " + part.label + " ao teu perfil")
    : "100% no teu navegador - nada sai dele";

  var run = document.createElement("button");
  run.textContent = isEf ? "Analisar faturas" : isProfile ? "Ler esta página" : "Abrir e-Fatura";
  run.setAttribute("style",
    "background:#034ad8;border:0;color:#fff;padding:6px 16px;min-height:32px;border-radius:6px;" +
    "font:600 .9rem 'IBM Plex Sans',sans-serif;cursor:pointer");
  run.addEventListener("mouseenter", function () { run.style.background = "#021c51"; });
  run.addEventListener("mouseleave", function () { run.style.background = "#034ad8"; });
  run.addEventListener("click", function () {
    if (isEf) { chrome.runtime.sendMessage({ type: "fb-run" }); collapse(); }
    else if (isProfile) { chrome.runtime.sendMessage({ type: "fb-run", mode: "profile" }); collapse(); }
    else location.href = "https://faturas.portaldasfinancas.gov.pt/";
  });

  var close = document.createElement("button");
  close.textContent = "×";
  close.title = "Fechar (Alt+clique: não voltar a mostrar)";
  close.setAttribute("style", "background:none;border:0;color:#6b7780;font-size:18px;cursor:pointer;padding:4px 8px");
  close.addEventListener("click", function (ev) {
    if (ev.altKey) { try { localStorage.setItem(HIDE_KEY, "1"); } catch (e) {} }
    collapse();
  });

  function collapse() { bar.remove(); document.documentElement.style.marginTop = ""; }

  bar.appendChild(brand); bar.appendChild(summary); bar.appendChild(run); bar.appendChild(close);
  document.documentElement.appendChild(bar);
  document.documentElement.style.marginTop = "44px";

  // Light year summary, e-Fatura only.
  if (!isEf) return;
  var u = "/json/obterDocumentosAdquirente.action?dataInicioFilter=" + YEAR + "-01-01&dataFimFilter=" + YEAR + "-12-31";
  fetch(u, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || j.expiredSession === true || j.success === false) {
        summary.textContent = "sessão do e-Fatura ainda não iniciada - faz login para veres o resumo"; return;
      }
      var rows = j.linhas || j.documentos || []; if (!Array.isArray(rows)) rows = [];
      var total = j.totalElementos != null ? j.totalElementos : rows.length;
      var pend = 0, pendCents = 0;
      rows.forEach(function (x) { if (x.estadoBeneficio === "P") { pend++; pendCents += Number(x.valorTotal || 0); } });
      var capped = rows.length < total;
      var txt = total + " faturas em " + YEAR;
      if (pend > 0) txt += " · " + pend + " pendente" + (pend === 1 ? "" : "s") + (capped ? " (nas últimas " + rows.length + ")" : "") + " · " + (pendCents / 100).toFixed(2) + " € por classificar";
      else txt += (capped ? " · sem pendentes nas últimas " + rows.length : " · nada pendente - boa");
      summary.textContent = txt;
    })
    .catch(function () { summary.textContent = "100% no teu navegador - nada sai dele"; });
})();
