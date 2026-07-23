// Profiling flow (SPEC-profiling.md). Proves:
//   1. Without window.__FB_PROFILE the classifier runs and profiling never activates.
//   2. With the flag, a consent gate appears; nothing is read or stored before accept.
//   3. After accept, reading the current partition (e-Fatura, then Imoveis/rendas) stores it in
//      the fb-profile-v1 localStorage key, and the assembled overlay reflects it.
//   4. Rule 3: an HTML body (login redirect) with HTTP 200 is treated as "not logged in", not data.
//   node test-profiling.js tool.js
const { JSDOM } = require("jsdom"); const fs = require("fs");
const SRC = fs.readFileSync(process.argv[2], "utf8");
let failures = 0;
function ok(name, cond) { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failures++; }

function mkEnv(host, flag, fetchImpl) {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://" + host + "/x" });
  const { window } = dom;
  global.window = window; global.document = window.document;
  // Replace `location` with a plain capturing stub: tool.js reads location.host and, on a
  // successful read, sets location.href to the /perfil handoff URL. jsdom's real location would
  // try to navigate; this records the target instead so we can assert on it.
  window.__nav = null;
  const loc = { host: host, hash: "", pathname: "/x", assign(v) { window.__nav = v; } };
  Object.defineProperty(loc, "href", { get() { return "https://" + host + "/x"; }, set(v) { window.__nav = v; } });
  global.location = loc;
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  window.localStorage = global.localStorage;
  global.alert = () => {}; global.navigator = window.navigator; global.DOMParser = window.DOMParser;
  global.fetch = fetchImpl;
  if (flag) window.__FB_PROFILE = 1; else { try { delete window.__FB_PROFILE; } catch (e) {} }
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
  if (/sectors\.json|\/bucket\//.test(s)) return json({});
  return json({ linhas: [] });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms || 900)); }

(async () => {
  // 1. no flag -> classifier path, no profiling consent key touched
  let w = mkEnv("faturas.portaldasfinancas.gov.pt", false, fetchOK);
  global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));
  eval(SRC); await wait();
  ok("no flag: classifier runs (no fb-prof consent gate)", !w.document.getElementById("fb-prof-go"));

  // 2. flag on e-Fatura -> consent gate, nothing stored yet
  w = mkEnv("faturas.portaldasfinancas.gov.pt", true, fetchOK);
  eval(SRC); await wait();
  ok("flag: consent gate shown", !!w.document.getElementById("fb-prof-go"));
  ok("flag: nothing stored before accept", global.localStorage.getItem("fb-profile-v1") == null);

  // 3. accept -> AUTO-reads e-Fatura -> stored -> auto-navigates to the /perfil handoff
  w.document.getElementById("fb-prof-go").click(); await wait();
  let store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("e-Fatura auto-read + stored as done", store.partitions && store.partitions.efatura && store.partitions.efatura.status === "done");
  ok("e-Fatura counts parsed (2 pending of 3)", store.partitions.efatura.data.porClassificar === 2 && store.partitions.efatura.data.totalFaturas === 3);
  ok("auto-navigates to /perfil handoff (efatura)", /faturas\.diogoandrade\.com\/perfil#p=efatura&d=/.test(w.__nav || ""));

  // 4. On Imoveis (a DIFFERENT origin) the browser gives fresh localStorage - modelled by mkEnv's
  //    new _d each call, which is exactly the same-origin policy. So: consent asked again, then the
  //    rendas read populates THIS origin's store and hands off. Cross-origin assembly is a known
  //    limit that the /perfil fragment handoff exists to bridge.
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchOK);
  eval(SRC); await wait();
  ok("cross-origin: consent asked again on Imoveis (separate localStorage)", !!w.document.getElementById("fb-prof-go"));
  w.document.getElementById("fb-prof-go").click(); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rendas auto-read + stored as done", store.partitions.rendas && store.partitions.rendas.status === "done");
  ok("rendas: 1 active contract", store.partitions.rendas.data.activos === 1);

  // 4b. handoff: the auto-navigation URL points at /perfil with the data in the URL FRAGMENT
  //     (never sent to a server), so /perfil can merge it. Payload carries no nif/name.
  {
    const hand = w.__nav || "";
    ok("auto-navigates to /perfil handoff (rendas, fragment)", /faturas\.diogoandrade\.com\/perfil#p=rendas&d=/.test(hand));
    if (hand) {
      const d = JSON.parse(Buffer.from(decodeURIComponent(hand.split("&d=")[1]), "base64").toString("utf8"));
      ok("handoff payload carries the partition summary", d.activos === 1 && d.contratos === 1);
      ok("handoff payload has NO nif/name fields", !JSON.stringify(d).match(/nomeLocador|nomeLocatario|nif/i));
    }
  }

  // 4c. situacao fiscal partition (sitfiscal): reads dividas/coimas/agenda, hands off
  w = mkEnv("sitfiscal.portaldasfinancas.gov.pt", true, fetchOK);
  eval(SRC); await wait();
  w.document.getElementById("fb-prof-go").click(); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("situacao auto-read + stored", store.partitions.situacao && store.partitions.situacao.status === "done");
  ok("situacao: 0 dividas, 1 agenda item", store.partitions.situacao.data.dividas.n === 0 && store.partitions.situacao.data.agenda.n === 1);
  ok("situacao hands off to /perfil", /perfil#p=situacao&d=/.test(w.__nav || ""));

  // 5. rule 3: HTML 200 on the contracts endpoint => pending, not stored as done
  const fetchHtml = (u) => {
    const s = String(u);
    if (/obterContratos\/locador/.test(s)) return Promise.resolve({ ok: true, headers: { get: () => "text/html" }, text: () => Promise.resolve("<html>login</html>") });
    return fetchOK(u);
  };
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchHtml);
  global.localStorage.removeItem("fb-profile-v1");
  global.localStorage.setItem("fb-profile-consent-v1", JSON.stringify({ ok: true }));
  eval(SRC); await wait();   // consent already set -> auto-reads, which fails on the HTML body
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rule 3: HTML-200 treated as not-logged-in (rendas pending)", !store.partitions.rendas || store.partitions.rendas.status === "pending");
  ok("rule 3: failure is loud on-screen (no console needed)", /Não consegui ler/.test(w.document.getElementById("efh-body").textContent));
  ok("rule 3: no navigation on failure", !w.__nav);

  console.log(failures ? ("\n  " + failures + " FAILED") : "\n  all passed");
  process.exit(failures ? 1 : 0);
})();
