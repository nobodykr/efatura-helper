// Pins the safe WRITE boundary with DRAFT off: a PENDING fatura uses its verified resolver form,
// while an already-ATTRIBUTED one remains manual. Later portal investigation proved that
// the raw alterarDocumentoAdquirente form/POST is rejected and the working UI depends on runtime
// fields plus post-state verification. Never touches a real account - fetch is fully mocked.
//   npm i jsdom && node test-reclassify.js [path-to-tool.js]
const { JSDOM } = require("jsdom");
const fs = require("fs");

// r1 already-attributed in C99 (recoverable); p1 still pending
const rows = [
  { estadoBeneficio: "R", nifEmitente: "500960046", nomeEmitente: "Continente",
    actividadeEmitente: "C99", valorTotal: 60000, valorTotalIva: 0,
    dataEmissaoDocumento: "2026-01-10", idDocumento: "r1" },
  { estadoBeneficio: "P", nifEmitente: "503540480", nomeEmitente: "Farm&aacute;cia",
    valorTotal: 10000, valorTotalIva: 600, dataEmissaoDocumento: "2026-06-01", idDocumento: "p1" },
];
const caemap = { "500960046": ["C05", "C99"], "503540480": ["C05", "C99"] };

// Include the obsolete attributed form as a decoy: the tool must not submit it.
function detalhe(id) {
  return `<form action="resolverPendenciaAdquirente.action" id="resolverPendencia">
            <input type="hidden" name="docId" value="${id}">
            <input type="hidden" name="ambitoAquisicaoPend" value=""></form>
          <form action="alterarDocumentoAdquirente.action">
            <input type="hidden" name="idDocumento" value="${id}">
            <input type="hidden" name="dataEmissaoDocumentoOriginal" value="2026-01-10">
            <input type="hidden" name="ambitoAquisicao" value=""></form>`;
}

const posted = [];
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://faturas.portaldasfinancas.gov.pt/x" });
const { window } = dom;
global.window = window; global.document = window.document; global.location = window.location;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
window.localStorage = global.localStorage;
global.crypto = { getRandomValues: a => a, subtle: {} };
global.TextEncoder = require("util").TextEncoder;
global.DOMParser = window.DOMParser; global.alert = () => {};
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.fetch = (u, opt) => {
  const s = String(u);
  // Same slice mock as the other tests: the tool asks for /bucket/<last 3 digits>, never the map.
  if (s.includes("/api/v1/map/buckets/")) {
    const b = s.split("/api/v1/map/buckets/")[1].split("?")[0];
    const out = {};
    for (const k in caemap) if (k.slice(-3) === b) out[k] = caemap[k];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(out) });
  }
  if (s.includes("sectors.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(caemap) });
  if (s.includes("obterDocumentosAdquirente")) return Promise.resolve({ ok: true, headers: { get: () => "application/json" }, text: () => Promise.resolve(JSON.stringify({ linhas: rows })) });
  if (s.includes("detalheDocumentoAdquirente")) {
    const id = (s.match(/idDocumento=([^&]+)/) || [])[1];
    return Promise.resolve({ ok: true, text: () => Promise.resolve(detalhe(id)) });
  }
  if (/resolverPendenciaAdquirente\.action$/.test(s) || /alterarDocumentoAdquirente\.action$/.test(s)) {
    posted.push({ url: s.replace(/^.*gov\.pt/, ""), body: opt.body });
    return Promise.resolve({ ok: true, text: () => Promise.resolve("operacao com sucesso") });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
};
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: false }));

// The whole point of this test is the !DRAFT path. Flip the flag in memory only - the shipped
// file stays DRAFT=true and test-draft.js guards that.
let src = fs.readFileSync(process.argv[2] || "/mnt/data/apps/efatura-helper/tool.js", "utf8");
if (!/var DRAFT = true;/.test(src)) { console.log("  *** FAIL: could not find DRAFT flag to flip"); process.exit(1); }
src = src.replace("var DRAFT = true;", "var DRAFT = false;");
eval(src);

setTimeout(() => {
  const d = window.document;
  const btn = d.getElementById("efh-apply");
  console.log("  apply button present with DRAFT off:", !!btn);
  if (!btn) { console.log("  *** FAIL"); process.exit(1); }
  // R1 (surfacing already-attributed rows for correction) IS built - see tool.js where
  // window.__efhPend is set to the actionable list, and test-r1.js which covers it. This comment
  // used to say it was "not built yet", which told a reader the tool lacked a feature it has.
  // We still drive __efhPend directly here rather than through the UI, because this test is about
  // the write boundary for both states in isolation: one pending + one attributed row, with the two
  // ticked controls applySelected reads synthesised.
  window.__efhPend = [rows[1], rows[0]];   // [0]=pending p1, [1]=attributed r1
  d.querySelector("#efh-pane-d").insertAdjacentHTML("beforeend",
    '<input type="checkbox" class="efh-ck" data-i="0" checked>' +
    '<select class="efh-sec" data-i="0"><option value="C05" selected>x</option></select>' +
    '<input type="checkbox" class="efh-ck" data-i="1" checked>' +
    '<select class="efh-sec" data-i="1"><option value="C05" selected>x</option></select>');
  btn.click();
  setTimeout(() => {
    console.log("  requests POSTed:", posted.length);
    const byUrl = {};
    posted.forEach(p => { byUrl[p.url] = new URLSearchParams(p.body); });
    const pend = byUrl["/resolverPendenciaAdquirente.action"];
    const pendOk = pend && pend.has("ambitoAquisicaoPend") && pend.get("docId") === "p1";
    const noAlter = !byUrl["/alterarDocumentoAdquirente.action"];
    const noCross = pend && !pend.has("ambitoAquisicao");
    console.log("  PENDING -> resolverPendencia + ambitoAquisicaoPend, right doc:", !!pendOk);
    console.log("  ATTRIBUTED -> no obsolete raw alter POST:", !!noAlter);
    console.log("  pending request has no attributed-sector field:", !!noCross);
    const onlyPending = posted.length >= 1 &&
      posted.every(p => p.url === "/resolverPendenciaAdquirente.action");
    const pass = onlyPending && pendOk && noAlter && noCross;
    console.log(pass ? "  PASS - only the verified pending route can write" : "  *** FAIL: write boundary is wrong");
    if (!pass) process.exit(1);
  }, 250);
}, 500);
