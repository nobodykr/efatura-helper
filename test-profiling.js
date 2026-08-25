// Profiling flow (SPEC-profiling.md). Proves:
//   1. Without window.__FB_PROFILE the classifier runs and profiling never activates.
//   2. With the flag, a consent gate appears; nothing is read or stored before accept.
//   3. After accept, reading the current partition (e-Fatura, then Imoveis/rendas) stores it in
//      the fb-profile-v1 localStorage key, and the assembled overlay reflects it.
//   4. Rule 3: an HTML body (login redirect) with HTTP 200 is treated as "not logged in", not data.
//   node test-profiling.js tool.js
const { JSDOM } = require("jsdom"); const fs = require("fs");
const SRC = fs.readFileSync(process.argv[2], "utf8");
const CONTRACT = require("./profile-contract.js");
let failures = 0;
function ok(name, cond) { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failures++; }

function mkEnv(host, flag, fetchImpl, path, options) {
  options = options || {};
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://" + host + (path || "/x") });
  const { window } = dom;
  global.window = window; global.document = window.document;
  // tool.js reads the official host/path and hands the result to a named /perfil window. Model the
  // v3 ready/envelope/accepted channel without exposing the payload to a URL or a server.
  let currentHref = "https://" + host + (path || "/x");
  const loc = { host: host, hash: "", pathname: path || "/x", origin: "https://" + host };
  Object.defineProperty(loc, "href", { get() { return currentHref; }, set(value) { currentHref = String(value); } });
  global.location = loc;
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  window.localStorage = global.localStorage;
  global.alert = () => {}; global.navigator = window.navigator; global.DOMParser = window.DOMParser;
  global.fetch = fetchImpl;
  global.FISCALIDADE_PROFILE_CONTRACT = CONTRACT;
  window.FISCALIDADE_PROFILE_CONTRACT = CONTRACT;
  window.__handoffs = [];
  window.__continuations = [];
  const profileDom = new JSDOM("", { url:"https://fiscalida.de/perfil" });
  let profileTarget = profileDom.window;
  if (options.bridgeHtml) {
    let targetHref = "https://fiscalida.de/perfil", targetDocument = profileDom.window.document;
    const navigations = [];
    function navigate(value) {
      targetHref = String(value); navigations.push(targetHref);
      if (new URL(targetHref).origin === "https://" + host) {
        targetDocument = new JSDOM(options.bridgeHtml, { url:targetHref }).window.document;
        Object.defineProperty(targetDocument, "readyState", { get() { return "complete"; } });
      } else targetDocument = profileDom.window.document;
    }
    const targetLocation = {
      get href() { return targetHref; }, set href(value) { navigate(value); },
      get origin() { return new URL(targetHref).origin; }, replace(value) { navigate(value); }
    };
    profileTarget = { closed:false, location:targetLocation, get document() { return targetDocument; },
      focus() {}, __navigations:navigations };
  }
  profileTarget.postMessage = function (message) {
    if (message.type === CONTRACT.continuationType) {
      window.__continuations.push(message);
      setTimeout(function () {
        window.dispatchEvent(new window.MessageEvent("message", { origin:"https://fiscalida.de",
          source:profileTarget, data:{ type:CONTRACT.continuationAckType, partition:message.partition,
            requestId:message.requestId } }));
      }, 0);
    }
    if (message.type === CONTRACT.helloType) setTimeout(function () {
      window.dispatchEvent(new window.MessageEvent("message", { origin:"https://fiscalida.de",
        source:profileTarget, data:{ type:CONTRACT.readyType, partition:message.partition,
          requestId:message.requestId, nonce:"f".repeat(32) } }));
    }, 0);
    if (message.type === CONTRACT.messageType) {
      window.__handoffs.push(message.envelope);
      setTimeout(function () {
        const rejected = window.__profileReply === "rejected";
        window.dispatchEvent(new window.MessageEvent("message", { origin:"https://fiscalida.de",
          source:profileTarget, data:{ type:rejected ? CONTRACT.rejectedType : CONTRACT.acceptedType,
            partition:message.partition, requestId:message.requestId,
            intake:rejected ? undefined : "required", code:rejected ? "intake_unavailable" : undefined } }));
      }, 0);
    }
  };
  window.open = function () { return profileTarget; };
  window.__FISCALIDADE_PROFILE_TARGET__ = profileTarget;
  window.__profileDom = profileDom;
  if (flag) {
    window.__FB_PROFILE = 1;
    window.__FISCALIDADE_CONFIG__ = { channel:"dev-bookmarklet", remoteCodeAllowed:false };
  } else { try { delete window.__FB_PROFILE; } catch (e) {} }
  return window;
}

