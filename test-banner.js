// Headless check that the referral banner ACTUALLY renders: the SVG icon was silently dropped
// once because an extraction regex matched nothing and I only grepped the source, which said
// "referral link present" while the logo was an empty blue square. Assert on the DOM instead.
//   npm i jsdom && node test-banner.js tool.js
const { JSDOM } = require("jsdom"); const fs=require("fs");
const rows=[{estadoBeneficio:"P",nifEmitente:"500000002",nomeEmitente:"X",valorTotal:1000,valorTotalIva:100,
             dataEmissaoDocumento:"2026-06-01",idDocumento:"p1"}];
const dom=new JSDOM(`<!doctype html><body></body>`,{url:"https://faturas.portaldasfinancas.gov.pt/x"});
const {window}=dom; global.window=window; global.document=window.document; global.location=window.location;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v}};
window.localStorage=global.localStorage;
global.crypto={getRandomValues:a=>a,subtle:{}}; global.TextEncoder=require("util").TextEncoder;
global.alert=()=>{};
global.fetch=(u)=>String(u).includes("sectors.json")
  ? Promise.resolve({ok:true,json:()=>Promise.resolve({"500000002":["C05","C99"]})})
  : Promise.resolve({ok:true,json:()=>Promise.resolve({linhas:rows}),text:()=>Promise.resolve("")});
// The consent gate (tool.js) blocks all reads until accepted. Seed a prior acceptance so
// these tests exercise the RETURNING-USER path; test-network.js phase 1 covers the gate itself.
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ok:true,share:false}));
eval(fs.readFileSync(process.argv[2],"utf8"));
setTimeout(()=>{
  const svg=window.document.querySelector("#efh-body svg");
  const link=window.document.querySelector('a[href*="referral-code"]');
  console.log("  svg rendered in panel:", !!svg, svg?`(${svg.getAttribute("viewBox")})`:"");
  console.log("  svg has artwork:", svg ? svg.querySelectorAll("path,polygon,g").length+" nodes" : "n/a");
  console.log("  referral link present:", !!link);
  // The sponsor strip moved OUT of the top: it now lives at the BOTTOM of the Resumo pane, so the
  // user sees the result first and the ask comes after the value. Assert it is inside #efh-pane-r
  // and is NOT the panel's first child anymore.
  const pane = window.document.querySelector("#efh-pane-r");
  const inResumoPane = !!(pane && link && pane.contains(link));
  const notFirstChild = !window.document.querySelector("#efh-body").firstElementChild?.contains(link);
  console.log("  banner in Resumo pane (not at top):", inResumoPane && notFirstChild);
  if (!(svg && link && inResumoPane && notFirstChild)) { console.log("  *** FAIL"); process.exit(1); }
  console.log("  PASS");
},400);
