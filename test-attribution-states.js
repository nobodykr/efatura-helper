// R, B and E are all attributed states and consume deduction headroom. Only P is pending. A state
// omitted from this set makes a full ceiling look open and changes recommendations.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const rows = [
  { estadoBeneficio:"B", nifEmitente:"500000001", nomeEmitente:"B", actividadeEmitente:"C99", valorTotal:60000, valorTotalIva:0, dataEmissaoDocumento:"2026-01-01", idDocumento:"b" },
  { estadoBeneficio:"E", nifEmitente:"500000002", nomeEmitente:"E", actividadeEmitente:"C99", valorTotal:20000, valorTotalIva:0, dataEmissaoDocumento:"2026-02-01", idDocumento:"e" },
  { estadoBeneficio:"P", nifEmitente:"500000009", nomeEmitente:"P", valorTotal:10000, valorTotalIva:600, dataEmissaoDocumento:"2026-03-01", idDocumento:"p" }
];
const dom = new JSDOM("<!doctype html><body></body>", { url:"https://faturas.portaldasfinancas.gov.pt/x" });
const w=dom.window; global.window=w;global.document=w.document;global.location=w.location;global.navigator=w.navigator;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)}};w.localStorage=global.localStorage;
global.alert=()=>{};global.DOMParser=w.DOMParser;
function response(body){return Promise.resolve({ok:true,headers:{get:()=>"application/json"},text:()=>Promise.resolve(JSON.stringify(body)),json:()=>Promise.resolve(body)});}
global.fetch=(url)=>String(url).includes("/api/v1/map/buckets/")?response({"500000001":["C99"],"500000002":["C99"],"500000009":["C05","C99"]}):String(url).endsWith("offers.json")?response([]):response({linhas:rows,totalElementos:rows.length});
global.localStorage.setItem("efh-consent-v1",JSON.stringify({ok:true,share:false}));
eval(readFileSync(process.argv[2],"utf8"));
setTimeout(()=>{
  const ids=(w.__efhPend||[]).map((x)=>x.idDocumento);
  if(ids.length!==1||ids[0]!=="p")throw new Error("B/E were treated as pending or P was lost: "+ids.join(","));
  const bars=(w.document.getElementById("efh-bars")||{}).textContent||"";
  if(!/€280\s*\/\s*€250/.test(bars)||!/excede/i.test(bars))throw new Error("B/E did not fill the C99 ceiling: "+bars.replace(/\s+/g," "));
  console.log("  B/E attribution states consume headroom; only P is pending");
},700);
