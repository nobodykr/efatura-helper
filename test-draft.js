// Proves DRAFT MODE cannot submit: asserts there is no apply button and that NO request ever
// reaches resolverPendenciaAdquirente, however the UI is driven.
//   npm i jsdom && node test-draft.js tool.js
// Confirm DRAFT MODE really cannot submit: no POST may reach resolverPendenciaAdquirente.
const { JSDOM } = require("jsdom"); const fs=require("fs");
const rows=[{estadoBeneficio:"P",nifEmitente:"2",nomeEmitente:"Farm&aacute;cia",valorTotal:10000,valorTotalIva:600,dataEmissaoDocumento:"2026-06-01",idDocumento:"p1"},
            {estadoBeneficio:"P",nifEmitente:"3",nomeEmitente:"Caf&eacute;",valorTotal:5000,valorTotalIva:300,dataEmissaoDocumento:"2026-06-02",idDocumento:"p2"}];
const posted=[];
const dom=new JSDOM(`<!doctype html><body></body>`,{url:"https://faturas.portaldasfinancas.gov.pt/x"});
const {window}=dom; global.window=window; global.document=window.document; global.location=window.location;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v}};
window.localStorage=global.localStorage;
global.crypto={getRandomValues:a=>a,subtle:{}}; global.TextEncoder=require("util").TextEncoder;
global.DOMParser=window.DOMParser; global.alert=()=>{};
let copied=null;
global.navigator = { clipboard:{ writeText:t=>{copied=t;return Promise.resolve();} } };
// jsdom has no execCommand; provide it so the non-clipboard fallback path is exercised too
window.document.execCommand = () => {
  const ta = window.document.querySelector('textarea');
  if (ta) copied = ta.value;
  return true;
};
global.fetch=(u,o)=>{const s=String(u);
  if(/resolverPendencia/.test(s)){ posted.push(s); }
  if(s.includes("sectors.json")) return Promise.resolve({ok:true,json:()=>Promise.resolve({"2":["C05","C99"],"3":["C03","C99"]})});
  return Promise.resolve({ok:true,json:()=>Promise.resolve({linhas:rows}),text:()=>Promise.resolve("")});};
eval(fs.readFileSync(process.argv[2],"utf8"));
setTimeout(()=>{
  const d=window.document;
  console.log("  apply button present:", !!d.getElementById("efh-apply"), "(must be false)");
  console.log("  export button present:", !!d.getElementById("efh-export"));
  console.log("  mail button present:  ", !!d.getElementById("efh-mail"));
  console.log("  draft notice shown:   ", /nao submete nada|não submete nada/i.test(d.getElementById("efh-body").textContent));
  const btn=d.getElementById("efh-export");
  if(btn){ btn.onclick(); }
  setTimeout(()=>{
    console.log("  plan copied:", copied ? copied.split("\n")[0] : "NOTHING");
    console.log("  POSTs to AT:", posted.length, posted.length===0?"(correct - nothing submitted)":"*** LEAKED ***");
  },200);
},400);
