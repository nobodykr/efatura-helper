// The two suggestion columns must answer DIFFERENT questions, and the pre-selected one must be
// the truthful one. Defaulting to whatever pays most would nudge people into declaring groceries
// as Saude just because a hypermarket holds a pharmacy CAE.
//   node test-columns.js tool.js
const { JSDOM } = require("jsdom"); const fs=require("fs");
// A hypermarket: primary CAE is general retail (C99), but it also holds a pharmacy CAE (C05).
// C99 is 35% of the total capped at 250; C05 is 15% of the total capped at 1000.
const rows=[
  // already registered elsewhere, enough to FILL the 250 EUR despesas gerais ceiling (35% of 1000)
  {estadoBeneficio:"R",nifEmitente:"500000008",actividadeEmitente:"C99",nomeEmitente:"Outro",valorTotal:100000,valorTotalIva:0,dataEmissaoDocumento:"2026-01-05",idDocumento:"r1"},
  // the pending one: C99 now pays nothing, so the optimiser should reach for the pharmacy CAE
  {estadoBeneficio:"P",nifEmitente:"500000009",nomeEmitente:"Hipermercado",valorTotal:20000,valorTotalIva:1200,dataEmissaoDocumento:"2026-06-01",idDocumento:"p1"}];
const posted=[];
const dom=new JSDOM(`<!doctype html><body></body>`,{url:"https://faturas.portaldasfinancas.gov.pt/x"});
const {window}=dom; global.window=window; global.document=window.document; global.location=window.location;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v}};
window.localStorage=global.localStorage;
global.crypto={getRandomValues:a=>a,subtle:{}}; global.TextEncoder=require("util").TextEncoder;
global.DOMParser=window.DOMParser; global.alert=()=>{}; global.Event=window.Event;
global.navigator={clipboard:{writeText:()=>Promise.resolve()}};
window.document.execCommand=()=>true;
global.fetch=(u,o)=>{const s=String(u);
  if(/resolverPendencia/.test(s)){ posted.push(s); }
  var CAEMAP={"500000009":["C99","C05"]}; if(s.includes("/bucket/")){var _b=s.split("/bucket/")[1].split("?")[0];var _o={};for(var _k in CAEMAP){if(_k.slice(-3)===_b)_o[_k]=CAEMAP[_k];}return Promise.resolve({ok:true,json:()=>Promise.resolve(_o)});} if(s.includes("sectors.json")) return Promise.resolve({ok:true,json:()=>Promise.resolve(CAEMAP)});
  return Promise.resolve({ok:true,json:()=>Promise.resolve({linhas:rows}),text:()=>Promise.resolve("")});};
// The consent gate (tool.js) blocks all reads until accepted. Seed a prior acceptance so
// these tests exercise the RETURNING-USER path; test-network.js phase 1 covers the gate itself.
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ok:true,share:false}));
eval(fs.readFileSync(process.argv[2],"utf8"));
setTimeout(()=>{
  const d=window.document;
  const heads=[...d.querySelectorAll("th")].map(t=>t.textContent.trim()).filter(Boolean);
  console.log("  columns:", heads.join(" | "));
  console.log("  both suggestion columns:", heads.some(h=>h.normalize("NFD").replace(/[\u0300-\u036f]/g,"")==="Provavel") && heads.includes("Otimizada"));
  const picks=[...d.querySelectorAll(".efh-pick")].map(b=>b.dataset.sec);
  console.log("  suggestions offered:", picks.join(" vs ")||"(none)");
  console.log("  they DIVERGE (not decorative):", new Set(picks).size>1);
  const sel=d.querySelector(".efh-sec");
  // Default is OTIMIZADA (changed 20-07-2026). It must equal the Otimizada button's sector,
  // and that sector must be one the merchant is really registered for - the point of the
  // change was to show the benefit, not to invent a sector.
  const optBtn=[...d.querySelectorAll(".efh-pick")].find(b=>b.style.borderColor.includes("128a3a")||/128a3a/.test(b.getAttribute("style")||""));
  const optSec=optBtn&&optBtn.dataset.sec;
  console.log("  pre-selected:", sel&&sel.value, "| equals Otimizada:", !!optSec&&sel&&sel.value===optSec);
  console.log("  merchant really registered for it:", !!optSec&&(["C05","C99"].includes(optSec)));
  const opt=[...d.querySelectorAll(".efh-pick")].find(b=>b.dataset.sec!=="C99");
  if(opt){ opt.click(); console.log("  after clicking Otimizada:", sel.value, "(expected C05)"); }
  else console.log("  *** no divergent suggestion to click ***");
  console.log("  POSTs to AT:", posted.length, posted.length===0?"(correct)":"*** LEAKED ***");
},500);
