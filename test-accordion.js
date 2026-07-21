const { JSDOM } = require("jsdom"); const fs=require("fs");
// registered invoices push C99 well past its cap, so the accordion should auto-open
const rows=[{estadoBeneficio:"R",nifEmitente:"1",nomeEmitente:"Super",actividadeEmitente:"C99",valorTotal:400000,valorTotalIva:0,dataEmissaoDocumento:"2026-01-10",idDocumento:"r1"},
            {estadoBeneficio:"P",nifEmitente:"2",nomeEmitente:"Farm",valorTotal:10000,valorTotalIva:600,dataEmissaoDocumento:"2026-06-01",idDocumento:"p1"}];
const dom=new JSDOM(`<!doctype html><body></body>`,{url:"https://faturas.portaldasfinancas.gov.pt/x"});
const {window}=dom; global.window=window; global.document=window.document; global.location=window.location;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)}}; window.localStorage=global.localStorage;
global.crypto={getRandomValues:a=>a,subtle:{}}; global.TextEncoder=require("util").TextEncoder;
global.navigator={clipboard:{writeText:()=>Promise.resolve()}}; global.alert=()=>{};
global.fetch=u=>String(u).includes("sectors.json")
 ? Promise.resolve({ok:true,json:()=>Promise.resolve({"1":["C99"],"2":["C05","C99"]})})
 : Promise.resolve({ok:true,json:()=>Promise.resolve({linhas:rows}),text:()=>Promise.resolve("")});
// The consent gate (tool.js) blocks all reads until accepted. Seed a prior acceptance so
// these tests exercise the RETURNING-USER path; test-network.js phase 1 covers the gate itself.
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ok:true,share:false}));
eval(fs.readFileSync(process.argv[2],"utf8"));
setTimeout(()=>{
  const d=window.document, det=d.querySelector("#efh-bars details");
  console.log("  accordion present:", !!det);
  console.log("  auto-open when a ceiling is exceeded:", det && det.open);
  console.log("  summary:", det ? det.querySelector("summary").textContent.replace(/\s+/g," ").trim().slice(0,90) : "-");
  console.log("  meters inside:", det ? det.querySelectorAll('[role=progressbar]').length : 0);
  // collapsing then re-rendering must keep it collapsed
  det.open=false;
  const ck=d.querySelector(".efh-ck"); ck.checked=false; ck.onchange();
  console.log("  stays collapsed after a re-render:", !d.querySelector("#efh-bars details").open);
},400);