// A fetch that returns the right JSON per partition endpoint, and an HTML redirect for a
// "logged out" endpoint so rule 3 can be exercised.
function fetchOK(u) {
  const s = String(u);
  const json = (o) => Promise.resolve({ ok: true, headers: { get: () => "application/json" }, text: () => Promise.resolve(JSON.stringify(o)) });
  if (/obterDocumentosAdquirente/.test(s)) return json({ totalElementos: 3, linhas: [{ estadoBeneficio: "P", actividadeEmitente: "47" }, { estadoBeneficio: "P" }, { estadoBeneficio: "R" }] });
  // Real shape: obterContratos/locador returns a BARE ARRAY, estado is an OBJECT {codigo,label},
  // recibos come from /locador (not /emitente). Query string carries a cache-buster.
  if (/obterContratos\/locador/.test(s)) return json([{ referencia: "C1", estado: { codigo: "ACTIVO", label: "Ativo" }, valorRenda: 65000 }]);
  if (/obterRecibos\/locador/.test(s)) return json([{ valor: 65000 }, { valor: 65000 }]);
  if (/geral\/dividas/.test(s)) return json({ montanteTotal: 0, nAtivasGeral: 0, dataInfoObtida: "2026-07-23" });
  if (/geral\/coimas/.test(s)) return json({ montanteTotal: 0, nAtivasGeral: 0 });
  if (/agendaFiscal/.test(s)) return json([{ data: "2026-08-31", descricao: "Entrega da declaracao de IRS" }]);
  if (/matrizesinter\/api\/patrimonio/.test(s)) return json([{ artigo: "1234", nomeFreguesia: "Benfica", tipo: "U", valor: 120000, valorInicial: 90000, estado: {codigo:"ATIVO"} }]);
  if (/liquidacoesIRSDataTables/.test(s)) return json({ iTotalRecords: 3, iTotalDisplayRecords: 3, aaData: [{ ano: 2024 }, { ano: 2023 }, { ano: 2022 }] });
  if (/reembolsosDataTables/.test(s)) return json({ iTotalRecords: 1, aaData: [{ ano: 2024 }] });
  // O leitor consulta ANO A ANO (o servidor rejeita intervalos multi-ano), por isso o mock so
  // devolve documentos para UM ano - devolver 2 em todas as chamadas multiplicaria o total.
  if (/obtemDocumentosV2/.test(s)) {
    var anoQ = (s.match(/dataEmissaoInicio=(\d{4})/) || [])[1];
    var alvo = String(new Date().getFullYear() - 1);
    if (anoQ && anoQ !== alvo) return json({ success: true, listaDocumentos: [], totalDocs: 0 });
    return json({ success: true, listaDocumentos: [{ n: 1 }, { n: 2 }], totalDocs: 2 });
  }
  if (/consultardeclaracoes/.test(s)) return Promise.resolve({ ok: true, headers: { get: () => "text/html" }, text: () => Promise.resolve(
    "<html><table>" +
    "<tr><td>SYNTHETIC-NEW</td><td>2099-01-01</td><td>Declaracao de reinicio de atividade</td><td>Declaracao certa</td><td><a href='/atividade/atividade/consultardeclaracoes/comprovativo/SYNTHETIC-NEW'>ver</a></td></tr>" +
    "<tr><td>SYNTHETIC-OLD</td><td>2021-01-01</td><td>Declaracao de cessacao</td><td>Declaracao certa</td><td><a href='/atividade/atividade/consultardeclaracoes/comprovativo/SYNTHETIC-OLD'>ver</a></td></tr>" +
    "</table>periodicidade trimestral</html>") });
  if (/login\/personalData/.test(s)) return json({ nome: "SECRET NAME", niss: "11111111111" });
  if (/situacao-contributiva/.test(s)) return json({ estado: "REGULARIZADA" });
  if (/payments\/current/.test(s)) return json({ data: [{ v: 1 }] });
  if (/sectors\.json|\/bucket\//.test(s)) return json({});
  return json({ linhas: [] });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms || 900)); }
