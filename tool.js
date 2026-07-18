/* e-Fatura Helper \u2014 runs 100% in the user's own browser, on their own e-Fatura session.
 * It never sees a password: it reuses the login already in the browser (same-origin cookies).
 *
 * Network calls (audit them yourself - there are exactly two kinds):
 *   - same-origin to faturas.portaldasfinancas.gov.pt  (read your faturas, submit classifications)
 *   - ONE read-only GET of the PUBLIC map at cae-db.diogoandrade.com/sectors.json
 *     (public business-registry data: NIF -> ranked deductible sectors, built from SICAE, the
 *     state's own CAE registry. It is a plain download and SENDS NOTHING of yours - not your NIF,
 *     not your faturas, nothing. The same file is served to everybody.)
 *
 * Suggestions are hints only: your own history first, then the public CAE map, skipping any sector
 * whose annual ceiling is already full. Nothing is submitted without you ticking it and clicking
 * Aplicar. Your household settings stay in localStorage and never leave the browser.
 */
(function () {
  if (!/faturas\.portaldasfinancas\.gov\.pt$/.test(location.host)) {
    alert("Abre primeiro o e-Fatura (faturas.portaldasfinancas.gov.pt) e faz login. Depois usa esta ferramenta.");
    return;
  }
  if (document.getElementById("efh-panel")) { document.getElementById("efh-panel").remove(); }
  var CAEMAP_URL = "https://cae-db.diogoandrade.com/sectors.json";

  var SECTORS = { C01: "Repara\u00e7\u00e3o autom\u00f3veis", C02: "Repara\u00e7\u00e3o motociclos", C03: "Alojamento / restaura\u00e7\u00e3o",
    C04: "Cabeleireiros / beleza", C05: "Sa\u00fade", C06: "Educa\u00e7\u00e3o", C07: "Im\u00f3veis / habita\u00e7\u00e3o", C08: "Lares",
    C09: "Veterin\u00e1rias", C10: "Transportes p\u00fablicos", C11: "Gin\u00e1sios", C12: "Jornais / revistas",
    C13: "Livros", C14: "Art\u00edsticas", C99: "Outros" };
  var year = new Date().getFullYear();
  var eur = function (c) { return (Number(c || 0) / 100).toFixed(2); };

  /* IRS ceilings (income year 2026, declared 2027 - Lei 73-A/2025).
   * base "iva" = you deduct a share of the VAT; base "total" = a share of the invoice value.
   * The C01..C04 + C09..C14 sectors do NOT have a cap each: they all share ONE 250 EUR pot
   * (art. 78.o-F), so once that pot is full every one of them is full at the same time.
   * Sources are listed on https://faturas.diogoandrade.com */
  var POT = "iva78F";
  var CEIL = {
    C05: { rate: 0.15, base: "total", cap: 1000 },
    C06: { rate: 0.30, base: "total", cap: 800 },
    C07: { rate: 0.15, base: "total", cap: 900, unconfirmed: true },
    C08: { rate: 0.25, base: "total", cap: 403.75 },
    C99: { rate: 0.35, base: "total", cap: 250, perTaxpayer: true },
    C01: { rate: 0.15, base: "iva", pot: POT }, C02: { rate: 0.15, base: "iva", pot: POT },
    C03: { rate: 0.15, base: "iva", pot: POT }, C04: { rate: 0.15, base: "iva", pot: POT },
    C09: { rate: 0.15, base: "iva", pot: POT }, C10: { rate: 1.00, base: "iva", pot: POT },
    C11: { rate: 0.30, base: "iva", pot: POT }, C12: { rate: 1.00, base: "iva", pot: POT },
    C13: { rate: 0.15, base: "iva", pot: POT }, C14: { rate: 0.15, base: "iva", pot: POT }
  };
  var POT_CAP = 250;

  // Household shape changes the ceilings, and e-Fatura does not expose it (it lives on another
  // origin, so the browser blocks us from reading it). So we ask once and keep it in localStorage
  // - it never leaves your browser, same as everything else here.
  var PKEY = "efh-profile";
  var HH_URL = "https://cae-db.diogoandrade.com/household/";

  /* Household sharing - OPT-IN, off unless you enter an email.
   *
   * Ceilings are per agregado familiar, but this page only ever sees ONE account's faturas. On real
   * data one account showed 3.186 EUR of despesas gerais where the household had 10.389 EUR - so a
   * solo view can report a ceiling as having room when it is 14x over.
   *
   * The room key is PBKDF2(NIF + email) computed HERE, in your browser. Only the derived value is
   * ever sent: the server never receives your NIF or your email, so it cannot learn them even if it
   * wanted to. Not hash(NIF) alone - a NIF is 9 digits, every possible hash of one can be
   * precomputed in seconds. Adding the email defeats that, because its entropy is unbounded.
   *
   * What is sent: six numbers, the deduction used against each ceiling. No faturas, no merchants,
   * no dates, no amounts. The member id is random per browser, derived from nothing real. */
  function memberId() {
    var k = "efh-member", v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      var a = new Uint8Array(12); crypto.getRandomValues(a);
      v = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }

  function deriveRoom(nif, email) {
    var enc = new TextEncoder();
    var material = enc.encode(String(nif) + String(email || "").trim().toLowerCase());
    return crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: enc.encode("efatura-helper-agregado-v1"),
            iterations: 200000, hash: "SHA-256" }, key, 256);
      })
      .then(function (bits) {
        return Array.prototype.map.call(new Uint8Array(bits), function (b) {
          return ("0" + b.toString(16)).slice(-2); }).join("");
      });
  }
  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; }
  }
  function saveProfile(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} }

  /* Despesas gerais is the only sector whose RATE and CAP depend on the household:
   *   normal        35% capped 250 EUR per taxpayer (so 500 filing jointly)
   *   monoparental  45% capped 335 EUR
   * Every other ceiling is per agregado familiar and does NOT scale with dependants - a couple
   * with three children shares exactly the same 1000 EUR of saude as a couple with none. That is
   * why asking for a dependant COUNT here would be theatre: it changes nothing we display. The
   * count does matter for the deducao por dependente and for the 5% majoracao on the GLOBAL
   * deduction limit, but neither of those is a sector ceiling, so neither is modelled here. */
  function c99Rate(prof) { return prof.mono ? 0.45 : 0.35; }

  function capFor(sec, prof) {
    var c = CEIL[sec]; if (!c) return Infinity;
    if (sec === "C99") return prof.mono ? 335 : (prof.joint ? 500 : 250);
    return c.pot ? POT_CAP : c.cap;
  }

  /* How much of each ceiling the year's ALREADY-REGISTERED invoices have used up. */
  function usedSoFar(rows, prof) {
    var used = {};
    rows.forEach(function (x) {
      var sec = x.actividadeEmitente, c = CEIL[sec];
      if (x.estadoBeneficio !== "R" || !c) return;
      var baseVal = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100;
      var key = c.pot || sec;
      used[key] = (used[key] || 0) + baseVal * (sec === "C99" ? c99Rate(prof) : c.rate);
    });
    return used;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, function (x) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[x]; }); }
  /* e-Fatura returns merchant names ALREADY html-encoded ("Irm&atilde;dona Supermercados"), so
   * escaping them again turned the & into &amp; and printed the entity literally on screen.
   * Decode first, then escape for insertion - decoding via textarea.innerHTML never executes
   * anything, and the value still goes through esc() before it reaches the DOM. */
  function deent(s) {
    var d = document.createElement("textarea");
    d.innerHTML = String(s == null ? "" : s);
    return d.value;
  }
  function name34(x) { return deent((x.nomeEmitente || "")).trim().slice(0, 34); }
  function panel(html) {
    var d = document.createElement("div"); d.id = "efh-panel";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "e-Fatura Helper");
    d.setAttribute("aria-modal", "false");
    d.style.cssText = "position:fixed;top:12px;right:12px;width:min(680px,95vw);max-height:90vh;overflow:auto;" +
      "background:#fff;border:1px solid #0b3d6b;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.35);" +
      "z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#111";
    d.innerHTML = html; document.body.appendChild(d); return d;
  }
  panel('<div style="background:#0b3d6b;color:#fff;padding:10px 14px;font-weight:600;border-radius:10px 10px 0 0">' +
    'e-Fatura Helper <button type="button" aria-label="Fechar" style="float:right;cursor:pointer;background:none;border:0;color:#fff;font:inherit;padding:0 4px" onclick="document.getElementById(\'efh-panel\').remove()">\u2715</button></div>' +
    '<div id="efh-body" style="padding:14px">A ler as suas faturas\u2026</div>');

  // load the public CAE map first (fails soft -> own-history still works), then the faturas
  fetch(CAEMAP_URL).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (caemap) { run(caemap || {}); });

  function run(caemap) {
    fetch("/json/obterDocumentosAdquirente.action?dataInicioFilter=" + year + "-01-01&dataFimFilter=" + year + "-12-31",
      { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rows = (d && d.linhas) || [];
        var pend = rows.filter(function (x) { return x.estadoBeneficio === "P"; });
        var learned = {};
        rows.forEach(function (x) {
          if (x.estadoBeneficio === "R" && x.actividadeEmitente) {
            (learned[x.nifEmitente] = learned[x.nifEmitente] || {})[x.actividadeEmitente] =
              (learned[x.nifEmitente][x.actividadeEmitente] || 0) + 1;
          }
        });
        // cascade(nif) = ordered candidate sectors, best first. The CAE-DB returns a LIST per NIF
        // (a merchant can hold several CAEs: a hypermarket with a pharmacy and a cafe), ranked
        // most-specific-and-beneficial first, C99 last. Tolerates the old single-string format.
        var cascade = function (nif) {
          var m = learned[nif];                                   // 1) your own history wins outright
          if (m) return [Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0]];
          var c = caemap[nif];                                    // 2) shared public CAE map
          if (c) return Object.prototype.toString.call(c) === "[object Array]" ? c : [c];
          return ["C99"];                                         // 3) safe default
        };
        // Walk the cascade and take the first sector that still has room under its ceiling.
        // This is the "prefer the most beneficial, and if it is full go to the next" rule: a
        // pharmacy invoice goes to Saude, but once Saude is capped it falls to the next option.
        var prof = loadProfile();
        var used = usedSoFar(rows, prof);
        var headroom = function (sec) {
          var c = CEIL[sec]; if (!c) return Infinity;
          return capFor(sec, prof) - (used[c.pot || sec] || 0);
        };
        var suggest = function (nif) {
          var opts = cascade(nif);
          for (var i = 0; i < opts.length; i++) {
            if (headroom(opts[i]) > 0.01) return opts[i];
          }
          return opts[0];                       // everything capped - the ranking still stands
        };
        if (!pend.length) {
          document.getElementById("efh-body").innerHTML = "\u2705 N\u00e3o tem faturas pendentes de classifica\u00e7\u00e3o em " + year + ".";
          return;
        }
        // v1 = the original logic: your own history only, otherwise "outros". Shown side by side so
        // you can see exactly what the CAE ranking changed, and judge it rather than trust it.
        var v1 = function (nif) {
          var m = learned[nif];
          return m ? Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0] : "C99";
        };
        var changed = 0;
        var opts = Object.keys(SECTORS).map(function (k) { return '<option value="' + k + '">' + k + " \u2014 " + SECTORS[k] + "</option>"; }).join("");
        var trs = pend.map(function (x, i) {
          var s = suggest(x.nifEmitente);
          var old = v1(x.nifEmitente);
          if (old !== s) changed++;
          var diff = old !== s
            ? '<span style="color:#999;text-decoration:line-through">' + old + '</span> <b style="color:#128a3a">' + s + "</b>"
            : '<span style="color:#999">' + s + "</span>";
          return '<tr><td style="text-align:center"><input type="checkbox" class="efh-ck" data-i="' + i + '" checked></td>' +
            '<td>' + esc(x.dataEmissaoDocumento) + '</td><td>' + esc(name34(x)) + '</td>' +
            '<td style="text-align:right">\u20ac' + eur(x.valorTotal) + '</td>' +
            '<td style="font-size:11px;white-space:nowrap">' + diff + "</td>" +
            '<td><select class="efh-sec" data-i="' + i + '" style="max-width:190px" aria-label="Setor para ' +
            esc(name34(x)) + '">' +
            opts.replace('value="' + s + '"', 'value="' + s + '" selected') + '</select></td></tr>';
        }).join("");
        window.__efhPend = pend;
        /* Progress bars, in two segments:
         *   solid  = what your ALREADY-REGISTERED invoices have used up
         *   ghost  = what the invoices you have TICKED below would add on top
         * so you can see where a ceiling lands before you click Aplicar. If the two together
         * would overshoot the cap, the overflow is drawn in red and flagged - that share of the
         * deduction is simply lost, and those faturas are better moved to another sector. */
        function oneBar(label, usedV, addV, cap) {
          var pu = cap ? (usedV / cap) * 100 : 0;
          var pa = cap ? (addV / cap) * 100 : 0;
          var total = pu + pa;
          var over = total > 100.5;
          var col = pu >= 100 ? "#b00" : pu >= 80 ? "#d98a00" : "#128a3a";
          var ghost = over ? "#b00" : "#7fc79b";
          var wu = Math.min(100, pu);
          var wa = Math.min(100 - wu, pa);
          return '<div style="margin:5px 0" role="group" aria-label="' + esc(label) + '">' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            "<span>" + esc(label) + "</span>" +
            '<span style="color:' + (over ? "#b00" : col) + '"><b>' + Math.round(total) + "%</b> \u00b7 \u20ac" +
            (usedV + addV).toFixed(0) + " / \u20ac" + cap.toFixed(0) +
            (addV > 0.5 ? ' <span style="color:#128a3a">(+\u20ac' + addV.toFixed(0) + " a aplicar)</span>" : "") +
            (over ? ' <b>excede</b>' : "") + "</span></div>" +
            '<div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
            Math.round(total) + '" aria-valuetext="' + Math.round(total) + '% de ' + esc(label) +
            (over ? ', excede o limite' : '') + '"' +
            ' style="height:7px;background:#e3e9f0;border-radius:4px;overflow:hidden;display:flex">' +
            '<div style="height:100%;width:' + wu.toFixed(1) + "%;background:" + col + '"></div>' +
            '<div style="height:100%;width:' + wa.toFixed(1) + "%;background:" + ghost +
            ';opacity:.75"></div></div></div>';
        }

        /* What the currently-ticked rows would add to each ceiling, at their chosen sectors. */
        function pendingAdds() {
          var add = {};
          document.querySelectorAll(".efh-ck").forEach(function (ck) {
            if (!ck.checked) return;
            var i = +ck.dataset.i;
            var selEl = document.querySelector('.efh-sec[data-i="' + i + '"]');
            if (!selEl) return;
            var c = CEIL[selEl.value]; if (!c) return;
            var x = pend[i];
            var baseVal = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100;
            var key = c.pot || selEl.value;
            add[key] = (add[key] || 0) + baseVal * (selEl.value === "C99" ? c99Rate(prof) : c.rate);
          });
          return add;
        }

        function renderBars() {
          var add = pendingAdds();
          var html = ["C05", "C06", "C07", "C08", "C99"].map(function (s) {
            return oneBar(s + " " + SECTORS[s], used[s] || 0, add[s] || 0, capFor(s, prof));
          }).join("") +
            oneBar("IVA em fatura (restaura\u00e7\u00e3o, gin\u00e1sios, oficinas\u2026)",
                   used[POT] || 0, add[POT] || 0, POT_CAP);
          var box = document.getElementById("efh-bars");
          if (box) box.innerHTML = html;
        }

        document.getElementById("efh-body").innerHTML =
          '<p style="margin:0 0 8px"><b>' + pend.length + ' faturas pendentes</b> em ' + year +
          '. Sugest\u00f5es do seu hist\u00f3rico + mapa CAE p\u00fablico, j\u00e1 a saltar setores cheios. <b>Reveja</b> \u2014 a classifica\u00e7\u00e3o \u00e9 uma declara\u00e7\u00e3o sua \u00e0 AT.</p>' +
          '<div style="background:#f4f7fa;border:1px solid #dde5ee;border-radius:6px;padding:8px;margin-bottom:10px;font-size:12px">' +
          '<label><input type="checkbox" id="efh-joint"' + (prof.joint ? " checked" : "") + '> Tributa\u00e7\u00e3o conjunta</label> \u00b7 ' +
          '<label><input type="checkbox" id="efh-mono"' + (prof.mono ? " checked" : "") +
          '> Fam\u00edlia monoparental</label>' +
          '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #dde5ee">' +
          '<label title="Opcional. Os tetos do IRS s\u00e3o do agregado, mas esta p\u00e1gina s\u00f3 v\u00ea esta conta.">' +
          'Partilhar tetos do agregado (opcional): <input type="email" id="efh-mail" placeholder="o-teu@email.pt" ' +
          'value="' + esc(prof.mail || "") + '" style="width:170px"></label> ' +
          '<button type="button" id="efh-join" style="cursor:pointer">Ligar</button>' +
          '<div id="efh-hh" style="margin-top:4px;color:#666"></div></div>' +
          '<div id="efh-bars" style="margin-top:8px"></div>' +
          '<div id="efh-opt" style="margin-top:8px"></div>' +
          '<div style="margin-top:6px;color:#666">Tetos de 2026. S\u00f3 conseguimos ver as faturas <b>desta</b> conta \u2014 se entregam em conjunto, ' +
          'os tetos s\u00e3o do agregado e o que falta ser\u00e1 menos do que aqui aparece.</div></div>' +
          '<div style="max-height:52vh;overflow:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:#eef3f8"><th></th><th>Data</th><th>Emitente</th><th>Valor</th><th title="antes vs agora">Antes/Agora</th><th>Setor</th></tr></thead>' +
          '<tbody>' + trs + '</tbody></table></div>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
          '<button id="efh-apply" style="background:#128a3a;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600">Aplicar selecionadas</button>' +
          '<span id="efh-status" role="status" aria-live="polite" style="color:#555"></span></div>';
        document.getElementById("efh-apply").onclick = applySelected;
        renderBars();
        (function () {
          var o = optimise(), box = document.getElementById("efh-opt");
          if (!box) return;
          var bits = [];
          if (o.wasted > 1) {
            bits.push('<b style="color:#b00">\u20ac' + o.wasted.toFixed(0) + ' de dedu\u00e7\u00e3o desperdi\u00e7ada</b> ' +
                      '(tetos j\u00e1 cheios \u2014 essas faturas n\u00e3o valem nada onde est\u00e3o)');
          }
          var reg = o.moves.filter(function (m) { return m.x.estadoBeneficio === "R"; });
          if (o.after - o.before > 1) {
            bits.push('Realoca\u00e7\u00e3o \u00f3tima valeria <b>+\u20ac' + (o.after - o.before).toFixed(0) + '</b>' +
                      (reg.length ? ' (inclui <b>' + reg.length + '</b> j\u00e1 registadas que podes alterar no e-Fatura)' : ''));
          }
          if (!bits.length) { box.innerHTML = '<div style="color:#128a3a;font-size:12px">\u2713 Nada por aproveitar \u2014 as tuas faturas j\u00e1 est\u00e3o nos melhores setores poss\u00edveis.</div>'; return; }
          box.innerHTML = '<div style="background:#fff8e6;border:1px solid #e8d9a8;border-radius:6px;padding:8px;font-size:12px">' +
            bits.join('<br>') +
            (reg.length ? ' <a href="#" id="efh-optmore" style="color:#0b3d6b">ver quais</a>' : '') + '</div>';
          var more = document.getElementById("efh-optmore");
          if (more) more.onclick = function (ev) {
            ev.preventDefault();
            more.outerHTML = '<div style="margin-top:6px;max-height:130px;overflow:auto">' +
              reg.slice(0, 40).map(function (m) {
                return '<div>' + esc(m.x.dataEmissaoDocumento) + ' \u00b7 ' + esc(name34(m.x)) +
                       ' \u00b7 \u20ac' + eur(m.x.valorTotal) + ' \u2014 <b>' + m.from + ' \u2192 ' + m.to + '</b></div>';
              }).join("") + '</div>';
          };
        })();
        document.querySelectorAll(".efh-ck").forEach(function (el) { el.onchange = renderBars; });
        document.querySelectorAll(".efh-sec").forEach(function (el) { el.onchange = renderBars; });
        // changing the household re-runs the whole suggestion pass (ceilings move, so do sectors)
        var reprofile = function () {
          saveProfile({ joint: document.getElementById("efh-joint").checked,
                        mono: document.getElementById("efh-mono").checked });
          run(caemap);
        };
        document.getElementById("efh-joint").onchange = reprofile;
        document.getElementById("efh-mono").onchange = reprofile;

        var hhBox = document.getElementById("efh-hh");
        if (prof.room) { hhBox.innerHTML = 'Ligado. Chave: <code>' + esc(prof.room.slice(0, 16)) + '\u2026</code>'; }
        document.getElementById("efh-join").onclick = function () {
          var mail = document.getElementById("efh-mail").value.trim();
          var myNif = (rows[0] && rows[0].nifAdquirente) || prof.nif || "";
          if (!mail) { hhBox.textContent = "Escreve um email para gerar a chave."; return; }
          hhBox.textContent = "A gerar chave\u2026";
          deriveRoom(myNif, mail).then(function (room) {
            var body = { member: memberId() };
            ["C05", "C06", "C07", "C08", "C99"].forEach(function (k) { body[k] = +(used[k] || 0).toFixed(2); });
            body.POT = +(used[POT] || 0).toFixed(2);
            return fetch(HH_URL + room, { method: "PUT", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(body) })
              .then(function () { return fetch(HH_URL + room); })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                saveProfile({ joint: prof.joint, mono: prof.mono, mail: mail, room: room });
                if (d && d.merged) {
                  Object.keys(d.merged).forEach(function (k) {
                    used[k === "POT" ? POT : k] = d.merged[k];
                  });
                  renderBars();
                }
                hhBox.innerHTML = '\u2713 ' + (d.members || 1) + ' membro(s). Partilha esta chave: ' +
                  '<code style="user-select:all">' + esc(room) + '</code>';
              });
          }).catch(function (e) { hhBox.textContent = "Falhou: " + e.message; });
        };
      })
      .catch(function (e) { document.getElementById("efh-body").innerHTML = "Erro a ler faturas: " + esc(e.message) + ". Confirma que tens sess\u00e3o iniciada."; });
  }

  function applySelected() {
    var pend = window.__efhPend || [], picks = [];
    document.querySelectorAll(".efh-ck").forEach(function (ck) {
      if (ck.checked) { var i = +ck.dataset.i; picks.push({ x: pend[i], sec: document.querySelector('.efh-sec[data-i="' + i + '"]').value }); }
    });
    var st = document.getElementById("efh-status"); document.getElementById("efh-apply").disabled = true;
    var ok = 0, fail = 0, n = 0;
    (function next() {
      if (n >= picks.length) { st.textContent = "Conclu\u00eddo: " + ok + " aplicadas, " + fail + " falhas. Atualize a p\u00e1gina para confirmar."; return; }
      var p = picks[n++]; st.textContent = "A aplicar " + n + "/" + picks.length + "\u2026";
      fetch("/detalheDocumentoAdquirente.action?idDocumento=" + p.x.idDocumento + "&dataEmissaoDocumento=" + p.x.dataEmissaoDocumento,
        { credentials: "include" }).then(function (r) { return r.text(); }).then(function (htmlText) {
        var form = new DOMParser().parseFromString(htmlText, "text/html").querySelector("#resolverPendencia");
        if (!form) throw new Error("form em falta");
        var body = new URLSearchParams();
        form.querySelectorAll('input[type="hidden"]').forEach(function (inp) { body.set(inp.name, inp.value || ""); });
        body.set("ambitoAquisicaoPend", p.sec);
        return fetch("/resolverPendenciaAdquirente.action", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      }).then(function (r) { return r.text(); }).then(function (t) { if (/sucesso/i.test(t)) ok++; else fail++; next(); })
        .catch(function () { fail++; next(); });
    })();
  }
})();
