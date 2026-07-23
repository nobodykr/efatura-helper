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
  global.window = window; global.document = window.document; global.location = window.location;
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
  if (/obterContratos\/locador/.test(s)) return json({ contratos: [{ referencia: "C1", estado: "Activo", valorRenda: 65000 }] });
  if (/obterRecibos\/emitente/.test(s)) return json({ recibos: [{ valor: 65000 }, { valor: 65000 }] });
  if (/sectors\.json|\/bucket\//.test(s)) return json({});
  return json({ linhas: [] });
}

function wait() { return new Promise(r => setTimeout(r, 30)); }

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

  // 3. accept -> read e-Fatura -> stored
  w.document.getElementById("fb-prof-go").click(); await wait();
  ok("after accept: read button shown", !!w.document.getElementById("fb-read"));
  w.document.getElementById("fb-read").click(); await wait();
  let store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("e-Fatura stored as done", store.partitions && store.partitions.efatura && store.partitions.efatura.status === "done");
  ok("e-Fatura counts parsed (2 pending of 3)", store.partitions.efatura.data.porClassificar === 2 && store.partitions.efatura.data.totalFaturas === 3);
  ok("overlay rendered", /Resumo do perfil/.test(w.document.getElementById("efh-body").textContent));

  // 4. On Imoveis (a DIFFERENT origin) the browser gives fresh localStorage - modelled by mkEnv's
  //    new _d each call, which is exactly the same-origin policy. So: consent asked again, and the
  //    rendas read populates THIS origin's store only. Cross-origin assembly is a known limit; see
  //    the constraint note in tool.js.
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchOK);
  eval(SRC); await wait();
  ok("cross-origin: consent asked again on Imoveis (separate localStorage)", !!w.document.getElementById("fb-prof-go"));
  w.document.getElementById("fb-prof-go").click(); await wait();
  const rb = w.document.getElementById("fb-read");
  ok("on Imoveis: read button present", !!rb);
  rb.click(); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rendas stored as done", store.partitions.rendas && store.partitions.rendas.status === "done");
  ok("rendas: 1 active contract", store.partitions.rendas.data.activos === 1);
  ok("Cat F in overlay", /Cat\. F/.test(w.document.getElementById("efh-body").textContent));

  // 5. rule 3: HTML 200 on the contracts endpoint => pending, not stored as done
  const fetchHtml = (u) => {
    const s = String(u);
    if (/obterContratos\/locador/.test(s)) return Promise.resolve({ ok: true, headers: { get: () => "text/html" }, text: () => Promise.resolve("<html>login</html>") });
    return fetchOK(u);
  };
  w = mkEnv("imoveis.portaldasfinancas.gov.pt", true, fetchHtml);
  global.localStorage.removeItem("fb-profile-v1");
  global.localStorage.setItem("fb-profile-consent-v1", JSON.stringify({ ok: true }));
  eval(SRC); await wait();
  w.document.getElementById("fb-read").click(); await wait();
  store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
  ok("rule 3: HTML-200 treated as not-logged-in (rendas pending)", !store.partitions.rendas || store.partitions.rendas.status === "pending");

  console.log(failures ? ("\n  " + failures + " FAILED") : "\n  all passed");
  process.exit(failures ? 1 : 0);
})();
