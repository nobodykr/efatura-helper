/* e-Fatura Helper — runs 100% in the user's own browser, on their own e-Fatura session.
 * It never sees a password: it reuses the login already in the browser (same-origin cookies).
 * No server, no storage, no credentials leave the page. Open-source, auditable.
 *
 * Flow: read pending faturas -> suggest a sector (learned from the user's OWN registered history)
 *       -> show a table the user reviews/edits -> apply only what they approve.
 * Suggestions are just hints; nothing is submitted without the user ticking it and clicking Aplicar.
 */
(function () {
  if (!/faturas\.portaldasfinancas\.gov\.pt$/.test(location.host)) {
    alert("Abre primeiro o e-Fatura (faturas.portaldasfinancas.gov.pt) e faz login. Depois usa esta ferramenta.");
    return;
  }
  if (document.getElementById("efh-panel")) { document.getElementById("efh-panel").remove(); }

  var SECTORS = { C01: "Reparação automóveis", C02: "Reparação motociclos", C03: "Alojamento / restauração",
    C04: "Cabeleireiros / beleza", C05: "Saúde", C06: "Educação", C07: "Imóveis / habitação", C08: "Lares",
    C09: "Veterinárias", C10: "Transportes públicos", C11: "Ginásios", C12: "Jornais / revistas",
    C13: "Livros", C14: "Artísticas", C99: "Outros" };
  var year = new Date().getFullYear();
  var eur = function (c) { return (Number(c || 0) / 100).toFixed(2); };

  function panel(html) {
    var d = document.createElement("div"); d.id = "efh-panel";
    d.style.cssText = "position:fixed;top:12px;right:12px;width:min(680px,95vw);max-height:90vh;overflow:auto;" +
      "background:#fff;border:1px solid #0b3d6b;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.35);" +
      "z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#111";
    d.innerHTML = html; document.body.appendChild(d); return d;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, function (x) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[x]; }); }

  panel('<div style="background:#0b3d6b;color:#fff;padding:10px 14px;font-weight:600;border-radius:10px 10px 0 0">' +
    'e-Fatura Helper <span style="float:right;cursor:pointer" onclick="document.getElementById(\'efh-panel\').remove()">✕</span></div>' +
    '<div id="efh-body" style="padding:14px">A ler as suas faturas…</div>');

  fetch("/json/obterDocumentosAdquirente.action?dataInicioFilter=" + year + "-01-01&dataFimFilter=" + year + "-12-31",
    { credentials: "include", headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var rows = (d && d.linhas) || [];
      var pend = rows.filter(function (x) { return x.estadoBeneficio === "P"; });
      // learn NIF -> sector from the user's OWN already-registered invoices (perfectly accurate, no external calls)
      var learned = {};
      rows.forEach(function (x) {
        if (x.estadoBeneficio === "R" && x.actividadeEmitente) {
          (learned[x.nifEmitente] = learned[x.nifEmitente] || {})[x.actividadeEmitente] =
            (learned[x.nifEmitente][x.actividadeEmitente] || 0) + 1;
        }
      });
      var suggest = function (nif) {
        var m = learned[nif]; if (!m) return "C99";
        return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0];
      };
      if (!pend.length) {
        document.getElementById("efh-body").innerHTML = "✅ Não tem faturas pendentes de classificação em " + year + ".";
        return;
      }
      var opts = Object.keys(SECTORS).map(function (k) { return '<option value="' + k + '">' + k + " — " + SECTORS[k] + "</option>"; }).join("");
      var trs = pend.map(function (x, i) {
        var s = suggest(x.nifEmitente);
        return '<tr>' +
          '<td style="text-align:center"><input type="checkbox" class="efh-ck" data-i="' + i + '" checked></td>' +
          '<td>' + esc(x.dataEmissaoDocumento) + '</td>' +
          '<td>' + esc((x.nomeEmitente || "").trim().slice(0, 34)) + '</td>' +
          '<td style="text-align:right">€' + eur(x.valorTotal) + '</td>' +
          '<td><select class="efh-sec" data-i="' + i + '" style="max-width:190px">' +
              opts.replace('value="' + s + '"', 'value="' + s + '" selected') + '</select></td>' +
          '</tr>';
      }).join("");
      window.__efhPend = pend;
      document.getElementById("efh-body").innerHTML =
        '<p style="margin:0 0 8px"><b>' + pend.length + ' faturas pendentes</b> em ' + year +
        '. As sugestões vêm do seu próprio histórico já classificado. <b>Reveja</b> antes de aplicar — a classificação é uma declaração sua à AT.</p>' +
        '<div style="max-height:52vh;overflow:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:#eef3f8"><th></th><th>Data</th><th>Emitente</th><th>Valor</th><th>Setor</th></tr></thead>' +
        '<tbody>' + trs + '</tbody></table></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
        '<button id="efh-apply" style="background:#128a3a;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600">Aplicar selecionadas</button>' +
        '<span id="efh-status" style="color:#555"></span></div>';
      document.getElementById("efh-apply").onclick = applySelected;
    })
    .catch(function (e) { document.getElementById("efh-body").innerHTML = "Erro a ler faturas: " + esc(e.message) + ". Confirma que tens sessão iniciada."; });

  function applySelected() {
    var pend = window.__efhPend || [];
    var picks = [];
    document.querySelectorAll(".efh-ck").forEach(function (ck) {
      if (ck.checked) {
        var i = +ck.dataset.i;
        var sec = document.querySelector('.efh-sec[data-i="' + i + '"]').value;
        picks.push({ x: pend[i], sec: sec });
      }
    });
    var st = document.getElementById("efh-status"); document.getElementById("efh-apply").disabled = true;
    var ok = 0, fail = 0, n = 0;
    (function next() {
      if (n >= picks.length) { st.textContent = "Concluído: " + ok + " aplicadas, " + fail + " falhas. Atualize a página para confirmar."; return; }
      var p = picks[n++]; st.textContent = "A aplicar " + n + "/" + picks.length + "…";
      // fetch the pending-invoice detail, copy its hidden form fields, set the sector, POST
      fetch("/detalheDocumentoAdquirente.action?idDocumento=" + p.x.idDocumento + "&dataEmissaoDocumento=" + p.x.dataEmissaoDocumento,
        { credentials: "include" }).then(function (r) { return r.text(); }).then(function (htmlText) {
        var doc = new DOMParser().parseFromString(htmlText, "text/html");
        var form = doc.querySelector("#resolverPendencia");
        if (!form) throw new Error("form em falta");
        var body = new URLSearchParams();
        form.querySelectorAll('input[type="hidden"]').forEach(function (inp) { body.set(inp.name, inp.value || ""); });
        body.set("ambitoAquisicaoPend", p.sec);
        return fetch("/resolverPendenciaAdquirente.action", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      }).then(function (r) { return r.text(); }).then(function (t) {
        if (/sucesso/i.test(t)) ok++; else fail++; next();
      }).catch(function () { fail++; next(); });
    })();
  }
})();
