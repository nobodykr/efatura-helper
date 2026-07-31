/* Fatura Boa (c) 2026 Diogo Andrade. Licenca PolyForm Noncommercial 1.0.0
 * (https://polyformproject.org/licenses/noncommercial/1.0.0). Uso nao-comercial apenas; copias
 * carregam este aviso. Origem oficial: faturas.diogoandrade.com | ref fb-lic-4761358cab */
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
  /* PROFILING MODE (opt-in, token-gated - see SPEC-profiling.md). Diogo's bookmarklet variant
   * sets window.__FB_PROFILE before loading this file; the PUBLIC bookmarklet never does, so
   * public users only ever get the e-Fatura classifier below. When the flag is set the tool runs
   * the multi-partition profiling flow instead, and is allowed to run on the OTHER Portal das
   * Financas partitions (Imoveis/rendas, etc.) - a bookmarklet can only read the partition it is
   * clicked on, so each is visited in turn.
   *
   * This flag is a FEATURE FLAG, not a security boundary: the code is public and the flag is
   * copyable. That is fine because every byte of profile data stays in this browser and nothing
   * is submitted - there is nothing on our side to protect. It exists to keep an unfinished
   * feature off the public tool while we test, and comes out in one line when it ships. */
  var PROFILING = !!(window.__FB_PROFILE);
  // Profiling reads Portal das Financas AND Seguranca Social (seg-social.pt) - both official
  // state portals where the user is already logged in.
  var ON_GOV = /(^|\.)(portaldasfinancas\.gov\.pt|seg-social\.pt)$/.test(location.host);

  if (PROFILING) {
    if (!ON_GOV) {
      alert("Abre uma p\u00e1gina das Finan\u00e7as ou da Seguran\u00e7a Social e faz login primeiro.");
      return;
    }
  } else if (!/faturas\.portaldasfinancas\.gov\.pt$/.test(location.host)) {
    alert("Abre primeiro o e-Fatura (faturas.portaldasfinancas.gov.pt) e faz login. Depois usa esta ferramenta.");
    return;
  }
  if (document.getElementById("efh-panel")) { document.getElementById("efh-panel").remove(); }
  var CAEMAP_URL = "https://cae-db.diogoandrade.com/sectors.json";
  // Provably-fair versioning: this label is shown in the panel; the TRUTH is the file's sha384,
  // published per release in /versions.json and checkable at /verificar. Bump on any tool.js change.
  var FB_VERSION = "2026.07.31a";

  /* ADS AS INERT DATA (provably-fair Step 2). The sponsor strip is the ONE piece that should update
   * without re-pinning the core, so it is a DATA feed, not code: the pinned core fetches offers.json
   * and renders it, validating every URL is https and escaping every string. The data can only pick
   * from core-defined styles; it can never inject markup or execute. A built-in DEFAULT (the current
   * offers) is in the audited code, so a pinned core still works and is honest if the feed is down. */
  var OFFERS_URL = "https://faturas.diogoandrade.com/offers.json";
  var DEFAULT_OFFERS = { message: "Isto e gratuito e continua a ser. Se te poupou trabalho e quiseres retribuir, abrir conta pelo link acima da-me uma pequena comissao, e a ti nao te custa nada.",
    offers: [ { style: "revolut", url: "https://revolut.com/referral/?referral-code=nobodykr!JUL2-26-AR-L1&geo-redirect", label: "Abrir conta Revolut" },
              { style: "coffee", url: "https://buymeacoffee.com/diogoandrade", label: "Buy me a coffee" } ] };
  /* Do NOT fetch the feed at this level. This file runs entirely on the bookmarklet click, so a
   * fetch here fires BEFORE the consent gate - and the page promises, literally, that before
   * consent there is not a single network request, not even the public map. A request just to load
   * an ad was the worst possible exception to that. loadOffers() is called from start(), reached
   * only after consent(); until then the strip uses DEFAULT_OFFERS (already in the audited code).
   * renderOffers() always draws with whatever exists at the time, so a late or failed feed just
   * leaves the default - no waiting state, no layout shift. */
  var _offers = null;
  function loadOffers() {
    if (_offers !== null) return;
    try {
      fetch(OFFERS_URL, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (o) { if (o && o.offers) _offers = o; })
        .catch(function () {});
    } catch (e) {}
  }

  var REVOLUT_SVG = '<span style="background:#0075eb;border-radius:3px;padding:2px;display:inline-flex">' +
    '<svg aria-hidden="true" style="width:14px;height:14px;display:block" viewBox="0 0 800 800"><path fill="#fff" d="M628.623,285.554c0-87.043-70.882-157.86-158.011-157.86H209.051v87.603h249.125c39.43,0,72.093,30.978,72.814,69.051 c0.361,19.064-6.794,37.056-20.146,50.66c-13.357,13.61-31.204,21.109-50.251,21.109h-97.046c-3.446,0-6.25,2.8-6.25,6.245v77.859 c0,1.324,0.409,2.59,1.179,3.656l164.655,228.43h120.53L478.623,443.253C561.736,439.08,628.623,369.248,628.623,285.554z"/></svg></span>';
  function renderOffers(o) {
    o = (o && o.offers) ? o : DEFAULT_OFFERS;
    var items = (o.offers || []).filter(function (x) { return /^https:\/\//i.test(x.url || ""); }).map(function (x) {
      var href = esc(x.url), label = esc(x.label || "");
      if (x.style === "revolut") return '<a href="' + href + '" target="_blank" rel="noopener sponsored nofollow" style="display:inline-flex;align-items:center;gap:5px;color:#034ad8;font-weight:600;text-decoration:none">' + REVOLUT_SVG + label + '</a>';
      if (x.style === "coffee") return '<a href="' + href + '" target="_blank" rel="noopener sponsored nofollow" style="display:inline-flex;align-items:center;gap:4px;color:#2B363C;background:#ffdd00;border-radius:2px;padding:2px 7px;font-weight:700;text-decoration:none">\u2615 ' + label + '</a>';
      return '<a href="' + href + '" target="_blank" rel="noopener sponsored nofollow" style="color:#034ad8;font-weight:600;text-decoration:none">' + label + '</a>';
    }).join("");
    return '<div style="margin:14px 0 2px;padding:7px 9px;background:#f4f6f9;border:1px solid #d5dae1;border-left:3px solid #034ad8;border-radius:4px;font-size:11px;color:#2B363C;display:flex;flex-wrap:wrap;align-items:center;gap:8px">' +
      items + '<span style="color:#6b7780">' + esc(o.message || "") + '</span></div>';
  }

  /* DRAFT MODE. While true the panel never submits anything to the AT: no apply button is
   * rendered and applySelected() is unreachable. The page at faturas.diogoandrade.com states
   * this in several places ("Nada e submetido, de todo"), so FLIPPING THIS TO false IS NOT A
   * CODE-ONLY CHANGE - those claims become false and must be rewritten first. See the plan file
   * for the exact passages (index.html 202-205, 246-249, 257, 364-370, 377-381, meta 7 and 16,
   * and planText() below). test-draft.js pins the true behaviour. */
  var DRAFT = true;

  /* Consent gate. Nothing is read from the e-Fatura account until the user agrees, and nothing
   * leaves the browser unless they additionally tick the share box (default off). Both live in
   * localStorage so the agreement is asked once, not every time. */
  var CKEY = "efh-consent-v1";

  /* The IRS deductions view - a DIFFERENT endpoint from obterDocumentosAdquirente, and the only
   * one that reports what deduction each invoice actually generates (valorTotalBeneficioProv,
   * valorTotalSetorBeneficio, valorTotalDespesasGerais). Read-only: once the AT has attributed a
   * benefit (estadoBeneficio "RBATF") the consumer CANNOT reallocate it - there is no alter form
   * anywhere in e-Fatura, only removerDocumentoAdquirente. So this drives the "where you stand"
   * panel, and must never be presented as an amount the user can click to recover. */
  var IRS_URL = "/json/obterDocumentosIRSAdquirente.action";

  var SECTORS = { C01: "Repara\u00e7\u00e3o autom\u00f3veis", C02: "Repara\u00e7\u00e3o motociclos", C03: "Alojamento / restaura\u00e7\u00e3o",
    C04: "Cabeleireiros / beleza", C05: "Sa\u00fade", C06: "Educa\u00e7\u00e3o", C07: "Im\u00f3veis / habita\u00e7\u00e3o", C08: "Lares",
    C09: "Veterin\u00e1rias", C10: "Transportes p\u00fablicos", C11: "Gin\u00e1sios", C12: "Jornais / revistas",
    C13: "Livros", C14: "Art\u00edsticas", C15: "Museus / monumentos", C99: "Outros" };
  /* The live #ambitoAquisicao list on e-Fatura is C01..C15 + C99. estadoDocumentoFilter has more
   * states than the tool acts on: P Pendente, A Anulado pelo emitente, R Registado, B Beneficio
   * atribuido, C Anulado apos comunicacao posterior, E Registado apos comunicacao posterior,
   * N Beneficio NAO atribuido (merchant declined - not fixable by reclassifying), O Duplicado. */
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
    // Art. 78.o-E n.1 a) EM VIGOR (pagina dedicada DRE 2014-70048167-1124882175, alterada
    // 2026-06-03, lida 2026-07-28): rendas 15% ate 800 EUR. O n.4 ESCALONA para cima (ate 1.100 p/
    // coletavel <= 1.o escalao, formula ate 30.000) - nao modelado; 800 e o piso, logo conservador.
    // Historico: 900 (original) nao era o valor de nenhum ano; 502 (fix de ontem) era o texto
    // DESATUALIZADO do render do diploma-pai - o valor por ano vive em RENDAS_CAP_ANO abaixo.
    C07: { rate: 0.15, base: "total", cap: 800 },
    C08: { rate: 0.25, base: "total", cap: 403.75 },
    C99: { rate: 0.35, base: "total", cap: 250, perTaxpayer: true },
    C01: { rate: 0.15, base: "iva", pot: POT }, C02: { rate: 0.15, base: "iva", pot: POT },
    C03: { rate: 0.15, base: "iva", pot: POT }, C04: { rate: 0.15, base: "iva", pot: POT },
    // C09: atividades veterinarias 15% (n.1 e); MEDICAMENTOS veterinarios sao 35% (n.6) mas a fatura
    // nao distingue consulta de medicamento, por isso usamos 15% em tudo - subestima, nunca inventa.
    C09: { rate: 0.15, base: "iva", pot: POT }, C10: { rate: 1.00, base: "iva", pot: POT },
    C11: { rate: 0.30, base: "iva", pot: POT }, C12: { rate: 1.00, base: "iva", pot: POT },
    C13: { rate: 0.15, base: "iva", pot: POT }, C14: { rate: 0.15, base: "iva", pot: POT },
    // C15 museus e monumentos: art. 78.o-F n.1 k) e l) EM VIGOR - 15% confirmado (DRE, 2026-07-28).
    C15: { rate: 0.15, base: "iva", pot: POT }
  };
  var POT_CAP = 250;

  // Household shape changes the ceilings, and e-Fatura does not expose it (it lives on another
  // origin, so the browser blocks us from reading it). So we ask once and keep it in localStorage
  // - it never leaves your browser, same as everything else here.
  var PKEY = "efh-profile";
  var HH_URL = "https://cae-db.diogoandrade.com/household/";

  /* Household sharing - OPT-IN, off unless you press Ligar.
   *
   * Ceilings are per agregado familiar, but this page only ever sees ONE account's faturas. On real
   * data one account showed 3.186 EUR of despesas gerais where the household had 10.389 EUR - so a
   * solo view can report a ceiling as having room when it is 14x over.
   *
   * The room key is 256 random bits (newRoom, below). It is NOT derived from your NIF, your email,
   * or anything else about you - none of those are read for this feature at all. The key IS the
   * secret: whoever holds it can read and write that room, so share it only with your household,
   * the same way you would a password. Empty field creates a room; pasting a key joins one.
   *
   * What is sent: six numbers, the deduction used against each ceiling, plus a random per-browser
   * member id. No faturas, no merchants, no dates, no amounts, no NIF, no email. */
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

  /* Room key: 256 bits of CSPRNG, NOT derived from anything about you.
   *
   * It used to be PBKDF2(NIF + email) with a fixed, public salt. That was wrong twice over:
   *   1. SECURITY. PBKDF2 slows a guess but adds no entropy. A NIF is 9 checksummed digits and an
   *      email is often public, so anyone who knew both could recompute the key and then read,
   *      overwrite or DELETE that household's numbers - the server has no auth on those routes.
   *      Deriving from guessable inputs threw away exactly the secrecy that sharing the key out
   *      of band was supposed to provide.
   *   2. IT DID NOT WORK. Each browser derived from ITS OWN nifAdquirente, so two people could
   *      never land on the same room. Everyone got a private single-member room, while the UI
   *      told them to "share this key" - a key the other person had no way to use.
   * Random fixes both: the key IS the secret, and a partner joins by pasting it.
   * Trade-off: lose localStorage and the room is gone. Hence it is shown in full, to be saved -
   * and it is the same key you already had to send your partner anyway. */
  function newRoom() {
    var b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) {
      return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  var ROOM_RE = /^[0-9a-f]{32,128}$/i;   // must match household.py ROOM_RE

  /* Anonymous per-user id for the recovered-euro counter (dedup + distinct-user count). Hash of the
   * user's OWN NIF - the NIF never leaves the browser, only the hash. UNLIKE the room key above, this
   * is NOT a secret and grants NOTHING: the server peppers it (HMAC) before storing and /counter/total
   * returns only aggregates, so "guessable NIF -> recompute hash" buys an attacker nothing (they can
   * at most re-post that user's own recoverable figure). And deriving per-person is exactly what we
   * want here (one id per taxpayer), the very thing that was wrong for a SHARED room key. */
  var FB_UID_SALT = "fatura-boa-uid-v2";
  function sha256hex(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  /* PBKDF2 e nao um sha256 simples (v2, 2026-07-28): os NIFs pessoais tem ~3e7 valores validos
   * (prefixo 1/2/3 + digito de controlo), por isso um hash rapido com salt publico reverte-se com
   * uma tabela barata. 600k iteracoes tornam essa tabela cara (horas de GPU, nao segundos) - e uma
   * DESACELERACAO honesta, nao uma impossibilidade; a protecao real em transito e a cifra RSA-OAEP
   * aplicada no envio (ver sendCounter no /perfil). Corre UMA vez por leitura (~0,5s). */
  function uidFromNif(nif) {
    if (!nif) return Promise.resolve(null);
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(String(nif)), "PBKDF2", false, ["deriveBits"])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(FB_UID_SALT), iterations: 600000 }, k, 256);
      })
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
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

  /* PAST-YEAR RE-AUDIT. e-Fatura keeps invoices per year (the same obterDocumentosAdquirente endpoint
   * takes a date range), so we can read any past year and see how much of each ceiling was used vs
   * still free - i.e. deduction that MIGHT be recoverable via a declaracao de substituicao (within
   * the CPPT/LGT windows). Only the rendas ceiling (C07) moved across years; the rest held. Values
   * are DRE/AT-verified in year_snapshots.json. Indicators only - never a submission. */
  var RENDAS_CAP_ANO = { 2023: 502, 2024: 600, 2025: 600, 2026: 800 };   // C07 base per income year (2026: Lei 73-A/2025 OE-2026, DRE em vigor)
  /* obterDocumentosAdquirente CAPS at 300 rows and returns the MOST RECENT first, so summing an
   * unfiltered year silently misses invoices on a busy year. But it accepts ambitoAquisicaoFilter
   * (a sector code), and a single sector is always well under 300 - so we fetch PER SECTOR to get
   * the whole year accurately. It also refuses a multi-year range ("mesmo ano"), so one year at a
   * time. Verified on real data 2026-07-24. */
  function _d(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function _iso(d) { var p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function _midDate(ini, fim) {
    var a = _d(ini), z = _d(fim);
    var mid = new Date((a.getTime() + z.getTime()) / 2); mid.setHours(0, 0, 0, 0);
    if (_iso(mid) <= ini || _iso(mid) >= fim) return null;   // range too small to split
    return _iso(mid);
  }
  function _nextDay(iso) { var d = _d(iso); d.setDate(d.getDate() + 1); return _iso(d); }
  /* Fetch every invoice for a sector in [ini,fim] (SAME YEAR). obterDocumentosAdquirente caps at 300
   * and reports the true count in totalElementos - so if we got fewer than that, the range is capped
   * and we split it in half and recurse. Halves stay inside the year, so no "mesmo ano" error. This
   * GUARANTEES completeness (rows.length >= totalElementos) instead of silently truncating. */
  function fetchRange(sec, ini, fim) {
    var u = "/json/obterDocumentosAdquirente.action?dataInicioFilter=" + ini + "&dataFimFilter=" + fim + "&ambitoAquisicaoFilter=" + sec;
    return getJSON(u).then(function (j) {
      if (j && (j.expiredSession === true || j.success === false)) throw new Error("sess\u00e3o do e-Fatura expirada");
      var rows = (j && (j.linhas || j.documentos)) || []; if (!Array.isArray(rows)) rows = [];
      var total = (j && j.totalElementos != null) ? j.totalElementos : rows.length;
      if (rows.length >= total) return rows;                 // complete
      var mid = _midDate(ini, fim);
      if (!mid) return rows;                                  // cannot split further - accept what we have
      return fetchRange(sec, ini, mid).then(function (a) {
        return fetchRange(sec, _nextDay(mid), fim).then(function (b) { return a.concat(b); });
      });
    });
  }
  function fetchSector(ano, sec) { return fetchRange(sec, ano + "-01-01", ano + "-12-31"); }
  // Deduction is "used" once the benefit is ATTRIBUTED (R Registado, B Beneficio, E Registado apos);
  // only P Pendente is still capturable by classifying; N/A/C/O never count.
  function isAttributed(s) { return s === "R" || s === "B" || s === "E"; }
  /* THE OPTIMISER CORE, pure and reusable. Given a year's invoices, the cae-db map (NIF -> the
   * sectors that merchant is ACTUALLY registered for) and the profile, it finds the footgun-safe
   * `recoverable`: attributed invoices sitting in a full pot where the SAME merchant is also
   * registered for a sector that still has room -> reclassifying them recovers deduction. Only
   * sectors the merchant genuinely holds (from caemap/SICAE) are ever offered, so it can never say
   * "declare groceries as Saude". Used by run() for the current year AND by reAuditAno for past
   * years (pass the per-year rendas cap for C07). Identical logic; do not let them diverge. */
  function movablesAndRecoverable(rows, caemap, prof, rendasCap) {
    var used = usedSoFar(rows, prof);
    var capOf = function (sec) { return (sec === "C07" && rendasCap != null) ? rendasCap : capFor(sec, prof); };
    var headroom = function (sec) { var c = CEIL[sec]; if (!c) return Infinity; return capOf(sec) - (used[c.pot || sec] || 0); };
    var dedu = function (x, sec) { var c = CEIL[sec]; if (!c) return 0; var v = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100; return v * (sec === "C99" ? c99Rate(prof) : c.rate); };
    var gain = function (sec, x) { var c = CEIL[sec]; if (!c) return 0; var base = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100; return Math.max(0, Math.min(headroom(sec), c.rate * base)); };
    var movR = [];
    rows.forEach(function (x) {
      if (!isAttributed(x.estadoBeneficio)) return;
      var cur = x.actividadeEmitente; if (!cur || !CEIL[cur]) return;
      var reg = caemap[x.nifEmitente];
      reg = reg ? (Object.prototype.toString.call(reg) === "[object Array]" ? reg : [reg]) : [];
      var bestA = null, bestG = gain(cur, x) + 0.01;   // must beat the current sector
      reg.forEach(function (a) { if (a === cur || !CEIL[a]) return; var g = gain(a, x); if (g > bestG) { bestG = g; bestA = a; } });
      // ACONSELHADO vs OTIMIZADO. O `reg` vem do cae-db ORDENADO: reg[0] deriva do **CAE PRINCIPAL**
      // (cae-db guarda caes = [principal] + secundarios, dedup preservando a ordem). Mover para o
      // setor do CAE PRINCIPAL e DEFENSAVEL - e o que o comerciante faz mesmo. Mover para um setor
      // secundario e apenas ARITMETICAMENTE possivel (um hipermercado tem CAE de farmacia, mas a
      // compra provavelmente nao foi um medicamento). E o caso mais forte de todos: a fatura estar em
      // "gerais/C99" (o saco por omissao) quando o emitente TEM um setor especifico - aqui a
      // classificacao atual e que provavelmente esta errada, contra o contribuinte.
      var primario = reg.length ? reg[0] : null;
      if (bestA) {
        var aconselhado = (bestA === primario) &&
                          (cur === "C99" || !CEIL[cur] || primario !== cur);
        movR.push({ x: x, to: bestA, primario: primario, aconselhado: !!aconselhado,
                    deGerais: cur === "C99" });
      }
    });
    // Greedy por teto. `only` limita o conjunto (usado para o cenario ACONSELHADO).
    var greedy = function (set) {
      var pots = {}, total = 0;
      set.slice().sort(function (a, b) { return dedu(b.x, b.to) - dedu(a.x, a.to); }).forEach(function (m) {
        var c = CEIL[m.to], k = c.pot || m.to;
        var roomLeft = headroom(m.to) - (pots[k] || 0);
        if (roomLeft <= 0.01) return;
        var g = Math.min(dedu(m.x, m.to), roomLeft);
        if (g <= 0.01) return;
        pots[k] = (pots[k] || 0) + g; total += g;
      });
      return +total.toFixed(2);
    };
    var movA = movR.filter(function (m) { return m.aconselhado; });
    return { movR: movR, recoverable: greedy(movR),
             movA: movA, recoverableAconselhado: greedy(movA),
             nDeGerais: movR.filter(function (m) { return m.deGerais; }).length };
  }
  /* Past-year re-audit = the optimiser above, run over EVERY invoice of a year (all sectors, fetched
   * completely via the recursive splitter), cross-referenced NIF-by-NIF against cae-db. Reports how
   * much deduction was left on the table by suboptimal classification, and which target sectors. */
  function reAuditAno(ano, prof) {
    return fetchSector(ano, "").then(function (rows) {          // "" = all sectors, uncapped
      return fetchMap(rows.map(function (x) { return x.nifEmitente; })).then(function (caemap) {
        var mr = movablesAndRecoverable(rows, caemap || {}, prof, RENDAS_CAP_ANO[ano]);
        var byTarget = {};
        mr.movR.forEach(function (m) { var s = SECTORS[m.to] || m.to; byTarget[s] = (byTarget[s] || 0) + 1; });
        var byTargetA = {};
        (mr.movA || []).forEach(function (m) { var s = SECTORS[m.to] || m.to; byTargetA[s] = (byTargetA[s] || 0) + 1; });
        return { ano: ano, recuperavel: mr.recoverable, nMover: mr.movR.length,
                 porSetor: byTarget, totalFaturas: rows.length,
                 // cenario ACONSELHADO: so movimentos para o setor do CAE PRINCIPAL do emitente
                 recuperavelAconselhado: mr.recoverableAconselhado, nMoverAconselhado: (mr.movA || []).length,
                 porSetorAconselhado: byTargetA, nDeGerais: mr.nDeGerais };
      });
    });
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
  /* The Resumo tab. Two numbers, and BOTH are actionable:
   *
   *   - pending faturas        -> classify them (resolverPendenciaAdquirente).
   *   - o.wasted on ATTRIBUTED  -> deduction sitting in a full ceiling. RECOVERABLE by re-
   *     classifying the fatura: on its detalhe page, Alterar -> pick the sector -> Guardar, which
   *     POSTs alterarDocumentoAdquirente.action. Verified live 20-07-2026 (Diogo does this by hand).
   *
   * An earlier version of this comment claimed the attributed amount could NOT be recovered. That
   * was wrong - it came from a probe that only enumerated <form action> and never saw the JS-driven
   * <a id="alterarDocumentoBtn">. The whole reason the wasted number is worth showing is that it CAN
   * be fixed, until 25 February of the following year. Zero pending is normal once the queue is
   * cleared, so that path still gets a real answer rather than an empty panel. */
  function renderResumo(o, nPend, room, full, recoverable, movCount) {
    /* room/full are computed by the CALLER, inside run(), because headroom() closes over that
     * call's profile and ceiling state and does not exist out here. An earlier version called
     * headroom() directly from this scope: check-functions.js passed (it only matches names, it
     * knows nothing about scope) and the ReferenceError silently killed the whole optimiser IIFE,
     * taking the ceilings accordion with it. Only test-accordion caught it. */
    var box = document.getElementById("efh-resumo");
    if (!box) return;
    var gain = Math.max(0, (o.after || 0) - (o.before || 0));
    room = room || []; full = full || [];
    var h = "";
    // ONE number, and it is DEDUCTION recovered - this is IRS, not "ganhos". Total = the extra
    // deduction from classifying pending faturas + moving already-registered ones out of a full
    // ceiling. "Recuperar dedu\u00e7\u00e3o" (not "ganhar") is the honest frame.
    var total = gain + (recoverable > 1 ? recoverable : 0);
    if (total > 0.5) {
      var parts = [];
      if (nPend > 0) parts.push(nPend + ' por classificar');
      if (movCount > 0) parts.push(movCount + ' por corrigir');
      h += '<div style="text-align:center;padding:8px 0 4px">' +
           '<div style="color:#6b7780;font-size:12px">Podes recuperar em dedu\u00e7\u00e3o no IRS</div>' +
           '<div class="efh-num" style="font-size:34px;font-weight:800;color:#1E5A3A;line-height:1.1">\u20ac' +
           total.toFixed(2) + '</div>' +
           '<div style="color:#6b7780;font-size:12px">' + parts.join(' \u00b7 ') + '</div></div>';
    } else if (nPend > 0) {
      h += '<div style="text-align:center;padding:8px 0 4px">' +
           '<div style="font-size:18px;font-weight:700;color:#2B363C">' + nPend + ' fatura' + (nPend === 1 ? '' : 's') + ' por classificar</div>' +
           '<div style="color:#6b7780;font-size:12px">Nesta conta n\u00e3o h\u00e1 dedu\u00e7\u00e3o extra a ganhar - mas classifica na mesma para ficar em ordem.</div></div>';
    } else {
      h += '<div style="text-align:center;padding:8px 0 4px">' +
           '<div style="font-size:20px;font-weight:700;color:#1E5A3A">Est\u00e1 tudo otimizado</div>' +
           '<div style="color:#6b7780;font-size:12px">As tuas faturas de ' + year + ' j\u00e1 rendem o m\u00e1ximo poss\u00edvel.</div></div>';
    }
    if (movCount > 0 && recoverable > 1) {
      // Descriptive only - the euro is in the headline. These invoices sit in a FULL sector while
      // the SAME merchant is also registered somewhere with room.
      h += '<div style="margin-top:10px;background:#eef7f0;border:1px solid #bfe0c8;border-radius:6px;padding:9px;font-size:12px;line-height:1.5">' +
           'Dessas, <b>' + movCount + ' fatura' + (movCount === 1 ? '' : 's') + '</b> ' +
           (movCount === 1 ? 'est\u00e1 numa categoria cheia' : 'est\u00e3o em categorias cheias') +
           ' mas o comerciante tamb\u00e9m est\u00e1 registado numa com espa\u00e7o' +
           (room.length ? ' (' + room.join(", ") + ')' : '') + '.<br>' +
           // In DRAFT the tool never submits - Detalhe only SHOWS which faturas; the change is done
           // in e-Fatura. So no misleading "ou no e-Fatura" as if Detalhe were an apply path.
           (DRAFT
             ? 'V\u00ea quais em <b>Detalhe</b> (marcadas <b>corrigir</b>) e corrige-as no e-Fatura, na p\u00e1gina de cada fatura: <b>Alterar</b> \u2192 setor \u2192 <b>Guardar</b>'
             : 'Corrige em <b>Detalhe</b> (bot\u00e3o Aplicar) ou no e-Fatura (<b>Alterar</b> \u2192 setor \u2192 <b>Guardar</b>)') +
           ', at\u00e9 <b>25 de fevereiro de ' + (year + 1) + '</b>.</div>';
    } else if (o.wasted > 1) {
      // Over a ceiling but NOTHING to move - the honest, calm message. Exceeding Despesas Gerais is
      // normal: those merchants are only registered for that sector, so there is nowhere to put the
      // spend. Do NOT frame the overflow as recoverable - it is not.
      h += '<div style="margin-top:10px;background:#f4f6f9;border:1px solid #d5dae1;border-radius:6px;padding:9px;font-size:12px;line-height:1.5;color:#4a5a63">' +
           'Est\u00e1s <b>\u20ac' + o.wasted.toFixed(2) + '</b> acima do teto de Despesas Gerais (250\u20ac), mas isso \u00e9 ' +
           '<b>normal</b> e n\u00e3o h\u00e1 nada a corrigir: essas compras s\u00e3o em comerciantes registados s\u00f3 ' +
           'nessa categoria, por isso n\u00e3o h\u00e1 para onde as mover.</div>';
    }
    if (nPend > 0) {
      h += '<div style="margin-top:10px;font-size:12px;color:#5a4600;background:#fdf8ec;border-left:3px solid #8a6100;padding:6px 8px">' +
           'Ao classificares, est\u00e1s a <b>declarar \u00e0 AT</b> que a compra foi nesse setor. ' +
           'Ser aceite n\u00e3o \u00e9 o mesmo que estar certo.</div>' +
           '<p style="margin:8px 0 0;font-size:12px;color:#6b7780">Podes classificar at\u00e9 <b>25 de fevereiro de ' +
           (year + 1) + '</b>. Abre <b>Detalhe</b> para escolher fatura a fatura.</p>';
    }
    box.innerHTML = h;
  }

  /* Learning loop. Fires only when the user ticked the share box in the consent gate, and sends
   * three fields per fatura: the MERCHANT's nif, what we suggested, what they chose. Never an
   * amount, never a date, never the user's own nif - see POST /outcome in cae-db/household.py.
   *
   * It fires on "Copiar plano" because in DRAFT mode that is the moment a decision is made; there
   * is no apply. Fire-and-forget: a failure here must never affect the user, so everything is
   * swallowed. Deduped per merchant+choice so one click cannot spam the endpoint. */
  function shareOn() { var c = consent(); return !!(c && c.share); }

  function sendOutcomes(pend) {
    if (!shareOn() || !pend || !pend.length) return;
    var url = CAEMAP_URL.replace(/sectors\.json$/, "outcome"), seen = {}, sent = 0;
    pend.forEach(function (x, i) {
      var ck = document.querySelector('.efh-ck[data-i="' + i + '"]');
      var se = document.querySelector('.efh-sec[data-i="' + i + '"]');
      if (!ck || !ck.checked || !se) return;
      var nif = String(x.nifEmitente || "").trim();
      var sug = String(x.__sug || "").toUpperCase(), cho = String(se.value || "").toUpperCase();
      if (!/^[0-9]{8,9}$/.test(nif) || !/^C[0-9]{2}$/.test(sug) || !/^C[0-9]{2}$/.test(cho)) return;
      var k = nif + sug + cho;
      if (seen[k] || sent >= 200) return;
      seen[k] = 1; sent++;
      try {
        // consent:true is REQUIRED by the server (403 without it). This block only runs when
        // sharing is on, so asserting it here is honest - and it means a stale or modified client
        // that never asked the user is rejected instead of silently contributing.
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nif: nif, suggested: sug, chosen: cho, consent: true }) }).catch(function () {});
      } catch (e) {}
    });
  }

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
    '<a href="https://faturas.diogoandrade.com" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.45)" title="Abrir faturas.diogoandrade.com">Fatura Boa</a> ' +
    '<span style="font-weight:400;font-size:11px;opacity:.85">v' + FB_VERSION + ' \u00b7 <a href="https://faturas.diogoandrade.com/verificar" target="_blank" rel="noopener" style="color:#cfe0ff">verificar</a></span>' +
    '<button type="button" aria-label="Fechar" style="float:right;cursor:pointer;background:none;border:0;color:#fff;font:inherit;padding:0 4px" onclick="document.getElementById(\'efh-panel\').remove()">\u2715</button></div>' +
    '<div style="background:#fdecec;border-bottom:2px solid #c8102e;padding:8px 12px;font-size:12px;line-height:1.45;color:#5a0000">'+'<b>Esta ferramenta nunca te pede a password.</b> Corre na sess\u00e3o que j\u00e1 abriste, s\u00f3 nesta p\u00e1gina. '+'Se algum site te pedir as credenciais das Finan\u00e7as, \u00e9 burla.</div>' +
    '<div id="efh-body" style="padding:14px">A carregar...</div>');

  /* CONSENT GATE. The panel does not touch the account until the user says yes. Two separate
   * things, and they are deliberately not bundled: agreeing to READ (local, required to do
   * anything at all) and agreeing to SHARE (off by default, and only ever merchant NIF + sector).
   * Asking after collecting would be the wrong order - by then it is already done. */
  function consent() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) {}
    return c;
  }
  function saveConsent(share) {
    try { localStorage.setItem(CKEY, JSON.stringify({ ok: true, share: !!share, ts: Date.now() })); } catch (e) {}
  }

  /* Fetch ONLY the slices of the sector map this account actually needs.
   *
   * This used to download the whole map (303k merchants, 1.5 MB gzipped, ~3 s) on every single
   * run, because at that point the tool did not yet know which merchants you had. Now the faturas
   * are read first, so it can ask for just the buckets its own NIFs fall into: ~77 requests of
   * ~7 KB, about 110 KB in total. Faster AND less of the map handed out.
   *
   * A bucket is the last 3 digits of the NIF, so the server sees only "this user has some
   * merchant ending in 311" - one of roughly 300. It never learns which. That is the whole point:
   * a per-NIF lookup would name your merchants outright, and downloading everything was the
   * previous way of avoiding that.
   *
   * Fails soft, per bucket: a bucket that errors just yields {} and those merchants fall back to
   * C99, exactly as an unknown merchant always has. Nothing breaks, you simply lose that hint.
   */
  function bucketOf(nif) { return String(nif || "").slice(-3); }

  function fetchMap(nifs) {
    var seen = {}, buckets = [];
    nifs.forEach(function (n) {
      var b = bucketOf(n);
      if (/^\d{3}$/.test(b) && !seen[b]) { seen[b] = 1; buckets.push(b); }
    });
    if (!buckets.length) return Promise.resolve({});
    var base = CAEMAP_URL.replace(/sectors\.json$/, "bucket/");
    return Promise.all(buckets.map(function (b) {
      return fetch(base + b).then(function (r) { return r.ok ? r.json() : {}; })
                            .catch(function () { return {}; });
    })).then(function (parts) {
      var map = {};
      parts.forEach(function (p) { for (var k in p) if (p.hasOwnProperty(k)) map[k] = p[k]; });
      return map;
    });
  }

  function start() {
    // Consent exists by the time we reach start() (gate accept, or the returning-user path that
    // guards on consent()). Only now is any network request allowed - including the sponsor feed.
    loadOffers();
    // faturas FIRST, then only the map slices they need. Order matters: it cannot know which
    // buckets to ask for until it knows your merchants.
    run();
  }

  function gate() {
    document.getElementById("efh-body").innerHTML =
      '<p style="margin:0 0 10px">Isto l\u00ea as tuas faturas de <b>' + year + '</b> directamente do e-Fatura, ' +
      'na sess\u00e3o que j\u00e1 tens aberta, e faz as contas <b>no teu navegador</b>.</p>' +
      '<ul style="margin:0 0 12px 18px;padding:0;line-height:1.5">' +
      '<li>N\u00e3o te pede, nem v\u00ea, a tua password.</li>' +
      '<li>As tuas faturas <b>n\u00e3o s\u00e3o enviadas para lado nenhum</b>.</li>' +
      '<li>A classifica\u00e7\u00e3o \u00e9 uma <b>declara\u00e7\u00e3o tua \u00e0 AT</b> - ser aceite n\u00e3o \u00e9 o mesmo que estar certo.</li>' +
      '</ul>' +
      '<label style="display:block;background:#f4f6f9;border:1px solid #d5dae1;border-radius:6px;padding:9px;margin-bottom:12px;font-size:12px;line-height:1.45;cursor:pointer">' +
      '<input type="checkbox" id="efh-share" style="margin-right:6px"> ' +
      'Opcional: partilhar <b>o NIF do comerciante e o setor escolhido</b> para melhorar as sugest\u00f5es. ' +
      'Sem valores, sem datas, sem o teu NIF. Podes deixar desligado.' +
      '</label>' +
      '<button type="button" id="efh-go" style="cursor:pointer;background:#034ad8;color:#fff;border:0;' +
      'border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">Concordo, ver resultado</button>';
    document.getElementById("efh-go").onclick = function () {
      saveConsent(document.getElementById("efh-share").checked);
      document.getElementById("efh-body").innerHTML = "A ler as tuas faturas...";
      start();
    };
  }

  /* =========================  PROFILING (SPEC-profiling.md)  =========================
   * Self-contained. Reuses only `panel` (already rendered), `esc`, and `year` from above; it
   * never touches the classifier's state. Data goes to its OWN localStorage keys and stays in the
   * browser. Kept as one block so the boundary with the classifier is obvious - a step toward the
   * engine/UI separation the review flagged. */
  var PROF_KEY = "fb-profile-v1";          // versioned so a schema change can't misread old data
  var PROF_CONSENT = "fb-profile-consent-v1";

  /* KNOWN CONSTRAINT (found during v0 build). AT's partitions are DIFFERENT ORIGINS -
   * faturas / imoveis / sitfiscal.portaldasfinancas.gov.pt - so localStorage written on one is
   * invisible to the others (same-origin policy). This overlay therefore reads and shows the
   * profile PER ORIGIN; it cannot by itself assemble one profile across partitions. True
   * cross-partition assembly needs a decision (SPEC open item): either a collector page on our
   * origin that each partition read pushes to via URL fragment (nothing to a server, survives
   * storage partitioning), or a Domain=.portaldasfinancas.gov.pt cookie (shared across subdomains
   * but sent to AT). Until that lands, v0 is a correct per-partition reader, not a combiner. */

  // Each partition lives on its OWN host. `read` returns a Promise -> {data, source}, or rejects
  // with an Error whose message is shown to the user. To add a partition (patrimonio, dividas,
  // SS, ...) append here and write its reader; nothing else changes.
  var PARTITIONS = [
    { id: "efatura", label: "e-Fatura", host: "faturas.portaldasfinancas.gov.pt",
      // .action entry that prompts login itself if there is no session (a login-less deep path
      // 404s). Verified 2026-07-23: this returns 302 -> login -> the invoices page.
      open: "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action",
      why: "As tuas faturas e o setor de dedu\u00e7\u00e3o de cada uma.", read: readEfatura },
    { id: "rendas", label: "Rendas (Im\u00f3veis)", host: "imoveis.portaldasfinancas.gov.pt",
      open: "https://imoveis.portaldasfinancas.gov.pt/arrendamento/consultarContratos/locador",
      why: "Contratos de arrendamento e recibos de renda - rendimentos da categoria F.", read: readRendas },
    { id: "situacao", label: "Situa\u00e7\u00e3o fiscal (d\u00edvidas e prazos)", host: "sitfiscal.portaldasfinancas.gov.pt",
      pathHint: "/geral",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/geral/dashboard",
      why: "D\u00edvidas e coimas em aberto, e os pr\u00f3ximos prazos da agenda fiscal.", read: readSituacao },
    // Cadastro / atividade (dainter). Authoritative Cat B + IVA-regime source; also open-vs-cessada.
    { id: "atividade", label: "Atividade (cadastro e IVA)", host: "sitfiscal.portaldasfinancas.gov.pt",
      pathHint: "/atividade",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/atividade/atividade/consultardeclaracoes",
      why: "Declara\u00e7\u00f5es de atividade e regime de IVA - se \u00e9s/foste trabalhador independente.", read: readAtividade },
    // Same host as situacao (sitfiscal) but the /inffin path and DIFC login partition, so its own
    // step. This is the assessed-IRS history - the outcome of every year's declaration.
    { id: "irs", label: "IRS (liquida\u00e7\u00f5es e reembolsos)", host: "sitfiscal.portaldasfinancas.gov.pt",
      pathHint: "/inffin",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/inffin/entrada.html",
      why: "As liquida\u00e7\u00f5es de IRS de todos os anos e os reembolsos - o hist\u00f3rico fiscal.", read: readIRS },
    // Movimentos financeiros (movfin). One rich page: ALL taxes, all years, pagamentos + reembolsos +
    // coimas classified. Server-rendered HTML table, so its own reader parses it. Own /movfin session.
    { id: "movfin", label: "Movimentos financeiros (pagamentos e reembolsos)", host: "sitfiscal.portaldasfinancas.gov.pt",
      pathHint: "/movfin",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/movfin/resumoCobranca",
      why: "Todos os documentos de cobran\u00e7a e reembolsos - de todos os impostos e anos, num s\u00f3 s\u00edtio.", read: readMovfin },
    { id: "recibos", label: "Recibos verdes (atividade)", host: "irs.portaldasfinancas.gov.pt",
      open: "https://irs.portaldasfinancas.gov.pt/recibos/portal/consultar",
      why: "Recibos verdes emitidos - rendimentos da categoria B (trabalho independente).", read: readRecibos },
    // Seguranca Social - a DIFFERENT domain. Same-origin REST at www.seg-social.pt/ptss/rest.
    { id: "ss", label: "Seguran\u00e7a Social", host: "www.seg-social.pt",
      open: "https://www.seg-social.pt/ptss/pssd/home",
      why: "Situa\u00e7\u00e3o contributiva e pagamentos - emprego, contribui\u00e7\u00f5es e presta\u00e7\u00f5es.", read: readSS },
    // Same HOST as rendas (imoveis) but a DIFFERENT app path and login partition (SMPP vs SICI),
    // so it is its own step. `pathHint` disambiguates the two on the shared host - see
    // currentPartition().
    { id: "patrimonio", label: "Patrim\u00f3nio predial (IMI)", host: "imoveis.portaldasfinancas.gov.pt",
      pathHint: "/matrizesinter",
      open: "https://imoveis.portaldasfinancas.gov.pt/matrizesinter/web/consultar-patrimonio-predial",
      why: "Im\u00f3veis que possuis e o seu VPT - a base do IMI.", read: readPatrimonio }
  ];
  // rendas lives on the same host; tag its path so host+path matching can tell them apart.
  PARTITIONS[1].pathHint = "/arrendamento";

  /* A MESMA regra de expiracao do /perfil (fim do dia), aplicada TAMBEM aqui: este ficheiro corre
   * na origem da AT, e o /perfil (outra origem) nao consegue apagar o localStorage desta - so o
   * proprio tool. Sem isto, a copia da situacao fiscal DESTA origem vivia para sempre e a promessa
   * "apagada automaticamente ao fim do dia" da pagina de privacidade so era verdade em metade dos
   * sitios onde os dados estao. */
  function profExpiry() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
  function profLoad() {
    try {
      var p = JSON.parse(localStorage.getItem(PROF_KEY)) || { partitions: {} };
      if (p.expiresAt && Date.now() >= p.expiresAt) { localStorage.removeItem(PROF_KEY); return { partitions: {} }; }
      return p;
    } catch (e) { return { partitions: {} }; }
  }
  function profSave(p) { try { p.expiresAt = profExpiry(); localStorage.setItem(PROF_KEY, JSON.stringify(p)); } catch (e) {} }

  /* CROSS-PARTITION HANDOFF (SPEC Option A). Each AT partition is a separate origin, so this
   * page's localStorage cannot be read on the next partition. To assemble ONE profile we hand
   * each partition's summary to our own /perfil page via a URL FRAGMENT. A fragment (#...) is
   * NEVER sent in the HTTP request, so this is a browser-to-our-page handoff, not a server send -
   * the data still never leaves the machine. /perfil accumulates across partitions in its single
   * origin. (The separate, opt-in, redacted SERVER telemetry is a different thing entirely.) */
  var PROF_SITE = "https://faturas.diogoandrade.com/perfil";
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function handoffUrl(pid, data, shape) {
    var u = PROF_SITE + "#p=" + encodeURIComponent(pid) + "&d=" + encodeURIComponent(b64(JSON.stringify(data)));
    if (shape && Object.keys(shape).length) u += "&s=" + encodeURIComponent(b64(JSON.stringify(shape)));
    return u;
  }
  function profConsent() { try { return JSON.parse(localStorage.getItem(PROF_CONSENT) || "null"); } catch (e) { return null; } }
  function currentPartition() {
    var here = PARTITIONS.filter(function (p) { return location.host === p.host; });
    if (here.length <= 1) return here[0] || null;
    // Several partitions share this host (imoveis: rendas vs patrimonio). Disambiguate by path so
    // the reader for the page you are ACTUALLY on runs - a host-only match would always pick the
    // first and read the wrong thing.
    for (var i = 0; i < here.length; i++)
      if (here[i].pathHint && location.pathname.indexOf(here[i].pathHint) === 0) return here[i];
    return null;   // on the shared host but not on a page we read - prompt to open one
  }

  /* DEBUG-SHAPE CAPTURE. To validate the blind-built readers against the REAL responses without
   * ever seeing Diogo's data: record the STRUCTURE of each response (keys + types + array lengths),
   * with every value redacted to its type. Diogo runs the bookmarklet on his own session and copies
   * this structure to us; we pin the parsers from it. No values, no PII - just the skeleton. */
  var _shapes = {};
  function skeleton(v, d) {
    d = d || 0; if (d > 5) return "...";
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? [skeleton(v[0], d + 1), "x" + v.length] : [];
    if (typeof v === "object") { var o = {}; Object.keys(v).slice(0, 40).forEach(function (k) { o[k] = skeleton(v[k], d + 1); }); return o; }
    if (typeof v === "string") return v.length > 40 ? "str(" + v.length + ")" : "str";
    return typeof v;   // number / boolean
  }
  function recordShape(url, kind, val) {
    // The URL is the schema key, but some paths embed identifiers (NISS/NIF, e.g.
    // /posicao-atual/<NISS>/situacao-contributiva). Redact any long digit run to :id BEFORE the
    // shape is captured - so an identifier never enters the skeleton, and every user's copy of that
    // endpoint collapses to one key for aggregation. (Query string already dropped.)
    var key = String(url).split("?")[0].replace(/\d{5,}/g, ":id");
    if (kind === "html") _shapes[key] = { html: true, len: (val || "").length, comprovativo: (String(val).match(/\/comprovativo\//g) || []).length };
    else _shapes[key] = skeleton(val);
  }

  /* RULE 3 (SPEC): a wrong session or missing permission on AT returns 200 + an HTML redirect,
   * never 401. So assert on CONTENT - did we get the JSON shape we asked for - never on r.ok. */
  function getJSON(url) {
    return fetch(url, { credentials: "include", headers: { "Accept": "application/json" } }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      return r.text().then(function (t) {
        if (/text\/html/i.test(ct) || /^\s*</.test(t)) throw new Error("sess\u00e3o n\u00e3o iniciada nesta p\u00e1gina");
        try { var j = JSON.parse(t); recordShape(url, "json", j); return j; } catch (e) { throw new Error("resposta inesperada"); }
      });
    });
  }

  /* POST variant for the .api endpoints whose search form posts a JSON body (e.g. recibos consultar
   * posts searchParameters.dataEmissaoInicio/Fim). Same session gate + shape capture as getJSON. */
  function postJSON(url, body) {
    return fetch(url, { method: "POST", credentials: "include",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body) }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      return r.text().then(function (t) {
        if (/text\/html/i.test(ct) || /^\s*</.test(t)) throw new Error("sess\u00e3o n\u00e3o iniciada nesta p\u00e1gina");
        try { var j = JSON.parse(t); recordShape(url, "json", j); return j; } catch (e) { throw new Error("resposta inesperada"); }
      });
    });
  }

  /* HTML-tolerant read for the cadastro/atividade pages (OutSystems, server-rendered - often not
   * clean JSON). Returns {json} OR {html}. Still a session gate: a login redirect returns the
   * acesso.gov.pt page, which has neither our JSON nor the expected page markers. */
  function getMaybe(url) {
    return fetch(url, { credentials: "include" }).then(function (r) {
      return r.text().then(function (t) {
        if (/acesso\.gov\.pt|loginForm/i.test(t)) throw new Error("sess\u00e3o n\u00e3o iniciada nesta p\u00e1gina");
        try { var j = JSON.parse(t); recordShape(url, "json", j); return { json: j }; }
        catch (e) { recordShape(url, "html", t); return { html: t }; }
      });
    });
  }

  /* Atividade (cadastro, dainter): the declaracoes de inicio/alteracao/cessacao. This is the
   * AUTHORITATIVE Cat B source and, crucially, tells open vs CLOSED - a count > 0 does NOT mean
   * "currently independent" (a cessacao declaration closes it). Response is likely HTML, so parsing
   * is heuristic and everything is FLAGGED for confirmation; we never assert Cat B on a guess.
   * Also scans for the IVA enquadramento (regime normal / isencao art. 53 / trimestral / mensal),
   * which is the regime signal that was previously unmapped. */
  function readAtividade() {
    return getMaybe("/atividade/atividade/consultardeclaracoes?_=" + Date.now()).then(function (res) {
      var txt = res.html || (res.json ? JSON.stringify(res.json) : "");
      var low = txt.toLowerCase();
      // Count declarations by their comprovativo download links (one per declaration) - more
      // reliable than word-matching. Fall back to the word count if the markup differs.
      var n = (txt.match(/\/comprovativo\//g) || []).length || (low.match(/declara[c\u00e7][a\u00e3]o/g) || []).length;
      var temInicio = /in[i\u00ed]cio de atividade|declara[c\u00e7][a\u00e3]o de in[i\u00ed]cio/.test(low);
      var temCessacao = /cessa[c\u00e7][a\u00e3]o|cessou|cessad/.test(low);
      var cessada = temCessacao ? true : (temInicio ? false : null);
      // The current IVA regime usually is NOT on this declarations page - it lives on the
      // "Atividade Exercida" screen of the Situacao Fiscal Integrada. Only report a regime if this
      // page happens to state it; otherwise leave null and say where to look. Never guess.
      var regime = /isen[c\u00e7][a\u00e3]o.*53|artigo 53|regime de isen/.test(low) ? "isento (art. 53.o)"
                 : /periodicidade mensal|iva mensal/.test(low) ? "IVA mensal"
                 : /periodicidade trimestr|iva trimestr/.test(low) ? "IVA trimestral"
                 : null;
      // We do NOT open the comprovativo PDFs - a bookmarklet cannot parse a PDF, and open/cessada
      // is already answerable from this list. Deep detail, if ever needed, is the server-side path.
      var avisos = ["leitura heur\u00edstica - confirmar aberta/cessada"];
      if (!regime) avisos.push("regime de IVA n\u00e3o consta aqui - ver 'Atividade Exercida' na Situa\u00e7\u00e3o Fiscal Integrada");
      // "Atividade Exercida" (Situacao Fiscal Integrada) TEM os dados a serio: data de inicio, tipo de
      // sujeito passivo, tipo de contabilidade (organizada vs nao -> regime simplificado), CAE
      // principal + secundarios e o CIRS (o codigo que fixa o coeficiente da Cat B), e a cessacao.
      // Isto e o que distingue ler de perguntar ao utilizador.
      return readAtividadeExercida().catch(function () { return null; }).then(function (ex) {
        var d = { declaracoes: n, cessada: cessada, regimeIva: regime, avisos: avisos };
        if (ex) {
          if (ex.inicio) { d.inicio = ex.inicio; d.cessada = ex.cessacao ? true : false; }
          if (ex.cessacao) d.cessacao = ex.cessacao;
          if (ex.tipoSujeito) d.tipoSujeito = ex.tipoSujeito;
          if (ex.contabilidade) { d.contabilidade = ex.contabilidade; d.regimeIrs = /organiz/i.test(ex.contabilidade) && !/n[a\u00e3]o/i.test(ex.contabilidade) ? "organizada" : "simplificado"; }
          if (ex.codigos && ex.codigos.length) d.codigos = ex.codigos;
          d.avisos = ["lido de 'Atividade Exercida' (Situa\u00e7\u00e3o Fiscal Integrada)"];
        }
        return { data: d, source: "/atividade/atividade/consultardeclaracoes" + (ex ? " + integrada/ecraActividade" : "") };
      });
    });
  }

  /* "Atividade Exercida" - o ecra da Situacao Fiscal Integrada com o cadastro REAL da atividade.
   * O URL e assinado (hmac) e MUDA, por isso NAO se forja: abre-se /integrada/ e colhe-se o link
   * targetScreen=ecraActividade da propria pagina. Devolve HTML, que se le por rotulos. */
  function readAtividadeExercida() {
    return fetch("/integrada/presentation", { credentials: "include" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var m = html.match(/\/integrada\/presentation\?queryStringS=targetScreen=ecraActividade&hmac=[^"'&\s]+/);
        if (!m) throw new Error("sem link ecraActividade");
        return fetch(m[0].replace(/&amp;/g, "&"), { credentials: "include" }).then(function (r) { return r.text(); });
      })
      .then(function (html) {
        var txt = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        var pick = function (re) { var x = txt.match(re); return x ? x[1].trim() : null; };
        // CESSACAO: o ecra tem DUAS secoes ("Atividade em IVA" e "Atividade em IRS") e cada uma tem a
        // sua "Data de Cessacao" + motivo, MUITO abaixo dos dados gerais. Ler o ecra INTEIRO e apanhar
        // TODAS as ocorrencias - ler so o inicio do texto dava "atividade aberta" numa atividade
        // CESSADA (erro real: Diogo cessou em 2025-09-08 e a leitura parcial nao viu).
        var cess = (txt.match(/Data de Cessa[\u00e7c][\u00e3a]o\s+(\d{4}-\d{2}-\d{2})/gi) || [])
          .map(function (s) { return (s.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; }).filter(Boolean);
        var motivos = (txt.match(/Motivo de Cessa[\u00e7c][\u00e3a]o\s+([^]{3,40}?)\s+(?:NIF|Nome|Op[\u00e7c]|Data|Consultas)/gi) || [])
          .map(function (s) { return s.replace(/Motivo de Cessa[\u00e7c][\u00e3a]o\s+/i, "").trim(); });
        var out = {
          inicio: pick(/Data de In[i\u00ed]cio\s+(\d{4}-\d{2}-\d{2})/i),
          cessacao: cess.length ? cess.sort()[0] : null,     // a mais ANTIGA = quando deixou de estar ativa
          cessacoes: cess, motivosCessacao: motivos,
          enquadramentoIva: pick(/Atividade em IVA\s+Enquadramento\s+([^]{3,30}?)\s+Data de Enquadramento/i),
          enquadramentoIrs: pick(/Atividade em IRS\s+Enquadramento\s+([^]{3,30}?)\s+Data de Enquadramento/i),
          tipoSujeito: pick(/Tipo de Sujeito Passivo\s+([^]{3,60}?)\s+(?:Contabilidade|Tipo de Contab)/i),
          contabilidade: pick(/Tipo de Contabilidade\s+(N[\u00e3a]o organizada|Organizada)/i),
          codigos: []
        };
        // "CAE Principal 47125 DESCRICAO 2025-01-01" / "CIRS Secundario 1 1332 ..." etc.
        var re = /(CAE Principal|CAE Secund[\u00e1a]rio \d+|CIRS(?: Secund[\u00e1a]rio \d+| Principal)?)\s+(\d{4,5})\s+([A-Z\u00c1\u00c2\u00c3\u00c0\u00c9\u00ca\u00cd\u00d3\u00d4\u00d5\u00da\u00c7][^]{3,90}?)\s+(\d{4}-\d{2}-\d{2})/g, mm;
        while ((mm = re.exec(txt)) !== null && out.codigos.length < 12)
          out.codigos.push({ tipo: mm[1].trim(), codigo: mm[2], desc: mm[3].replace(/\s+/g, " ").trim(), desde: mm[4] });
        return out;
      });
  }

  function readEfatura() {
    var u = "/json/obterDocumentosAdquirente.action?dataInicioFilter=" + year + "-01-01&dataFimFilter=" + year + "-12-31";
    return getJSON(u).then(function (j) {
      // A STALE e-Fatura session returns valid JSON {success:false, expiredSession:true} - NOT an
      // HTML redirect - so getJSON lets it through and we'd read undefined `linhas` -> silently
      // show 0 pending. Verified against the real server response 2026-07-23. Treat it as a login
      // gate. (Same envelope likely on other .action endpoints; harden them if the shape shows up.)
      if (j && (j.expiredSession === true || j.success === false))
        throw new Error("sess\u00e3o do e-Fatura expirada - reabre a p\u00e1gina e faz login");
      var rows = (j && (j.linhas || j.documentos)) || [];
      if (!Array.isArray(rows)) rows = [];
      var pend = 0, byAct = {};
      rows.forEach(function (x) {
        if (x.estadoBeneficio === "P") pend++;
        var a = x.actividadeEmitente; if (a) byAct[a] = (byAct[a] || 0) + 1;
      });
      // Re-audit the recent past income years (the same endpoint, per year). Caps assume an
      // INDIVIDUAL filer (mono/joint not known here); /perfil can refine. Best-effort: a year that
      // fails (no data / lapsed) just drops out.
      var anos = [year - 1, year - 2, year - 3];
      return Promise.all(anos.map(function (a) {
        return reAuditAno(a, {}).catch(function () { return null; });
      })).then(function (ra) {
        // The user IS the adquirente, so their own NIF is on every row - hash it (locally) for the
        // anonymous counter id; store the HASH, never the NIF.
        var ownNif = null;
        for (var i = 0; i < rows.length; i++) { if (rows[i].nifAdquirente) { ownNif = rows[i].nifAdquirente; break; } }
        return uidFromNif(ownNif).then(function (uid) {
          return { data: { ano: year, totalFaturas: (j && j.totalElementos != null ? j.totalElementos : rows.length),
                           porClassificar: pend, atividades: byAct, uid: uid,
                           reAudit: ra.filter(Boolean) }, source: u };
        });
      });
    });
  }

  /* RULE 1 (documents over widgets): these /api/obter* endpoints are the document data, not a
   * lagged dashboard widget. RULE 2 (two sources): recibos corroborate the contracts - a contract
   * active but with no recibos in the period is flagged, not hidden. Recibos fail soft: contracts
   * alone already establish "is a landlord". Monetary values are shown per-contract as returned,
   * NOT summed - their scale (cents vs euros) must be confirmed live before we compute on them. */
  // `estado` is an OBJECT ({codigo:"ACTIVO", label:"Ativo"}), not a string - verified against
  // fiscal-monitor's rendas_raw.json. Reading it as a string (String(c.estado) -> "[object Object]")
  // is how a real active contract was mis-counted. Read .codigo/.label, and use the endpoint the
  // proven scraper uses: obterRecibos/LOCADOR, not /emitente.
  function estadoStr(e) { return (e && (e.codigo || e.label)) ? String(e.codigo || e.label) : String(e || ""); }
  function readRendas() {
    var cU = "/arrendamento/api/obterContratos/locador";
    var rU = "/arrendamento/api/obterRecibos/locador";
    return getJSON(cU + "?_=" + Date.now()).then(function (cj) {
      var contratos = (cj && (cj.contratos || cj.listaContratos)) || (Array.isArray(cj) ? cj : []);
      return getJSON(rU + "?_=" + Date.now()).then(function (rj) {
        return { contratos: contratos, recibos: (rj && rj.recibos) || (Array.isArray(rj) ? rj : []) };
      }).catch(function () { return { contratos: contratos, recibos: null }; });
    }).then(function (o) {
      var ativos = o.contratos.filter(function (c) { return /activ|ativ/i.test(estadoStr(c.estado)); });
      var recCount = o.recibos ? o.recibos.length : null;
      // Per-year recibo count for the recibos-em-falta indicator. Recibo period fields are not pinned,
      // so scan each row for a year (schema-agnostic, like readIRS) - another contributor-schema target.
      var yNow = new Date().getFullYear();
      var recibosAno = o.recibos ? o.recibos.filter(function (r) { return scanYear(rowVals(r)) === yNow; }).length : null;
      // Rendas RECEBIDAS por ano (valor, nao so contagem) - base do what-if englobamento vs 28%.
      // Recibos ANULADOS nao contam (mesma armadilha do anulado no movfin).
      var rendasPorAno = {};
      (o.recibos || []).forEach(function (r) {
        var estado = (r.estado && (r.estado.label || r.estado.codigo)) || "";
        if (/anul/i.test(estado)) return;
        var ano = scanYear(rowVals(r));
        var v = +r.valor || +r.importancia || 0;
        if (!ano || !v) return;
        if (!rendasPorAno[ano]) rendasPorAno[ano] = { n: 0, valor: 0 };
        rendasPorAno[ano].n++; rendasPorAno[ano].valor += v;
      });
      Object.keys(rendasPorAno).forEach(function (a) { rendasPorAno[a].valor = +rendasPorAno[a].valor.toFixed(2); });
      var avisos = [];
      if (o.recibos && ativos.length && recCount === 0) avisos.push("contrato activo sem recibos no per\u00edodo - confirmar");
      return { data: { contratos: o.contratos.length, activos: ativos.length, recibos: recCount,
                       recibosAno: recibosAno, rendasPorAno: rendasPorAno, ano: yNow, periodosHeuristica: true,
                       lista: ativos.slice(0, 8).map(function (c) {
                         var cv = rowVals(c), dt = scanDate(cv);
                         // inicio as YYYY-MM when a start date is present; used to not over-count months
                         var inicio = null; if (dt) { var mm = dt.match(/(\d{4})-(\d{2})/) || dt.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
                           if (mm) inicio = mm[0].length === 7 ? mm[0] : (mm[3] + "-" + mm[2]); }
                         return { referencia: c.referencia || c.numero, estado: estadoStr(c.estado), valorRenda: c.valorRenda, inicio: inicio };
                       }), avisos: avisos },
               source: cU + (o.recibos !== null ? " + " + rU : " (recibos indispon\u00edveis)") };
    });
  }

  /* Situacao fiscal (sitfiscal / PFAP): outstanding debts, fines, and the OFFICIAL deadline agenda.
   * dividas/coimas fields per ENDPOINTS.md: montanteTotal, nAtivasGeral, dataInfoObtida. Counts are
   * reliable; the monetary total is stored RAW (its number format is not re-derived here). The
   * `dividas` call is the session gate (getJSON throws on the not-logged-in HTML); coimas + agenda
   * are best-effort. agendaFiscal item keys vary, so date/description are picked from the usual
   * candidates and anything unknown is simply omitted rather than guessed. */
  function pickAgenda(o) {
    return { data: o.data || o.dataLimite || o.dataFim || o.prazo || o.dataLimitePagamento || null,
             desc: o.descricao || o.titulo || o.designacao || o.assunto || o.obrigacao || null };
  }
  function readSituacao() {
    return getJSON("/geral/dividas?_=" + Date.now()).then(function (div) {
      return Promise.all([
        getJSON("/geral/coimas?_=" + Date.now()).catch(function () { return null; }),
        getJSON("/geral/dashboard/agendaFiscal?_=" + Date.now()).catch(function () { return null; })
      ]).then(function (rest) {
        div = div || {};
        var coi = rest[0] || {};
        var ag = rest[1];
        var agenda = Array.isArray(ag) ? ag : (ag && (ag.listaAgenda || ag.agenda || ag.lista)) || [];
        return { data: {
          dividas: { total: (div.montanteTotal != null ? div.montanteTotal : null),
                     n: (div.nAtivasGeral != null ? div.nAtivasGeral : null), em: div.dataInfoObtida || null },
          coimas: { total: (coi.montanteTotal != null ? coi.montanteTotal : null),
                    n: (coi.nAtivasGeral != null ? coi.nAtivasGeral : null) },
          agenda: { n: agenda.length, proximos: agenda.slice(0, 5).map(pickAgenda) }
        }, source: "/geral/dividas + /geral/coimas + /geral/dashboard/agendaFiscal" };
      });
    });
  }

  /* IRS liquidacoes + reembolsos (inffin / DIFC): the assessed outcome of every year's IRS. These
   * are DataTables .web endpoints; their COLUMN ORDER is not pinned in our recon, so we do NOT map
   * columns to meanings (that is how a wrong number ships). We count rows from the DataTables
   * envelope (data / aaData / bare array) and keep a raw sample to inspect. A zero count on an
   * account that has filed IRS is flagged as suspect rather than shown as fact - these endpoints
   * may want a POST with DataTables params, which live testing will confirm. */
  function dtRows(j) {
    var rows = (j && (j.aaData || j.data || j.aoData)) || (Array.isArray(j) ? j : []);
    return Array.isArray(rows) ? rows : [];
  }
  // Real DataTables shape confirmed 2026-07-23: {iTotalRecords, iTotalDisplayRecords, aaData}. The
  // authoritative count is iTotalRecords, NOT aaData.length (aaData is one page). When they differ,
  // the endpoint is paginating and needs display params - the suspect-0/short flag catches it.
  function dtCount(j, rows) { return (j && j.iTotalRecords != null) ? j.iTotalRecords : rows.length; }
  // Per-row parse for the liquidacoes table, feeding the past-year correction-window tool. The exact
  // column names/order are NOT yet pinned by a server probe, so this is DELIBERATELY heuristic and
  // schema-agnostic: it flattens the row (object -> values, DataTables array-of-arrays -> the array)
  // and scans for a 4-digit year, a date, and an estado token. It reports what it found + keeps the
  // raw row, and marks the result heuristic so nothing downstream treats it as pinned. When the probe
  // lands, this narrows to the real fields. Guessing exact keys is what ships wrong numbers - scanning
  // for shapes (year-looking, date-looking) is the honest interim.
  function rowVals(r) { return (r && typeof r === "object") ? (Array.isArray(r) ? r : Object.keys(r).map(function (k) { return r[k]; })) : [r]; }
  function scanYear(vals) { for (var i = 0; i < vals.length; i++) { var m = String(vals[i]).match(/\b(20\d{2})\b/); if (m) return +m[1]; } return null; }
  function scanDate(vals) { for (var i = 0; i < vals.length; i++) { var s = String(vals[i]); var m = s.match(/\b\d{4}-\d{2}-\d{2}\b/) || s.match(/\b\d{2}[\/.-]\d{2}[\/.-]\d{4}\b/); if (m) return m[0]; } return null; }
  function scanEstado(vals) { for (var i = 0; i < vals.length; i++) { var s = String(vals[i] == null ? "" : vals[i]).trim(); if (s && !/^\d/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s) && s.length > 2 && s.length < 40 && /[a-z\u00e0-\u00ff]/i.test(s)) return s; } return null; }
  function liqPorAno(rows) {
    var out = [], seen = {};
    rows.forEach(function (r) {
      var v = rowVals(r), y = scanYear(v);
      if (y == null || seen[y]) return;         // one entry per year; earliest row wins
      seen[y] = 1;
      out.push({ ano: y, data: scanDate(v), estado: scanEstado(v) });
    });
    out.sort(function (a, b) { return b.ano - a.ano; });
    return out;
  }
  /* Movimentos financeiros (movfin/resumoCobranca). filtraMeusDocumentos.web is SERVER-RENDERED HTML
   * (not JSON - confirmed even with X-Requested-With), so parse the table. Columns confirmed
   * 2026-07-24: Id. Documento | Periodo | Imposto | Valor | Valor Regularizado/Anulado. Empty filters
   * = ALL taxes/years, pagamentos + reembolsos; filtro = last-N movements. Schema-agnostic: reads
   * whatever <th>/<td> exist. Only COLUMN NAMES + row count are recorded for the shape - NO cell
   * values, so no amounts/doc numbers leave the browser. TODO >999: paginate by exercicio x imposto. */
  function readMovfin() {
    var u = "/movfin/filtraMeusDocumentos.web?imposto=&exercicio=&tipoDocumento=&filtro=999&_=" + Date.now();
    return fetch(u, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) { return r.text(); }).then(function (t) {
        var docp = new DOMParser().parseFromString(t, "text/html");
        var table = docp.querySelector("#tabela_documentos") || docp.querySelector("table");
        var cols = [];
        if (table) Array.prototype.forEach.call(table.querySelectorAll("th"), function (th) {
          var x = (th.textContent || "").replace(/\s+/g, " ").trim(); if (x) cols.push(x);
        });
        var trs = table ? table.querySelectorAll("tbody tr") : [];
        if (table && !trs.length) trs = table.querySelectorAll("tr");
        var rows = [];
        Array.prototype.forEach.call(trs, function (tr) {
          var tds = tr.querySelectorAll("td");
          if (tds.length) rows.push(Array.prototype.map.call(tds, function (td) { return (td.textContent || "").replace(/\s+/g, " ").trim(); }));
        });
        recordShape(u, "json", { movfinTable: { columns: cols, rows: rows.length } });   // structure only
        // Local summary (stays in the browser): per Imposto, with anulados/regularizados split out -
        // a document in the "Valor Regularizado/Anulado" column is NOT a live charge, so we never
        // count it as owed/paid. This is the "situacao financeira" view. PT currency -> Number.
        function eurNum(s) { s = String(s || "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); var n = parseFloat(s); return isFinite(n) ? n : 0; }
        var iImp = cols.indexOf("Imposto"); if (iImp < 0) iImp = 2;
        var iVal = cols.indexOf("Valor"); if (iVal < 0) iVal = 3;
        var iAnul = cols.length - 1;      // "Valor Regularizado/Anulado" is the last column
        var porImposto = {}, totalAnulados = 0;
        rows.forEach(function (c) {
          var k = (c[iImp] || "?");
          var anulTxt = c[iAnul] || "";
          var anulado = /anul|regular/i.test(anulTxt) || eurNum(anulTxt) !== 0;
          if (!porImposto[k]) porImposto[k] = { n: 0, anulados: 0, valor: 0 };
          porImposto[k].n++;
          if (anulado) { porImposto[k].anulados++; totalAnulados++; }
          else porImposto[k].valor += eurNum(c[iVal]);   // only live docs count toward the total
        });
        var avisos = [];
        if (rows.length >= 999) avisos.push("999 movimentos - lista pode estar truncada; paginar por ano/imposto");
        else if (!rows.length) avisos.push("0 movimentos lidos - confirmar");
        if (totalAnulados) avisos.push(totalAnulados + " documento(s) anulados/regularizados - nao contam como encargo");
        return { data: { movimentos: rows.length, colunas: cols, porImposto: porImposto, anulados: totalAnulados, avisos: avisos }, source: u + " (HTML)" };
      });
  }

  function readIRS() {
    // DataTables .web endpoints return an empty aaData without server-side paging params; send the
    // standard trio so rows come back and the column order can finally be pinned by contributors.
    var dt = "?sEcho=1&iDisplayStart=0&iDisplayLength=200&_=" + Date.now();
    var uL = "/inffin/liquidacoesIRSDataTables.web";
    var uR = "/inffin/reembolsosDataTables.web";
    return getJSON(uL + dt).then(function (jl) {
      return getJSON(uR + dt).catch(function () { return null; }).then(function (jr) {
        var liq = dtRows(jl), reemb = jr ? dtRows(jr) : null;
        var liqN = dtCount(jl, liq);
        var porAno = liqPorAno(liq);
        var avisos = [];
        if (liqN === 0) avisos.push("0 liquida\u00e7\u00f5es - se j\u00e1 entregaste IRS, pode precisar de par\u00e2metros de pagina\u00e7\u00e3o; confirmar");
        if (porAno.length) avisos.push("anos detetados por leitura heur\u00edstica (colunas por confirmar): " + porAno.map(function (x) { return x.ano; }).join(", "));
        return { data: { liquidacoes: liqN, reembolsos: reemb == null ? null : dtCount(jr, reemb),
                         porAno: porAno, anosHeuristica: true, amostra: liq.slice(0, 5), avisos: avisos },
                 source: uL + (reemb == null ? " (reembolsos indispon\u00edveis)" : " + " + uR) };
      });
    });
  }

  /* Seguranca Social Direta (www.seg-social.pt). personalData carries name + NISS; the NISS goes
   * in the situacao-contributiva path. CRITICAL: the NISS and name are PII - they are used ONLY to
   * build the URL and are NEVER stored in the summary. We keep the contributory status and a count
   * of current payments (whether you receive or contribute), no identifiers. personalData is the
   * session gate. */
  function readSS() {
    return getJSON("/ptss/rest/public/pssd/login/personalData?_=" + Date.now()).then(function (pd) {
      var niss = pd && (pd.niss || pd.NISS || pd.numeroIdentificacaoSegurancaSocial || pd.identificador || pd.niss);
      var jobs = [ getJSON("/ptss/rest/public/pssd/payments/current?_=" + Date.now()).catch(function () { return null; }) ];
      jobs.push(niss ? getJSON("/ptss/rest/v360/posicao-atual/" + encodeURIComponent(niss) + "/situacao-contributiva?_=" + Date.now()).catch(function () { return null; })
                     : Promise.resolve(null));
      return Promise.all(jobs).then(function (r) {
        var pay = r[0], sit = r[1];
        var pags = pay ? (pay.data || pay.pagamentos || pay.lista || (Array.isArray(pay) ? pay : [])) : null;
        if (pags && !Array.isArray(pags)) pags = [];
        return { data: {
          inscrito: true,
          estado: (sit && (sit.estado || sit.situacao)) || null,     // e.g. REGULARIZADA
          pagamentosCorrentes: pags ? pags.length : null
        }, source: "/ptss/rest/public/pssd/login/personalData + situacao-contributiva + payments/current" };
      });
    });
  }

  /* Recibos verdes (SIRE, irs host): documents issued as an independent worker - the Cat B signal.
   * obtemDocumentosV2 may expect a period; a bare read can come back empty, so a 0 count is FLAGGED
   * as needing confirmation rather than asserted (green-is-not-healthy). Shape unconfirmed in recon:
   * rows read from the usual container keys, counted only, not column-interpreted. */
  function readRecibos() {
    var u = "/recibos/api/obtemDocumentosV2";
    // PARAMETROS REAIS (capturados do botao Pesquisar da propria pagina, 2026-07-25):
    //   GET ?dataEmissaoInicio&dataEmissaoFim&modoConsulta=Prestador&tipoPesquisa=1
    //       &nifPrestadorServicos=<o proprio NIF>&offset=0&tableSize=<n>&isAutoSearchOn=on
    // ARMADILHAS confirmadas contra o servidor:
    //   - E **GET**. Um POST devolve 405 "Request method 'POST' not supported".
    //   - Sem tipoPesquisa/modoConsulta -> 200 com success:false "O tipo de consulta e invalido."
    //   - O intervalo NAO pode abranger varios anos: 6 anos -> "Por favor, confira os campos
    //     assinalados."; um ANO CIVIL de cada vez -> success:true. Por isso pede-se ano a ano.
    // O NIF e o do proprio (lido da pagina) e serve so para construir o URL - nunca e guardado.
    var yr = new Date().getFullYear();
    var nif = (document.body.innerHTML.match(/\b(\d{9})\b/) || [])[1] || "";
    var anos = [];
    for (var a = yr; a >= yr - 5; a--) anos.push(a);
    var qFor = function (ano) {
      return "?dataEmissaoInicio=" + ano + "-01-01&dataEmissaoFim=" + ano + "-12-31" +
             "&modoConsulta=Prestador&tipoPesquisa=1&isAutoSearchOn=on&offset=0&tableSize=500" +
             (nif ? "&nifPrestadorServicos=" + nif : "") + "&_=" + Date.now();
    };
    return Promise.all(anos.map(function (ano) {
      return getJSON(u + qFor(ano)).catch(function () { return null; });
    })).then(function (parts) {
      // juntar os anos num unico envelope, no formato que o resto do codigo ja espera
      var todos = [], total = 0, algum = false;
      parts.forEach(function (j) {
        if (!j) return;
        algum = true;
        var l = j.listaDocumentos || j.documentos || j.lista || [];
        if (Object.prototype.toString.call(l) === "[object Array]") todos = todos.concat(l);
        if (typeof j.totalDocs === "number") total += j.totalDocs;
      });
      return algum ? { success: true, listaDocumentos: todos, totalDocs: total } : null;
    })
    // FAIL-SOFT: esta particao transporta MUITO mais do que os recibos - traz tambem as declaracoes
    // (+ a demonstracao de liquidacao, de onde sai a taxa marginal), as deducoes oficiais da AT e as
    // despesas afetas a atividade. Se o endpoint dos recibos falhar (ex.: atividade CESSADA devolve
    // uma pagina de erro em vez de JSON), NAO se pode deitar fora tudo o resto: segue-se com j=null.
      .then(function (j) {
      // Real shape confirmed 2026-07-23: {success, listaDocumentos, totalDocs, ...}. The list is
      // `listaDocumentos` and the count is `totalDocs`. success:false means the query returned nothing.
      var rows = (j && (j.listaDocumentos || j.documentos || j.data || j.lista)) || (Array.isArray(j) ? j : []);
      if (!Array.isArray(rows)) rows = [];
      var count = (j && j.totalDocs != null) ? j.totalDocs : rows.length;
      var avisos = [];
      if (j && j.success === false) avisos.push("resposta sem dados - pode precisar de outro per\u00edodo ou pagina\u00e7\u00e3o; confirmar");
      else if (count === 0) avisos.push("0 recibos no per\u00edodo - confirmar");
      // VALORES por ano (nao so a contagem): e a base do rendimento da Cat B. Recibos ANULADOS nao
      // contam. Os nomes dos campos ainda nao estao pinados, por isso tentam-se os candidatos usuais
      // e assinala-se quando nao se encontrou valor nenhum - nunca se inventa um total.
      var porAno = {}, semValor = 0;
      rows.forEach(function (r) {
        var est = String(r.estado || r.situacao || r.estadoDoc || "");
        if (/anul/i.test(est)) return;
        var dt = String(r.dataEmissao || r.data || r.dataDoc || "");
        var ano = (dt.match(/(20\d{2})/) || [])[1];
        var v = +r.valorBase || +r.valorTotal || +r.importancia || +r.valor || 0;
        if (!ano) return;
        if (!porAno[ano]) porAno[ano] = { n: 0, valor: 0 };
        porAno[ano].n++;
        if (v) porAno[ano].valor += v; else semValor++;
      });
      Object.keys(porAno).forEach(function (a) { porAno[a].valor = +porAno[a].valor.toFixed(2); });
      if (semValor) avisos.push(semValor + " recibo(s) sem valor reconhecido - campos por confirmar");
      // A app das DECLARA\u00c7\u00d5ES vive no MESMO host (irs.portaldasfinancas.gov.pt), por isso d\u00e1 para a ler
      // aqui - mesma sess\u00e3o, mesma origem. Fornece, por ano, a declara\u00e7\u00e3o que CONTA e o seu resultado.
      return Promise.all([
        readDeclaracoes().catch(function () { return null; }),
        readDeducoesOficiais().catch(function () { return null; }),
        readDespesasAtividade().catch(function () { return null; })
      ]).then(function (r) {
        var decl = r[0], ded = r[1], desp = r[2];
        return { data: { recibosVerdes: count, recibosPorAno: porAno, declaracoes: decl,
                         deducoesOficiais: ded, despesasAtividade: desp, avisos: avisos },
                 source: u + " (POST dataEmissao)" + (decl ? " + /app/consulta/pesquisa" : "") +
                         (ded ? " + /consultarDespesasDeducoes.action" : "") +
                         (desp ? " + /app/dashboard-regime-simplificado" : "") };
      });
    });
  }

  /* DEDU\u00c7\u00d5ES \u00c0 COLETA calculadas pela AT, por categoria (/consultarDespesasDeducoes.action).
   * \u00c9 o n\u00famero OFICIAL - o mesmo que aparece na demonstra\u00e7\u00e3o de liquida\u00e7\u00e3o - e evita somar faturas e
   * aplicar tetos \u00e0 m\u00e3o. Cobre ainda categorias que as faturas n\u00e3o d\u00e3o (im\u00f3veis, lares).
   * ARMADILHA: o seletor de ano (`anoDashboard`) \u00e9 STATEFUL - pass\u00e1-lo no GET N\u00c3O muda o ano
   * (testado: 2025/2024/2023 devolvem tudo igual). Por isso lemos S\u00d3 o ano que a p\u00e1gina mostrar e
   * devolvemo-lo com esse ano; nunca se assume que um par\u00e2metro pegou.
   * A p\u00e1gina \u00e9 HTML server-rendered (n\u00e3o JSON). Nota da pr\u00f3pria AT: os valores s\u00e3o POR TITULAR,
   * sem considerar agregado nem tributa\u00e7\u00e3o conjunta. */
  function readDeducoesOficiais() {
    return fetch("/consultarDespesasDeducoes.action", { credentials: "include" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var t = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/g, " ").replace(/&euro;/g, "\u20ac").replace(/\s+/g, " ");
        var num = function (s) { return +String(s).replace(/\./g, "").replace(",", ".") || 0; };
        var cats = {}, total = 0, m;
        var re = /(Despesas gerais familiares|Sa[\u00fau]de e seguros de sa[\u00fau]de|Educa[\u00e7c][\u00e3a]o e forma[\u00e7c][\u00e3a]o|Encargos com im[\u00f3o]veis|Lares|Import[\u00e2a]ncias respeitantes a IVA|Exig[\u00eae]ncia de fatura)[^0-9]{0,60}([\d.]+,\d{2})\s*\u20ac\s*Dedu[\u00e7c][\u00e3a]o correspondente [\u00e0a] despesa\s*([\d.]+,\d{2})\s*\u20ac/g;
        while ((m = re.exec(t)) !== null) {
          var d = num(m[3]);
          cats[m[1].replace(/\s+/g, " ").trim()] = { despesa: num(m[2]), deducao: d };
          total += d;
        }
        if (!Object.keys(cats).length) return null;
        // o ano que a p\u00e1gina est\u00e1 mesmo a mostrar (n\u00e3o o que pedimos)
        var ano = (t.match(/Ano\s+(20\d{2})\s+Esta p[\u00e1a]gina/) || t.match(/\bAno\s+(20\d{2})\b/) || [])[1] || null;
        return { ano: ano ? +ano : null, categorias: cats, total: +total.toFixed(2),
                 nota: "valores oficiais da AT, por titular (n\u00e3o consideram agregado nem tributa\u00e7\u00e3o conjunta)" };
      });
  }

  /* DESPESAS AFETAS \u00c0 ATIVIDADE (Cat B, regime simplificado) - /app/dashboard-regime-simplificado.
   * No simplificado tributa-se um coeficiente do bruto (art. 31), mas parte desse benef\u00edcio exige
   * despesas efetivamente afetas \u00e0 atividade (art. 31 n.13): pessoal, rendas, VPT de im\u00f3veis afetos,
   * outras. Esta p\u00e1gina mostra o que a AT j\u00e1 tem, com o "valor a considerar" j\u00e1 calculado.
   * Mesmo padr\u00e3o (e mesma armadilha) da p\u00e1gina das dedu\u00e7\u00f5es: HTML server-rendered e ano STATEFUL. */
  function readDespesasAtividade() {
    return fetch("/app/dashboard-regime-simplificado", { credentials: "include" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var t = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/g, " ").replace(/&euro;/g, "\u20ac").replace(/\s+/g, " ");
        if (!/Despesas Afetas [\u00e0a] Atividade/i.test(t)) return null;
        var num = function (s) { return +String(s).replace(/\./g, "").replace(",", ".") || 0; };
        var cats = {}, m;
        var re = /(Despesas com pessoal|Rendas de im[\u00f3o]veis|Outras despesas|Valor patrimonial tribut[\u00e1a]rio|Import[\u00e2a]ncias)[^0-9]{0,80}([\d.]+,\d{2})\s*\u20ac\s*Valor a considerar[^0-9]{0,60}([\d.]+,\d{2})\s*\u20ac/g;
        while ((m = re.exec(t)) !== null)
          cats[m[1].replace(/\s+/g, " ").trim()] = { valor: num(m[2]), considerar: num(m[3]) };
        var ano = (t.match(/Ano\s+(20\d{2})\s+Esta p[\u00e1a]gina/) || t.match(/\bAno\s+(20\d{2})\b/) || [])[1] || null;
        if (!Object.keys(cats).length) return { ano: ano ? +ano : null, categorias: {}, vazio: true };
        return { ano: ano ? +ano : null, categorias: cats,
                 nota: "despesas afetas \u00e0 atividade (art. 31.\u00ba n.13 CIRS) - relevantes s\u00f3 no regime simplificado" };
      });
  }

  /* DECLARA\u00c7\u00d5ES de IRS por ano (irs.../app/consulta). POST com {anoDeclaracoes:"YYYY"} - um GET
   * devolve vazio. ARMADILHA CR\u00cdTICA: um ano pode ter V\u00c1RIAS declara\u00e7\u00f5es (1.\u00aa + substitui\u00e7\u00f5es) e a que
   * conta \u00e9 a \u00daLTIMA; o `montante` da linha pode dizer 0,00 / "SALDO NULO EMITIDO" e ainda assim haver
   * imposto (foi o caso real de 2025: 1.\u00aa dizia 2.281,60, a substitui\u00e7\u00e3o dizia 0,00 mas eram 1.487,44).
   * Por isso: ordenar por tipo ("N. D.PRAZO") e dataRececao, e assinalar que houve substitui\u00e7\u00e3o. */
  /* DEMONSTRACAO DE LIQUIDACAO: ler o PDF NO PROPRIO NAVEGADOR, sem biblioteca nenhuma.
   * Ao contrario do comprovativo do Modelo 3, este PDF NAO esta encriptado - basta inflacionar os
   * streams FlateDecode (DecompressionStream('deflate') e nativo) e apanhar o texto entre parentesis
   * dos operadores Tj/TJ. Da os numeros OFICIAIS do ano (taxa marginal, taxa efetiva, deducoes), por
   * isso NAO se pergunta nada ao utilizador sobre um ano ja entregue: esta no documento da AT. */
  function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") return Promise.resolve(null);
    try {
      var ds = new DecompressionStream("deflate");
      return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function pdfTexto(buf) {
    var u8 = new Uint8Array(buf), lat = "";
    for (var i = 0; i < u8.length; i++) lat += String.fromCharCode(u8[i]);
    var jobs = [], re = /stream\r?\n/g, m;
    while ((m = re.exec(lat)) !== null) {
      var st = m.index + m[0].length, en = lat.indexOf("endstream", st);
      if (en < 0) continue;
      jobs.push(inflate(u8.subarray(st, en)));
    }
    return Promise.all(jobs).then(function (parts) {
      var out = [];
      parts.forEach(function (p) {
        if (!p) return;
        var s = "";
        for (var i = 0; i < p.length; i++) s += String.fromCharCode(p[i]);
        if (s.indexOf("Tj") < 0 && s.indexOf("TJ") < 0) return;
        var t, rx = /\(((?:[^()\\]|\\.)*)\)/g;
        while ((t = rx.exec(s)) !== null) out.push(t[1].replace(/\\([()])/g, "$1"));
      });
      return out.join(" ").replace(/\s+/g, " ");
    });
  }

  function lerDemonstracao(url) {
    return fetch(url, { credentials: "include" }).then(function (r) { return r.arrayBuffer(); })
      .then(pdfTexto).then(function (t) {
        if (!t || t.length < 200) return null;
        var num = function (x) { return x ? +String(x).replace(/\./g, "").replace(",", ".") : null; };
        var pick = function (re) { var m = t.match(re); return m ? m[1] : null; };
        return {
          marginal: num(pick(/Quociente familiar\s+[\d,]+\s+taxa\s+([\d,]+)\s*%/i)),
          taxaEfetiva: num(pick(/Taxa Efetiva de Tributa[\u00e7c][\u00e3a]o\s*-\s*([\d,]+)\s*%/i)),
          deducoesTotal: num(pick(/Total das Dedu[\u00e7c][\u00f5o]es\s*:?\s*([\d.]+,\d{2})/i)),
          deducaoEfetiva: num(pick(/Dedu[\u00e7c][\u00e3a]o Efetiva\s*:?\s*([\d.]+,\d{2})/i)),
          fonte: "demonstracao de liquidacao (PDF lido no navegador)"
        };
      }).catch(function () { return null; });
  }


  function readDeclaracoes() {
    var anos = [], y = new Date().getFullYear();
    for (var i = 1; i <= 5; i++) anos.push(y - i);
    return Promise.all(anos.map(function (ano) {
      return postJSON("/app/consulta/pesquisa", { anoDeclaracoes: String(ano) })
        .then(function (j) { return (j && j.linhas) || []; })
        .catch(function () { return []; });
    })).then(function (lists) {
      var out = {};
      lists.forEach(function (linhas) {
        linhas.forEach(function (l) {
          var ano = String(l.ano); if (!out[ano]) out[ano] = [];
          out[ano].push(l);
        });
      });
      var porAno = {};
      Object.keys(out).forEach(function (ano) {
        var ls = out[ano].slice().sort(function (a, b) {
          var oa = (String(a.tipo || "").match(/^(\d+)\s*\./) || [0, 1])[1];
          var ob = (String(b.tipo || "").match(/^(\d+)\s*\./) || [0, 1])[1];
          if (+ob !== +oa) return +ob - +oa;
          return String(b.dataRececao || "").localeCompare(String(a.dataRececao || ""));
        });
        var v = ls[0] || {};
        porAno[ano] = {
          n: ls.length, substituida: ls.length > 1,
          tipo: v.tipo || null, situacao: (v.situacao || "").trim() || null,
          montante: v.montante || null, numLiquidacao: v.numeroLiquidacao || null,
          dataRececao: v.dataRececao || null, temDemonstracao: !!v.hasDemLiquidacao,
          urlDem: v.urlPDFLiquidacao || null
        };
      });
      // Ler a demonstracao VIGENTE de cada ano (PDF, no navegador) - da os numeros oficiais e evita
      // perguntar ao utilizador o que ja esta no documento.
      var anos = Object.keys(porAno).filter(function (a) { return porAno[a].urlDem; });
      return Promise.all(anos.map(function (a) {
        return lerDemonstracao(porAno[a].urlDem).then(function (d) { if (d) porAno[a].liquidacao = d; })
          .catch(function () {});
      })).then(function () { return porAno; });
    });
  }

  /* Patrimonio predial (SMPP): the properties you own and their VPT - the base of IMI, and a
   * pointer to Cat G if one is later sold. The response shape is not pinned in our recon, so the
   * property list is read from the usual container keys and each property's fields from the usual
   * candidates; anything unknown is omitted, never guessed. Count is reliable; VPT is stored raw
   * (not summed - its format is unconfirmed). */
  function readPatrimonio() {
    return getJSON("/matrizesinter/api/patrimonio?_=" + Date.now()).then(function (j) {
      var lista = [];
      if (Array.isArray(j)) lista = j;
      else if (j) {
        lista = j.imoveis || j.listaPredios || j.predios || j.dados ||
                [].concat(j.prediosUrbanos || [], j.prediosRusticos || []);
        if (!Array.isArray(lista)) lista = [];
      }
      // Real field is `valor` (int), confirmed against the server 2026-07-23; valorPatrimonial does
      // NOT exist. `valorInicial` is the original matrix value, kept as a fallback.
      function vpt(o) { return o.valor != null ? o.valor : (o.valorPatrimonial != null ? o.valorPatrimonial : (o.vpt != null ? o.vpt : (o.valorInicial != null ? o.valorInicial : null))); }
      return { data: {
        imoveis: lista.length,
        lista: lista.slice(0, 8).map(function (o) {
          return { artigo: o.artigo || o.artigoMatricial || o.identificacao || o.numeroArtigo || null,
                   freguesia: o.freguesia || o.nomeFreguesia || o.designacaoFreguesia || null,
                   tipo: o.tipo || o.tipoPredio || o.especie || o.tipoImovel || null,
                   vpt: vpt(o) };
        })
      }, source: "/matrizesinter/api/patrimonio" };
    });
  }

  /* Assemble the cross-partition profile. Separate from rendering ON PURPOSE: the future /perfil
   * page (SPEC v1) consumes this SAME object, so nothing here may emit HTML. */
  function assembleProfile(store) {
    var P = store.partitions, prof = { categorias: [], detalhes: {}, recolhidoEm: {} };
    if (P.efatura && P.efatura.status === "done") {
      prof.detalhes.efatura = P.efatura.data; prof.recolhidoEm.efatura = P.efatura.fetchedAt; prof.consumidor = true;
    }
    if (P.rendas && P.rendas.status === "done") {
      var r = P.rendas.data; prof.detalhes.rendas = r; prof.recolhidoEm.rendas = P.rendas.fetchedAt;
      if (r.activos > 0) prof.categorias.push({ cat: "F", label: "Rendimentos prediais (senhorio)", base: "contratos de arrendamento activos" });
    }
    if (P.situacao && P.situacao.status === "done") {
      var s = P.situacao.data; prof.detalhes.situacao = s; prof.recolhidoEm.situacao = P.situacao.fetchedAt;
    }
    if (P.patrimonio && P.patrimonio.status === "done") {
      var pt = P.patrimonio.data; prof.detalhes.patrimonio = pt; prof.recolhidoEm.patrimonio = P.patrimonio.fetchedAt;
      if (pt.imoveis > 0) prof.categorias.push({ cat: "IMI", label: "Propriet\u00e1rio de im\u00f3veis", base: "patrim\u00f3nio predial" });
    }
    if (P.irs && P.irs.status === "done") {
      prof.detalhes.irs = P.irs.data; prof.recolhidoEm.irs = P.irs.fetchedAt;
    }
    if (P.recibos && P.recibos.status === "done") {
      prof.detalhes.recibos = P.recibos.data; prof.recolhidoEm.recibos = P.recibos.fetchedAt;
      if (P.recibos.data.recibosVerdes > 0) prof.categorias.push({ cat: "B", label: "Trabalho independente (recibos verdes)", base: "recibos verdes emitidos" });
    }
    if (P.ss && P.ss.status === "done") {
      prof.detalhes.ss = P.ss.data; prof.recolhidoEm.ss = P.ss.fetchedAt;
    }
    if (P.atividade && P.atividade.status === "done") {
      var at = P.atividade.data; prof.detalhes.atividade = at; prof.recolhidoEm.atividade = P.atividade.fetchedAt;
      // Only assert Cat B when atividade is confirmed OPEN. cessada or unknown -> do NOT add it.
      if (at.declaracoes > 0 && at.cessada === false)
        prof.categorias.push({ cat: "B", label: "Trabalho independente (atividade aberta)", base: "cadastro de atividade" });
    }
    return prof;
  }

  function profOverlay(prof) {
    var h = '<div style="font-size:14px;font-weight:700;margin:0 0 6px">Resumo da situa\u00e7\u00e3o</div>';
    if (prof.categorias.length) {
      h += '<div style="margin:0 0 8px">';
      prof.categorias.forEach(function (c) {
        h += '<span style="display:inline-block;background:#eaf2ff;border:1px solid #034ad8;color:#021c51;border-radius:99px;padding:2px 9px;margin:0 6px 5px 0;font-size:12px">Cat. ' + esc(c.cat) + ' - ' + esc(c.label) + '</span>';
      });
      h += '</div>';
    } else {
      h += '<div style="color:#666;font-size:12px;margin-bottom:8px">Ainda sem categoria detectada.</div>';
    }
    var d = prof.detalhes;
    if (d.efatura)
      h += '<div style="font-size:12px;color:#333;margin:2px 0">e-Fatura ' + esc(d.efatura.ano) + ': <b>' + esc(d.efatura.porClassificar) + '</b> por classificar de ' + esc(d.efatura.totalFaturas) + '.</div>';
    if (d.rendas) {
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Arrendamento: <b>' + esc(d.rendas.activos) + '</b> contrato(s) activo(s) de ' + esc(d.rendas.contratos) +
           (d.rendas.recibos != null ? ', ' + esc(d.rendas.recibos) + ' recibo(s)' : '') + '.</div>';
      (d.rendas.avisos || []).forEach(function (a) { h += '<div style="font-size:11px;color:#8a6100">\u26a0 ' + esc(a) + '</div>'; });
    }
    if (d.situacao) {
      var s = d.situacao;
      var temDiv = (s.dividas && s.dividas.n) ? s.dividas.n : 0;
      var temCoi = (s.coimas && s.coimas.n) ? s.coimas.n : 0;
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Situa\u00e7\u00e3o fiscal: ' +
        (temDiv ? '<b style="color:#c8102e">' + esc(temDiv) + ' d\u00edvida(s)</b>' : '<b style="color:#128a3a">sem d\u00edvidas</b>') +
        (temCoi ? ', <b style="color:#c8102e">' + esc(temCoi) + ' coima(s)</b>' : '') +
        ((s.agenda && s.agenda.n) ? '. ' + esc(s.agenda.n) + ' obriga\u00e7\u00e3o(\u00f5es) na agenda.' : '.') + '</div>';
      (s.agenda && s.agenda.proximos || []).slice(0, 3).forEach(function (p) {
        if (p.desc || p.data)
          h += '<div style="font-size:11px;color:#666;margin-left:8px">\u2022 ' + esc(p.data || "") + ' ' + esc(p.desc || "") + '</div>';
      });
    }
    if (d.patrimonio) {
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Patrim\u00f3nio: <b>' + esc(d.patrimonio.imoveis) + '</b> im\u00f3vel(is).</div>';
      (d.patrimonio.lista || []).slice(0, 3).forEach(function (im) {
        h += '<div style="font-size:11px;color:#666;margin-left:8px">\u2022 ' + esc(im.artigo || "artigo?") +
             (im.freguesia ? ", " + esc(im.freguesia) : "") + (im.vpt != null ? " (VPT " + esc(im.vpt) + ")" : "") + '</div>';
      });
    }
    if (d.irs) {
      h += '<div style="font-size:12px;color:#333;margin:2px 0">IRS: <b>' + esc(d.irs.liquidacoes) + '</b> liquida\u00e7\u00e3o(\u00f5es)' +
           (d.irs.reembolsos != null ? ', ' + esc(d.irs.reembolsos) + ' reembolso(s)' : '') + '.</div>';
      (d.irs.avisos || []).forEach(function (a) { h += '<div style="font-size:11px;color:#8a6100">\u26a0 ' + esc(a) + '</div>'; });
    }
    if (d.recibos) {
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Recibos verdes: <b>' + esc(d.recibos.recibosVerdes) + '</b> emitido(s).</div>';
      (d.recibos.avisos || []).forEach(function (a) { h += '<div style="font-size:11px;color:#8a6100">\u26a0 ' + esc(a) + '</div>'; });
    }
    if (d.atividade) {
      var at = d.atividade;
      var estado = at.cessada === true ? "cessada" : (at.cessada === false ? "aberta" : "por confirmar");
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Atividade: <b>' + esc(estado) + '</b>' +
           (at.declaracoes ? ' (' + esc(at.declaracoes) + ' declara\u00e7\u00e3o/\u00f5es)' : '') +
           (at.regimeIva ? ', IVA: <b>' + esc(at.regimeIva) + '</b>' : '') + '.</div>';
      (at.avisos || []).forEach(function (a) { h += '<div style="font-size:11px;color:#8a6100">\u26a0 ' + esc(a) + '</div>'; });
    }
    if (d.ss) {
      h += '<div style="font-size:12px;color:#333;margin:2px 0">Seguran\u00e7a Social: inscrito' +
           (d.ss.estado ? ', situa\u00e7\u00e3o <b>' + esc(d.ss.estado) + '</b>' : '') +
           (d.ss.pagamentosCorrentes != null ? '. ' + esc(d.ss.pagamentosCorrentes) + ' pagamento(s) corrente(s)' : '') + '.</div>';
    }
    return h;
  }

  function profConsentGate() {
    document.getElementById("efh-body").innerHTML =
      '<p style="margin:0 0 10px">Isto carrega a <b>tua situa\u00e7\u00e3o fiscal</b> a partir dos documentos ' +
      'oficiais das Finan\u00e7as, na sess\u00e3o que j\u00e1 tens aberta. L\u00eas uma p\u00e1gina de cada vez.</p>' +
      '<ul style="margin:0 0 12px 18px;padding:0;line-height:1.5">' +
      '<li>N\u00e3o te pede, nem v\u00ea, a password.</li>' +
      '<li>Os dados <b>ficam s\u00f3 neste navegador</b> - nada \u00e9 enviado.</li>' +
      '<li>S\u00f3 leitura: nada \u00e9 submetido \u00e0s Finan\u00e7as.</li>' +
      '</ul>' +
      '<button type="button" id="fb-prof-go" style="cursor:pointer;background:#034ad8;color:#fff;border:0;' +
      'border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">Concordo, carregar</button>';
    document.getElementById("fb-prof-go").onclick = function () {
      try { localStorage.setItem(PROF_CONSENT, JSON.stringify({ ok: true, ts: Date.now() })); } catch (e) {}
      var p = profLoad(); if (!p.consentedAt) { p.consentedAt = new Date().toISOString(); profSave(p); }
      runProfiling();            // consent given -> go straight to auto-reading this page
    };
  }

  /* Read the current partition immediately, no separate button click. "send data before the
   * buttons" - the panel opens, reads the page you are on, and only THEN shows Guardar / re-read.
   * A per-page-load guard stops it re-reading on every render. */
  var _autoRead = {};
  function autoReadCurrent(cur) {
    if (_autoRead[cur.id]) return profRender();
    _autoRead[cur.id] = 1;
    document.getElementById("efh-body").innerHTML = "A ler " + esc(cur.label) + "...";
    cur.read().then(function (res) {
      var s = profLoad();
      s.partitions[cur.id] = { status: "done", fetchedAt: new Date().toISOString(), data: res.data, source: res.source, shape: _shapes };
      profSave(s);
      // Read OK -> go STRAIGHT to /perfil with the data (URL fragment, no server). This removes the
      // separate "Guardar" click that was being missed: click bookmarklet -> read -> land on
      // /perfil with this step ticked. A brief confirmation first so the jump is not a surprise.
      var n = res.data && (res.data.porClassificar != null ? res.data.porClassificar + " por classificar"
             : (res.data.activos != null ? res.data.activos + " contrato(s) activo(s)"
             : (res.data.dividas ? ((res.data.dividas.n || 0) + " d\u00edvida(s)")
             : (res.data.imoveis != null ? res.data.imoveis + " im\u00f3vel(is)"
             : (res.data.liquidacoes != null ? res.data.liquidacoes + " liquida\u00e7\u00e3o(\u00f5es)"
             : (res.data.recibosVerdes != null ? res.data.recibosVerdes + " recibo(s) verde(s)"
             : (res.data.inscrito ? "inscrito na Seg. Social"
             : (res.data.declaracoes != null ? ("atividade " + (res.data.cessada === true ? "cessada" : res.data.cessada === false ? "aberta" : "?")) : "lido"))))))));
      document.getElementById("efh-body").innerHTML =
        '<div style="font-size:14px"><b>\u2713 Li ' + esc(cur.label) + '</b>' + (n ? " (" + esc(n) + ")" : "") +
        '.<br>A abrir a tua situa\u00e7\u00e3o...</div>';
      setTimeout(function () { location.href = handoffUrl(cur.id, res.data, _shapes); }, 700);
    }).catch(function (e) {
      var s = profLoad();
      var msg = (e && e.message) || "erro";
      s.partitions[cur.id] = { status: "pending", error: msg, fetchedAt: new Date().toISOString() };
      profSave(s);
      // Loud, on-screen failure - no console needed. Say exactly what went wrong and what to do.
      document.getElementById("efh-body").innerHTML =
        '<div style="background:#fdecec;border:1px solid #c8102e;border-radius:6px;padding:12px;font-size:13px;color:#5a0000">' +
        '<b>N\u00e3o consegui ler ' + esc(cur.label) + '.</b><br>Motivo: ' + esc(msg) + '.<br><br>' +
        'Confirma que est\u00e1s <b>autenticado nesta mesma p\u00e1gina</b> (' + esc(location.host) + ') e tenta de novo. ' +
        'Se mudaste de conta, faz de novo o login aqui.</div>' +
        '<div style="margin-top:10px"><button type="button" id="fb-retry" style="cursor:pointer;background:#034ad8;color:#fff;border:0;border-radius:6px;padding:8px 14px;font:inherit;font-weight:600">Tentar de novo</button></div>';
      var rt = document.getElementById("fb-retry");
      if (rt) rt.onclick = function () { _autoRead[cur.id] = 0; autoReadCurrent(cur); };
    });
  }

  function profRender() {
    var store = profLoad(), cur = currentPartition();
    var done = PARTITIONS.filter(function (p) { return store.partitions[p.id] && store.partitions[p.id].status === "done"; });

    var h = '<div style="font-size:15px;font-weight:700;margin:0 0 8px">A tua situa\u00e7\u00e3o fiscal ' +
            '<span style="font-weight:400;color:#555">(' + done.length + '/' + PARTITIONS.length + ')</span></div>' +
            '<div style="margin:0 0 12px">';
    PARTITIONS.forEach(function (p) {
      var st = store.partitions[p.id], ok = st && st.status === "done", here = cur && cur.id === p.id;
      h += '<div style="display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid #eef">' +
        '<span style="font-size:14px">' + (ok ? '\u2705' : '\u2b1c') + '</span>' +
        '<div style="flex:1"><div style="font-weight:600">' + esc(p.label) +
          (here ? ' <span style="color:#034ad8;font-size:11px">(est\u00e1s aqui)</span>' : '') + '</div>' +
          '<div style="color:#666;font-size:12px">' + esc(p.why) + '</div>' +
          (ok || here ? '' : '<a href="' + p.open + '" style="font-size:12px;color:#034ad8">Abrir esta p\u00e1gina \u2192</a> ' +
            '<span style="color:#888;font-size:11px">(depois clica outra vez no favorito)</span>') +
          (st && st.status === "pending" && st.error ? '<div style="color:#c8102e;font-size:11px">' + esc(st.error) + '</div>' : '') +
        '</div></div>';
    });
    h += '</div>';

    if (cur) {
      var isDone = store.partitions[cur.id] && store.partitions[cur.id].status === "done";
      h += '<button type="button" id="fb-read" style="cursor:pointer;' +
        (isDone ? 'background:#eef;color:#034ad8;border:1px solid #cdd' : 'background:#034ad8;color:#fff;border:0') +
        ';border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">' +
        (isDone ? 'Reler ' : 'Ler ') + esc(cur.label) + '</button>';
      // Once THIS partition is read, hand it to /perfil (via URL fragment - stays in the browser)
      // so the profile assembles across origins. This is the only way to combine partitions.
      if (isDone)
        h += ' <a href="' + handoffUrl(cur.id, store.partitions[cur.id].data, store.partitions[cur.id].shape) + '" ' +
          'style="display:inline-block;cursor:pointer;background:#128a3a;color:#fff;text-decoration:none;' +
          'border-radius:6px;padding:9px 16px;font-weight:600">Guardar a minha situa\u00e7\u00e3o \u2192</a>';
    } else {
      h += '<div style="color:#666;font-size:12px">Esta p\u00e1gina n\u00e3o \u00e9 uma das que lemos. Abre uma da lista acima.</div>';
    }

    if (done.length)
      h += '<div style="margin-top:14px;border-top:2px solid #021c51;padding-top:10px">' + profOverlay(assembleProfile(store)) + '</div>';
    if (done.length === PARTITIONS.length)
      h += '<div style="margin-top:8px;color:#128a3a;font-weight:600">Situa\u00e7\u00e3o carregada. Fica guardada neste navegador.</div>';
    h += '<div style="margin-top:12px"><a href="#" id="fb-reset" style="font-size:11px;color:#888">Apagar a situa\u00e7\u00e3o deste navegador</a></div>';

    document.getElementById("efh-body").innerHTML = h;

    var rb = document.getElementById("fb-read");
    if (rb && cur) rb.onclick = function () {
      rb.disabled = true; rb.textContent = "A ler...";
      cur.read().then(function (res) {
        var s = profLoad();
        s.partitions[cur.id] = { status: "done", fetchedAt: new Date().toISOString(), data: res.data, source: res.source, shape: _shapes };
        profSave(s); profRender();
      }).catch(function (e) {
        var s = profLoad();
        s.partitions[cur.id] = { status: "pending", error: "N\u00e3o deu para ler: " + ((e && e.message) || "erro") + ". Confirma o login nesta p\u00e1gina.", fetchedAt: new Date().toISOString() };
        profSave(s); profRender();
      });
    };
    var rs = document.getElementById("fb-reset");
    // "apagar" = apagar TUDO o que o tool guardou nesta origem: a situacao fiscal E a configuracao
    // do agregado (incluindo a chave de sala da partilha - quem pede para apagar quer apagar).
    if (rs) rs.onclick = function (ev) { ev.preventDefault(); try { localStorage.removeItem(PROF_KEY); localStorage.removeItem(PKEY); } catch (e) {} profRender(); };
  }

  function runProfiling() {
    if (!profConsent()) return profConsentGate();
    var cur = currentPartition(), store = profLoad();
    // On a known partition not yet read this session, read it AUTOMATICALLY. Otherwise just show
    // the checklist (e.g. an AT page we do not read, or one already collected).
    if (cur && !(store.partitions[cur.id] && store.partitions[cur.id].status === "done"))
      autoReadCurrent(cur);
    else
      profRender();
  }
  /* ======================  end PROFILING  ====================== */

  if (PROFILING) { runProfiling(); }
  else if (consent()) { document.getElementById("efh-body").innerHTML = "A ler as tuas faturas..."; start(); }
  else { gate(); }

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

  function run() {
    var caemap = {};
    fetch("/json/obterDocumentosAdquirente.action?dataInicioFilter=" + year + "-01-01&dataFimFilter=" + year + "-12-31",
      { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        // Pull the map slices for THESE merchants before doing anything else. Everything below
        // reads caemap synchronously, so it has to be populated first.
        var all = ((d && d.linhas) || []).map(function (x) { return x.nifEmitente; });
        return fetchMap(all).then(function (m) { caemap = m || {}; return d; });
      })
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
        /* R1: the actionable set is PENDING plus already-attributed invoices the optimiser can
         * genuinely improve. `optimise()` and `dedu()` are hoisted function declarations inside
         * this callback, so calling optimise() here (before its textual definition) is safe - all
         * its inputs (cascade, dedu, capFor, prof, CEIL, rows) already exist.
         *
         * movR is the FOOTGUN-SAFE recoverable set BY CONSTRUCTION: optimise() only emits a move
         * when a DIFFERENT sector the merchant is REGISTERED for (from cascade -> SICAE) has
         * headroom. A C99-only merchant yields no move, so this can never suggest declaring
         * groceries as Saude. Verified 20-07-2026 that the landing sector is actividadeEmitente
         * (the IRS endpoint's valorTotalSetorBeneficio/DespesasGerais are always 0). */
        // movR (invoices in a full pot the merchant can move out of) + the footgun-safe recoverable,
        // now computed by the SHARED core so the current year and the past-year re-audit never drift.
        var _mr = movablesAndRecoverable(rows, caemap, prof);   // current year -> current ceilings
        var movR = _mr.movR, recoverable = _mr.recoverable;
        var movTo = {};
        movR.forEach(function (m) { movTo[m.x.idDocumento] = m.to; });
        var actionable = pend.concat(movR.map(function (m) { return m.x; }));
        if (!actionable.length) {
          document.getElementById("efh-body").innerHTML = "\u2705 Est\u00e1s em dia - nada por classificar nem por corrigir em " + year + ".";
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
        var trs = actionable.map(function (x, i) {
          // Already-attributed rows are a CORRECTION: current sector = actividadeEmitente, target =
          // the optimiser's move. Pending rows keep the suggest/provavel two-column semantics.
          var isR = (x.estadoBeneficio === "R");
          var s = isR ? movTo[x.idDocumento] : suggest(x.nifEmitente, x);   // most deduction / move target
          var pv = isR ? (x.actividadeEmitente || "C99") : provavel(x.nifEmitente);   // current / likely
          // stash the suggestion so sendOutcomes() can report suggested-vs-chosen without
          // recomputing it (and without ever touching amounts or dates)
          x.__sug = s;
          var old = v1(x.nifEmitente);
          if (old !== s) changed++;
          /* Two suggestions, side by side, because they answer different questions and the user
           * is the one declaring.
           *
           * PRE-SELECTS OTIMIZADA (changed 20-07-2026). This reverses the original default, and
           * the reason it was PROVAVEL is still valid and worth stating: defaulting to whatever
           * pays most can nudge someone into declaring groceries as Saude just because the shop
           * also holds a pharmacy CAE. What changed is that defaulting to PROVAVEL meant almost
           * nobody ever saw the benefit - the panel opened on the safe answer and the user had to
           * work out for themselves that a better one existed.
           *
           * What keeps this honest, and must not be removed:
           *   - Otimizada only ever offers a sector the merchant is ACTUALLY REGISTERED for
           *     (cascade() -> the public SICAE map). It cannot invent one.
           *   - The Resumo tab carries the consequence line in plain sight, not in a tooltip:
           *     classifying is a declaration to the AT, and being accepted is not being right.
           *   - Both figures sit on the switcher, so choosing PROVAVEL is one click and the user
           *     can see exactly what that choice costs.
           * Where the purchase genuinely was in the better sector the two agree anyway. */
          var cell = function (sec, i2, kind) {
            return '<button type="button" class="efh-pick" data-i="' + i2 + '" data-sec="' + sec + '" ' +
              'title="Usar ' + sec + ' - ' + esc(SECTORS[sec] || sec) + '" ' +
              'style="cursor:pointer;font:inherit;font-size:11px;border:1px solid ' +
              (kind === "pv" ? "#034ad8;color:#034ad8" : "#128a3a;color:#128a3a") +
              ';background:#fff;border-radius:3px;padding:2px 6px;min-height:24px">' + sec + '</button>';
          };
          var same = (pv === s);
          var badge = isR ? ' <span style="font-size:9px;background:#eef7f0;color:#1E5A3A;border:1px solid #bfe0c8;border-radius:3px;padding:0 3px" title="Ja classificada - isto corrige o setor">corrigir</span>' : "";
          return '<tr><td style="text-align:center"><input type="checkbox" class="efh-ck" data-i="' + i + '" checked></td>' +
            '<td>' + esc(x.dataEmissaoDocumento) + '</td><td>' + esc(name34(x)) + badge + '</td>' +
            '<td style="text-align:right">\u20ac' + eur(x.valorTotal) + '</td>' +
            '<td style="font-size:11px;white-space:nowrap">' + cell(pv, i, "pv") + "</td>" +
            '<td style="font-size:11px;white-space:nowrap">' +
              (same ? '<span style="color:#999">igual</span>' : cell(s, i, "op")) + "</td>" +
            '<td><select class="efh-sec" data-i="' + i + '" style="max-width:190px" aria-label="Setor para ' +
            esc(name34(x)) + '">' +
            opts.replace('value="' + s + '"', 'value="' + s + '" selected') + '</select></td></tr>';
        }).join("");
        // Named __efhPend for history, but it is now the full ACTIONABLE set (pending + movable-R).
        // applySelected() indexes into this by the row's data-i and routes each by estadoBeneficio.
        window.__efhPend = actionable;
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
            var x = actionable[i];
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
          // The ~11 activity sectors that share the single art. 78.o-F IVA pot. Built from CEIL so
          // it stays complete if a sector (e.g. C15) is added - no hardcoded list to drift.
          var potMembers = Object.keys(CEIL).filter(function (k) { return CEIL[k].pot === POT; })
                             .map(function (k) { return SECTORS[k] || k; });
          var html = keys.map(function (s) {
            return oneBar(s + " " + SECTORS[s], used[s] || 0, add[s] || 0, capFor(s, prof));
          }).join("") +
            oneBar("IVA em fatura (" + potMembers.length + " atividades, teto \u00fanico)",
                   used[POT] || 0, add[POT] || 0, POT_CAP) +
            // Make it explicit WHY there are only 6 ceilings, not 16 - the IVA activities share one.
            '<div style="margin-top:6px;font-size:10.5px;color:#6b7780;line-height:1.4">' +
            'S\u00e3o estes <b>6 os tetos</b> de dedu\u00e7\u00e3o por faturas. As <b>' + potMembers.length +
            ' atividades com IVA</b> (' + potMembers.join(", ") + ') <b>n\u00e3o t\u00eam teto pr\u00f3prio</b>: ' +
            'partilham todas o mesmo teto de \u20ac' + POT_CAP + '.</div>';

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

        // Sponsor strip - now rendered from the offers DATA feed (see renderOffers / offers.json),
        // so the referral/offers can update without re-pinning the core. Sits at the BOTTOM of the
        // Resumo tab, after the value. Only on the simple view.
        var sponsor = renderOffers(_offers);
        document.getElementById("efh-body").innerHTML =
          /* Two renderings of ONE dataset, one fetch. Resumo answers "what do I do"; Detalhe keeps
           * everything that was here before. Tabs toggle display only - #efh-bars and #efh-opt must
           * stay IN the DOM, because renderBars() and the optimiser write into them by id and would
           * silently no-op against a detached node. */
          '<div role="tablist" style="display:flex;gap:4px;margin:0 0 10px;border-bottom:2px solid #d5dae1">' +
          '<button type="button" role="tab" id="efh-tab-r" aria-selected="true" style="cursor:pointer;border:0;' +
          'background:none;font:inherit;font-weight:700;color:#034ad8;padding:6px 12px;border-bottom:3px solid #034ad8;margin-bottom:-2px">Resumo</button>' +
          '<button type="button" role="tab" id="efh-tab-d" aria-selected="false" style="cursor:pointer;border:0;' +
          'background:none;font:inherit;font-weight:600;color:#6b7780;padding:6px 12px;border-bottom:3px solid transparent;margin-bottom:-2px">Detalhe</button>' +
          '</div>' +
          '<div id="efh-pane-r"><div id="efh-resumo">A calcular...</div>' + sponsor + '</div>' +
          '<div id="efh-pane-d" style="display:none">' +
          '<p style="margin:0 0 8px"><b>' + pend.length + ' por classificar</b>' +
          (movR.length ? ' + <b>' + movR.length + ' por corrigir</b> (j\u00e1 classificadas, mas rendem mais noutro setor)' : '') +
          ' em ' + year +
          '. Duas sugest\u00f5es por fatura: <b>Prov\u00e1vel</b> (a atividade principal do comerciante, ou o que j\u00e1 usaste antes) e <b>Otimizada</b> (mais dedu\u00e7\u00e3o, com espa\u00e7o no teto). Vem selecionada a <b>Otimizada</b>. S\u00f3 aparecem setores em que o comerciante est\u00e1 mesmo registado, mas <b>ser aceite n\u00e3o \u00e9 o mesmo que estar certo</b>: a classifica\u00e7\u00e3o \u00e9 uma declara\u00e7\u00e3o tua \u00e0 AT.</p>' +
          '<div style="background:#f4f6f9;border:1px solid #d5dae1;border-radius:2px;padding:9px;margin-bottom:10px;font-size:12px">' +
          '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center">' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' +
          '<input type="checkbox" id="efh-joint"' + (prof.joint ? " checked" : "") + '> Tributa\u00e7\u00e3o conjunta</label>' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' +
          '<input type="checkbox" id="efh-mono"' + (prof.mono ? " checked" : "") +
          '> Fam\u00edlia monoparental</label></div>' +
          '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #dde5ee">' +
          '<label title="Opcional. Os tetos do IRS s\u00e3o do agregado, mas esta p\u00e1gina s\u00f3 v\u00ea esta conta.">' +
          'Partilhar tetos do agregado (opcional): <input type="text" id="efh-room" ' +
          'placeholder="cola a chave, ou deixa vazio" autocomplete="off" spellcheck="false" ' +
          'value="" style="width:170px"></label> ' +
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
          // #efh-apply is rendered ONLY when DRAFT is off. While DRAFT is on the tool writes nothing,
          // and the page copy at faturas.diogoandrade.com promises exactly that - so this button and
          // those promises flip together, never one without the other.
          (DRAFT ? '' :
            '<button id="efh-apply" style="background:#1E5A3A;color:#fff;border:0;border-radius:6px;padding:10px 16px;min-height:44px;cursor:pointer;font-weight:700">Aplicar no e-Fatura</button> ') +
          '<button id="efh-export" style="background:#034ad8;color:#fff;border:0;border-radius:6px;padding:10px 16px;min-height:44px;cursor:pointer;font-weight:600">Copiar plano</button> ' +
          '<button id="efh-mailto" style="background:#fff;color:#034ad8;border:1px solid #034ad8;border-radius:6px;padding:10px 16px;min-height:44px;cursor:pointer;font-weight:600">Enviar por email</button> ' +
          '<span id="efh-status" role="status" aria-live="polite" style="color:#555"></span></div>' +
          '</div>';

        (function () {
          var tr = document.getElementById("efh-tab-r"), td = document.getElementById("efh-tab-d");
          var pr = document.getElementById("efh-pane-r"), pd = document.getElementById("efh-pane-d");
          function show(res) {
            pr.style.display = res ? "" : "none";
            pd.style.display = res ? "none" : "";
            tr.setAttribute("aria-selected", res ? "true" : "false");
            td.setAttribute("aria-selected", res ? "false" : "true");
            tr.style.color = res ? "#034ad8" : "#6b7780";
            td.style.color = res ? "#6b7780" : "#034ad8";
            tr.style.borderBottomColor = res ? "#034ad8" : "transparent";
            td.style.borderBottomColor = res ? "transparent" : "#034ad8";
            tr.style.fontWeight = res ? "700" : "600";
            td.style.fontWeight = res ? "600" : "700";
          }
          tr.onclick = function () { show(true); };
          td.onclick = function () { show(false); };
        })();
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
            var i = +ck.dataset.i, x = actionable[i];
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
          sendOutcomes(window.__efhPend);
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
        document.getElementById("efh-mailto").onclick = function () {
          // mailto keeps this client-side: the plan goes straight to the user's own mail client,
          // it never touches a server of ours.
          var subj = "Plano e-Fatura " + year;
          window.location.href = "mailto:?subject=" + encodeURIComponent(subj) +
            "&body=" + encodeURIComponent(planText());
        };
        // Wire the live-submit button only when it exists (DRAFT off). sendOutcomes() fires here
        // too, because clicking Aplicar is a decision just like Copiar plano is.
        var applyBtn = document.getElementById("efh-apply");
        if (applyBtn) applyBtn.onclick = function () { sendOutcomes(window.__efhPend); applySelected(); };
        restoreEdits(actionable);         // re-apply edits made before a household change
        renderBars();
        (function () {
          var o = optimise(), box = document.getElementById("efh-opt");
          window.__efhOpt = o;
          var rRoom = [], rFull = [];
          ["C05", "C06", "C07", "C08", "C99"].forEach(function (s2) {
            (headroom(s2) > 1 ? rRoom : rFull).push(SECTORS[s2] || s2);
          });
          renderResumo(o, pend.length, rRoom, rFull, recoverable, movR.length);
          if (!box) return;
          // Same honest framing as the Resumo: recoverable is the MOVABLE gain, not the raw
          // overflow. `reg` must be movR - o.moves is always empty for R rows (cascade pins them
          // to their own attribution), so the old "ver quais" never listed anything.
          var bits = [];
          var reg = movR;
          if (movR.length && recoverable > 1) {
            bits.push('Podes recuperar <b style="color:#1E5A3A">\u20ac' + recoverable.toFixed(2) + '</b> ' +
                      'movendo <b>' + movR.length + '</b> fatura' + (movR.length === 1 ? '' : 's') +
                      ' j\u00e1 registada' + (movR.length === 1 ? '' : 's') + ' para um setor com espa\u00e7o');
            bits.push('<span style="color:#b8860b;font-size:11px">S\u00f3 se a compra <b>pertencer mesmo</b> a esse setor. O comerciante est\u00e1 l\u00e1 registado, mas classificar mal s\u00f3 para deduzir mais \u00e9 ilegal e pode dar inspe\u00e7\u00e3o. Otimizar \u2260 declarar bem. N\u00e3o \u00e9 aconselhamento fiscal.</span>');
          } else if (o.wasted > 1) {
            bits.push('<span style="color:#6b7780">\u20ac' + o.wasted.toFixed(0) + ' acima do teto de ' +
                      'Despesas Gerais - <b>normal</b>, e sem outro setor registado n\u00e3o h\u00e1 nada a mover.</span>');
          }
          if (!bits.length) { box.innerHTML = '<div style="color:#128a3a;font-size:12px">\u2713 Nada por aproveitar - as tuas faturas j\u00e1 est\u00e3o nos melhores setores poss\u00edveis.</div>'; return; }
          box.innerHTML = '<div style="background:' + (movR.length ? '#eef7f0;border:1px solid #bfe0c8' : '#f4f6f9;border:1px solid #d5dae1') + ';border-radius:6px;padding:8px;font-size:12px">' +
            bits.join('<br>') +
            (reg.length ? ' <a href="#" id="efh-optmore" style="color:#034ad8">ver quais</a>' : '') + '</div>';
          var more = document.getElementById("efh-optmore");
          if (more) more.onclick = function (ev) {
            ev.preventDefault();
            more.outerHTML = '<div style="margin-top:6px;max-height:130px;overflow:auto">' +
              reg.slice(0, 40).map(function (m) {
                return '<div>' + esc(m.x.dataEmissaoDocumento) + '  |  ' + esc(name34(m.x)) +
                       '  |  \u20ac' + eur(m.x.valorTotal) + ' - <b>' + (m.x.actividadeEmitente || "C99") + ' -> ' + m.to + '</b></div>';
              }).join("") + '</div>';
          };
        })();
        document.querySelectorAll(".efh-ck").forEach(function (el) { el.onchange = renderBars; });
        document.querySelectorAll(".efh-sec").forEach(function (el) { el.onchange = renderBars; });
        // changing the household re-runs the whole suggestion pass (ceilings move, so do sectors)
        var reprofile = function () {
          snapshotEdits(actionable);        // keep the user's corrections across the rebuild
          saveProfile({ joint: document.getElementById("efh-joint").checked,
                        mono: document.getElementById("efh-mono").checked });
          run(caemap);
        };
        document.getElementById("efh-joint").onchange = reprofile;
        document.getElementById("efh-mono").onchange = reprofile;

        var hhBox = document.getElementById("efh-hh");
        if (prof.room) { hhBox.innerHTML = 'Ligado. Chave: <code>' + esc(prof.room.slice(0, 16)) + '...</code>'; }
        document.getElementById("efh-join").onclick = function () {
          /* Paste a key to JOIN an existing household; leave it empty to CREATE one. Nothing about
           * you goes into the key - see newRoom(). Your own NIF and email are never read here. */
          var typed = document.getElementById("efh-room").value.trim().toLowerCase();
          if (typed && !ROOM_RE.test(typed)) {
            hhBox.textContent = "Chave invalida. Cola a chave inteira, ou deixa vazio para criar uma.";
            return;
          }
          var room = typed || prof.room || newRoom();
          hhBox.textContent = typed ? "A ligar..." : "A criar chave...";
          Promise.resolve(room).then(function (room) {
            var body = { member: memberId() };
            ["C05", "C06", "C07", "C08", "C99"].forEach(function (k) { body[k] = +(used[k] || 0).toFixed(2); });
            body.POT = +(used[POT] || 0).toFixed(2);
            return fetch(HH_URL + room, { method: "PUT", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(body) })
              .then(function () { return fetch(HH_URL + room); })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                // no email is stored any more - the room key is the only household state we keep
                saveProfile({ joint: prof.joint, mono: prof.mono, room: room });
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
        // consent:true required by the server. This send sits behind an explicit button, so the
        // assertion is accurate; a payload without it means the client never asked anyone.
        body: JSON.stringify({ ano: year, desperdicado: +(o.wasted || 0).toFixed(2),
                               ganho: +((o.after - o.before) || 0).toFixed(2), aplicadas: applied,
                               consent: true })
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
    var st = document.getElementById("efh-status");
    var applyBtn = document.getElementById("efh-apply"); if (applyBtn) applyBtn.disabled = true;
    var ok = 0, fail = 0, n = 0, errs = [];
    (function next() {
      if (n >= picks.length) {
        st.innerHTML = "<b>" + ok + " aplicadas</b>, " + fail + " falhas. Atualize a p\u00e1gina para confirmar.";
        if (errs.length) {
          var reported = shareOn() && errs.some(function (e) { return /atividade registada/i.test(e.reason); });
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
      /* Two write paths, chosen by the invoice's state. A PENDING fatura is resolved; an
       * already-ATTRIBUTED one is re-classified via Alterar. Both server-render their form (with
       * every hidden field) into the same detalhe page, so the mechanism is identical - only the
       * form, the action, and the sector field name differ. Confirmed against the raw HTML on
       * 20-07-2026: the detalhe page carries resolverPendencia AND alterarDocumentoAdquirente forms
       * with all hidden inputs, so DOMParser finds them without running any JS. */
      var isPend = /^P$/i.test(p.x.estadoBeneficio || "");
      var formSel = isPend ? '[action="resolverPendenciaAdquirente.action"]'
                           : '[action="alterarDocumentoAdquirente.action"]';
      var postUrl = isPend ? "/resolverPendenciaAdquirente.action" : "/alterarDocumentoAdquirente.action";
      var secField = isPend ? "ambitoAquisicaoPend" : "ambitoAquisicao";
      fetch("/detalheDocumentoAdquirente.action?idDocumento=" + p.x.idDocumento + "&dataEmissaoDocumento=" + p.x.dataEmissaoDocumento,
        { credentials: "include" }).then(function (r) { return r.text(); }).then(function (htmlText) {
        var doc = new DOMParser().parseFromString(htmlText, "text/html");
        var form = doc.querySelector("form" + formSel) || doc.querySelector("#resolverPendencia");
        if (!form) throw new Error("form em falta");
        var body = new URLSearchParams();
        form.querySelectorAll('input[type="hidden"]').forEach(function (inp) { body.set(inp.name, inp.value || ""); });
        body.set(secField, p.sec);
        return fetch(postUrl, { method: "POST", credentials: "include",
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
        // Only report the merchant NIF for re-verification if the user opted into sharing. It is
        // the SAME data the learning loop sends (a merchant NIF, nothing of yours), so it lives
        // under the same consent - otherwise the transparency page's "se nao ativares nada, nada
        // sai" would not hold. Server accepts this unauthenticated but rate-limited.
        if (shareOn() && /atividade registada/i.test(reason)) {
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
