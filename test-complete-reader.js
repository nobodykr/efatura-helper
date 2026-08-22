// A 300-row portal response is not necessarily complete. Prove recursive date splitting both when
// the server reports a larger total and when the total field disappears at the known cap.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const src=readFileSync(process.argv[2],"utf8");
function response(body){return Promise.resolve({ok:true,headers:{get:()=>"application/json"},text:()=>Promise.resolve(JSON.stringify(body)),json:()=>Promise.resolve(body)});}
function makeRows(n,offset){return Array.from({length:n},(_,i)=>({estadoBeneficio:"P",nifEmitente:"500000009",nomeEmitente:"Fixture",valorTotal:100,valorTotalIva:23,dataEmissaoDocumento:"2026-01-01",idDocumento:"d"+(offset+i)}));}
async function run(target,withTotal){
  const dom=new JSDOM("<!doctype html><body></body>",{url:"https://faturas.portaldasfinancas.gov.pt/x"});
  const w=dom.window;global.window=w;global.document=w.document;global.location=w.location;global.navigator=w.navigator;global.DOMParser=w.DOMParser;global.alert=()=>{};
  global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)}};w.localStorage=global.localStorage;
  global.localStorage.setItem("efh-consent-v1",JSON.stringify({ok:true,share:false}));
  let reads=0;
  global.fetch=(url)=>{
    const s=String(url);
    if(s.includes("/api/v1/map/buckets/"))return response({"500000009":["C05","C99"]});
    if(s.endsWith("offers.json"))return response([]);
    if(s.includes("obterDocumentosAdquirente")){
      reads++;
      const q=new URL(s,"https://faturas.portaldasfinancas.gov.pt").searchParams;
      const full=q.get("dataInicioFilter").endsWith("-01-01")&&q.get("dataFimFilter").endsWith("-12-31");
      if(full){const body={linhas:makeRows(300,0)};if(withTotal)body.totalElementos=target;return response(body);}
      const left=q.get("dataInicioFilter").endsWith("-01-01"), count=left?150:target-150;
      return response({linhas:makeRows(count,left?0:150),totalElementos:count});
    }
    throw new Error("unexpected request "+s);
  };
  eval(src);
  await new Promise((resolve)=>setTimeout(resolve,1000));
  const got=(w.__efhPend||[]).length;
  dom.window.close();
  if(reads!==3||got!==target)throw new Error(`reader completeness failed: reads=${reads} rows=${got} target=${target}`);
}
(async()=>{
  await run(301,true);
  await run(300,false);
  console.log("  capped reader recursively proved completeness with and without a total field");
})().catch((error)=>{console.error(error);process.exit(1);});
