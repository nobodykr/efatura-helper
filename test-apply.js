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
eval(fs.readFileSync(process.argv[2] || "/mnt/data/apps/efatura-helper/tool.js","utf8"));

setTimeout(()=>{
  const d=window.document;
  const cks=[...d.querySelectorAll(".efh-ck")], sels=[...d.querySelectorAll(".efh-sec")];
  console.log("pending rows:", cks.length);
  console.log("auto-suggested:", sels.map(s=>s.value).join(", "));
  // user removes the supermarket row and moves the cafe to C99 by hand
  cks[2].checked=false; cks[2].onchange&&cks[2].onchange();
  sels[1].value="C99"; sels[1].onchange&&sels[1].onchange();
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
      new URLSearchParams(posted.find(b=>new URLSearchParams(b).get("docId")==="p2")).get("ambitoAquisicaoPend")==="C99"?"YES":"*** NO ***");
    console.log("   status line:", d.getElementById("efh-status").textContent);
  }, 600);
}, 400);
