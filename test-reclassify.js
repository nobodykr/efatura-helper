// Pins the WRITE routing with DRAFT off: a PENDING fatura is resolved, an already-ATTRIBUTED one
// is re-classified. Both hit the right action with the right sector field. Never touches a real
// account - fetch is fully mocked. Runs tool.js with DRAFT flipped to false in memory only.
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

// the detalhe page carries BOTH forms, exactly as the real server HTML does
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
  if (s.includes("sectors.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(caemap) });
  if (s.includes("obterDocumentosAdquirente")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ linhas: rows }) });
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
  // R1 (surfacing attributed rows in the table) is not built yet, so the table shows only the
  // pending row. To unit-test the WRITE ROUTING for both states, drive __efhPend directly with one
  // pending and one attributed row and synthesise the two ticked controls applySelected reads.
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
    const alt = byUrl["/alterarDocumentoAdquirente.action"];
    const pendOk = pend && pend.has("ambitoAquisicaoPend") && pend.get("docId") === "p1";
    const altOk = alt && alt.has("ambitoAquisicao") && alt.get("idDocumento") === "r1"
                  && /^C[0-9]{2}$/.test(alt.get("ambitoAquisicao"));
    // and the pending POST must NOT carry the alter field, nor vice-versa
    const noCross = pend && !pend.has("ambitoAquisicao") && alt && !alt.has("ambitoAquisicaoPend");
    console.log("  PENDING -> resolverPendencia + ambitoAquisicaoPend, right doc:", !!pendOk);
    console.log("  ATTRIBUTED -> alterarDocumento + ambitoAquisicao (C-sector), right doc:", !!altOk);
    console.log("  no field crossover between the two paths:", !!noCross);
    const pass = pendOk && altOk && noCross;
    console.log(pass ? "  PASS - reclassification routes correctly" : "  *** FAIL: routing is wrong");
    if (!pass) process.exit(1);
  }, 250);
}, 500);
