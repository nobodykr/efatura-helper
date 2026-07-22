// Headless interaction test. Drives tool.js against fake e-Fatura data and exercises what a
// user actually does: untick a row, change a sector, toggle the household settings. Needs jsdom.
//   npm i jsdom && node test-interaction.js
// Drive tool.js headlessly against fake e-Fatura data and actually EXERCISE the UI:
// untick a row, change a sector, and check the bars/optimiser respond correctly.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rows = [
  // registered - already consuming ceilings
  { estadoBeneficio:"R", nifEmitente:"500000001", nomeEmitente:"Superm&atilde;o", actividadeEmitente:"C99",
    valorTotal: 60000, valorTotalIva: 0, dataEmissaoDocumento:"2026-01-10", idDocumento:"r1" },
  { estadoBeneficio:"R", nifEmitente:"500000002", nomeEmitente:"Farm&aacute;cia X", actividadeEmitente:"C05",
    valorTotal: 20000, valorTotalIva: 1200, dataEmissaoDocumento:"2026-02-10", idDocumento:"r2" },
  // pending - the ones the user ticks/edits
  { estadoBeneficio:"P", nifEmitente:"500000002", nomeEmitente:"Farm&aacute;cia X",
    valorTotal: 10000, valorTotalIva: 600, dataEmissaoDocumento:"2026-06-01", idDocumento:"p1" },
  { estadoBeneficio:"P", nifEmitente:"500000003", nomeEmitente:"Caf&eacute; Central",
    valorTotal:  5000, valorTotalIva: 300, dataEmissaoDocumento:"2026-06-02", idDocumento:"p2" },
];
const caemap = { "500000001":["C99"], "500000002":["C05","C99"], "500000003":["C03","C99"] };

const dom = new JSDOM(`<!doctype html><body></body>`, { url:"https://faturas.portaldasfinancas.gov.pt/x" });
const { window } = dom;
global.window = window; global.document = window.document;
global.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v} };
window.localStorage = global.localStorage;
global.crypto = { getRandomValues:a=>a, subtle:{} };
global.TextEncoder = require("util").TextEncoder;
global.fetch = (u) => {
  if (String(u).includes("sectors.json")) return Promise.resolve({ok:true, json:()=>Promise.resolve(caemap)});
  return Promise.resolve({ok:true, json:()=>Promise.resolve({linhas: rows}), text:()=>Promise.resolve("")});
};
global.alert = () => {};
global.location = window.location;

// The consent gate (tool.js) blocks all reads until accepted. Seed a prior acceptance so
// these tests exercise the RETURNING-USER path; test-network.js phase 1 covers the gate itself.
global.localStorage.setItem("efh-consent-v1", JSON.stringify({ok:true,share:false}));
eval(fs.readFileSync(process.argv[2] || __dirname + "/tool.js","utf8"));

setTimeout(() => {
  const d = window.document;
  const bars = () => d.getElementById("efh-bars").textContent.replace(/\s+/g," ").trim();
  const opt  = () => (d.getElementById("efh-opt")||{textContent:""}).textContent.replace(/\s+/g," ").trim();
  const cks  = [...d.querySelectorAll(".efh-ck")];
  const sels = [...d.querySelectorAll(".efh-sec")];

  console.log("rows rendered:", cks.length, "| selects:", sels.length);
  console.log("merchant name decoded?:", d.querySelector("tbody tr td:nth-child(3)").textContent);
  console.log("\n1) INITIAL");
  console.log("   bars:", bars().slice(0,140));
  console.log("   opt :", opt().slice(0,120));

  console.log("\n2) UNTICK first pending row");
  cks[0].checked = false;
  cks[0].onchange && cks[0].onchange();
  console.log("   bars:", bars().slice(0,140));

  console.log("\n3) RETICK it, then CHANGE its sector to C99");
  cks[0].checked = true; cks[0].onchange && cks[0].onchange();
  const before = bars();
  sels[0].value = "C99";
  sels[0].onchange && sels[0].onchange();
  const after = bars();
  console.log("   bars:", after.slice(0,140));
  console.log("   bars changed after edit?:", before !== after ? "YES" : "*** NO - EDIT IGNORED ***");

  console.log("\n4) EDIT rows, THEN toggle the household checkbox");
  sels[0].value = "C05"; sels[0].onchange && sels[0].onchange();
  sels[1].value = "C99"; sels[1].onchange && sels[1].onchange();
  cks[1].checked = false; cks[1].onchange && cks[1].onchange();
  const editedSel = [...d.querySelectorAll(".efh-sec")].map(s=>s.value).join(",");
  const editedCk  = [...d.querySelectorAll(".efh-ck")].map(c=>c.checked).join(",");
  console.log("   before toggle: sectors=" + editedSel + " ticks=" + editedCk);
  const mono = d.getElementById("efh-mono");
  mono.checked = true; mono.onchange && mono.onchange();
  setTimeout(()=>{
    const afterSel = [...d.querySelectorAll(".efh-sec")].map(s=>s.value).join(",");
    const afterCk  = [...d.querySelectorAll(".efh-ck")].map(c=>c.checked).join(",");
    console.log("   after  toggle: sectors=" + afterSel + " ticks=" + afterCk);
    console.log("   edits survived?:", (afterSel===editedSel && afterCk===editedCk) ? "YES" : "*** NO - USER EDITS WIPED ***");
  }, 300);

  console.log("\n5) UNTICK ALL");
  cks.forEach(c => { c.checked = false; c.onchange && c.onchange(); });
  console.log("   bars:", bars().slice(0,140));
  console.log("   any '(+' pending marker left?:", /\(\+/.test(bars()) ? "*** YES - STALE ***" : "no, correct");
}, 400);