function hasHandoffShape(w, partition) {
  const handoff = w.__handoffs.find(h => h.partition === partition);
  return !!handoff && Object.keys(handoff.shapes || {}).some(url => {
    const id = CONTRACT.endpointId(url) || (CONTRACT.isEndpointId(url) ? url : null);
    return id && CONTRACT.endpointPartition(id) === partition;
  });
}

(async () => {
  // 1. no flag -> classifier path, no profiling consent key touched
  let w = mkEnv("faturas.portaldasfinancas.gov.pt", false, fetchOK);
  global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));
  eval(SRC); await wait();
  ok("no flag: classifier runs (no fb-prof consent gate)", !w.document.getElementById("fb-prof-go"));

  // 2. The gated bookmarklet click is already the explicit page-read action. The one mandatory
  //    market agreement lives on /perfil, so no origin-specific second confirmation appears.
  w = mkEnv("faturas.portaldasfinancas.gov.pt", true, fetchOK);
  eval(SRC); await wait();
  ok("bookmarklet: no redundant page-origin consent gate", !w.document.getElementById("fb-prof-go"));

  // 3. The click AUTO-reads e-Fatura -> stores locally -> nonce-bound /perfil handoff.
  let store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("e-Fatura auto-read + stored as done", store.partitions && store.partitions.efatura && store.partitions.efatura.status === "done");
  ok("e-Fatura counts parsed (2 pending of 3)", store.partitions.efatura.data.porClassificar === 2 && store.partitions.efatura.data.totalFaturas === 3);
  ok("e-Fatura uses the v3 browser handoff", w.__handoffs.some(h => h.partition === "efatura" && h.contract === 3));
  ok("accepted handoff is remembered on the official origin", store.partitions.efatura.handoff.status === "accepted");

  // 3b. A rejected intake leaves the already-local read available. Clicking the bookmarklet again
  //     retries its handoff automatically; it does not show or require a buried Guardar button.
  w = mkEnv("faturas.portaldasfinancas.gov.pt", true, fetchOK);
  w.__profileReply = "rejected";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  const firstCapturedAt = store.partitions.efatura.fetchedAt;
  ok("failed handoff is retained for automatic retry", store.partitions.efatura.handoff.status === "error");
  w.__profileReply = "accepted";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("second bookmarklet click auto-retries without rereading",
    w.__handoffs.length === 2 && store.partitions.efatura.fetchedAt === firstCapturedAt &&
    store.partitions.efatura.handoff.status === "accepted" && !w.document.getElementById("fb-save-profile"));

  // 4. On Imoveis (a DIFFERENT origin) the browser gives fresh localStorage - modelled by mkEnv's
  //    new _d each call, which is exactly the same-origin policy. The bookmarklet invocation still
  //    auto-reads without a second consent and hands off through canonical /perfil.
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchOK, "/arrendamento/consultarContratos/locador");
  eval(SRC); await wait();
  ok("cross-origin: no duplicate consent on Imoveis", !w.document.getElementById("fb-prof-go"));
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rendas auto-read + stored as done", store.partitions.rendas && store.partitions.rendas.status === "done");
  ok("rendas: 1 active contract", store.partitions.rendas.data.activos === 1);

  // 4b. The full local result moves only through postMessage, never in a URL.
  {
    const hand = w.__handoffs.find(h => h.partition === "rendas");
    ok("rendas uses the v3 browser handoff", !!hand);
    ok("handoff payload carries the partition summary", hand && hand.data.activos === 1 && hand.data.contratos === 1);
    ok("handoff payload has NO nif/name values", hand && !JSON.stringify(hand.data).match(/nomeLocador|nomeLocatario|nif/i));
  }

  // 4c. situacao fiscal partition (sitfiscal /geral): reads dividas/coimas/agenda, hands off
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/geral/dashboard");
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("situacao picked on /geral (not irs)", store.partitions.situacao && store.partitions.situacao.status === "done" && !store.partitions.irs);
  ok("situacao: 0 dividas, 1 agenda item", store.partitions.situacao.data.dividas.n === 0 && store.partitions.situacao.data.agenda.n === 1);
  ok("situacao hands off to /perfil", w.__handoffs.some(h => h.partition === "situacao"));

  // 4c-2. IRS partition: SAME host as situacao (sitfiscal) but /inffin path -> picks irs
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/inffin/entrada.html");
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("irs picked on /inffin (not situacao)", store.partitions.irs && store.partitions.irs.status === "done" && !store.partitions.situacao);
  ok("irs: 3 liquidacoes, 1 reembolso", store.partitions.irs.data.liquidacoes === 3 && store.partitions.irs.data.reembolsos === 1);

  // 4c-3. recibos verdes (SIRE, irs host): Cat B signal
  w = mkEnv("irs.portaldasfinancas.gov.pt", true, fetchOK, "/recibos/portal");
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("recibos auto-read + stored", store.partitions.recibos && store.partitions.recibos.status === "done");
  ok("recibos: 2 recibos verdes", store.partitions.recibos.data.recibosVerdes === 2);
  {
    const d = w.__handoffs.find(h => h.partition === "recibos");
    ok("recibos hands off with Cat B derivable", d && d.data.recibosVerdes === 2);
  }

  // 4c-4. Seguranca Social (seg-social.pt - DIFFERENT domain). NISS is used to build the URL but
  //       must NEVER be stored (PII). estado + payment count only.
  w = mkEnv("www.seg-social.pt", true, fetchOK, "/ptss/pssd/home");
  eval(SRC); await wait();
  ok("SS: profiling auto-reads on seg-social.pt", !w.document.getElementById("fb-prof-go"));
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("SS auto-read + stored", store.partitions.ss && store.partitions.ss.status === "done");
  ok("SS estado REGULARIZADA, 1 pagamento", store.partitions.ss.data.estado === "REGULARIZADA" && store.partitions.ss.data.pagamentosCorrentes === 1);
  // PII: o NISS/nome nao podem ser guardados como VALOR. O `shape` (esqueleto para a contribuicao
  // opt-in) pode conter os NOMES dos campos com o respetivo TIPO ("niss":"str") - isso nao e PII.
  // E o NISS no PATH do endpoint tem de estar redigido como :id (ver recordShape em tool.js).
  var ssJson = JSON.stringify(store.partitions.ss);
  ok("SS: NISS/name values NOT stored", !/11111111111|SECRET NAME/.test(ssJson));
  ok("SS: NISS redacted in endpoint path", !/posicao-atual\/\d/.test(ssJson) && /posicao-atual\/:id/.test(ssJson));
  ok("SS: shape has only field names + types", !/"(?:niss|nome)"\s*:\s*"(?!str"|number"|boolean"|null")/.test(ssJson));
  ok("SS handoff carries NO NISS/name values", !/11111111111|SECRET NAME/.test(JSON.stringify(w.__handoffs)));

  // 4c-5. Declaration history is not current cadastro. A past cessation plus a newer accepted
  //       restart may be scheduled for the future, so the list must not claim open OR closed.
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/atividade/atividade/consultardeclaracoes");
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("atividade read + stored", store.partitions.atividade && store.partitions.atividade.status === "done");
  ok("declaration history does not infer current state", store.partitions.atividade.data.cessada === null);
  ok("latest accepted restart is retained without an effective-date guess",
    store.partitions.atividade.data.ultimaDeclaracaoTipo === "inicio-ou-reinicio" &&
    store.partitions.atividade.data.ultimaDeclaracaoAceite === true);
  ok("atividade IVA regime parsed (trimestral)", /trimestr/i.test(store.partitions.atividade.data.regimeIva || ""));

  // 4c-6. The integrated cadastro compares the latest EFFECTIVE dates. A future start must not
  //       make the account currently open; once a later start is effective it overrides history.
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/integrada/presentation");
  w.document.body.innerHTML = "<div>Atividade em IVA Data de Início 2020-01-01 Data de Cessação 2021-01-01 " +
    "Data de Início 2099-01-01 Tipo de Contabilidade Não organizada</div>";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("future restart remains scheduled, not currently open",
    store.partitions.atividade_integrada.data.estadoAtual === "cessada" &&
    store.partitions.atividade_integrada.data.proximoInicio === "2099-01-01" &&
    store.partitions.atividade_integrada.data.cessada === true);
  ok("integrated cadastro handoff includes its allowlisted DOM schema",
    hasHandoffShape(w, "atividade_integrada"));

  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/integrada/presentation");
  w.document.body.innerHTML = "<div>Atividade em IRS Data de Início 2020-01-01 Data de Cessação 2021-01-01 " +
    "Data de Início 2022-01-01 Tipo de Contabilidade Não organizada</div>";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("later effective restart overrides historical cessation",
    store.partitions.atividade_integrada.data.estadoAtual === "aberta" &&
    store.partitions.atividade_integrada.data.inicio === "2022-01-01" &&
    store.partitions.atividade_integrada.data.cessada === false);

  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/integrada/presentation");
  w.document.body.innerHTML = "<div>Atividade em IVA Data de Início 2099-01-01 Tipo de Contabilidade Não organizada</div>";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("future-only cadastro is scheduled and cannot trigger current Cat B",
    store.partitions.atividade_integrada.data.estadoAtual === "agendada" &&
    store.partitions.atividade_integrada.data.proximoInicio === "2099-01-01" &&
    store.partitions.atividade_integrada.data.cessada === null);

  // A schema_required result from an older favorite must be reread, not retried forever with the
  // same empty envelope.
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/integrada/presentation");
  w.document.body.innerHTML = "<div>Atividade em IVA Data de Início 2024-01-01 Tipo de Contabilidade Não organizada</div>";
  global.localStorage.setItem("fb-profile-v1", JSON.stringify({ partitions:{ atividade_integrada:{
    status:"done", fetchedAt:"2026-08-24T00:00:00.000Z", data:{estadoAtual:"desconhecida"}, shape:{},
    handoff:{status:"error",code:"schema_required"}
  } } }));
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("stale empty-schema result is reread automatically",
    store.partitions.atividade_integrada.data.estadoAtual === "aberta" && hasHandoffShape(w, "atividade_integrada"));

  // On the integrated hub the signed activity screen needs a top-level GET. A bookmarklet cannot
  // survive replacing its own document, so the profile is warned and this official tab navigates;
  // one explicit second bookmarklet click on the signed screen completes the ordinary handoff.
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK, "/integrada/presentation");
  w.document.body.innerHTML = "<a href='/integrada/presentation?targetScreen=ecraActividade&hmac=fixture'>Atividade exercida</a>";
  eval(SRC); await wait(1200);
  ok("integrated hub announces the exceptional second click to the profile",
    w.__continuations.some(message => message.partition === "atividade_integrada"));
  ok("integrated hub performs the signed top-level navigation without a false local completion",
    /targetScreen=ecraActividade/.test(global.location.href) && w.__handoffs.length === 0);

  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK,
    "/integrada/presentation?targetScreen=ecraActividade&hmac=fixture");
  w.document.body.innerHTML = "<div>Atividade em IRS Data de Início 2023-01-01 Tipo de Contabilidade Não organizada</div>";
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("second bookmarklet click completes the signed integrated source",
    store.partitions.atividade_integrada && store.partitions.atividade_integrada.data.estadoAtual === "aberta" &&
    hasHandoffShape(w, "atividade_integrada"));

  // 4d. patrimonio: SAME host as rendas (imoveis) but a /matrizesinter path -> host+path matching
  //     must pick patrimonio, NOT rendas. Proves the disambiguation.
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchOK, "/matrizesinter/web/consultar-patrimonio-predial");
  eval(SRC); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("patrimonio picked (not rendas) on /matrizesinter path", store.partitions.patrimonio && store.partitions.patrimonio.status === "done" && !store.partitions.rendas);
  ok("patrimonio: 1 imovel parsed", store.partitions.patrimonio.data.imoveis === 1 && store.partitions.patrimonio.data.lista[0].artigo === "1234");
  ok("patrimonio hands off to /perfil", w.__handoffs.some(h => h.partition === "patrimonio"));

  // 5. rule 3: HTML 200 on the contracts endpoint => pending, not stored as done
  const fetchHtml = (u) => {
    const s = String(u);
    if (/obterContratos\/locador/.test(s)) return Promise.resolve({ ok: true, headers: { get: () => "text/html" }, text: () => Promise.resolve("<html>login</html>") });
    return fetchOK(u);
  };
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchHtml, "/arrendamento/consultarContratos/locador");
  global.localStorage.removeItem("fb-profile-v1");
  global.localStorage.setItem("fb-profile-consent-v1", JSON.stringify({ ok: true }));
  eval(SRC); await wait();   // consent already set -> auto-reads, which fails on the HTML body
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rule 3: HTML-200 treated as not-logged-in (rendas pending)", !store.partitions.rendas || store.partitions.rendas.status === "pending");
  ok("rule 3: failure is loud on-screen (no console needed)", /Não consegui ler/.test(w.document.getElementById("efh-body").textContent));
  ok("rule 3: no handoff on failure", w.__handoffs.length === 0);

  console.log(failures ? ("\n  " + failures + " FAILED") : "\n  all passed");
  process.exit(failures ? 1 : 0);
})();
