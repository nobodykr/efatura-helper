/* Fatura Boa (c) 2026 Diogo Andrade. Licenca PolyForm Noncommercial 1.0.0
 * (https://polyformproject.org/licenses/noncommercial/1.0.0). Uso nao-comercial apenas; copias
 * carregam este aviso. Origem oficial: fiscalida.de | ref fb-lic-4761358cab */
/* Fatura Boa - runs 100% in the user's own browser, on their own e-Fatura session.
 * It never sees a password: it reuses the login already in the browser (same-origin cookies).
 *
 * Network calls (audit them yourself - there are exactly three kinds):
 *   - same-origin to faturas.portaldasfinancas.gov.pt  (read your faturas, submit classifications)
 *   - static BRAND ASSETS from fiscalida.de (the IBM Plex font files and the
 *     offers.json sponsor feed - plain downloads, the same files for everybody, send nothing)
 *   - ONE read-only GET of the PUBLIC map at fiscalida.de/api/v1/sectors.json
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
   * copyable. The complete fiscal profile stays in the browser; after the one explicit /perfil
   * agreement, only allowlisted value-free shapes and permitted company/year aggregates enter the
   * mandatory isolated market intake. The flag keeps this gated flow off the public classifier. */
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
  var RUNTIME = (window.__FISCALIDADE_CONFIG__ && typeof window.__FISCALIDADE_CONFIG__ === "object")
    ? window.__FISCALIDADE_CONFIG__ : {};
  var PUBLIC_ORIGIN = RUNTIME.publicOrigin || "https://fiscalida.de";
  var API_BASE = RUNTIME.apiBase || (PUBLIC_ORIGIN + "/api/v1");
  var EXTENSION_MODE = RUNTIME.extension === true;
  var DASHBOARD = EXTENSION_MODE && !!window.__FB_DASHBOARD;
  var _extensionSettings = Object.assign({}, RUNTIME.extensionSettings || {});
  function saveExtensionSettings(patch) {
    if (!EXTENSION_MODE) return;
    _extensionSettings = Object.assign({}, _extensionSettings, patch || {});
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage)
        chrome.runtime.sendMessage({ type: "fb-settings-save", settings: patch || {} });
    } catch (e) {}
  }
  var MAP_BUCKET_URL = API_BASE + "/map/buckets/";
  var MERCHANT_CONTRIBUTION_URL = API_BASE + "/contributions/merchant";
  var IMPACT_CONTRIBUTION_URL = API_BASE + "/contributions/impact";
  // Provably-fair versioning: this label is shown in the panel; the TRUTH is the file's sha384,
  // published per release in /versions.json and checkable at /verificar. Bump on any tool.js change.
  var FB_VERSION = "2026.08.25.6";

  /* ADS AS INERT DATA (provably-fair Step 2). The sponsor strip is the ONE piece that should update
   * without re-pinning the core, so it is a DATA feed, not code: the pinned core fetches offers.json
   * and renders it, validating every URL is https and escaping every string. The data can only pick
   * from core-defined styles; it can never inject markup or execute. A built-in DEFAULT (the current
   * offers) is in the audited code, so a pinned core still works and is honest if the feed is down. */
  var OFFERS_URL = RUNTIME.offersUrl || (PUBLIC_ORIGIN + "/offers.json");
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
   * rendered and applySelected() is unreachable. The page at fiscalida.de states
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

  var SECTORS = { C01: "Repara\u00e7\u00e3o autom\u00f3veis", C02: "Repara\u00e7\u00e3o motociclos", C03: "Alojamento/restaura\u00e7\u00e3o",
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
   * Sources are listed on https://fiscalida.de */
  var POT = "iva78F";
  var CEIL = {
    C05: { rate: 0.15, base: "total", cap: 1000 },
    C06: { rate: 0.30, base: "total", cap: 800 },
    // Art. 78.o-E: the permanent n.10 ceiling is 1,000 EUR, but DL 97/2026 art. 15 applies
    // 900 EUR to income year 2026. N.4 can raise the result to 1,100 for lower incomes; that
    // income-dependent increase is not modelled, so this remains the conservative base ceiling.
    // Historico: 502 (fix anterior) era o texto
    // DESATUALIZADO do render do diploma-pai - o valor por ano vive em RENDAS_CAP_ANO abaixo.
    C07: { rate: 0.15, base: "total", cap: 900 },
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
  var HH_URL = API_BASE + "/households/";

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
    if (EXTENSION_MODE) v = _extensionSettings.member || null;
    else try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      var a = new Uint8Array(12); crypto.getRandomValues(a);
      v = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      if (EXTENSION_MODE) saveExtensionSettings({ member: v });
      else try { localStorage.setItem(k, v); } catch (e) {}
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

  function loadProfile() {
    if (EXTENSION_MODE) return Object.assign({}, _extensionSettings.classifierProfile || {});
    try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; }
  }
  function saveProfile(p) {
    if (EXTENSION_MODE) { saveExtensionSettings({ classifierProfile: p }); return; }
    try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {}
  }

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

  /* Deduction contributed by one invoice when classified in `sec`. Keep this in one place: C99
   * is 45%, not CEIL.C99.rate (35%), for a monoparental household. Having ad-hoc copies of this
   * formula already made the optimiser undervalue that case. Amounts from e-Fatura are cents. */
  function deductionFor(x, sec, prof) {
    var c = CEIL[sec]; if (!c) return 0;
    var value = (c.base === "iva" ? Number(x.valorTotalIva || 0) : Number(x.valorTotal || 0)) / 100;
    return value * (sec === "C99" ? c99Rate(prof) : c.rate);
  }

  /* How much of each ceiling the year's ALREADY-REGISTERED invoices have used up. */
  function usedSoFar(rows, prof) {
    var used = {};
    rows.forEach(function (x) {
      var sec = x.actividadeEmitente, c = CEIL[sec];
      if (!isAttributed(x.estadoBeneficio) || !c) return;
      var key = c.pot || sec;
      used[key] = (used[key] || 0) + deductionFor(x, sec, prof);
    });
    return used;
  }

  /* PAST-YEAR RE-AUDIT. e-Fatura keeps invoices per year (the same obterDocumentosAdquirente endpoint
   * takes a date range), so we can read any past year and see how much of each ceiling was used vs
   * still free - i.e. deduction that MIGHT be recoverable via a declaracao de substituicao (within
   * the CPPT/LGT windows). Only the rendas ceiling (C07) moved across years; the rest held. Values
   * are DRE/AT-verified in year_snapshots.json. Indicators only - never a submission. */
  var RENDAS_CAP_ANO = { 2023: 502, 2024: 600, 2025: 700, 2026: 900 };   // C07 base per income year. 2025: Lei 36/2024 (transitoria 50% do aumento 600->800). 2026: DL 97/2026, art. 78-E n.10 + norma transitoria (900 em 2026, 1000 em 2027) - lido do PDF do DR 2026-07-31.
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
      var hasTotal = !!(j && j.totalElementos != null);
      var total = hasTotal ? Number(j.totalElementos) : rows.length;
      // If the count field disappears and exactly the known server cap arrives, completeness is
      // unknowable. Split until each interval is below the cap instead of accepting a neat 300.
      var mayBeCapped = hasTotal ? rows.length < total : rows.length >= 300;
      if (!mayBeCapped) return rows;                         // complete
      var mid = _midDate(ini, fim);
      if (!mid) throw new Error("pagina\u00e7\u00e3o incompleta: " + rows.length + " de " + total + " faturas");
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
  function movablesAndRecoverable(rows, caemap, prof, rendasCap, usedOverride) {
    // Current-year household mode supplies the authoritative merged ceiling usage. Past-year
    // re-audits omit it and use this account's rows. Copy so allocation never mutates the caller.
    var sourceUsed = usedOverride || usedSoFar(rows, prof), used = {};
    Object.keys(sourceUsed).forEach(function (k) { used[k] = sourceUsed[k]; });
    var capOf = function (sec) { return (sec === "C07" && rendasCap != null) ? rendasCap : capFor(sec, prof); };
    var keyOf = function (sec) { return CEIL[sec].pot || sec; };
    var copyUsed = function () { var o = {}; Object.keys(used).forEach(function (k) { o[k] = used[k]; }); return o; };

    /* Allocate actual NET improvements. A move does two things at once: it can add deduction to
     * the target, but it also removes this invoice's deduction from its current category. The old
     * code counted only the first half, so moving an invoice out of a barely-over-cap source could
     * be reported as profitable even when it reduced the taxpayer's total deduction. Recompute the
     * marginal before/after result against mutable ceiling levels at every greedy step. */
    var allocate = function (onlyPrimary) {
      var levels = copyUsed(), pending = [], out = [];
      rows.forEach(function (x) {
        if (!isAttributed(x.estadoBeneficio)) return;
        var cur = x.actividadeEmitente; if (!cur || !CEIL[cur]) return;
        var raw = caemap[x.nifEmitente];
        var reg = raw ? (Object.prototype.toString.call(raw) === "[object Array]" ? raw : [raw]) : [];
        reg = reg.filter(function (s, i) { return CEIL[s] && reg.indexOf(s) === i; });
        var primario = reg.length ? reg[0] : null;
        var targets = onlyPrimary ? (primario && primario !== cur ? [primario] : [])
                                  : reg.filter(function (s) { return s !== cur; });
        if (targets.length) pending.push({ x: x, cur: cur, targets: targets, primario: primario });
      });

      while (pending.length) {
        var best = null;
        pending.forEach(function (p, pi) {
          var sourceKey = keyOf(p.cur), sourceD = deductionFor(p.x, p.cur, prof);
          var sourceBefore = Math.min(levels[sourceKey] || 0, capOf(p.cur));
          var sourceAfter = Math.min(Math.max(0, (levels[sourceKey] || 0) - sourceD), capOf(p.cur));
          var sourceLoss = sourceBefore - sourceAfter;
          p.targets.forEach(function (to, ti) {
            var targetKey = keyOf(to);
            // Sectors in the same 78-F pot share one ceiling. Re-labelling inside that pot is not
            // a cap-recovery operation and must be left to the factual purchase classification.
            if (targetKey === sourceKey) return;
            var targetD = deductionFor(p.x, to, prof);
            var targetBefore = Math.min(levels[targetKey] || 0, capOf(to));
            var targetAfter = Math.min((levels[targetKey] || 0) + targetD, capOf(to));
            var net = targetAfter - targetBefore - sourceLoss;
            if (net > 0.01 && (!best || net > best.net + 0.005))
              best = { pi: pi, ti: ti, p: p, to: to, sourceKey: sourceKey,
                       targetKey: targetKey, sourceD: sourceD, targetD: targetD, net: net };
          });
        });
        if (!best) break;
        levels[best.sourceKey] = Math.max(0, (levels[best.sourceKey] || 0) - best.sourceD);
        levels[best.targetKey] = (levels[best.targetKey] || 0) + best.targetD;
        var m = { x: best.p.x, to: best.to, primario: best.p.primario,
                  aconselhado: best.to === best.p.primario, deGerais: best.p.cur === "C99" };
        out.push({ m: m, g: best.net });
        pending.splice(best.pi, 1); // one invoice can move only once
      }
      return out;
    };

    var allocR = allocate(false), allocA = allocate(true);
    var movR = allocR.map(function (a) { return a.m; });
    var movA = allocA.map(function (a) { return a.m; });
    var sum = function (a) { return +a.reduce(function (n, x) { return n + x.g; }, 0).toFixed(2); };
    return { movR: movR, recoverable: sum(allocR),
             movA: movA, recoverableAconselhado: sum(allocA),
             allocR: allocR, allocA: allocA,
             nDeGerais: movR.filter(function (m) { return m.deGerais; }).length };
  }
  /* A LISTA ACIONAVEL. Os agregados dizem "651 EUR em 153 faturas"; nunca disseram QUAIS - e sem
   * isso nao ha nada a fazer com o numero. Isto agrupa a alocacao do greedy por comerciante, para
   * /perfil poder mostrar onde exatamente ir mexer no e-Fatura.
   *
   * A CHAVE E nif + setor atual + setor candidato, e nao so o NIF: as faturas do mesmo comerciante
   * podem estar em setores atuais diferentes e receber candidatos diferentes, e uma linha unica
   * teria de escolher um par "de/para" que seria FALSO para parte do grupo. Assim um comerciante
   * misturado da duas linhas, ambas verdadeiras.
   *
   * Etiquetas via SECTORS, exatamente como porSetor logo acima - a lista aparece ao lado da
   * contagem por setor, e dois nomes para o mesmo codigo na mesma caixa seria pior do que qualquer
   * um deles isolado.
   *
   * CAP: isto viaja no fragmento do URL de handoff (browser -> /perfil, nunca pela rede) e fica
   * guardado no localStorage. O fragmento tem de continuar pequeno, por isso ficam so os TOP 40
   * grupos por valor, por ano e por lista. Quem tem 200 comerciantes nao vai agir em 200; age nos
   * que valem dinheiro. */
  var GRUPOS_MAX = 40;
  function groupByMerchant(alloc) {
    var by = {}, keys = [];
    (alloc || []).forEach(function (a) {
      var x = a.m.x;
      var de = (x.actividadeEmitente && CEIL[x.actividadeEmitente]) ? x.actividadeEmitente : "C99";
      var k = (x.nifEmitente || "") + "|" + de + "|" + a.m.to;
      if (!by[k]) {
        by[k] = { nome: name34(x), nif: String(x.nifEmitente || ""), n: 0, valor: 0,
                  de: SECTORS[de] || de, para: SECTORS[a.m.to] || a.m.to };
        keys.push(k);
      }
      by[k].n++; by[k].valor += a.g;
    });
    return keys.map(function (k) { by[k].valor = +by[k].valor.toFixed(2); return by[k]; })
               .sort(function (p, q) { return q.valor - p.valor; })
               .slice(0, GRUPOS_MAX);
  }
  /* Mandatory market contribution for the free profile flow. Only Portuguese legal-entity NIFs
   * that pass the checksum are eligible. The row contains one company/year aggregate: no issuer
   * name, invoice/date/document identifiers, consumer identity or individual invoice survives.
   * e-Fatura monetary fields are cents (the same unit used by dedu()), hence /100 here. */
  function marketCompanyYear(rows, ano) {
    var by = {};
    (rows || []).forEach(function (row) {
      var nif = String(row.nifEmitente || "");
      if (!isVerifiedLegalEntityNif(nif)) return;
      if (!by[nif]) by[nif] = { nif: nif, year: Number(ano), invoiceCount: 0,
        grossEur: 0, vatEur: 0, sectorCounts: {} };
      var item = by[nif];
      item.invoiceCount++;
      item.grossEur += (Number(row.valorTotal) || 0) / 100;
      item.vatEur += (Number(row.valorTotalIva) || 0) / 100;
      var sector = /^C[0-9]{2}$/.test(String(row.actividadeEmitente || ""))
        ? String(row.actividadeEmitente) : "UNCLASSIFIED";
      item.sectorCounts[sector] = (item.sectorCounts[sector] || 0) + 1;
    });
    return Object.keys(by).sort().map(function (nif) {
      by[nif].grossEur = +by[nif].grossEur.toFixed(2);
      by[nif].vatEur = +by[nif].vatEur.toFixed(2);
      return by[nif];
    });
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
                 porSetorAconselhado: byTargetA, nDeGerais: mr.nDeGerais,
                 // O detalhe acionavel: uma lista por PAINEL, porque os dois paineis de /perfil
                 // mostram cenarios diferentes. Uma lista unica debaixo do painel "Aconselhado"
                 // estaria a incluir setores secundarios sob um titulo que promete so o principal.
                 porComerciante: groupByMerchant(mr.allocR),
                 porComercianteAconselhado: groupByMerchant(mr.allocA),
                 // Private transport field. readEfatura removes it before the local profile data
                 // is stored and passes it only through the minimized market envelope.
                 _market: marketCompanyYear(rows, ano) };
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
  function firstDashboardValue(row, names) {
    for (var i = 0; i < names.length; i++) {
      var value = row[names[i]];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }
  function dashboardScope(row) {
    var value = firstDashboardValue(row, ["afectacaoAtividade", "afetacaoAtividade", "ambitoAtividade",
      "tipoAquisicaoAtividade", "despesaAtividade"]);
    if (value === "") return "";
    if (value === true || value === 1 || value === "1") return "profissional";
    if (value === false || value === 0 || value === "0") return "pessoal";
    value = String(value).toLowerCase();
    if (/parcial/.test(value)) return "parcial";
    if (/profissional|atividade|actividade|empresarial|total/.test(value)) return "profissional";
    if (/pessoal|particular/.test(value)) return "pessoal";
    return "";
  }
  function finiteDashboardNumber(value) {
    if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }
  function deliverInvoiceDashboard(rows, caemap, mapUnavailable) {
    var issuerSectors = {}, needed = {};
    (rows || []).forEach(function (row) { if (row.nifEmitente) needed[String(row.nifEmitente)] = true; });
    Object.keys(needed).forEach(function (nif) {
      if (!caemap || caemap[nif] === undefined) return;
      var sectors = Object.prototype.toString.call(caemap[nif]) === "[object Array]" ? caemap[nif] : [caemap[nif]];
      issuerSectors[String(nif)] = sectors.filter(function (sector) { return /^C[0-9]{2}$/.test(String(sector)); });
    });
    var snapshot = {
      version: 1,
      year: year,
      fetchedAt: new Date().toISOString(),
      complete: true,
      mapUnavailable: !!mapUnavailable,
      issuerSectors: issuerSectors,
      invoices: (rows || []).map(function (row) {
        return {
          id: String(row.idDocumento == null ? "" : row.idDocumento),
          date: String(row.dataEmissaoDocumento || ""),
          issuerNif: String(row.nifEmitente || ""),
          issuerName: deent(row.nomeEmitente || "").trim(),
          totalCents: finiteDashboardNumber(row.valorTotal),
          vatCents: finiteDashboardNumber(row.valorTotalIva),
          taxBaseCents: finiteDashboardNumber(row.valorTotalBaseTributavel),
          status: String(row.estadoBeneficio || ""),
          sector: String(row.actividadeEmitente || ""),
          scope: dashboardScope(row),
          activity: String(firstDashboardValue(row, ["atividadeRealizacaoAquisicao",
            "actividadeRealizacaoAquisicao", "atividadeAquisicao", "actividadeAquisicao",
            "codigoAtividade"]) || "")
        };
      })
    };
    var body = document.getElementById("efh-body");
    try {
      chrome.runtime.sendMessage({ type: "fb-invoice-snapshot", snapshot: snapshot }, function (response) {
        if (!body) return;
        if (response && response.ok) body.innerHTML = '<div class="efh-ok"><b>Painel aberto.</b> Usa o cabe\u00e7alho do painel para voltar a esta p\u00e1gina.</div>';
        else body.innerHTML = '<div class="efh-warn"><b>N\u00e3o foi poss\u00edvel abrir o painel.</b> Fecha e volta a tentar pela barra da extens\u00e3o.</div>';
      });
    } catch (e) {
      if (body) body.innerHTML = '<div class="efh-warn"><b>N\u00e3o foi poss\u00edvel abrir o painel.</b> Fecha e volta a tentar pela barra da extens\u00e3o.</div>';
    }
  }
  /* The Resumo tab. Two numbers, and BOTH are actionable:
   *
   *   - pending faturas        -> classify them (resolverPendenciaAdquirente).
   *   - o.wasted on ATTRIBUTED  -> deduction sitting in a full ceiling. RECOVERABLE by re-
   *     classifying the fatura: on its detalhe page, Alterar -> pick the sector -> Guardar.
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
           '<div class="efh-num" style="font-size:34px;font-weight:600;letter-spacing:-.015em;color:var(--green);line-height:1.15">\u20ac' +
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
             : 'As pendentes podem ser aplicadas em <b>Detalhe</b>; as j\u00e1 classificadas corrigem-se no e-Fatura (<b>Alterar</b> \u2192 setor \u2192 <b>Guardar</b>)') +
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
    var url = MERCHANT_CONTRIBUTION_URL, seen = {}, sent = 0;
    pend.forEach(function (x, i) {
      var ck = document.querySelector('.efh-ck[data-i="' + i + '"]');
      var se = document.querySelector('.efh-sec[data-i="' + i + '"]');
      if (!ck || !ck.checked || !se) return;
      var nif = String(x.nifEmitente || "").trim();
      var sug = String(x.__sug || "").toUpperCase(), cho = String(se.value || "").toUpperCase();
      if (!isVerifiedLegalEntityNif(nif) || !/^C[0-9]{2}$/.test(sug) || !/^C[0-9]{2}$/.test(cho)) return;
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

  /* Merchant feedback must never turn a sole trader's personal NIF into contributed data. The
   * conservative allowlist accepts only namespaces reserved for legal persons (5) and public
   * legal persons (6), then validates the Portuguese check digit. Natural-person, estate,
   * association/condominium and other ambiguous prefixes are rejected. */
  function isVerifiedLegalEntityNif(nif) {
    nif = String(nif || "");
    if (!/^[56][0-9]{8}$/.test(nif)) return false;
    var sum = 0;
    for (var i = 0; i < 8; i++) sum += Number(nif.charAt(i)) * (9 - i);
    var rem = sum % 11, check = rem < 2 ? 0 : 11 - rem;
    return check === Number(nif.charAt(8));
  }

  /* Panel stylesheet - mirrors the fiscalida.de design tokens (index.html :root).
   * One source of visual truth: every color in the panel is a token below; radius is 6px
   * everywhere; type is IBM Plex Sans (falls back to system-ui on machines without it - the
   * portal's CSP is not ours to test, so no font download is attempted) with IBM Plex Mono
   * reserved for numbers, NIFs and the eyebrow section titles, exactly like the site. */
  var WIDE_KEY = "efh-wide";
  function isWide() {
    if (EXTENSION_MODE) return _extensionSettings.wide === true;
    try { return localStorage.getItem(WIDE_KEY) === "1"; } catch (e) { return false; }
  }
  if (!document.getElementById('efh-style')) {
    // System fonts deliberately avoid even an asset request before the user has consented. The
    // extension package still contains its audited assets, but the injected account-page code
    // has no reason to request them.
    var fs = document.createElement('style'); fs.id = 'efh-style';
    fs.textContent =
      /* tokens = index.html :root, verbatim */
      '#efh-panel{--pri:#034ad8;--pri-dark:#021c51;--pri-mid:#1b4dab;--pri-soft:#eaf1ff;' +
        '--ink:#2B363C;--ink2:#4a5a63;--mute:#6b7780;' +
        '--bg:#fff;--bg2:#f4f6f9;--bg3:#E1E4EA;--rule:#d5dae1;--hair:#e2e8f3;' +
        '--red:#c8102e;--red-bg:#fdecec;--red-ink:#5a0000;' +
        '--green:#1E5A3A;--green-bg:#f1f7f3;--green-rule:#bfe0c8;--amber:#8a6100;--amber-bg:#fdf8ec;' +
        '--amber-ink:#5a4600;--focus:#ff7a00;--r:6px;' +
        'position:fixed;top:12px;right:12px;width:min(680px,95vw);max-height:90vh;overflow:auto;' +
        'background:var(--bg);border:1px solid var(--pri-dark);border-radius:var(--r);' +
        'box-shadow:0 8px 40px rgba(2,28,81,.28);z-index:2147483647;color:var(--ink);' +
        "font:400 14px/1.55 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
        '-webkit-font-smoothing:antialiased}' +
      '#efh-panel.efh-wide{top:2vh;right:auto;left:50%;transform:translateX(-50%);' +
        'width:min(1200px,96vw);max-height:96vh;font-size:15px}' +
      /* focus ring = site universal rule */
      '#efh-panel a:focus-visible,#efh-panel button:focus-visible,#efh-panel select:focus-visible,' +
        '#efh-panel input:focus-visible,#efh-panel summary:focus-visible' +
        '{outline:3px solid var(--focus);outline-offset:2px;border-radius:2px}' +
      '#efh-panel a{color:var(--pri);text-underline-offset:3px;text-decoration-thickness:1px}' +
      '#efh-panel a:hover{color:var(--pri-dark)}' +
      "#efh-panel .efh-num,#efh-panel .efh-nif{font-family:'IBM Plex Mono',ui-monospace,monospace;" +
        'font-variant-numeric:tabular-nums}' +
      /* .eyebrow = site spec exactly (weight 600, not 700) */
      "#efh-panel .efh-eyebrow{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;" +
        'letter-spacing:.11em;text-transform:uppercase;color:var(--pri);font-weight:600;' +
        'margin:20px 0 8px}' +
      /* header = navy alertbar idiom; version chip = .tag idiom */
      '#efh-panel .efh-head{background:var(--pri-dark);color:#fff;padding:11px 16px;' +
        'font-weight:600;font-size:1rem;line-height:1.35;' +
        'border-radius:var(--r) var(--r) 0 0;display:flex;align-items:center;gap:12px}' +
      '#efh-panel .efh-head a{color:#fff}' +
      '#efh-panel .efh-head .efh-sub,#efh-panel .efh-head .efh-sub a{color:#dbe4fa;font-weight:400;font-size:.82rem}' +
      "#efh-panel .efh-tag{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.7rem;" +
        'letter-spacing:.09em;text-transform:uppercase;border:1px solid rgba(255,255,255,.45);' +
        'border-radius:2px;padding:2px 7px;white-space:nowrap;font-weight:400}' +
      '#efh-panel .efh-alert{background:var(--red-bg);border-bottom:2px solid var(--red);' +
        'padding:9px 16px;font-size:.86rem;line-height:1.5;color:var(--red-ink)}' +
      /* buttons = site .btn / .btn-outline (1.5px) specs */
      '#efh-panel .efh-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;' +
        'background:var(--pri);color:#fff;border:0;border-radius:var(--r);padding:11px 22px;' +
        "min-height:44px;font:600 .95rem 'IBM Plex Sans',sans-serif}" +
      '#efh-panel .efh-btn:hover{background:var(--pri-dark)}' +
      '#efh-panel .efh-btn-green{background:var(--green)}' +
      '#efh-panel .efh-btn-green:hover{background:#154430}' +
      '#efh-panel .efh-btn-ghost{background:var(--bg);color:var(--pri);border:1.5px solid var(--pri)}' +
      '#efh-panel .efh-btn-ghost:hover{background:var(--pri-soft);color:var(--pri-dark)}' +
      '#efh-panel .efh-btn-mini{cursor:pointer;background:var(--bg);color:var(--pri);' +
        'border:1.5px solid var(--pri);border-radius:var(--r);padding:2px 8px;font:inherit;font-size:.78rem}' +
      '#efh-panel .efh-btn-mini:hover{background:var(--pri-soft)}' +
      '#efh-panel .efh-btn-mini.efh-green{color:var(--green);border-color:var(--green)}' +
      /* boxes = site .box idiom: 1px rule + 4px left accent, bg2 */
      '#efh-panel .efh-box{border:1px solid var(--rule);border-left:4px solid var(--pri);' +
        'border-radius:var(--r);padding:12px 14px;background:var(--bg2);font-size:.88rem;line-height:1.5}' +
      '#efh-panel .efh-warn{border:1px solid var(--rule);border-left:4px solid var(--amber);' +
        'border-radius:var(--r);background:var(--amber-bg);color:var(--amber-ink);' +
        'padding:10px 14px;font-size:.85rem;line-height:1.5}' +
      '#efh-panel .efh-ok{border:1px solid var(--green-rule);border-left:4px solid var(--green);' +
        'border-radius:var(--r);background:var(--green-bg);padding:10px 14px;font-size:.88rem}' +
      /* situacoes gate = perfil .gate idiom */
      '#efh-panel .efh-gate{border:1px solid var(--pri-soft);background:var(--pri-soft);' +
        'border-radius:11px;padding:15px 18px;margin:0 0 14px;border-left:0}' +
      '#efh-panel .efh-gate .efh-gt{font-weight:600;color:var(--pri-dark)}' +
      '#efh-panel .efh-gate label{display:block;padding:6px 0;border-top:1px solid var(--hair);' +
        'font-size:.9rem;cursor:pointer}' +
      '#efh-panel .efh-gate label:first-of-type{border-top:0}' +
      '#efh-panel .efh-w{color:var(--mute);font-size:.9rem}' +
      /* table = deducoes spec: uppercase mute headers, no thead bg, hairline rows */
      '#efh-panel table{width:100%;border-collapse:collapse;font-size:.9rem}' +
      '#efh-panel th{text-align:left;padding:8px 8px;border-bottom:1px solid var(--bg3);' +
        'font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600}' +
      '#efh-panel td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--bg3);vertical-align:middle}' +
      "#efh-panel td.efh-val{font-family:'IBM Plex Mono',ui-monospace,monospace;" +
        'font-variant-numeric:tabular-nums;font-weight:600;color:var(--pri-dark);white-space:nowrap}' +
      '#efh-panel select,#efh-panel input[type=text]{border:1.5px solid var(--rule);' +
        'border-radius:var(--r);padding:6px 8px;font:inherit;font-size:.9rem;background:#fff}' +
      '#efh-panel .efh-mute{color:var(--mute)}' +
      /* tabs = .navlink idiom */
      '#efh-panel .efh-tabs{display:flex;gap:4px;margin:0 0 12px;border-bottom:2px solid var(--rule)}' +
      '#efh-panel .efh-tab{cursor:pointer;border:0;background:none;font:500 .98rem inherit;' +
        "font-family:'IBM Plex Sans',sans-serif;color:var(--mute);padding:8px 14px;" +
        'border-bottom:3px solid transparent;margin-bottom:-2px}' +
      '#efh-panel .efh-tab[aria-selected=true]{color:var(--pri);font-weight:600;' +
        'border-bottom-color:var(--pri)}' +
      '#efh-panel .efh-scroll{max-height:52vh;overflow:auto}' +
      '#efh-panel.efh-wide .efh-scroll{max-height:70vh}' +
      '#efh-panel.efh-wide .efh-name{max-width:none}' +
      '#efh-panel .efh-name{max-width:24ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}';
    document.head.appendChild(fs);
  }
  function panel(html) {
    var d = document.createElement("div"); d.id = "efh-panel";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Fatura Boa");
    d.setAttribute("aria-modal", "false");
    if (isWide()) d.className = "efh-wide";
    d.innerHTML = html; document.body.appendChild(d); return d;
  }
  // The reviewed interface is desktop-only for now. Say it in the panel rather than leaving a
  // half-working screen on mobile browsers.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    alert("A Fatura Boa s\u00f3 funciona no computador durante esta revis\u00e3o. Abre isto num computador.");
  }
  panel('<div class="efh-head">' +
    '<a href="' + esc(PUBLIC_ORIGIN) + '" target="_blank" rel="noopener" style="text-decoration:none;border-bottom:1px solid rgba(255,255,255,.45)" title="Abrir Fiscalidade">Fatura Boa</a>' +
    '<span class="efh-tag">v' + FB_VERSION + '</span>' +
    '<span class="efh-sub"><a href="' + esc(PUBLIC_ORIGIN) + '/verificar" target="_blank" rel="noopener">verificar</a></span>' +
    '<button type="button" id="efh-expand" style="margin-left:auto;cursor:pointer;background:none;border:1px solid rgba(255,255,255,.45);border-radius:6px;color:#fff;font:inherit;font-size:11px;font-weight:400;padding:2px 8px"></button>' +
    '<button type="button" aria-label="Fechar" style="cursor:pointer;background:none;border:0;color:#fff;font:inherit;padding:0 4px" onclick="document.getElementById(\'efh-panel\').remove()">\u2715</button></div>' +
    '<div class="efh-alert"><b>Esta ferramenta nunca te pede a password.</b> Corre na sess\u00e3o que j\u00e1 abriste, s\u00f3 nesta p\u00e1gina. Se algum site te pedir as credenciais das Finan\u00e7as, \u00e9 burla.</div>' +
    '<div id="efh-body" style="padding:16px">A carregar...</div>');
  // Expandir/Encolher: wide mode is a class flip persisted per-origin; every view survives the
  // toggle because it is pure CSS (no re-render, so ticked plans and edits are untouched).
  (function () {
    var b = document.getElementById("efh-expand"), p = document.getElementById("efh-panel");
    var label = function () { b.textContent = p.className === "efh-wide" ? "Encolher" : "Expandir"; };
    b.onclick = function () {
      p.className = p.className === "efh-wide" ? "" : "efh-wide";
      if (EXTENSION_MODE) saveExtensionSettings({ wide: p.className === "efh-wide" });
      else try { localStorage.setItem(WIDE_KEY, p.className === "efh-wide" ? "1" : "0"); } catch (e) {}
      label();
    };
    label();
  })();

  /* CONSENT GATE. The panel does not touch the account until the user says yes. Two separate
   * things, and they are deliberately not bundled: agreeing to READ (local, required to do
   * anything at all) and agreeing to SHARE (off by default, and only ever merchant NIF + sector).
   * Asking after collecting would be the wrong order - by then it is already done. */
  function consent() {
    if (EXTENSION_MODE) return { ok: true, share: _extensionSettings.share === true, extension: true };
    var c = null;
    try { c = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) {}
    return c;
  }
  function saveConsent(share) {
    if (EXTENSION_MODE) { saveExtensionSettings({ share: !!share }); return; }
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
   * A missing bucket must not be confused with an unknown merchant. The classifier may continue
   * from the account's own history when the optional public map is unavailable, but that degraded
   * state must stay visibly labelled so C99 cannot look like a fully-evidenced recommendation.
   */
  function bucketOf(nif) { return String(nif || "").slice(-3); }

  function fetchMap(nifs) {
    var seen = {}, buckets = [];
    nifs.forEach(function (n) {
      var b = bucketOf(n);
      if (/^\d{3}$/.test(b) && !seen[b]) { seen[b] = 1; buckets.push(b); }
    });
    if (!buckets.length) return Promise.resolve({});
    return Promise.all(buckets.map(function (b) {
      return fetch(MAP_BUCKET_URL + b).then(function (r) {
        if (!r.ok) throw new Error("mapa de atividades incompleto (bloco " + b + ")");
        return r.json();
      });
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
    var prof0 = loadProfile();
    /* Situacoes on the consent screen: only the questions that CHANGE the faturas math
     * (household ceilings via capFor/c99Rate). Asked once - prof.sitOk skips the section on
     * later runs, and the same answers prefil /perfil (first answer on any surface wins;
     * the extension bridges them across origins, bookmarklet users answer once per surface). */
    var sitHtml = prof0.sitOk ? "" :
      '<div class="efh-gate">' +
      '<div class="efh-gt">A tua situacao</div>' +
      '<div class="efh-w" style="margin-top:3px">Isto muda os tetos de deducao do agregado. Podes alterar depois em Detalhe.</div>' +
      '<div style="margin-top:8px">' +
      '<label>Entregas o IRS <b>em conjunto</b> (casado/unido de facto)?' +
      ' <span style="margin-left:8px;white-space:nowrap"><input type="radio" name="efh-sit-joint" value="1"' + (prof0.joint ? " checked" : "") + '> Sim' +
      ' <input type="radio" name="efh-sit-joint" value="0" style="margin-left:10px"' + (prof0.joint ? "" : " checked") + '> Nao</span></label>' +
      '<label><input type="checkbox" id="efh-sit-mono" style="margin-right:6px"' + (prof0.mono ? " checked" : "") + '>' +
      'Familia <b>monoparental</b></label>' +
      '</div></div>';
    document.getElementById("efh-body").innerHTML =
      '<p style="margin:0 0 10px">Isto l\u00ea as tuas faturas de <b>' + year + '</b> directamente do e-Fatura, ' +
      'na sess\u00e3o que j\u00e1 tens aberta, e faz as contas <b>no teu navegador</b>.</p>' +
      '<ul style="margin:0 0 12px 18px;padding:0;line-height:1.5">' +
      '<li>N\u00e3o te pede, nem v\u00ea, a tua password.</li>' +
      '<li>As tuas faturas <b>n\u00e3o s\u00e3o enviadas para lado nenhum</b>.</li>' +
      '<li>A classifica\u00e7\u00e3o \u00e9 uma <b>declara\u00e7\u00e3o tua \u00e0 AT</b> - ser aceite n\u00e3o \u00e9 o mesmo que estar certo.</li>' +
      '</ul>' + sitHtml +
      '<label class="efh-box" style="display:block;margin-bottom:12px;cursor:pointer">' +
      '<input type="checkbox" id="efh-share" style="margin-right:6px"> ' +
      'Opcional: partilhar <b>o NIF do comerciante e o setor escolhido</b> para melhorar as sugest\u00f5es. ' +
      'Sem valores, sem datas, sem o teu NIF. Podes deixar desligado.' +
      '</label>' +
      '<button type="button" id="efh-go" class="efh-btn">Concordo, ver resultado</button>';
    document.getElementById("efh-go").onclick = function () {
      saveConsent(document.getElementById("efh-share").checked);
      if (!prof0.sitOk) {
        var jr = document.querySelector('input[name="efh-sit-joint"]:checked');
        var p = loadProfile();
        p.joint = !!(jr && jr.value === "1");
        p.mono = !!(document.getElementById("efh-sit-mono") || {}).checked;
        p.sitOk = true;
        saveProfile(p);
      }
      document.getElementById("efh-body").innerHTML = "A ler as tuas faturas...";
      start();
    };
  }

  /* =========================  PROFILING (SPEC-profiling.md)  =========================
   * Self-contained. Reuses only `panel` (already rendered), `esc`, and `year` from above; it
   * never touches the classifier's state. The complete result uses its OWN localStorage keys and a
   * browser-only handoff to /perfil; only the separately minimized market envelope is submitted by
   * /perfil after agreement. Kept as one block so the classifier boundary stays obvious. */
  var PROF_KEY = "fb-profile-v1";          // versioned so a schema change can't misread old data
  var PROF_CONSENT = "fb-profile-consent-v1";

  /* AT's partitions are DIFFERENT ORIGINS, so each official origin keeps only its own temporary
   * reading. Cross-partition assembly is canonical on /perfil and receives each complete result
   * through the request/nonce-bound postMessage handoff below; fiscal values never enter a URL. */

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
      why: "Declara\u00e7\u00f5es de in\u00edcio, altera\u00e7\u00e3o e cessa\u00e7\u00e3o de atividade.", read: readAtividade },
    // The integrated activity screen belongs to PFAP, not the declarations app's SSO partition.
    // It must be a separate step even though both apps share the sitfiscal hostname.
    { id: "atividade_integrada", label: "Atividade exercida (cadastro atual)", host: "sitfiscal.portaldasfinancas.gov.pt",
      pathHint: "/integrada",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/integrada/presentation",
      why: "CAE/CIRS, datas de in\u00edcio e cessa\u00e7\u00e3o, contabilidade e enquadramento de IVA/IRS.", read: readAtividadeExercida },
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
      pathHint: "/recibos",
      open: "https://irs.portaldasfinancas.gov.pt/recibos/portal/consultar",
      why: "Recibos verdes emitidos - rendimentos da categoria B (trabalho independente).", read: readRecibos },
    { id: "declaracoes", label: "Declara\u00e7\u00f5es de IRS", host: "irs.portaldasfinancas.gov.pt",
      pathHint: "/app/consulta",
      open: "https://irs.portaldasfinancas.gov.pt/app/consulta",
      why: "A declara\u00e7\u00e3o efetiva de cada ano, incluindo substitui\u00e7\u00f5es.", read: readDeclaracoesPartition },
    { id: "deducoes", label: "Dedu\u00e7\u00f5es oficiais", host: "irs.portaldasfinancas.gov.pt",
      pathHint: "/consultarDespesasDeducoes",
      open: "https://irs.portaldasfinancas.gov.pt/consultarDespesasDeducoes.action",
      why: "Totais oficiais da AT por categoria e por ano conclu\u00eddo.", read: readDeducoesPartition },
    { id: "despesas_atividade", label: "Despesas afetas \u00e0 atividade", host: "irs.portaldasfinancas.gov.pt",
      pathHint: "/app/dashboard-regime-simplificado",
      open: "https://irs.portaldasfinancas.gov.pt/app/dashboard-regime-simplificado",
      why: "Despesas reconhecidas pela AT para o regime simplificado da categoria B.", read: readDespesasAtividadePartition },
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
  // The packaged contract is authoritative. The inline list above remains only as a compatibility
  // fallback for people pasting an older standalone tool.js in DevTools; extension and DEV
  // bookmarklet builds always load profile-contract.js first.
  var PROFILE_CONTRACT = (typeof FISCALIDADE_PROFILE_CONTRACT !== "undefined")
    ? FISCALIDADE_PROFILE_CONTRACT : null;
  if (PROFILE_CONTRACT) {
    var readers = { efatura: readEfatura, rendas: readRendas, situacao: readSituacao,
      atividade: readAtividade, atividade_integrada: readAtividadeExercida, patrimonio: readPatrimonio,
      irs: readIRS, movfin: readMovfin, recibos: readRecibos, declaracoes: readDeclaracoesPartition,
      deducoes: readDeducoesPartition, despesas_atividade: readDespesasAtividadePartition, ss: readSS };
    PARTITIONS = PROFILE_CONTRACT.partitions.map(function (item) {
      return { id: item.id, label: item.label, host: item.host, pathHint: item.path || null,
        open: item.open, why: item.why, read: readers[item.id] };
    });
  }

  /* A MESMA regra de expiracao do /perfil (fim do dia), aplicada TAMBEM aqui: este ficheiro corre
   * na origem da AT, e o /perfil (outra origem) nao consegue apagar o localStorage desta - so o
   * proprio tool. Sem isto, a copia da situacao fiscal DESTA origem vivia para sempre e a promessa
   * "apagada automaticamente ao fim do dia" da pagina de privacidade so era verdade em metade dos
   * sitios onde os dados estao. */
  function profExpiry() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
  var _extensionProfile = { partitions: {} };
  function profLoad() {
    if (EXTENSION_MODE) return _extensionProfile;
    try {
      var p = JSON.parse(localStorage.getItem(PROF_KEY)) || { partitions: {} };
      if (p.expiresAt && Date.now() >= p.expiresAt) { localStorage.removeItem(PROF_KEY); return { partitions: {} }; }
      return p;
    } catch (e) { return { partitions: {} }; }
  }
  function profSave(p) {
    if (EXTENSION_MODE) { p.expiresAt = profExpiry(); _extensionProfile = p; return; }
    try { p.expiresAt = profExpiry(); localStorage.setItem(PROF_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function markProfileHandoff(pid, status, code) {
    var store = profLoad(), row = store.partitions && store.partitions[pid];
    if (!row) return;
    row.handoff = { status: status, at: new Date().toISOString() };
    if (code) row.handoff.code = code;
    profSave(store);
  }

  /* CROSS-PARTITION HANDOFF. /perfil and the official portal are different origins. The reader
   * opens/reuses the named profile window, asks it for a one-time nonce, then sends a strictly
   * versioned envelope with postMessage. No fiscal value enters a URL or an HTTP request. */
  var PROF_SITE = PUBLIC_ORIGIN + "/perfil";
  function profileRequestId() {
    var bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  function profileDiagnostic(stage, partition, code) {
    var log = window.__FISCALIDADE_HANDOFF_DIAGNOSTICS__ || [];
    log.push({ at: new Date().toISOString(), stage: stage, partition: partition, code: code || null });
    window.__FISCALIDADE_HANDOFF_DIAGNOSTICS__ = log.slice(-20);
  }
  function profileMessage(css, title, detail) {
    var body = document.getElementById("efh-body");
    if (body) body.innerHTML = '<div class="' + css + '"><b>' + title + '</b> ' + detail + '</div>';
  }
  function closeGuidedOfficialAfterAccepted() {
    // Only tabs created by /perfil are eligible. Keep every failed/pending tab open so login or a
    // retry remains possible; close only after the profile has acknowledged the intake receipt.
    try {
      if (window.name !== "fiscalidade-oficial" || !window.opener || window.opener.closed) return;
      setTimeout(function () { try { window.close(); } catch (e) {} }, 900);
    } catch (e) {}
  }
  function deliverProfile(pid, data, shape, market) {
    var contract = PROFILE_CONTRACT;
    var requestId = profileRequestId();
    var envelope = { contract: contract && contract.version, partition: pid, status: "done",
      capturedAt: new Date().toISOString(), data: data, shapes: shape || {} };
    if (market) envelope.market = market;
    if (!contract || !contract.validEnvelope(envelope)) {
      profileDiagnostic("rejected", pid, "contract_unavailable");
      profileMessage("efh-warn", "Vers\u00e3o incompat\u00edvel.",
        "Atualiza o favorito ou a extens\u00e3o DEV. A leitura n\u00e3o foi enviada nem colocada no endere\u00e7o.");
      return false;
    }
    var target = null;
    try {
      // The bookmarklet/extension reserves this named tab inside the user's click. Reuse that
      // exact WindowProxy after the asynchronous read so popup blocking cannot turn Guardar into
      // a second manual step, and do not unnecessarily reload an already-ready /perfil page.
      target = window.__FISCALIDADE_PROFILE_TARGET__;
      if (!target || target.closed) target = (window.opener && !window.opener.closed) ? window.opener : null;
      // Backward compatibility for an already-installed July loader that reserved the named tab
      // but did not retain its WindowProxy. Looking up an existing name does not reload /perfil.
      if (!target) target = window.open("", "fiscalidade-perfil");
      try { if (target && target.location.href === "about:blank") target.location.replace(PROF_SITE); } catch (e2) {}
    } catch (e) {}
    if (!target) {
      profileDiagnostic("blocked", pid, "profile_window_unavailable");
      profileMessage("efh-warn", "O navegador bloqueou o regresso.",
        "Abre fiscalida.de/perfil e volta a carregar no favorito. A leitura n\u00e3o foi enviada nem colocada no endere\u00e7o.");
      return false;
    }
    var ready = false, finished = false, retries = 0;
    profileDiagnostic("hello", pid, "started");
    function onMessage(event) {
      if (event.origin !== PUBLIC_ORIGIN || event.source !== target || !event.data) return;
      if (event.data.type === contract.readyType && event.data.partition === pid &&
          event.data.requestId === requestId && typeof event.data.nonce === "string") {
        ready = true;
        profileDiagnostic("ready", pid, "nonce_received");
        target.postMessage({ type: contract.messageType, partition: pid, requestId: requestId,
          nonce: event.data.nonce, envelope: envelope }, PUBLIC_ORIGIN);
      }
      if (event.data.type === contract.acceptedType && event.data.partition === pid &&
          event.data.requestId === requestId) {
        finished = true; clearInterval(retryTimer); clearTimeout(timeoutTimer);
        window.removeEventListener("message", onMessage);
        markProfileHandoff(pid, "accepted");
        profileDiagnostic("accepted", pid, event.data.intake || "required");
        try { target.focus(); } catch (e) {}
        profileMessage("efh-ok", "Leitura conclu\u00edda.",
          "O perfil completo ficou neste navegador e o contributo minimizado foi aceite.");
        closeGuidedOfficialAfterAccepted();
      }
      if (event.data.type === contract.rejectedType && event.data.partition === pid &&
          event.data.requestId === requestId) {
        finished = true; clearInterval(retryTimer); clearTimeout(timeoutTimer);
        window.removeEventListener("message", onMessage);
        var rejection = event.data.code || "profile_rejected";
        markProfileHandoff(pid, "error", rejection);
        profileDiagnostic("rejected", pid, rejection);
        if (rejection === "agreement_required")
          profileMessage("efh-warn", "Falta aceitar a troca do modo gratuito.",
            "No perfil Fiscalidade, l\u00ea e aceita o contributo minimizado; depois volta aqui e tenta outra vez.");
        else if (rejection === "schema_required")
          profileMessage("efh-warn", "N\u00e3o foi recolhida a estrutura necess\u00e1ria.",
            EXTENSION_MODE
              ? "Atualiza a extens\u00e3o DEV e repete a leitura nesta p\u00e1gina oficial."
              : "Instala de novo o favorito DEV e carrega nele nesta p\u00e1gina; a leitura ser\u00e1 repetida, n\u00e3o apenas reenviada.");
        else
          profileMessage("efh-warn", "N\u00e3o foi poss\u00edvel concluir esta fonte.",
            "O perfil completo n\u00e3o foi enviado. Abre o perfil Fiscalidade e tenta novamente o contributo minimizado.");
      }
    }
    function hello() {
      if (finished || ready) return;
      retries++;
      try { target.postMessage({ type: contract.helloType, contract: contract.version,
        partition: pid, requestId: requestId }, PUBLIC_ORIGIN); } catch (e) {}
    }
    window.addEventListener("message", onMessage);
    hello();
    var retryTimer = setInterval(hello, 750);
    var timeoutTimer = setTimeout(function () {
      if (finished) return;
      clearInterval(retryTimer);
      window.removeEventListener("message", onMessage);
      markProfileHandoff(pid, "error", "no_matching_profile");
      profileDiagnostic("timeout", pid, "no_matching_profile");
      profileMessage("efh-warn", "O perfil n\u00e3o respondeu em 120 segundos.",
        "Conclui o acesso a fiscalida.de, deixa /perfil aberto e volta a carregar no favorito. A leitura n\u00e3o foi enviada.");
    }, 120000);
    return true;
  }
  function profConsent() {
    // The extension's first-run gate is stored in chrome.storage.local before tool.js can be
    // injected. Do not duplicate profile state or consent in an official-portal origin.
    if (EXTENSION_MODE) return { ok: true, extension: true };
    // The gated DEV bookmarklet itself is the explicit per-page read action. The mandatory market
    // agreement was already accepted once on /perfil before the guided flow opened this source.
    // Asking again here stored a separate consent on every official origin and made the user press
    // a second, redundant button after every bookmarklet click.
    if (PROFILING && RUNTIME.channel === "dev-bookmarklet" && RUNTIME.remoteCodeAllowed === false)
      return { ok: true, bookmarklet: true };
    try { return JSON.parse(localStorage.getItem(PROF_CONSENT) || "null"); } catch (e) { return null; }
  }
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
  function htmlSkeleton(value) {
    // HTML readers expose structure through element/form-field names only. Never retain text,
    // attributes such as value/href, exact document length or a DOM id that may contain a token.
    try {
      var doc = new DOMParser().parseFromString(String(value || ""), "text/html");
      var tags = {}, fields = {};
      Array.prototype.forEach.call(doc.querySelectorAll("form,input,select,textarea,button,table,thead,tbody,tr,th,td,a"), function (el) {
        var tag = String(el.tagName || "").toLowerCase();
        if (tag) tags[tag] = (tags[tag] || 0) + 1;
        if (!/^(?:input|select|textarea|button)$/.test(tag)) return;
        var name = String(el.getAttribute("name") || "").replace(/\d{5,}/g, ":id").replace(/[\[\]]/g, ".");
        if (/^[A-Za-z0-9_.:-]{1,80}$/.test(name)) fields[tag + ":" + name] = "str";
      });
      Object.keys(tags).forEach(function (tag) { tags[tag] = "x" + tags[tag]; });
      return { document: { tags: tags, fields: fields } };
    } catch (e) { return { document: "str" }; }
  }
  function recordShape(url, kind, val) {
    // The URL is the schema key, but some paths embed identifiers (NISS/NIF, e.g.
    // /posicao-atual/<NISS>/situacao-contributiva). Redact any long digit run to :id BEFORE the
    // shape is captured - so an identifier never enters the skeleton, and every user's copy of that
    // endpoint collapses to one key for aggregation. (Query string already dropped.)
    var key = String(url).split("?")[0].replace(/\d{5,}/g, ":id");
    if (kind === "html") _shapes[key] = htmlSkeleton(val);
    else _shapes[key] = skeleton(val);
  }
  function hasPartitionShape(partition, shapes) {
    var contract = PROFILE_CONTRACT;
    if (!contract || !contract.endpointId || !contract.endpointPartition) return false;
    return Object.keys(shapes || {}).some(function (url) {
      var id = contract.endpointId(url) || (contract.isEndpointId && contract.isEndpointId(url) ? url : null);
      return !!id && contract.endpointPartition(id) === partition;
    });
  }

  /* RULE 3 (SPEC): a wrong session or missing permission on AT returns 200 + an HTML redirect,
   * never 401. So assert on CONTENT - did we get the JSON shape we asked for - never on r.ok. */
  function readError(code, message, status) {
    var error = new Error(message); error.code = code;
    if (status != null) error.status = status;
    return error;
  }
  function responseJSON(r, url) {
    var ct = r.headers.get("content-type") || "";
    return r.text().then(function (t) {
      if (/text\/html/i.test(ct) || /^\s*</.test(t) || /acesso\.gov\.pt|loginForm/i.test(t))
        throw readError("session_required", "A sess\u00e3o desta p\u00e1gina expirou. Faz login aqui e tenta de novo.", r.status);
      if (!r.ok)
        throw readError("official_http_" + r.status,
          "A p\u00e1gina oficial respondeu com erro " + r.status + ". Tenta novamente dentro de momentos.", r.status);
      if (!String(t || "").trim())
        throw readError("empty_response", "A p\u00e1gina oficial devolveu uma resposta vazia. Atualiza a p\u00e1gina e tenta de novo.", r.status);
      var j;
      try { j = JSON.parse(t); }
      catch (e) {
        throw readError("invalid_json", "A p\u00e1gina oficial mudou o formato da resposta. A leitura foi interrompida sem guardar zeros.", r.status);
      }
      if (j && typeof j === "object" && !Array.isArray(j) &&
          (j.success === false || j.sucesso === false || j.error === true))
        throw readError("official_rejected", "A p\u00e1gina oficial recusou esta leitura. Atualiza a sess\u00e3o e tenta de novo.", r.status);
      recordShape(url, "json", j); return j;
    });
  }
  function getJSON(url) {
    return fetch(url, { credentials: "include", headers: { "Accept": "application/json" } })
      .then(function (r) { return responseJSON(r, url); });
  }

  /* POST variant for the .api endpoints whose search form posts a JSON body (e.g. recibos consultar
   * posts searchParameters.dataEmissaoInicio/Fim). Same session gate + shape capture as getJSON. */
  function postJSON(url, body) {
    return fetch(url, { method: "POST", credentials: "include",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body) }).then(function (r) { return responseJSON(r, url); });
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

  /* Activity declarations are HISTORY, not current cadastro. In particular, the portal can accept
   * a future start/restart while the integrated screen still shows the previous cessation. The list
   * also labels a restart as an "inicio" in some accounts. Keep only type/status signals here and
   * never infer open/closed from the mere presence of start or cessation rows. */
  function readAtividade() {
    return getMaybe("/atividade/atividade/consultardeclaracoes?_=" + Date.now()).then(function (res) {
      var txt = res.html || (res.json ? JSON.stringify(res.json) : "");
      var low = txt.toLowerCase();
      // Count declarations by their comprovativo download links (one per declaration) - more
      // reliable than word-matching. Fall back to the word count if the markup differs.
      var n = (txt.match(/\/comprovativo\//g) || []).length || (low.match(/declara[c\u00e7][a\u00e3]o/g) || []).length;
      var temInicio = /(?:re)?in[i\u00ed]cio de atividade|declara[c\u00e7][a\u00e3]o de (?:re)?in[i\u00ed]cio/.test(low);
      var temCessacao = /cessa[c\u00e7][a\u00e3]o|cessou|cessad/.test(low);
      var ultimaTipo = null, ultimaAceite = null;
      if (res.html) {
        try {
          var doc = new DOMParser().parseFromString(res.html, "text/html");
          var linhas = doc.querySelectorAll("tr");
          for (var li = 0; li < linhas.length; li++) {
            if (!linhas[li].querySelector('a[href*="/comprovativo/"]')) continue;
            var linha = (linhas[li].textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            ultimaTipo = /cessa[c\u00e7][a\u00e3]o/.test(linha) ? "cessacao"
              : /(?:re)?in[i\u00ed]cio(?: de atividade)?/.test(linha) ? "inicio-ou-reinicio"
              : /altera[c\u00e7][a\u00e3]o/.test(linha) ? "alteracao" : "outra";
            ultimaAceite = /declara[c\u00e7][a\u00e3]o certa|aceite|validada/.test(linha) ? true : null;
            break; // the portal orders this table newest first
          }
        } catch (e) {}
      }
      // The current IVA regime usually is NOT on this declarations page - it lives on the
      // "Atividade Exercida" screen of the Situacao Fiscal Integrada. Only report a regime if this
      // page happens to state it; otherwise leave null and say where to look. Never guess.
      var regime = /isen[c\u00e7][a\u00e3]o.*53|artigo 53|regime de isen/.test(low) ? "isento (art. 53.o)"
                 : /periodicidade mensal|iva mensal/.test(low) ? "IVA mensal"
                 : /periodicidade trimestr|iva trimestr/.test(low) ? "IVA trimestral"
                 : null;
      // The effective date exists in the official receipt, which this browser reader deliberately
      // does not download or parse. A recent start row can therefore be current OR scheduled.
      var avisos = ["a lista de declara\u00e7\u00f5es n\u00e3o prova o estado atual nem a data de efic\u00e1cia"];
      if (ultimaTipo === "inicio-ou-reinicio" && temCessacao)
        avisos.push("h\u00e1 in\u00edcio/rein\u00edcio declarado ap\u00f3s historial de cessa\u00e7\u00e3o; confirmar o comprovativo");
      if (!regime) avisos.push("regime de IVA n\u00e3o consta aqui - ver 'Atividade Exercida' na Situa\u00e7\u00e3o Fiscal Integrada");
      // The authoritative "Atividade Exercida" screen is a DIFFERENT PFAP SSO partition. It is an
      // explicit profile step (`atividade_integrada`) and cannot be fetched from this DAInter
      // session merely because both apps share the sitfiscal host.
      return { data: { declaracoes: n, cessada: null, regimeIva: regime,
                       inicioOuReinicioDeclarado: temInicio, cessacaoDeclarada: temCessacao,
                       ultimaDeclaracaoTipo: ultimaTipo, ultimaDeclaracaoAceite: ultimaAceite,
                       avisos: avisos },
               source: "/atividade/atividade/consultardeclaracoes" };
    });
  }

  /* "Atividade Exercida" - o ecra da Situacao Fiscal Integrada com o cadastro REAL da atividade.
   * O URL e assinado (hmac) e MUDA, por isso NAO se forja: abre-se /integrada/ e colhe-se o link
   * targetScreen=ecraActividade da propria pagina. Devolve HTML, que se le por rotulos. */
  function atividadeTemporal(inicios, cessacoes) {
        var hoje;
        try {
          var hp = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" })
            .formatToParts(new Date()).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
          hoje = hp.year + "-" + hp.month + "-" + hp.day;
        } catch (e) { hoje = new Date().toISOString().slice(0, 10); }
        var uniq = function (xs) { return xs.filter(function (x, i) { return /^\d{4}-\d{2}-\d{2}$/.test(x) && xs.indexOf(x) === i; }).sort(); };
        var ins = uniq(inicios), cess = uniq(cessacoes);
        var passadosI = ins.filter(function (x) { return x <= hoje; });
        var passadosC = cess.filter(function (x) { return x <= hoje; });
        var futurosI = ins.filter(function (x) { return x > hoje; });
        var ultimoI = passadosI.length ? passadosI[passadosI.length - 1] : null;
        var ultimoC = passadosC.length ? passadosC[passadosC.length - 1] : null;
        var estado = ultimoI ? ((!ultimoC || ultimoI > ultimoC) ? "aberta" : "cessada")
          : (ultimoC ? "cessada" : (futurosI.length ? "agendada" : "desconhecida"));
        return { inicios: ins, cessacoes: cess, inicio: ultimoI, cessacao: ultimoC,
                 proximoInicio: futurosI.length ? futurosI[0] : null, estadoAtual: estado,
                 cessada: estado === "cessada" ? true : (estado === "aberta" ? false : null) };
  }

  function parseAtividadeExercida(html) {
        var txt = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        var pick = function (re) { var x = txt.match(re); return x ? x[1].trim() : null; };
        // The screen can contain historical dates in both IVA and IRS sections. Compare the newest
        // effective start and cessation; "any cessation exists" permanently misclassifies restarts.
        var inic = (txt.match(/Data de In[i\u00ed]cio(?: de Atividade)?\s+(\d{4}-\d{2}-\d{2})/gi) || [])
          .map(function (s) { return (s.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; }).filter(Boolean);
        var cess = (txt.match(/Data de Cessa[\u00e7c][\u00e3a]o\s+(\d{4}-\d{2}-\d{2})/gi) || [])
          .map(function (s) { return (s.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; }).filter(Boolean);
        var motivos = (txt.match(/Motivo de Cessa[\u00e7c][\u00e3a]o\s+([^]{3,40}?)\s+(?:NIF|Nome|Op[\u00e7c]|Data|Consultas)/gi) || [])
          .map(function (s) { return s.replace(/Motivo de Cessa[\u00e7c][\u00e3a]o\s+/i, "").trim(); });
        var temporal = atividadeTemporal(inic, cess);
        var out = {
          inicio: temporal.inicio, inicios: temporal.inicios,
          cessacao: temporal.cessacao, cessacoes: temporal.cessacoes,
          proximoInicio: temporal.proximoInicio, estadoAtual: temporal.estadoAtual,
          cessada: temporal.cessada, motivosCessacao: motivos,
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
  }

  function continueToSignedActivity(pid, href) {
    var contract = PROFILE_CONTRACT;
    var target = window.__FISCALIDADE_PROFILE_TARGET__;
    var requestId = profileRequestId();
    var finished = false, attempts = 0, retryTimer = null, fallbackTimer = null;
    profileMessage("efh-warn", "A AT precisa de mudar de ecr\u00e3.",
      "O ecr\u00e3 assinado vai abrir agora. Quando abrir, carrega uma segunda vez neste mesmo favorito. N\u00e3o existe nenhum bot\u00e3o Guardar escondido.");
    function cleanup() {
      if (retryTimer) clearInterval(retryTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener("message", onMessage);
    }
    function navigate() {
      if (finished) return;
      finished = true; cleanup();
      // Give the profile instruction enough time to paint before this official tab changes page.
      setTimeout(function () { location.href = href; }, 650);
    }
    function onMessage(event) {
      if (!target || event.origin !== PUBLIC_ORIGIN || event.source !== target || !event.data) return;
      if (event.data.type === contract.continuationAckType && event.data.partition === pid &&
          event.data.requestId === requestId) navigate();
    }
    function announce() {
      attempts++;
      try {
        if (target && !target.closed && contract && contract.continuationType)
          target.postMessage({ type: contract.continuationType, contract: contract.version,
            partition: pid, requestId: requestId }, PUBLIC_ORIGIN);
      } catch (e) {}
      if (attempts >= 20) navigate();
    }
    window.addEventListener("message", onMessage);
    announce();
    retryTimer = setInterval(announce, 200);
    fallbackTimer = setTimeout(navigate, 4500);
  }

  function readAtividadeExercida() {
    var html = document.documentElement ? document.documentElement.outerHTML : "";
    if (/Atividade em IVA|Atividade em IRS|Tipo de Contabilidade|CAE Principal|CIRS/i.test(html)) {
      recordShape("/integrada/presentation", "html", html);
      return Promise.resolve({ data: parseAtividadeExercida(html), source: "/integrada/presentation::ecraActividade" });
    }
    var links = document.querySelectorAll("a[href]"), href = null;
    for (var i = 0; i < links.length; i++) {
      var h = links[i].href || links[i].getAttribute("href") || "";
      if (/ecraActividade/i.test(h)) { href = h; break; }
    }
    if (href) {
      // The portal rejects this signed screen as a background fetch; it must be a top-level GET.
      var signed = null;
      try {
        signed = new URL(href, location.href);
        if (signed.origin !== location.origin || !/ecraActividade/i.test(signed.href)) signed = null;
      } catch (e) {}
      // A bookmarklet cannot survive replacing its own top-level document. Keep the direct /perfil
      // channel intact, announce the one exceptional continuation step there, then navigate this
      // official tab. The next explicit bookmarklet click reads the signed DOM and completes the
      // ordinary browser-only handoff. This is intentionally two clicks rather than a fragile
      // popup bridge that can read locally but lose postMessage when COOP changes origin.
      continueToSignedActivity("atividade_integrada", signed ? signed.href : href);
      return new Promise(function () {});
    }
    // A second live account legitimately had no ecraActividade link. Absence is UNKNOWN/not exposed,
    // never proof of a closed activity.
    recordShape("/integrada/presentation", "html", html);
    return Promise.resolve({ data: { disponivel: false,
      avisos: ["A AT n\u00e3o disponibilizou o ecr\u00e3 Atividade Exercida nesta conta; estado desconhecido."] },
      source: "/integrada/presentation (ecraActividade n\u00e3o exposto)" });
  }

  function readEfatura() {
    var u = "/json/obterDocumentosAdquirente.action?dataInicioFilter=" + year + "-01-01&dataFimFilter=" + year + "-12-31";
    // The same recursive reader used by the classifier is mandatory here too. The plain endpoint
    // caps a busy account at 300 rows and otherwise looks like a successful complete response.
    return fetchSector(year, "").then(function (rows) {
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
        var companies = marketCompanyYear(rows, year);
        ra.forEach(function (audit) {
          if (!audit) return;
          companies = companies.concat(audit._market || []);
          delete audit._market;
        });
        return { data: { ano: year, totalFaturas: rows.length,
                         porClassificar: pend, atividades: byAct,
                         reAudit: ra.filter(Boolean) }, source: u,
                 market: { version: 1, companies: companies } };
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
      // Rendas RECEBIDAS por ano (valor, nao so contagem). Nao inferir daqui uma taxa: o art. 72
      // distingue arrendamento habitacional (25% em 2025), outros prediais (28%) e reducoes por
      // contrato. O what-if continua desativado ate natureza/duracao/gastos estarem confirmados.
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
      if (!div || typeof div !== "object" || Array.isArray(div) ||
          (div.montanteTotal == null && div.nAtivasGeral == null && div.dataInfoObtida == null))
        throw readError("unexpected_debts_shape",
          "A Situa\u00e7\u00e3o fiscal mudou o formato das d\u00edvidas. A leitura foi interrompida sem assumir que o valor \u00e9 zero.");
      return Promise.all([
        getJSON("/geral/coimas?_=" + Date.now()).then(function (value) { return { value: value }; })
          .catch(function (error) { return { error: error }; }),
        getJSON("/geral/dashboard/agendaFiscal?_=" + Date.now()).then(function (value) { return { value: value }; })
          .catch(function (error) { return { error: error }; })
      ]).then(function (rest) {
        div = div || {};
        var coi = rest[0].value;
        var ag = rest[1].value;
        var agenda = ag == null ? null : (Array.isArray(ag) ? ag : (ag && (ag.listaAgenda || ag.agenda || ag.lista)));
        if (agenda != null && !Array.isArray(agenda)) agenda = null;
        var avisos = [];
        if (rest[0].error) avisos.push("N\u00e3o foi poss\u00edvel confirmar as coimas nesta leitura.");
        else if (!coi || typeof coi !== "object" || Array.isArray(coi)) {
          coi = null; avisos.push("A resposta das coimas teve um formato desconhecido; n\u00e3o foi tratada como zero.");
        }
        if (rest[1].error || agenda == null) avisos.push("N\u00e3o foi poss\u00edvel confirmar a agenda fiscal nesta leitura.");
        return { data: {
          dividas: { total: (div.montanteTotal != null ? div.montanteTotal : null),
                     n: (div.nAtivasGeral != null ? div.nAtivasGeral : null), em: div.dataInfoObtida || null },
          coimas: coi ? { total: (coi.montanteTotal != null ? coi.montanteTotal : null),
                    n: (coi.nAtivasGeral != null ? coi.nAtivasGeral : null) } : null,
          agenda: agenda ? { n: agenda.length, proximos: agenda.slice(0, 5).map(pickAgenda) } : null,
          avisos: avisos
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
        if (/acesso\.gov\.pt|loginForm/i.test(t))
          throw readError("session_required", "A sess\u00e3o desta p\u00e1gina expirou. Faz login aqui e tenta de novo.");
        var docp = new DOMParser().parseFromString(t, "text/html");
        var table = docp.querySelector("#tabela_documentos") || docp.querySelector("table");
        if (!table) throw readError("format_changed", "A AT mudou o formato dos movimentos financeiros. A leitura foi interrompida sem guardar zeros.");
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

  /* Seguranca Social Direta (www.seg-social.pt). Live validation in 2026 showed personalData may
   * contain only citizen/entity role booleans, not a NISS. If a future/other account shape exposes a
   * NISS it is used transiently for situacao-contributiva and never stored; otherwise estado stays
   * unknown. Never turn a missing identifier or failed optional endpoint into "regularizada". */
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
        }, source: "/ptss/rest/public/pssd/login/personalData + payments/current" +
                   (sit ? " + situacao-contributiva" : " (situa\u00e7\u00e3o contributiva indispon\u00edvel)") };
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
    var qFor = function (ano, offset) {
      return "?dataEmissaoInicio=" + ano + "-01-01&dataEmissaoFim=" + ano + "-12-31" +
             "&modoConsulta=Prestador&tipoPesquisa=1&isAutoSearchOn=on&offset=" + offset + "&tableSize=500" +
             (nif ? "&nifPrestadorServicos=" + nif : "") + "&_=" + Date.now();
    };
    var pullYear = function (ano, offset, acc) {
      return getJSON(u + qFor(ano, offset)).then(function (j) {
        if (!j || j.success === false) return { success: j && j.success, listaDocumentos: acc, totalDocs: acc.length };
        var rows = j.listaDocumentos || j.documentos || j.data || j.lista || [];
        if (!Array.isArray(rows)) throw new Error("lista de recibos inesperada");
        var total = j.totalDocs != null ? Number(j.totalDocs) : offset + rows.length;
        var all = acc.concat(rows);
        if (offset + rows.length >= total) return { success: true, listaDocumentos: all, totalDocs: total };
        if (!rows.length) throw new Error("pagina\u00e7\u00e3o incompleta dos recibos verdes");
        return pullYear(ano, offset + rows.length, all);
      });
    };
    return Promise.all(anos.map(function (ano) {
      return pullYear(ano, 0, []).catch(function () { return null; });
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
    // This SIRE partition contains only green receipts. Declarations, deductions and Cat B expenses
    // have their own explicit SSO steps even though all four apps share irs.portaldasfinancas.gov.pt.
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
      return { data: { recibosVerdes: count, recibosPorAno: porAno, avisos: avisos },
               source: u + " (GET, um ano civil de cada vez, pagina\u00e7\u00e3o reconciliada)" };
    });
  }

  /* DEDU\u00c7\u00d5ES \u00c0 COLETA calculadas pela AT, por categoria.
   * \u00c9 o n\u00famero OFICIAL - o mesmo que aparece na demonstra\u00e7\u00e3o de liquida\u00e7\u00e3o - e evita somar faturas e
   * aplicar tetos \u00e0 m\u00e3o. Cobre ainda categorias que as faturas n\u00e3o d\u00e3o (im\u00f3veis, lares).
   * The page ignores a year in its ordinary GET. Its own year selector calls the JSON service and
   * returns `dashboardHTML`; that service was live-validated across the last four COMPLETED income
   * years. The still-open current year can be refused, so requesting it is not a completeness proof. */
  function parseDeducoesHtml(html, requestedYear) {
        var t = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/g, " ").replace(/&euro;/g, "\u20ac").replace(/\s+/g, " ");
        var num = function (s) { return +String(s).replace(/\./g, "").replace(",", ".") || 0; };
        var cats = {}, total = 0, m;
        var re = /(Despesas gerais familiares|Sa[\u00fau]de e seguros de sa[\u00fau]de|Educa[\u00e7c][\u00e3a]o e forma[\u00e7c][\u00e3a]o|Encargos com im[\u00f3o]veis|Lares|Import[\u00e2a]ncias respeitantes a IVA|Exig[\u00eae]ncia de fatura)[^0-9]{0,60}([\d.]+,\d{2})\s*\u20ac\s*Dedu[\u00e7c][\u00e3a]o correspondente [\u00e0a] despesa\s*([\d.]+,\d{2})\s*\u20ac/g;
        while ((m = re.exec(t)) !== null) {
          var d = num(m[3]);
          cats[m[1].replace(/\s+/g, " ").trim()] = { despesa: num(m[2]), deducao: d };
          total += d;
        }
        if (!Object.keys(cats).length) throw new Error("formato das dedu\u00e7\u00f5es n\u00e3o reconhecido");
        var ano = (t.match(/Ano\s+(20\d{2})\s+Esta p[\u00e1a]gina/) || t.match(/\bAno\s+(20\d{2})\b/) || [])[1] || null;
        if (!ano || Number(ano) !== Number(requestedYear)) throw new Error("ano devolvido pela AT n\u00e3o corresponde ao pedido");
        return { ano: +ano, categorias: cats, total: +total.toFixed(2),
                 nota: "valores oficiais da AT, por titular (n\u00e3o consideram agregado nem tributa\u00e7\u00e3o conjunta)" };
  }
  function readDeducoesOficiais() {
    var y = new Date().getFullYear(), anos = [y - 1, y - 2, y - 3, y - 4];
    return Promise.all(anos.map(function (ano) {
      return getJSON("/json/consultarDespesasDeducoesService.action?anoDashboard=" + ano + "&_=" + Date.now())
        .then(function (j) {
          if (!j || j.success === false || !j.dashboardHTML) throw new Error("dedu\u00e7\u00f5es indispon\u00edveis para " + ano);
          return parseDeducoesHtml(j.dashboardHTML, ano);
        });
    })).then(function (rows) {
      var out = {}; rows.forEach(function (row) { out[row.ano] = row; }); return out;
    });
  }

  /* DESPESAS AFETAS \u00c0 ATIVIDADE (Cat B, regime simplificado) - /app/dashboard-regime-simplificado.
   * No simplificado tributa-se um coeficiente do bruto (art. 31), mas parte desse benef\u00edcio exige
   * despesas efetivamente afetas \u00e0 atividade (art. 31 n.13): pessoal, rendas, VPT de im\u00f3veis afetos,
   * outras. Esta p\u00e1gina mostra o que a AT j\u00e1 tem, com o "valor a considerar" j\u00e1 calculado.
   * Mesmo padr\u00e3o (e mesma armadilha) da p\u00e1gina das dedu\u00e7\u00f5es: HTML server-rendered e ano STATEFUL. */
  function parseDespesasAtividadeHtml(html) {
    var raw = String(html || ""), t = "";
    try {
      var contentDoc = new DOMParser().parseFromString(raw, "text/html");
      Array.prototype.forEach.call(contentDoc.querySelectorAll("script,style,noscript"), function (node) {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      t = (contentDoc.body && contentDoc.body.textContent) || contentDoc.textContent || "";
    } catch (e) {
      t = raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/g, " ").replace(/&euro;/g, "\u20ac");
    }
    t = t.replace(/\s+/g, " ");
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
  }
  function despesasAtividadeLoginDocument(html, responseUrl) {
    if (/^https:\/\/acesso\.gov\.pt(?:\/|$)/i.test(String(responseUrl || ""))) return true;
    try {
      var loginDoc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var forms = loginDoc.querySelectorAll("form");
      for (var i = 0; i < forms.length; i++) {
        var marker = [forms[i].getAttribute("id"), forms[i].getAttribute("name"),
          forms[i].getAttribute("action")].join(" ");
        if (/loginForm|acesso\.gov\.pt/i.test(marker)) return true;
      }
    } catch (e) {}
    return false;
  }
  function despesasAtividadeVisibleHtml() {
    // The user is already on this server-rendered page. Read that DOM first: a same-origin fetch can
    // be redirected independently by the portal. Remove our widget clone so its source label cannot
    // be mistaken for the official page heading.
    try {
      var root = document.documentElement.cloneNode(true);
      var panel = root.querySelector("#efh-panel");
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      return root.outerHTML || "";
    } catch (e) { return ""; }
  }
  function readDespesasAtividade() {
    var url = "/app/dashboard-regime-simplificado";
    var visibleHtml = despesasAtividadeVisibleHtml();
    var visibleData = parseDespesasAtividadeHtml(visibleHtml);
    if (visibleData) {
      recordShape(url, "html", visibleHtml);
      return Promise.resolve(visibleData);
    }
    return fetch(url, { credentials: "include" })
      .then(function (r) {
        return r.text().then(function (html) {
          var data = parseDespesasAtividadeHtml(html);
          // Valid page content wins over harmless login-related script or shell text. Only an actual
          // login form or a redirect to acesso.gov.pt means this page's session has expired.
          if (data) { recordShape(url, "html", html); return data; }
          if (despesasAtividadeLoginDocument(html, r.url))
            throw readError("session_required", "A sess\u00e3o desta p\u00e1gina expirou. Faz login aqui e tenta de novo.");
          recordShape(url, "html", html);
          return null;
        });
      });
  }

  /* DECLARA\u00c7\u00d5ES de IRS por ano (irs.../app/consulta). POST com {anoDeclaracoes:"YYYY"} - um GET
   * devolve vazio. ARMADILHA CR\u00cdTICA: um ano pode ter V\u00c1RIAS declara\u00e7\u00f5es (1.\u00aa + substitui\u00e7\u00f5es) e a que
   * conta \u00e9 a \u00daLTIMA; o `montante` da linha pode dizer 0,00 / "SALDO NULO EMITIDO" e ainda assim haver
   * imposto (foi o caso real de 2025: 1.\u00aa dizia 2.281,60, a substitui\u00e7\u00e3o dizia 0,00 mas eram 1.487,44).
   * Por isso: ordenar por tipo ("N. D.PRAZO") e dataRececao, e assinalar que houve substitui\u00e7\u00e3o. */
  /* DEMONSTRACAO DE LIQUIDACAO: deliberately not parsed in this browser build yet. The previous
   * hand-written scanner assumed unencrypted, literal-text Flate streams and could silently miss
   * ToUnicode fonts, object streams, filters or encryption while still returning plausible tax
   * numbers. Metadata and the official download link remain available; no derived PDF value is
   * exposed until the vetted parser fixture suite covers those formats. */


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
      Object.keys(porAno).forEach(function (a) {
        if (porAno[a].urlDem) porAno[a].leituraDemonstracao = "indisponivel-ate-parser-validado";
      });
      return porAno;
    });
  }

  function readDeclaracoesPartition() {
    return readDeclaracoes().then(function (porAno) {
      return { data: { porAno: porAno }, source: "/app/consulta/pesquisa (POST de pesquisa, cinco anos)" };
    });
  }
  function readDeducoesPartition() {
    return readDeducoesOficiais().then(function (porAno) {
      return { data: { porAno: porAno },
        source: "/json/consultarDespesasDeducoesService.action (quatro anos conclu\u00eddos)" };
    });
  }
  function readDespesasAtividadePartition() {
    return readDespesasAtividade().then(function (data) {
      return { data: data || { disponivel: false }, source: "/app/dashboard-regime-simplificado" };
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
    if (P.declaracoes && P.declaracoes.status === "done") {
      prof.detalhes.declaracoes = P.declaracoes.data; prof.recolhidoEm.declaracoes = P.declaracoes.fetchedAt;
    }
    if (P.deducoes && P.deducoes.status === "done") {
      prof.detalhes.deducoesOficiais = P.deducoes.data; prof.recolhidoEm.deducoes = P.deducoes.fetchedAt;
    }
    if (P.despesas_atividade && P.despesas_atividade.status === "done") {
      prof.detalhes.despesasAtividade = P.despesas_atividade.data;
      prof.recolhidoEm.despesasAtividade = P.despesas_atividade.fetchedAt;
    }
    if (P.ss && P.ss.status === "done") {
      prof.detalhes.ss = P.ss.data; prof.recolhidoEm.ss = P.ss.fetchedAt;
    }
    var at = null;
    if (P.atividade && P.atividade.status === "done") {
      at = {}; Object.keys(P.atividade.data || {}).forEach(function (k) { at[k] = P.atividade.data[k]; });
      prof.recolhidoEm.atividade = P.atividade.fetchedAt;
    }
    if (P.atividade_integrada && P.atividade_integrada.status === "done") {
      if (!at) at = {};
      var ai = P.atividade_integrada.data || {};
      Object.keys(ai).forEach(function (k) { at[k] = ai[k]; });
      prof.recolhidoEm.atividadeIntegrada = P.atividade_integrada.fetchedAt;
      // Only the date-aware current cadastro can assert OPEN. Historical cessations do not override
      // a later effective restart, and a future start does not count as open before its date.
      if (ai.disponivel !== false && ai.estadoAtual === "aberta" && !prof.categorias.some(function (c) { return c.cat === "B"; }))
        prof.categorias.push({ cat: "B", label: "Trabalho independente (atividade aberta)", base: "Atividade Exercida" });
    }
    if (at) prof.detalhes.atividade = at;
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
      var estado = at.estadoAtual === "agendada" ? "in\u00edcio/rein\u00edcio agendado (ainda n\u00e3o aberto)"
        : (at.estadoAtual || (at.cessada === true ? "cessada" : (at.cessada === false ? "aberta" : "por confirmar")));
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
      '<li>O perfil completo fica neste navegador. No modo gratuito, o perfil envia apenas estruturas sem valores e, no e-Fatura, agregados empresa/ano sem identidade do comprador, datas ou faturas individuais.</li>' +
      '<li>S\u00f3 leitura: nada \u00e9 submetido \u00e0s Finan\u00e7as.</li>' +
      '</ul>' +
      '<button type="button" id="fb-prof-go" style="cursor:pointer;background:#034ad8;color:#fff;border:0;' +
      'border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">Concordo, carregar</button>';
    document.getElementById("fb-prof-go").onclick = function () {
      if (!EXTENSION_MODE) try { localStorage.setItem(PROF_CONSENT, JSON.stringify({ ok: true, ts: Date.now() })); } catch (e) {}
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
    _shapes = {};
    document.getElementById("efh-body").innerHTML = "A ler " + esc(cur.label) + "...";
    cur.read().then(function (res) {
      if (!hasPartitionShape(cur.id, _shapes))
        throw readError("schema_not_captured", "A estrutura desta p\u00e1gina n\u00e3o foi reconhecida. A leitura local n\u00e3o foi aceite como conclu\u00edda.");
      var s = profLoad();
      s.partitions[cur.id] = { status: "done", fetchedAt: new Date().toISOString(), data: res.data,
        source: res.source, shape: _shapes, market: res.market || null,
        handoff: { status: "pending", at: new Date().toISOString() } };
      profSave(s);
      // Read OK -> hand the result straight to /perfil through the nonce-bound browser channel.
      // This removes the separate "Guardar" click that was being missed.
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
      deliverProfile(cur.id, res.data, _shapes, res.market || null);
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
    var isDone = !!(cur && store.partitions[cur.id] && store.partitions[cur.id].status === "done");

    var h = '<div style="font-size:15px;font-weight:700;margin:0 0 8px">A tua situa\u00e7\u00e3o fiscal ' +
            '<span style="font-weight:400;color:#555">(' + done.length + '/' + PARTITIONS.length + ')</span></div>';
    // Keep the only useful actions visible at the top of the scrollable widget. An accepted read
    // needs no Guardar button: delivery already happened automatically.
    if (cur) {
      h += '<div style="position:sticky;top:0;z-index:2;background:#fff;border:1px solid #d5dae1;' +
        'border-radius:8px;padding:10px;margin:0 0 12px;display:flex;gap:8px;flex-wrap:wrap">' +
        (isDone ? '<button type="button" id="fb-open-profile" style="cursor:pointer;background:#128a3a;color:#fff;border:0;' +
          'border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">Voltar \u00e0 minha situa\u00e7\u00e3o \u2192</button>' : '') +
        '<button type="button" id="fb-read" style="cursor:pointer;' +
        (isDone ? 'background:#eef;color:#034ad8;border:1px solid #cdd' : 'background:#034ad8;color:#fff;border:0') +
        ';border-radius:6px;padding:9px 16px;font:inherit;font-weight:600">' +
        (isDone ? 'Reler ' : 'Ler ') + esc(cur.label) + '</button></div>';
    }
    h += '<div style="margin:0 0 12px">';
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

    if (!cur) {
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
      _shapes = {};
      cur.read().then(function (res) {
        if (!hasPartitionShape(cur.id, _shapes))
          throw readError("schema_not_captured", "A estrutura desta p\u00e1gina n\u00e3o foi reconhecida. A leitura local n\u00e3o foi aceite como conclu\u00edda.");
        var s = profLoad();
        s.partitions[cur.id] = { status: "done", fetchedAt: new Date().toISOString(), data: res.data,
          source: res.source, shape: _shapes, market: res.market || null,
          handoff: { status: "pending", at: new Date().toISOString() } };
        profSave(s);
        document.getElementById("efh-body").innerHTML = '<b>\u2713 Leitura atualizada.</b> A concluir automaticamente...';
        deliverProfile(cur.id, res.data, _shapes, res.market || null);
      }).catch(function (e) {
        var s = profLoad();
        s.partitions[cur.id] = { status: "pending", error: "N\u00e3o deu para ler: " + ((e && e.message) || "erro") + ". Confirma o login nesta p\u00e1gina.", fetchedAt: new Date().toISOString() };
        profSave(s); profRender();
      });
    };
    var sp = document.getElementById("fb-open-profile");
    if (sp) sp.onclick = function () {
      try {
        var target = window.__FISCALIDADE_PROFILE_TARGET__ || window.open(PROF_SITE, "fiscalidade-perfil");
        if (target) target.focus();
      } catch (e) {}
    };
    var rs = document.getElementById("fb-reset");
    // "apagar" = apagar TUDO o que o tool guardou nesta origem: a situacao fiscal E a configuracao
    // do agregado (incluindo a chave de sala da partilha - quem pede para apagar quer apagar).
    if (rs) rs.onclick = function (ev) {
      ev.preventDefault();
      if (EXTENSION_MODE) {
        _extensionProfile = { partitions: {} };
        _extensionSettings.classifierProfile = {};
        try { chrome.runtime.sendMessage({ type: "fb-settings-clear" }); } catch (e) {}
      } else try { localStorage.removeItem(PROF_KEY); localStorage.removeItem(PKEY); } catch (e) {}
      profRender();
    };
  }

  function runProfiling() {
    if (!profConsent()) return profConsentGate();
    var cur = currentPartition(), store = profLoad();
    var cached = cur && store.partitions[cur.id];
    var staleSchema = cached && cached.status === "done" &&
      (!hasPartitionShape(cur.id, cached.shape) ||
       (cached.handoff && (cached.handoff.code === "schema_required" || cached.handoff.code === "invalid_schema")));
    // On a known partition not yet read this session, read it AUTOMATICALLY. Otherwise just show
    // the checklist (e.g. an AT page we do not read, or one already collected). A cached result
    // without a currently allowlisted schema is not retryable: reread it with this version instead
    // of resending the same empty envelope forever.
    if (cur && (!cached || cached.status !== "done" || staleSchema))
      autoReadCurrent(cur);
    // If the official page was read but the browser handoff or mandatory intake failed, another
    // bookmarklet click retries automatically with the already-local reading. The user never has
    // to hunt for a separate Guardar button below the 13-source checklist.
    else if (cur && store.partitions[cur.id] && store.partitions[cur.id].status === "done" &&
             (!store.partitions[cur.id].handoff || store.partitions[cur.id].handoff.status !== "accepted")) {
      document.getElementById("efh-body").innerHTML =
        '<div style="font-size:14px"><b>A concluir ' + esc(cur.label) + '...</b><br>' +
        'A leitura j\u00e1 est\u00e1 neste navegador; a ligar automaticamente \u00e0 tua situa\u00e7\u00e3o.</div>';
      deliverProfile(cur.id, store.partitions[cur.id].data, store.partitions[cur.id].shape,
        store.partitions[cur.id].market || null);
    } else
      profRender();
  }
  /* ======================  end PROFILING  ====================== */

  if (PROFILING) { runProfiling(); }
  else if (consent()) { document.getElementById("efh-body").innerHTML = "A ler as tuas faturas..."; start(); }
  else { gate(); }

  /* Changing the household re-runs the whole pass, which rebuilds the table - so anything already
   * edited (a corrected sector, an unticked row) would be silently thrown away. Snapshot the choices
   * by idDocumento rather than row index, because row order can change, and restore after rebuild. */
  var userEdits = {}, userDirty = {};
  function snapshotEdits(pend) {
    document.querySelectorAll(".efh-sec").forEach(function (el) {
      var x = pend[+el.dataset.i]; if (!x) return;
      if (!userDirty[x.idDocumento]) return; // untouched defaults must be recalculated for new caps
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

  function run(householdSnapshot) {
    var caemap = {}, mapUnavailable = false;
    // The unpaginated endpoint caps at 300. Use the recursive, fail-visible reader for the current
    // year too; otherwise a busy account appears complete while silently missing older invoices.
    fetchSector(year, "").then(function (rows) { return { linhas: rows, totalElementos: rows.length }; })
      .then(function (d) {
        // Pull the map slices for THESE merchants before doing anything else. Everything below
        // reads caemap synchronously, so it has to be populated first.
        var all = ((d && d.linhas) || []).map(function (x) { return x.nifEmitente; });
        return fetchMap(all).then(function (m) {
          caemap = m || {};
          return d;
        }).catch(function () {
          // The account read already succeeded. An optional public enrichment outage must not
          // discard those rows or claim that the e-Fatura session expired. Continue from local
          // classification history and make the degraded evidence state explicit in the widget.
          caemap = {};
          mapUnavailable = true;
          return d;
        });
      })
      .then(function (d) {
        var rows = (d && d.linhas) || [];
        var pend = rows.filter(function (x) { return x.estadoBeneficio === "P"; });
        var learned = {};
        rows.forEach(function (x) {
          if (isAttributed(x.estadoBeneficio) && x.actividadeEmitente) {
            (learned[x.nifEmitente] = learned[x.nifEmitente] || {})[x.actividadeEmitente] =
              (learned[x.nifEmitente][x.actividadeEmitente] || 0) + 1;
          }
        });
        if (DASHBOARD) {
          deliverInvoiceDashboard(rows, caemap, mapUnavailable);
          return;
        }
        // cascade(nif) = every evidenced candidate sector, ordered with the user's own history
        // first and the public CAE list after it. History is the strongest PROBABLE answer, but it
        // must not erase legitimate alternatives: that made the "optimised" column unable to use a
        // merchant's secondary activity whenever this account had classified it before.
        var cascade = function (nif) {
          var out = [], add = function (s) { if (CEIL[s] && out.indexOf(s) < 0) out.push(s); };
          var m = learned[nif];
          if (m) Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).forEach(add);
          var c = caemap[nif];
          if (c) (Object.prototype.toString.call(c) === "[object Array]" ? c : [c]).forEach(add);
          if (!out.length) out.push("C99");                        // no evidence: safe default
          return out;
        };
        // Walk the cascade and take the first sector that still has room under its ceiling.
        // This is the "prefer the most beneficial, and if it is full go to the next" rule: a
        // pharmacy invoice goes to Saude, but once Saude is capped it falls to the next option.
        var prof = loadProfile();
        // Keep own-account and merged-household totals separate. Uploading the merged result back
        // under this member would count the partner's invoices again on every refresh.
        var accountUsed = usedSoFar(rows, prof), used = {};
        Object.keys(accountUsed).forEach(function (k) { used[k] = accountUsed[k]; });
        if (householdSnapshot && householdSnapshot.merged) {
          Object.keys(householdSnapshot.merged).forEach(function (k) {
            used[k === "POT" ? POT : k] = Number(householdSnapshot.merged[k] || 0);
          });
        }
        var headroom = function (sec) {
          var c = CEIL[sec]; if (!c) return Infinity;
          return capFor(sec, prof) - (used[c.pot || sec] || 0);
        };
        /* OTIMIZADA is allocated as ONE plan below, not independently row by row. Otherwise two
         * pending invoices can both be shown the same last 10 EUR of headroom. */
        var suggest = function (nif, x) { return x.__plannedSector || cascade(nif)[0]; };
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
         * movR is the FOOTGUN-SAFE recoverable set BY CONSTRUCTION: the shared allocator emits a
         * move only when a DIFFERENT sector the merchant is REGISTERED for (from SICAE) has
         * headroom. A C99-only merchant yields no move, so this can never suggest declaring
         * groceries as Saude. Verified 20-07-2026 that the landing sector is actividadeEmitente
         * (the IRS endpoint's valorTotalSetorBeneficio/DespesasGerais are always 0). */
        // movR (invoices in a full pot the merchant can move out of) + the footgun-safe recoverable,
        // now computed by the SHARED core so the current year and the past-year re-audit never drift.
        var pendingPlan = allocatePending();
        // Pending invoices are obligations the user still has to classify; reserve their proposed
        // ceiling usage before valuing optional corrections so both paths cannot claim the same
        // last euro of target headroom.
        var _mr = movablesAndRecoverable(rows, caemap, prof, null, pendingPlan.levels);
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
           *   - Otimizada only ever offers an evidenced sector (own history or public SICAE map).
           *     It cannot invent one.
           *   - The Resumo tab carries the consequence line in plain sight, not in a tooltip:
           *     classifying is a declaration to the AT, and being accepted is not being right.
           *   - Both figures sit on the switcher, so choosing PROVAVEL is one click and the user
           *     can see exactly what that choice costs.
           * Where the purchase genuinely was in the better sector the two agree anyway. */
          var cell = function (sec, i2, kind) {
            return '<button type="button" class="efh-pick efh-btn-mini' + (kind === "pv" ? "" : " efh-green") +
              '" data-i="' + i2 + '" data-sec="' + sec + '" ' +
              'title="Usar ' + sec + ' - ' + esc(SECTORS[sec] || sec) + '" ' +
              'style="min-height:24px">' + sec + '</button>';
          };
          var same = (pv === s);
          var badge = isR ? ' <span class="efh-ok" style="font-size:9px;padding:0 3px;border-radius:3px;color:var(--green)" title="Ja classificada - isto corrige o setor">corrigir</span>' : "";
          // Deep link straight to THIS invoice on e-Fatura (same-origin detail page the portal
          // itself uses) - amending is: click, Alterar, Guardar. Browser Back returns to the plan.
          var link = "/detalheDocumentoAdquirente.action?idDocumento=" + encodeURIComponent(x.idDocumento) +
            "&dataEmissaoDocumento=" + encodeURIComponent(x.dataEmissaoDocumento);
          return '<tr><td style="text-align:center"><input type="checkbox" class="efh-ck" data-i="' + i + '" checked></td>' +
            '<td class="efh-num" style="font-size:11px">' + esc(x.dataEmissaoDocumento) + '</td>' +
            '<td><a href="' + link + '" class="efh-name" ' +
              'title="Abrir esta fatura no e-Fatura" style="color:var(--pri)">' +
              esc(deent(x.nomeEmitente || "").trim()) + '</a>' + badge + '</td>' +
            '<td class="efh-nif" style="font-size:11px"><a href="#" class="efh-copynif" data-nif="' +
              esc(String(x.nifEmitente || "")) + '" title="Copiar NIF" style="color:var(--ink2);text-decoration:none;border-bottom:1px dotted var(--mute)">' +
              esc(String(x.nifEmitente || "")) + '</a></td>' +
            '<td class="efh-val" style="text-align:right">\u20ac' + eur(x.valorTotal) + '</td>' +
            '<td style="font-size:11px;white-space:nowrap">' + cell(pv, i, "pv") + "</td>" +
            '<td style="font-size:11px;white-space:nowrap">' +
              (same ? '<span class="efh-mute">igual</span>' : cell(s, i, "op")) + "</td>" +
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
        /* Pending allocator. Start with the deduction already used by attributed invoices, then
         * reserve ceiling space after each proposed pending classification. This is the key lesson
         * retained from the historical classifier: proposals are a portfolio, not independent row
         * guesses. Registered corrections are calculated separately by movablesAndRecoverable(),
         * so the headline cannot count them once here and again as `recoverable`. */
        function dedu(x, sec) {
          return deductionFor(x, sec, prof);
        }
        function allocatePending() {
          var capOf = function (k) { return k === POT ? POT_CAP : capFor(k, prof); };
          var keyOf = function (sec) { return CEIL[sec].pot || sec; };
          var levels = {}, moves = [];
          Object.keys(used).forEach(function (k) { levels[k] = used[k]; });
          var plan = pend.map(function (x, i) {
            var allowed = cascade(x.nifEmitente).filter(function (a) { return CEIL[a]; });
            var best = 0;
            allowed.forEach(function (a) { var d = dedu(x, a); if (d > best) best = d; });
            return { gain: best, x: x, allowed: allowed, order: i };
          });
          plan.sort(function (a, b) { return (b.gain - a.gain) || (a.order - b.order); });
          var before = 0, wasted = 0;
          Object.keys(levels).forEach(function (k) {
            before += Math.min(levels[k], capOf(k));
            wasted += Math.max(0, levels[k] - capOf(k));
          });
          plan.forEach(function (p) {
            if (!p.allowed.length) return;
            var bestSec = p.allowed[0], bestVal = -1;
            p.allowed.forEach(function (a) {
              var k = keyOf(a), d = dedu(p.x, a);
              var val = Math.min((levels[k] || 0) + d, capOf(k)) - Math.min(levels[k] || 0, capOf(k));
              if (val > bestVal + 0.005) { bestSec = a; bestVal = val; }
            });
            p.x.__plannedSector = bestSec;
            levels[keyOf(bestSec)] = (levels[keyOf(bestSec)] || 0) + dedu(p.x, bestSec);
            moves.push({ x: p.x, from: null, to: bestSec, val: Math.max(0, bestVal) });
          });
          var after = 0;
          Object.keys(levels).forEach(function (k) { after += Math.min(levels[k], capOf(k)); });
          return { before: before, after: after, wasted: wasted, moves: moves, levels: levels };
        }
        function optimise() { return pendingPlan; }

        function oneBar(label, usedV, addV, cap) {
          var projected = Math.max(0, usedV + addV);
          // A correction can reduce its source category. In that case draw the projected solid
          // level; a negative-width ghost segment is invalid CSS and hid the actual result.
          var solidV = addV < 0 ? projected : usedV;
          var pu = cap ? (solidV / cap) * 100 : 0;
          var pa = cap && addV > 0 ? (addV / cap) * 100 : 0;
          var total = cap ? (projected / cap) * 100 : 0;
          var over = total > 100.5;
          var col = pu >= 100 ? "#b00" : pu >= 80 ? "#d98a00" : "#128a3a";
          var ghost = over ? "#b00" : "#7fc79b";
          var wu = Math.min(100, pu);
          var wa = Math.min(100 - wu, pa);
          return '<div style="margin:5px 0" role="group" aria-label="' + esc(label) + '">' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            "<span>" + esc(label) + "</span>" +
            '<span style="color:' + (over ? "#b00" : col) + '"><b>' + Math.round(total) + "%</b>  |  \u20ac" +
            projected.toFixed(0) + " / \u20ac" + cap.toFixed(0) +
            (addV > 0.5 ? ' <span style="color:#128a3a">(+\u20ac' + addV.toFixed(0) + " a aplicar)</span>" : "") +
            (addV < -0.5 ? ' <span style="color:#6b7780">(-\u20ac' + Math.abs(addV).toFixed(0) + " ao corrigir)</span>" : "") +
            (over ? ' <b>excede</b>' : "") + "</span></div>" +
            '<div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
            Math.round(total) + '" aria-valuetext="' + Math.round(total) + '% de ' + esc(label) +
            (over ? ', excede o limite' : '') + '"' +
            ' style="height:7px;background:#E1E4EA;border-radius:4px;overflow:hidden;display:flex">' +
            '<div style="height:100%;width:' + wu.toFixed(1) + "%;background:" + col + '"></div>' +
            '<div style="height:100%;width:' + wa.toFixed(1) + "%;background:" + ghost +
            ';opacity:.75"></div></div></div>';
        }

        /* Net ceiling deltas for the currently-ticked rows. Pending invoices only add a target;
         * attributed corrections also remove their current contribution from the source. */
        function pendingAdds() {
          var add = {};
          document.querySelectorAll(".efh-ck").forEach(function (ck) {
            if (!ck.checked) return;
            var i = +ck.dataset.i;
            var selEl = document.querySelector('.efh-sec[data-i="' + i + '"]');
            if (!selEl) return;
            var c = CEIL[selEl.value]; if (!c) return;
            var x = actionable[i];
            var key = c.pot || selEl.value;
            if (isAttributed(x.estadoBeneficio) && CEIL[x.actividadeEmitente]) {
              var sourceKey = CEIL[x.actividadeEmitente].pot || x.actividadeEmitente;
              add[sourceKey] = (add[sourceKey] || 0) - dedu(x, x.actividadeEmitente);
            }
            add[key] = (add[key] || 0) + dedu(x, selEl.value);
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
        var mapNotice = mapUnavailable
          ? '<div id="efh-map-warning" class="efh-warn" style="margin-bottom:10px">' +
            '<b>Faturas lidas.</b> O mapa p\u00fablico de atividades est\u00e1 temporariamente indispon\u00edvel. ' +
            'As sugest\u00f5es usam apenas o teu hist\u00f3rico e o setor geral; confirma cada escolha no portal.</div>'
          : "";
        document.getElementById("efh-body").innerHTML = mapNotice +
          /* Two renderings of ONE dataset, one fetch. Resumo answers "what do I do"; Detalhe keeps
           * everything that was here before. Tabs toggle display only - #efh-bars and #efh-opt must
           * stay IN the DOM, because renderBars() and the optimiser write into them by id and would
           * silently no-op against a detached node. */
          '<div role="tablist" class="efh-tabs">' +
          '<button type="button" role="tab" id="efh-tab-r" class="efh-tab" aria-selected="true">Resumo</button>' +
          '<button type="button" role="tab" id="efh-tab-d" class="efh-tab" aria-selected="false">Detalhe</button>' +
          '</div>' +
          '<div id="efh-pane-r"><div id="efh-resumo">A calcular...</div>' + sponsor + '</div>' +
          '<div id="efh-pane-d" style="display:none">' +

          '<div class="efh-eyebrow" style="margin-top:0">A tua situacao</div>' +
          '<div class="efh-box" style="margin-bottom:10px">' +
          '<div>IRS ' + (prof.joint ? '<b>em conjunto</b> (tetos do agregado - o que falta e MENOS do que aparece aqui, usa a partilha)' : '<b>em separado</b> (tetos so teus)') +
          (prof.mono ? ' \u00b7 familia <b>monoparental</b>' : '') +
          ' <a href="#" id="efh-sit-edit" style="color:var(--pri);font-size:11px">alterar</a></div>' +
          '<div id="efh-sit-controls" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--rule)">' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;margin-right:14px">' +
          '<input type="checkbox" id="efh-joint"' + (prof.joint ? " checked" : "") + '> Tributa\u00e7\u00e3o conjunta</label>' +
          '<label style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' +
          '<input type="checkbox" id="efh-mono"' + (prof.mono ? " checked" : "") +
          '> Fam\u00edlia monoparental</label></div>' +
          '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--rule)">' +
          '<label title="Opcional. Os tetos do IRS s\u00e3o do agregado, mas esta p\u00e1gina s\u00f3 v\u00ea esta conta.">' +
          'Partilhar tetos do agregado (opcional): <input type="text" id="efh-room" ' +
          'placeholder="cola a chave, ou deixa vazio" autocomplete="off" spellcheck="false" ' +
          'value="" style="width:170px"></label> ' +
          '<button type="button" id="efh-join" class="efh-btn-mini">Ligar</button>' +
          '<div id="efh-hh" style="margin-top:4px" class="efh-mute"></div></div></div>' +

          '<div class="efh-warn" style="margin-bottom:10px">Esta ferramenta <b>n\u00e3o submete nada</b> ' +
          '\u00e0 AT - s\u00f3 analisa e mostra o plano. A decis\u00e3o e o clique final s\u00e3o sempre teus: clica no nome de uma fatura para a abrir no e-Fatura.</div>' +

          '<div class="efh-eyebrow">Tetos</div>' +
          '<div id="efh-bars"></div>' +

          '<div class="efh-eyebrow">Otimizacao</div>' +
          '<div id="efh-opt"></div>' +

          '<div class="efh-eyebrow">Faturas</div>' +
          '<p style="margin:0 0 8px;font-size:12px"><b>' + pend.length + ' por classificar</b>' +
          (movR.length ? ' + <b>' + movR.length + ' por corrigir</b> (j\u00e1 classificadas, mas rendem mais noutro setor)' : '') +
          ' em ' + year +
          '. <b>Prov\u00e1vel</b> = a atividade principal do comerciante ou o teu hist\u00f3rico; <b>Otimizada</b> = mais dedu\u00e7\u00e3o com espa\u00e7o no teto (vem selecionada). S\u00f3 aparecem setores em que o comerciante est\u00e1 registado, mas <b>ser aceite n\u00e3o \u00e9 o mesmo que estar certo</b>: a classifica\u00e7\u00e3o \u00e9 uma declara\u00e7\u00e3o tua \u00e0 AT.</p>' +
          '<div class="efh-scroll"><table>' +
          '<thead><tr><th></th><th>Data</th><th title="Clica no nome para abrir a fatura no e-Fatura">Emitente</th><th title="Clica para copiar">NIF</th><th>Valor</th><th title="O setor que a compra provavelmente foi: o teu hist\u00f3rico, ou a atividade principal do comerciante">Prov\u00e1vel</th><th title="O setor que d\u00e1 mais dedu\u00e7\u00e3o e ainda tem espa\u00e7o no teto">Otimizada</th><th>Setor</th></tr></thead>' +
          '<tbody>' + trs + '</tbody></table></div>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
          // #efh-apply is rendered ONLY when DRAFT is off. While DRAFT is on the tool writes nothing,
          // and the page copy at fiscalida.de promises exactly that - so this button and
          // those promises flip together, never one without the other.
          (DRAFT ? '' :
            '<button id="efh-apply" class="efh-btn efh-btn-green">Aplicar no e-Fatura</button> ') +
          '<button id="efh-export" class="efh-btn">Copiar plano</button> ' +
          '<button id="efh-mailto" class="efh-btn efh-btn-ghost">Enviar por email</button> ' +
          '<span id="efh-status" role="status" aria-live="polite" class="efh-mute"></span></div>' +
          '</div>';

        (function () {
          var tr = document.getElementById("efh-tab-r"), td = document.getElementById("efh-tab-d");
          var pr = document.getElementById("efh-pane-r"), pd = document.getElementById("efh-pane-d");
          function show(res) {
            pr.style.display = res ? "" : "none";
            pd.style.display = res ? "none" : "";
            // aria-selected drives the .efh-tab[aria-selected=true] styling - no inline mutation
            tr.setAttribute("aria-selected", res ? "true" : "false");
            td.setAttribute("aria-selected", res ? "false" : "true");
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
        // NIF click-to-copy: users who amend via e-Fatura's own search paste the NIF there.
        document.querySelectorAll(".efh-copynif").forEach(function (a) {
          a.addEventListener("click", function (ev) {
            ev.preventDefault();
            var nif = a.dataset.nif || "";
            var done = function () {
              var st = document.getElementById("efh-status");
              if (st) st.textContent = "NIF " + nif + " copiado.";
            };
            if (navigator.clipboard) navigator.clipboard.writeText(nif).then(done, done);
            else done();
          });
        });

        function planText() {
          var lines = ["Plano de classificacao e-Fatura - " + year, ""];
          document.querySelectorAll(".efh-ck").forEach(function (ck) {
            if (!ck.checked) return;
            var i = +ck.dataset.i, x = actionable[i];
            var sec = document.querySelector('.efh-sec[data-i="' + i + '"]').value;
            lines.push(x.dataEmissaoDocumento + "  " + name34(x) + "  NIF " + (x.nifEmitente || "?") +
                       "  EUR" + eur(x.valorTotal) + "  ->  " + sec + " (" + SECTORS[sec] + ")");
            lines.push("    https://faturas.portaldasfinancas.gov.pt/detalheDocumentoAdquirente.action?idDocumento=" +
                       encodeURIComponent(x.idDocumento) + "&dataEmissaoDocumento=" +
                       encodeURIComponent(x.dataEmissaoDocumento));
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
                var lk = "/detalheDocumentoAdquirente.action?idDocumento=" + encodeURIComponent(m.x.idDocumento) +
                         "&dataEmissaoDocumento=" + encodeURIComponent(m.x.dataEmissaoDocumento);
                return '<div>' + esc(m.x.dataEmissaoDocumento) + '  |  ' +
                       '<a href="' + lk + '" style="color:var(--pri)" ' +
                       'title="Abrir esta fatura no e-Fatura">' + esc(name34(m.x)) + '</a>' +
                       '  |  <span class="efh-nif">' + esc(String(m.x.nifEmitente || "")) + '</span>' +
                       '  |  \u20ac' + eur(m.x.valorTotal) + ' - <b>' + (m.x.actividadeEmitente || "C99") + ' -> ' + m.to + '</b></div>';
              }).join("") + '</div>';
          };
        })();
        document.querySelectorAll(".efh-ck").forEach(function (el) {
          el.onchange = function () {
            var x = actionable[+el.dataset.i]; if (x) userDirty[x.idDocumento] = true;
            renderBars();
          };
        });
        document.querySelectorAll(".efh-sec").forEach(function (el) {
          el.onchange = function () {
            var x = actionable[+el.dataset.i]; if (x) userDirty[x.idDocumento] = true;
            renderBars();
          };
        });
        // changing the household re-runs the whole suggestion pass (ceilings move, so do sectors)
        var reprofile = function () {
          snapshotEdits(actionable);        // keep the user's corrections across the rebuild
          saveProfile(Object.assign(loadProfile(),
                      { joint: document.getElementById("efh-joint").checked,
                        mono: document.getElementById("efh-mono").checked }));
          run(householdSnapshot);
        };
        document.getElementById("efh-joint").onchange = reprofile;
        document.getElementById("efh-mono").onchange = reprofile;
        // "alterar" reveals the situacao checkboxes in place - same controls, same reprofile
        // wiring, so the gate stays the single source of truth for what the answers MEAN.
        var sitEdit = document.getElementById("efh-sit-edit");
        if (sitEdit) sitEdit.onclick = function (ev) {
          ev.preventDefault();
          var c = document.getElementById("efh-sit-controls");
          if (c) c.style.display = c.style.display === "none" ? "" : "none";
        };

        var hhBox = document.getElementById("efh-hh");
        if (prof.room && householdSnapshot && householdSnapshot.merged) {
          hhBox.innerHTML = '\u2713 ' + (householdSnapshot.members || 1) +
            ' membro(s). Chave: <code style="user-select:all">' + esc(prof.room) + '</code>';
        } else if (prof.room) {
          hhBox.innerHTML = 'Chave guardada. Clica <b>Ligar</b> para atualizar os tetos do agregado.';
        }
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
            var body = { member: memberId(), consent: true };
            ["C05", "C06", "C07", "C08", "C99"].forEach(function (k) { body[k] = +(accountUsed[k] || 0).toFixed(2); });
            body.POT = +(accountUsed[POT] || 0).toFixed(2);
            return fetch(HH_URL + room, { method: "PUT", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(body) })
              .then(function () { return fetch(HH_URL + room); })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                // no email is stored any more - the room key is the only household state we keep
                saveProfile(Object.assign(loadProfile(), { joint: prof.joint, mono: prof.mono, room: room }));
                if (!d || !d.merged) throw new Error("totais do agregado em falta");
                snapshotEdits(actionable);
                // Rebuild rows, targets, recoverable value, summary and bars from one merged
                // snapshot. A bars-only repaint leaves the actual plan based on account-only caps.
                run({ merged: d.merged, members: d.members || 1 });
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
      fetch(IMPACT_CONTRIBUTION_URL, {
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
      /* Only the pending resolver has a verified form POST. Historical portal testing proved
       * that an attributed invoice is different: the raw alterarDocumentoAdquirente POST is a
       * decoy/rejected path; the working portal UI fills runtime-only hashDocumento/linhasDocumento
       * fields and then verifies the result by re-fetching invoices. Do not reproduce that browser
       * automation here and never report an attributed correction as applied without post-state
       * verification. Those rows remain a manual deep-link plan even if DRAFT is later disabled. */
      var isPend = /^P$/i.test(p.x.estadoBeneficio || "");
      if (!isPend) {
        fail++;
        errs.push({ nome: name34(p.x), sec: p.sec,
                    reason: "corre\u00e7\u00e3o manual: abrir a fatura, Alterar, escolher setor e Guardar" });
        next(); return;
      }
      fetch("/detalheDocumentoAdquirente.action?idDocumento=" + p.x.idDocumento + "&dataEmissaoDocumento=" + p.x.dataEmissaoDocumento,
        { credentials: "include" }).then(function (r) { return r.text(); }).then(function (htmlText) {
        var doc = new DOMParser().parseFromString(htmlText, "text/html");
        var form = doc.querySelector('form[action="resolverPendenciaAdquirente.action"]') || doc.querySelector("#resolverPendencia");
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
        // Only report the merchant NIF for re-verification if the user opted into sharing. It is
        // the SAME data the learning loop sends (a merchant NIF, nothing of yours), so it lives
        // under the same consent - otherwise the transparency page's "se nao ativares nada, nada
        // sai" would not hold. Server accepts this unauthenticated but rate-limited.
        if (shareOn() && isVerifiedLegalEntityNif(p.x.nifEmitente) && /atividade registada/i.test(reason)) {
          try {
            fetch(MERCHANT_CONTRIBUTION_URL, { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nif: String(p.x.nifEmitente), action: "refresh", consent: true }) })
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
