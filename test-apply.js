// Headless test of the APPLY path - what actually gets POSTed to e-Fatura.
// Checks unticked rows are excluded, hand-edited sectors win over suggestions, and the
// per-document hidden form fields are carried through. Needs jsdom.
//   npm i jsdom && node test-apply.js [path-to-tool.js]
// Drive the APPLY path: what actually gets POSTed to e-Fatura for the ticked rows.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const rows = [
  { estadoBeneficio:"R", nifEmitente:"1", nomeEmitente:"Superm&atilde;o", actividadeEmitente:"C99",
    valorTotal:60000, valorTotalIva:0, dataEmissaoDocumento:"2026-01-10", idDocumento:"r1" },
  { estadoBeneficio:"P", nifEmitente:"2", nomeEmitente:"Farm&aacute;cia X",
    valorTotal:10000, valorTotalIva:600, dataEmissaoDocumento:"2026-06-01", idDocumento:"p1" },
  { estadoBeneficio:"P", nifEmitente:"3", nomeEmitente:"Caf&eacute;",
    valorTotal:5000, valorTotalIva:300, dataEmissaoDocumento:"2026-06-02", idDocumento:"p2" },
  { estadoBeneficio:"P", nifEmitente:"1", nomeEmitente:"Superm&atilde;o",
    valorTotal:4000, valorTotalIva:200, dataEmissaoDocumento:"2026-06-03", idDocumento:"p3" },
];
const caemap = { "1":["C99"], "2":["C05","C99"], "3":["C03","C99"] };
const posted = [];
const dom = new JSDOM(`<!doctype html><body></body>`, { url:"https://faturas.portaldasfinancas.gov.pt/x" });
const { window } = dom;
global.window=window; global.document=window.document; global.location=window.location;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v}};
window.localStorage=global.localStorage;
global.crypto={getRandomValues:a=>a,subtle:{}}; global.TextEncoder=require("util").TextEncoder;
global.DOMParser = window.DOMParser;
global.alert=()=>{};
global.fetch = (u, opt) => {
  const s = String(u);
  if (s.includes("sectors.json")) return Promise.resolve({ok:true,json:()=>Promise.resolve(caemap)});
  if (s.includes("obterDocumentosAdquirente")) return Promise.resolve({ok:true,json:()=>Promise.resolve({linhas:rows})});
  if (s.includes("detalheDocumentoAdquirente")) {
    const id = (s.match(/idDocumento=([^&]+)/)||[])[1];
    return Promise.resolve({ok:true, text:()=>Promise.resolve(
      `<form id="resolverPendencia"><input type="hidden" name="docId" value="${id}">
       <input type="hidden" name="csrf" value="tok-${id}"></form>`)});
  }
  if (s.includes("resolverPendenciaAdquirente")) {
    posted.push(opt.body);
    return Promise.resolve({ok:true, text:()=>Promise.resolve("operacao com sucesso")});
  }
  return Promise.resolve({ok:true,json:()=>Promise.resolve({}),text:()=>Promise.resolve("")});
};
// The consent gate (tool.js) blocks all reads until accepted. Seed a prior acceptance so
// these tests exercise the RETURNING-USER path; test-network.js phase 1 covers the gate itself.
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ok:true,share:false}));
// This test exercises the !DRAFT apply path, so it must flip the flag in memory - same trick as
// test-reclassify.js. Without it, #efh-apply does not exist and line ~58 threw "Cannot read
// properties of null": a public file that crashed on the repo's own shipped tool, and had
// therefore been verifying nothing since DRAFT was turned on. The file on disk stays DRAFT=true;
// test-draft.js guards that.
{
  const p = process.argv[2] || __dirname + "/tool.js";
  const src = fs.readFileSync(p, "utf8");
  if (!/var DRAFT = true;/.test(src)) { console.log("  *** FAIL: could not find DRAFT flag to flip"); process.exit(1); }
  eval(src.replace("var DRAFT = true;", "var DRAFT = false;"));
}

setTimeout(()=>{
  const d=window.document;
  const cks=[...d.querySelectorAll(".efh-ck")], sels=[...d.querySelectorAll(".efh-sec")];
  console.log("pending rows:", cks.length);
  console.log("auto-suggested:", sels.map(s=>s.value).join(", "));
  // User removes the supermarket row, and moves the cafe to C03 by hand.
  // The override MUST differ from the auto-suggestion or the assertion below proves nothing:
  // the cafe (nif 3) is registered for C03 and C99, and the tool suggests C99 - so C03 is a
  // genuine user override. This used to set "C99", the value the tool had already chosen, so
  // "hand-edited sector honoured" passed without ever exercising an override.
  cks[2].checked=false; cks[2].onchange&&cks[2].onchange();
  sels[1].value="C03"; sels[1].onchange&&sels[1].onchange();
  console.log("after edits   :", sels.map((s,i)=>s.value+(cks[i].checked?"":"[unticked]")).join(", "));
  d.getElementById("efh-apply").click();
  setTimeout(()=>{
    console.log("\nPOSTed to e-Fatura:", posted.length, "(expected 2 - the unticked one must NOT be sent)");
    posted.forEach(b=>{
      const p=new URLSearchParams(b);
      console.log("   doc="+p.get("docId")+" csrf="+p.get("csrf")+" sector="+p.get("ambitoAquisicaoPend"));
    });
    const sent=posted.map(b=>new URLSearchParams(b).get("docId"));
    console.log("\n   unticked row excluded?:", sent.includes("p3")?"*** NO - BUG ***":"YES");
    console.log("   hand-edited sector honoured?:",
      new URLSearchParams(posted.find(b=>new URLSearchParams(b).get("docId")==="p2")).get("ambitoAquisicaoPend")==="C03"?"YES":"*** NO ***");
    console.log("   status line:", d.getElementById("efh-status").textContent);
  }, 600);
}, 400);
