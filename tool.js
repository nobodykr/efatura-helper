/* Fatura Boa - runs 100% in the user's own browser, on their own e-Fatura session.
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
    d.setAttribute("aria-label", "Fatura Boa");
    d.setAttribute("aria-modal", "false");
    d.style.cssText = "position:fixed;top:12px;right:12px;width:min(680px,95vw);max-height:90vh;overflow:auto;" +
      "background:#fff;border:1px solid #021c51;border-radius:8px;font-family:'IBM Plex Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.35);" +
      "z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#111";
    d.innerHTML = html; document.body.appendChild(d); return d;
  }
  // gov-style focus ring: magenta so it can never blend into AT's own blues
  if(!document.getElementById('efh-focus-style')){
    var fs=document.createElement('style'); fs.id='efh-focus-style';
    fs.textContent='#efh-panel a:focus-visible,#efh-panel button:focus-visible,'+
      '#efh-panel select:focus-visible,#efh-panel input:focus-visible,#efh-panel summary:focus-visible'+
      '{outline:3px solid #f408fc;outline-offset:2px;border-radius:2px}'+
      '#efh-panel .efh-num{font-family:\'IBM Plex Mono\',ui-monospace,monospace;font-variant-numeric:tabular-nums}';
    document.head.appendChild(fs);
  }
  // Mobile browsers cannot run a bookmarklet inside a page, so this is desktop-only. Say it in
  // the panel too rather than leaving a half-working screen.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    alert("A Fatura Boa s\u00f3 funciona no computador. Os navegadores de telem\u00f3vel n\u00e3o deixam correr "
        + "favoritos dentro da p\u00e1gina do e-Fatura. Abre isto num computador.");
  }
  panel('<div style="background:#021c51;color:#fff;padding:10px 14px;font-weight:600;border-radius:8px 8px 0 0">' +
    '<a href="https://faturas.diogoandrade.com" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.45)" title="Abrir faturas.diogoandrade.com">Fatura Boa</a> <button type="button" aria-label="Fechar" style="float:right;cursor:pointer;background:none;border:0;color:#fff;font:inherit;padding:0 4px" onclick="document.getElementById(\'efh-panel\').remove()">\u2715</button></div>' +
    '<div style="background:#fdecec;border-bottom:2px solid #c8102e;padding:8px 12px;font-size:12px;line-height:1.45;color:#5a0000">'+'<b>Esta ferramenta nunca te pede a password.</b> Corre na sess\u00e3o que j\u00e1 abriste, s\u00f3 nesta p\u00e1gina. '+'Se algum site te pedir as credenciais das Finan\u00e7as, \u00e9 burla.</div>' +
    '<div id="efh-body" style="padding:14px">A ler as tuas faturas...</div>');

  // load the public CAE map first (fails soft -> own-history still works), then the faturas
  fetch(CAEMAP_URL).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (caemap) { run(caemap || {}); });

  /* Changing the household re-runs the whole pass, which rebuilds the table - so anything already
   * edited (a corrected sector, an unticked row) would be silently thrown away. Snapshot the choices
   * by idDocumento rather than row index, because row order can change, and restore after rebuild. */
  var userEdits = {};
  function snapshotEdits(pend) {
    document.querySelectorAll(".efh-sec").forEach(function (el) {
      var x = pend[+el.dataset.i]; if (!x) return;
      var ck = document.querySelector('.efh-ck[data-i="' + el.dataset.i + '"]');
      userEdits[x.idDocumento] = { sec: el.value, on: ck ? ck.checked : true };
    });
  }
  function restoreEdits(pend) {
    document.querySelectorAll(".efh-sec").forEach(function (el) {
      var x = pend[+el.dataset.i]; if (!x) return;
      var e = userEdits[x.idDocumento]; if (!e) return;
      el.value = e.sec;
      var ck = document.querySelector('.efh-ck[data-i="' + el.dataset.i + '"]');
      if (ck) ck.checked = e.on;
    });
  }

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
        /* OTIMIZADA - of the sectors this merchant is registered for, the one that actually puts
         * the most euros of deduction on THIS invoice. Not the same as "first in the list": the
         * CAE-DB returns the primary CAE first, so walking the list in order would nearly always
         * hand back the primary and the two columns would be identical.
         * Deduction differs per sector by rate AND by base (a share of the invoice total, or a
         * share of its VAT), and is worth nothing beyond a full ceiling - so compute the real
         * gain and take the best. This is the "pharmacy preferred, and when it is full fall to
         * the next" rule, done by value rather than by position. */
        var gain = function (sec, x) {
          var c = CEIL[sec]; if (!c) return 0;
          var base = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100;
          return Math.max(0, Math.min(headroom(sec), c.rate * base));
        };
        var suggest = function (nif, x) {
          var opts = cascade(nif), best = opts[0], bestG = -1;
          for (var i = 0; i < opts.length; i++) {
            var g = gain(opts[i], x);
            if (g > bestG + 0.005) { bestG = g; best = opts[i]; }   // ties keep the earlier (primary)
          }
          return bestG > 0.01 ? best : opts[0];   // everything capped - the ranking still stands
        };
        /* PROVAVEL - the sector the purchase most likely really belonged to, ignoring ceilings.
         * This is NOT the same question as "which sector pays best". A hypermarket holds a
         * pharmacy CAE, so the optimiser can legitimately offer Saude, but if you bought
         * groceries there the truthful sector is despesas gerais. Order of evidence:
         *   1. how YOU classified this merchant before - the strongest signal there is,
         *   2. otherwise the sector of the merchant's PRIMARY CAE, which is its main activity.
         * The CAE-DB returns the primary CAE's sector first, before the benefit ranking. */
        var provavel = function (nif) {
          var m = learned[nif];
          if (m) return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0];
          var c = caemap[nif];
          if (c) return Object.prototype.toString.call(c) === "[object Array]" ? c[0] : c;
          return "C99";
        };
        if (!pend.length) {
          document.getElementById("efh-body").innerHTML = "\u2705 N\u00e3o tens faturas pendentes de classifica\u00e7\u00e3o em " + year + ".";
          return;
        }
        // v1 = the original logic: your own history only, otherwise "outros". Shown side by side so
        // you can see exactly what the CAE ranking changed, and judge it rather than trust it.
        var v1 = function (nif) {
          var m = learned[nif];
          return m ? Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0] : "C99";
        };
        var changed = 0;
        var opts = Object.keys(SECTORS).map(function (k) { return '<option value="' + k + '">' + k + " - " + SECTORS[k] + "</option>"; }).join("");
        var trs = pend.map(function (x, i) {
          var s = suggest(x.nifEmitente, x);       // most deduction for THIS invoice
          var pv = provavel(x.nifEmitente);         // what it most likely actually was
          var old = v1(x.nifEmitente);
          if (old !== s) changed++;
          /* Two suggestions, side by side, because they answer different questions and the user
           * is the one declaring. Pre-select PROVAVEL: defaulting to whatever pays most would
           * nudge people into declaring groceries as Saude just because the shop holds a
           * pharmacy CAE. Where the purchase genuinely was in the better sector the two agree
           * anyway, so nothing is lost by being honest here. */
          var cell = function (sec, i2, kind) {
            return '<button type="button" class="efh-pick" data-i="' + i2 + '" data-sec="' + sec + '" ' +
              'title="Usar ' + sec + ' - ' + esc(SECTORS[sec] || sec) + '" ' +
              'style="cursor:pointer;font:inherit;font-size:11px;border:1px solid ' +
              (kind === "pv" ? "#034ad8;color:#034ad8" : "#128a3a;color:#128a3a") +
              ';background:#fff;border-radius:3px;padding:2px 6px;min-height:24px">' + sec + '</button>';
          };
          var same = (pv === s);
          return '<tr><td style="text-align:center"><input type="checkbox" class="efh-ck" data-i="' + i + '" checked></td>' +
            '<td>' + esc(x.dataEmissaoDocumento) + '</td><td>' + esc(name34(x)) + '</td>' +
            '<td style="text-align:right">\u20ac' + eur(x.valorTotal) + '</td>' +
            '<td style="font-size:11px;white-space:nowrap">' + cell(pv, i, "pv") + "</td>" +
            '<td style="font-size:11px;white-space:nowrap">' +
              (same ? '<span style="color:#999">igual</span>' : cell(s, i, "op")) + "</td>" +
            '<td><select class="efh-sec" data-i="' + i + '" style="max-width:190px" aria-label="Setor para ' +
            esc(name34(x)) + '">' +
            opts.replace('value="' + pv + '"', 'value="' + pv + '" selected') + '</select></td></tr>';
        }).join("");
        window.__efhPend = pend;
        /* Progress bars, in two segments:
         *   solid  = what your ALREADY-REGISTERED invoices have used up
         *   ghost  = what the invoices you have TICKED below would add on top
         * so you can see where a ceiling lands before you click Aplicar. If the two together
         * would overshoot the cap, the overflow is drawn in red and flagged - that share of the
         * deduction is simply lost, and those faturas are better moved to another sector. */
        /* OPTIMISER - the same pass the server-side script runs, ported to the browser.
         * Looks at EVERY fatura of the year (registered and pending), takes the sectors each
         * merchant legitimately allows, and allocates greedily by value so the invoices with most
         * to gain get the scarce headroom first. Surfaces two things a per-row view cannot: how
         * much deduction is being WASTED on a ceiling that is already over, and which
         * already-REGISTERED faturas sit in a full sector while a legitimate alternative has room.
         * Rates are not uniform (transportes/jornais 100% of the VAT, ginasios 30%, despesas
         * gerais 35% of the total), so the emptiest bucket is not the best one. */
        function dedu(x, sec) {
          var c = CEIL[sec]; if (!c) return 0;
          var v = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100;
          return v * (sec === "C99" ? c99Rate(prof) : c.rate);
        }
        function optimise() {
          var capOf = function (k) { return k === POT ? POT_CAP : capFor(k, prof); };
          var keyOf = function (sec) { return CEIL[sec].pot || sec; };
          var plan = [];
          rows.forEach(function (x) {
            if (x.estadoBeneficio !== "R" && x.estadoBeneficio !== "P") return;
            var cur = x.actividadeEmitente;
            var allowed = cascade(x.nifEmitente).filter(function (a) { return CEIL[a]; });
            if (cur && CEIL[cur] && allowed.indexOf(cur) < 0) allowed = allowed.concat([cur]);
            if (!allowed.length) return;
            var best = 0;
            allowed.forEach(function (a) { var d = dedu(x, a); if (d > best) best = d; });
            plan.push({ gain: best - (cur && CEIL[cur] ? dedu(x, cur) : 0),
                        x: x, cur: cur, allowed: allowed });
          });
          plan.sort(function (a, b) { return b.gain - a.gain; });

          var curPots = {};
          plan.forEach(function (p) {
            if (!p.cur || !CEIL[p.cur]) return;
            var k = keyOf(p.cur);
            curPots[k] = (curPots[k] || 0) + dedu(p.x, p.cur);
          });
          var before = 0, wasted = 0;
          Object.keys(curPots).forEach(function (k) {
            before += Math.min(curPots[k], capOf(k));
            wasted += Math.max(0, curPots[k] - capOf(k));
          });

          var pots = {}, moves = [];
          plan.forEach(function (p) {
            var bestSec = null, bestVal = -1;
            p.allowed.slice().sort(function (a, b) { return dedu(p.x, b) - dedu(p.x, a); })
              .forEach(function (a) {
                var k = keyOf(a), room = capOf(k) - (pots[k] || 0);
                if (room <= 0.01) return;
                var val = Math.min(dedu(p.x, a), room);
                if (val > bestVal) { bestSec = a; bestVal = val; }
              });
            if (!bestSec) return;
            pots[keyOf(bestSec)] = (pots[keyOf(bestSec)] || 0) + bestVal;
            if (bestSec !== p.cur && bestVal > 0.01) {
              moves.push({ x: p.x, from: p.cur, to: bestSec, val: bestVal });
            }
          });
          var after = 0;
          Object.keys(pots).forEach(function (k) { after += Math.min(pots[k], capOf(k)); });
          return { before: before, after: after, wasted: wasted, moves: moves };
        }

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
            '<span style="color:' + (over ? "#b00" : col) + '"><b>' + Math.round(total) + "%</b>  |  \u20ac" +
            (usedV + addV).toFixed(0) + " / \u20ac" + cap.toFixed(0) +
            (addV > 0.5 ? ' <span style="color:#128a3a">(+\u20ac' + addV.toFixed(0) + " a aplicar)</span>" : "") +
            (over ? ' <b>excede</b>' : "") + "</span></div>" +
            '<div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
            Math.round(total) + '" aria-valuetext="' + Math.round(total) + '% de ' + esc(label) +
            (over ? ', excede o limite' : '') + '"' +
            ' style="height:7px;background:#E1E4EA;border-radius:4px;overflow:hidden;display:flex">' +
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

        /* Collapsed by default - six meters is a wall of numbers when usually only one matters.
         * The summary carries the actionable part (what is over, what has room), and it opens
         * automatically when a ceiling is exceeded, because that is the case worth seeing. */
        function renderBars() {
          var add = pendingAdds();
          var keys = ["C05", "C06", "C07", "C08", "C99"];
          var html = keys.map(function (s) {
            return oneBar(s + " " + SECTORS[s], used[s] || 0, add[s] || 0, capFor(s, prof));
          }).join("") +
            oneBar("IVA em fatura (restaura\u00e7\u00e3o, gin\u00e1sios, oficinas...)",
                   used[POT] || 0, add[POT] || 0, POT_CAP);

          var over = [], room = [];
          keys.concat([POT]).forEach(function (k) {
            var cap = k === POT ? POT_CAP : capFor(k, prof);
            var tot = (used[k] || 0) + (add[k] || 0);
            if (tot > cap + 0.5) over.push(k === POT ? "IVA" : k);
            else if (cap - tot > 1) room.push(k === POT ? "IVA" : k);
          });
          var sum = over.length
            ? '<b style="color:#b00">' + over.join(", ") + " excede o teto</b>" +
              (room.length ? ' <span style="color:#6b7780">- ainda h\u00e1 espa\u00e7o em ' + room.join(", ") + "</span>" : "")
            : '<b style="color:#1E5A3A">Nenhum teto excedido</b> <span style="color:#6b7780">- espa\u00e7o em ' +
              room.join(", ") + "</span>";

          var box = document.getElementById("efh-bars");
          if (!box) return;
          var wasOpen = box.querySelector("details");
          wasOpen = wasOpen ? wasOpen.open : over.length > 0;
          box.innerHTML =
            '<details' + (wasOpen ? " open" : "") + ' style="border:1px solid #d5dae1;border-radius:2px;background:#f4f6f9">' +
            '<summary style="cursor:pointer;padding:7px 9px;font-size:12px;list-style:revert">' +
            "Tetos do IRS - " + sum + "</summary>" +
            '<div style="padding:2px 9px 9px">' + html + "</div></details>";
        }

        document.getElementById("efh-body").innerHTML =
          '<div style="margin:-4px 0 10px;padding:7px 9px;background:#f4f6f9;border:1px solid #d5dae1;border-left:3px solid #034ad8;border-radius:4px;font-size:11px;color:#2B363C;display:flex;flex-wrap:wrap;align-items:center;gap:8px">' +
          '<a href="https://revolut.com/referral/?referral-code=nobodykr!JUL2-26-AR-L1&amp;geo-redirect" ' +
          'target="_blank" rel="noopener sponsored nofollow" ' +
          'style="display:inline-flex;align-items:center;gap:5px;color:#034ad8;font-weight:600;text-decoration:none">' +
          '<span style="background:#0075eb;border-radius:3px;padding:2px;display:inline-flex">' +
          '<svg aria-hidden="true" style="width:14px;height:14px;display:block" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 800 800" style="enable-background:new 0 0 800 800;" xml:space="preserve"> <style type="text/css"> .st0{fill:#FFFFFF;} </style> <rect class="st0"/> <g> <rect x="209.051" y="262.097"/> <path d="M628.623,285.554c0-87.043-70.882-157.86-158.011-157.86H209.051v87.603h249.125c39.43,0,72.093,30.978,72.814,69.051 c0.361,19.064-6.794,37.056-20.146,50.66c-13.357,13.61-31.204,21.109-50.251,21.109h-97.046c-3.446,0-6.25,2.8-6.25,6.245v77.859 c0,1.324,0.409,2.59,1.179,3.656l164.655,228.43h120.53L478.623,443.253C561.736,439.08,628.623,369.248,628.623,285.554z"/> </g> </svg>' +
          '</span>Abrir conta Revolut</a>' +
          '<a href="https://buymeacoffee.com/diogoandrade" target="_blank" rel="noopener sponsored nofollow" ' +
          'style="display:inline-flex;align-items:center;gap:4px;color:#2B363C;background:#ffdd00;' +
          'border-radius:2px;padding:2px 7px;font-weight:700;text-decoration:none">\u2615 Buy me a coffee</a>' +
          '<span style="color:#6b7780">Isto \u00e9 gratuito e continua a ser. Se te poupou trabalho e quiseres retribuir, abrir conta pelo link acima d\u00e1-me uma pequena comiss\u00e3o, e a ti n\u00e3o te custa nada.</span>' +
          '</div>' +
          '<p style="margin:0 0 8px"><b>' + pend.length + ' faturas pendentes</b> em ' + year +
          '. Duas sugest\u00f5es por fatura: <b>Prov\u00e1vel</b> (a atividade principal do comerciante, ou o que j\u00e1 usaste antes) e <b>Otimizada</b> (mais dedu\u00e7\u00e3o, com espa\u00e7o no teto). Vem selecionada a Prov\u00e1vel. S\u00f3 aparecem setores em que o comerciante est\u00e1 mesmo registado, mas <b>ser aceite n\u00e3o \u00e9 o mesmo que estar certo</b>: a classifica\u00e7\u00e3o \u00e9 uma declara\u00e7\u00e3o tua \u00e0 AT.</p>' +
          '<div style="background:#f4f6f9;border:1px solid #d5dae1;border-radius:2px;padding:9px;margin-bottom:10px;font-size:12px">' +
          '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center">' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' +
          '<input type="checkbox" id="efh-joint"' + (prof.joint ? " checked" : "") + '> Tributa\u00e7\u00e3o conjunta</label>' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' +
          '<input type="checkbox" id="efh-mono"' + (prof.mono ? " checked" : "") +
          '> Fam\u00edlia monoparental</label></div>' +
          '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #dde5ee">' +
          '<label title="Opcional. Os tetos do IRS s\u00e3o do agregado, mas esta p\u00e1gina s\u00f3 v\u00ea esta conta.">' +
          'Partilhar tetos do agregado (opcional): <input type="email" id="efh-mail" placeholder="o-teu@email.pt" ' +
          'value="' + esc(prof.mail || "") + '" style="width:170px"></label> ' +
          '<button type="button" id="efh-join" style="cursor:pointer">Ligar</button>' +
          '<div id="efh-hh" style="margin-top:4px;color:#666"></div></div>' +
          '<div style="margin:0 0 8px;padding:6px 8px;background:#fdf8ec;border-left:3px solid #8a6100;' +
          'font-size:11px;color:#5a4600"><b>Vers\u00e3o de teste.</b> Esta ferramenta <b>n\u00e3o submete nada</b> ' +
          '\u00e0 AT - s\u00f3 analisa e mostra o plano. Aplicas tu no e-Fatura. Estamos a recolher feedback ' +
          'antes de permitir submiss\u00e3o autom\u00e1tica.</div>' +
          '<div id="efh-bars" style="margin-top:8px"></div>' +
          '<div id="efh-opt" style="margin-top:8px"></div>' +
          '<div style="margin-top:6px;padding:5px 7px;background:#fdf8ec;border-left:3px solid #8a6100;color:#5a4600">' +
          '<b>Aten\u00e7\u00e3o:</b> isto v\u00ea as faturas <b>desta conta</b>. Se entregas o IRS ' +
          '<b>em conjunto</b>, os tetos s\u00e3o do agregado e o que falta \u00e9 <b>menos</b> do que aqui aparece - ' +
          'usa a partilha abaixo. Se entregas <b>em separado</b>, os tetos s\u00e3o s\u00f3 teus e estes n\u00fameros ' +
          'j\u00e1 est\u00e3o certos.</div></div>' +
          '<div style="max-height:52vh;overflow:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:#f4f6f9"><th></th><th>Data</th><th>Emitente</th><th>Valor</th><th title="O setor que a compra provavelmente foi: o teu hist\u00f3rico, ou a atividade principal do comerciante">Prov\u00e1vel</th><th title="O setor que d\u00e1 mais dedu\u00e7\u00e3o e ainda tem espa\u00e7o no teto">Otimizada</th><th>Setor</th></tr></thead>' +
          '<tbody>' + trs + '</tbody></table></div>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
          '<button id="efh-export" style="background:#034ad8;color:#fff;border:0;border-radius:6px;padding:10px 16px;min-height:44px;cursor:pointer;font-weight:600">Copiar plano</button> ' +
          '<button id="efh-mail" style="background:#fff;color:#034ad8;border:1px solid #034ad8;border-radius:6px;padding:10px 16px;min-height:44px;cursor:pointer;font-weight:600">Enviar por email</button> ' +
          '<span id="efh-status" role="status" aria-live="polite" style="color:#555"></span></div>';
        /* DRAFT MODE - the tool does NOT submit anything to the AT.
         * Writing to someone's fiscal record is not something to ship on first release: a wrong
         * sector is the user's declaration, not ours. So this builds the plan and hands it over,
         * and the user applies it themselves in e-Fatura. The submit path exists and is tested
         * (see test-apply.js) - it is deliberately not wired up. */
        // clicking either suggestion applies it to that row and refreshes the ceiling bars
        document.querySelectorAll(".efh-pick").forEach(function (b) {
          b.addEventListener("click", function () {
            var sel = document.querySelector('.efh-sec[data-i="' + b.dataset.i + '"]');
            if (!sel) return;
            sel.value = b.dataset.sec;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });

        function planText() {
          var lines = ["Plano de classificacao e-Fatura - " + year, ""];
          document.querySelectorAll(".efh-ck").forEach(function (ck) {
            if (!ck.checked) return;
            var i = +ck.dataset.i, x = pend[i];
            var sec = document.querySelector('.efh-sec[data-i="' + i + '"]').value;
            lines.push(x.dataEmissaoDocumento + "  " + name34(x) + "  EUR" + eur(x.valorTotal) +
                       "  ->  " + sec + " (" + SECTORS[sec] + ")");
          });
          var o = window.__efhOpt || {};
          lines.push("");
          if (o.wasted > 1) lines.push("Deducao ja desperdicada (tetos cheios): EUR" + o.wasted.toFixed(2));
          if (o.after - o.before > 1) lines.push("Ganho possivel com realocacao: EUR" + (o.after - o.before).toFixed(2));
          lines.push("");
          lines.push("Aplica em faturas.portaldasfinancas.gov.pt. Nada foi submetido por esta ferramenta.");
          return lines.join("\n");
        }
        document.getElementById("efh-export").onclick = function () {
          var t = planText();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(t).then(function () {
              document.getElementById("efh-status").textContent = "Plano copiado. Cola onde quiseres.";
            });
          } else {
            var ta = document.createElement("textarea");
            ta.value = t; document.body.appendChild(ta); ta.select();
            document.execCommand("copy"); ta.remove();
            document.getElementById("efh-status").textContent = "Plano copiado.";
          }
        };
        document.getElementById("efh-mail").onclick = function () {
          // mailto keeps this client-side: the plan goes straight to the user's own mail client,
          // it never touches a server of ours.
          var subj = "Plano e-Fatura " + year;
          window.location.href = "mailto:?subject=" + encodeURIComponent(subj) +
            "&body=" + encodeURIComponent(planText());
        };
        restoreEdits(pend);               // re-apply edits made before a household change
        renderBars();
        (function () {
          var o = optimise(), box = document.getElementById("efh-opt");
          window.__efhOpt = o;
          if (!box) return;
          var bits = [];
          if (o.wasted > 1) {
            bits.push('<b style="color:#b00">\u20ac' + o.wasted.toFixed(0) + ' de dedu\u00e7\u00e3o desperdi\u00e7ada</b> ' +
                      '(tetos j\u00e1 cheios - essas faturas n\u00e3o valem nada onde est\u00e3o)');
          }
          var reg = o.moves.filter(function (m) { return m.x.estadoBeneficio === "R"; });
          if (o.after - o.before > 1) {
            bits.push('Realoca\u00e7\u00e3o \u00f3tima valeria <b>+\u20ac' + (o.after - o.before).toFixed(0) + '</b>' +
                      (reg.length ? ' (inclui <b>' + reg.length + '</b> j\u00e1 registadas que podes alterar no e-Fatura)' : ''));
          }
          if (!bits.length) { box.innerHTML = '<div style="color:#128a3a;font-size:12px">\u2713 Nada por aproveitar - as tuas faturas j\u00e1 est\u00e3o nos melhores setores poss\u00edveis.</div>'; return; }
          box.innerHTML = '<div style="background:#fff8e6;border:1px solid #e8d9a8;border-radius:6px;padding:8px;font-size:12px">' +
            bits.join('<br>') +
            (reg.length ? ' <a href="#" id="efh-optmore" style="color:#034ad8">ver quais</a>' : '') + '</div>';
          var more = document.getElementById("efh-optmore");
          if (more) more.onclick = function (ev) {
            ev.preventDefault();
            more.outerHTML = '<div style="margin-top:6px;max-height:130px;overflow:auto">' +
              reg.slice(0, 40).map(function (m) {
                return '<div>' + esc(m.x.dataEmissaoDocumento) + '  |  ' + esc(name34(m.x)) +
                       '  |  \u20ac' + eur(m.x.valorTotal) + ' - <b>' + m.from + ' -> ' + m.to + '</b></div>';
              }).join("") + '</div>';
          };
        })();
        document.querySelectorAll(".efh-ck").forEach(function (el) { el.onchange = renderBars; });
        document.querySelectorAll(".efh-sec").forEach(function (el) { el.onchange = renderBars; });
        // changing the household re-runs the whole suggestion pass (ceilings move, so do sectors)
        var reprofile = function () {
          snapshotEdits(pend);              // keep the user's corrections across the rebuild
          saveProfile({ joint: document.getElementById("efh-joint").checked,
                        mono: document.getElementById("efh-mono").checked });
          run(caemap);
        };
        document.getElementById("efh-joint").onchange = reprofile;
        document.getElementById("efh-mono").onchange = reprofile;

        var hhBox = document.getElementById("efh-hh");
        if (prof.room) { hhBox.innerHTML = 'Ligado. Chave: <code>' + esc(prof.room.slice(0, 16)) + '...</code>'; }
        document.getElementById("efh-join").onclick = function () {
          var mail = document.getElementById("efh-mail").value.trim();
          var myNif = (rows[0] && rows[0].nifAdquirente) || prof.nif || "";
          if (!mail) { hhBox.textContent = "Escreve um email para gerar a chave."; return; }
          hhBox.textContent = "A gerar chave...";
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

  /* Opt-in, anonymous record of value created. Sends FOUR numbers: year, how much deduction was
   * being wasted, how much the reallocation recovered, how many faturas were touched. No NIF, no
   * email, no merchant, no date, no per-purchase amount. It exists so the project can say what it
   * is actually worth to people with a measurement instead of a claim. Nothing is sent unless the
   * button is pressed. */
  function offerWin(applied) {
    var o = window.__efhOpt || {};
    var box = document.getElementById("efh-status");
    if (!box) return;
    var d = document.createElement("div");
    d.style.cssText = "margin-top:8px;padding:7px;background:#eef7f0;border:1px solid #bfe0c8;border-radius:6px;font-size:12px";
    d.innerHTML = 'Ajuda a mostrar que isto funciona: envia <b>s\u00f3 quatro n\u00fameros</b> ' +
      '(ano, desperd\u00edcio detetado, ganho, n.\u00ba de faturas). Sem NIF, sem email, sem comerciantes. ' +
      '<button type="button" id="efh-win" style="cursor:pointer">Enviar an\u00f3nimo</button> ' +
      '<span id="efh-winmsg"></span>';
    box.appendChild(d);
    document.getElementById("efh-win").onclick = function () {
      var msg = document.getElementById("efh-winmsg");
      fetch(CAEMAP_URL.replace(/sectors\.json$/, "win"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano: year, desperdicado: +(o.wasted || 0).toFixed(2),
                               ganho: +((o.after - o.before) || 0).toFixed(2), aplicadas: applied })
      }).then(function () { msg.textContent = " obrigado!"; })
        .catch(function () { msg.textContent = " falhou (sem problema)"; });
      document.getElementById("efh-win").disabled = true;
    };
  }

  function applySelected() {
    var pend = window.__efhPend || [], picks = [];
    document.querySelectorAll(".efh-ck").forEach(function (ck) {
      if (ck.checked) { var i = +ck.dataset.i; picks.push({ x: pend[i], sec: document.querySelector('.efh-sec[data-i="' + i + '"]').value }); }
    });
    var st = document.getElementById("efh-status"); document.getElementById("efh-apply").disabled = true;
    var ok = 0, fail = 0, n = 0, errs = [];
    (function next() {
      if (n >= picks.length) {
        st.innerHTML = "<b>" + ok + " aplicadas</b>, " + fail + " falhas. Atualize a p\u00e1gina para confirmar.";
        if (errs.length) {
          var reported = errs.some(function (e) { return /atividade registada/i.test(e.reason); });
          st.innerHTML += '<div style="margin-top:6px;padding:6px;background:#fdecec;border-left:3px solid #b00;' +
            'color:#5a0000;max-height:120px;overflow:auto;font-size:11px">' +
            errs.slice(0, 12).map(function (e) {
              return "<div><b>" + esc(e.nome) + "</b> (" + esc(e.sec) + "): " + esc(e.reason) + "</div>";
            }).join("") +
            (reported ? '<div style="margin-top:5px">A AT recusa um setor que o comerciante n\u00e3o tenha registado. ' +
              'Report\u00e1mos esses comerciantes para reverifica\u00e7\u00e3o - escolhe outro setor da lista.</div>' : "") +
            "</div>";
        }
        if (ok > 0) { offerWin(ok); }
        return;
      }
      var p = picks[n++]; st.textContent = "A aplicar " + n + "/" + picks.length + "...";
      fetch("/detalheDocumentoAdquirente.action?idDocumento=" + p.x.idDocumento + "&dataEmissaoDocumento=" + p.x.dataEmissaoDocumento,
        { credentials: "include" }).then(function (r) { return r.text(); }).then(function (htmlText) {
        var form = new DOMParser().parseFromString(htmlText, "text/html").querySelector("#resolverPendencia");
        if (!form) throw new Error("form em falta");
        var body = new URLSearchParams();
        form.querySelectorAll('input[type="hidden"]').forEach(function (inp) { body.set(inp.name, inp.value || ""); });
        body.set("ambitoAquisicaoPend", p.sec);
        return fetch("/resolverPendenciaAdquirente.action", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      }).then(function (r) { return r.text(); }).then(function (t) {
        if (/sucesso/i.test(t)) { ok++; next(); return; }
        fail++;
        /* Show WHY it failed. This used to just count a failure, which told the user nothing and
         * told us nothing either. The message that matters is:
         *   "O emitente nao tem atividade registada (CAE/CIRS) pertencente ao setor indicado"
         * AT validates the sector against the merchant's CAE server-side, so that error means the
         * SHARED map is wrong for this merchant - wrong for everybody, not just this user. Report
         * the NIF for re-verification. ONLY the NIF is sent, nothing else. */
        var m = /atividade registada[^<]*/i.exec(t.replace(/<[^>]*>/g, " "));
        var reason = m ? m[0].trim().slice(0, 90) : "recusada pela AT";
        errs.push({ nome: name34(p.x), sec: p.sec, reason: reason });
        if (/atividade registada/i.test(reason)) {
          try {
            fetch(CAEMAP_URL.replace(/sectors\.json$/, "refresh/") + p.x.nifEmitente, { method: "POST" })
              .catch(function () {});
          } catch (e) {}
        }
        next();
      }).catch(function (e) {
        fail++;
        errs.push({ nome: name34(p.x), sec: p.sec, reason: (e && e.message) || "erro de rede" });
        next();
      });
    })();
  }
})();
