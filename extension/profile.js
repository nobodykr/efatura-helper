"use strict";
var PROFILE_KEY = "fiscalidade-profile-v1";
var CONSENT_KEY = "fiscalidade-consent-v1";
var SETTINGS_KEY = "fiscalidade-settings-v1";
var INVOICE_SNAPSHOT_KEY = "fatura-boa-invoice-snapshot-v1";
var CRC_URL = "https://www.bportugal.pt/area-cidadao/formulario/227";
var CRC_MAX_BYTES = 25 * 1024 * 1024;
var NAMES = {
  efatura:"e-Fatura", rendas:"Rendas", situacao:"Situação fiscal", atividade:"Atividade e IVA",
  atividade_integrada:"Atividade exercida", irs:"IRS", movfin:"Movimentos financeiros",
  recibos:"Recibos verdes", declaracoes:"Declarações de IRS", deducoes:"Deduções oficiais",
  despesas_atividade:"Despesas da atividade", ss:"Segurança Social",
  patrimonio:"Património predial"
};
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function fact(id,d){
  if(id==="efatura") return esc(d.totalFaturas||0)+" faturas; "+esc(d.porClassificar||0)+" por classificar";
  if(id==="rendas") return esc(d.activos||0)+" contratos ativos";
  if(id==="situacao") return esc((d.dividas&&d.dividas.n)||0)+" dívidas ativas";
  if(id==="atividade") return d.ultimaDeclaracaoTipo==="inicio-ou-reinicio"?"início/reinício declarado; eficácia por confirmar":"estado atual por confirmar";
  if(id==="atividade_integrada") return d.disponivel===false?"não exposta nesta conta":d.estadoAtual==="aberta"?"atividade aberta":d.estadoAtual==="agendada"?"início/reinício futuro; ainda não aberto":d.estadoAtual==="cessada"?(d.proximoInicio?"cessada agora; início futuro":"atividade cessada"):"estado por confirmar";
  if(id==="irs") return esc(d.liquidacoes||0)+" liquidações";
  if(id==="movfin") return esc(d.movimentos||0)+" movimentos";
  if(id==="recibos") return esc(d.recibosVerdes||0)+" recibos";
  if(id==="declaracoes") return esc(Object.keys(d.porAno||{}).length)+" ano(s) com declaração";
  if(id==="deducoes") return esc(Object.keys(d.porAno||{}).length)+" ano(s) oficial(is)";
  if(id==="despesas_atividade") return d.disponivel===false?"não disponível":"lida";
  if(id==="ss") return d.estado?"situação "+esc(d.estado):"lida; estado indisponível";
  if(id==="patrimonio") return esc(d.imoveis||0)+" imóveis";
  return "lida";
}
function endOfDay(){var d=new Date();d.setHours(23,59,59,999);return d.getTime();}
function money(value){return new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(Number(value)||0);}
function crcDataOnly(data){
  return {
    schema:"credit-responsibilities.v1",source:"bportugal-crc",reference_month:String(data.reference_month||""),
    effective_debt_eur:Number(data.effective_debt_eur)||0,overdue_debt_eur:Number(data.overdue_debt_eur)||0,
    potential_credit_eur:Number(data.potential_credit_eur)||0,contracts:Number.isInteger(data.contracts)?data.contracts:null,
    institutions:Number.isInteger(data.institutions)?data.institutions:null,
    roles:{debtor_present:data.roles&&data.roles.debtor_present===true,guarantor_present:data.roles&&data.roles.guarantor_present===true},
    flags:{arrears:data.flags&&data.flags.arrears===true,judicial:data.flags?data.flags.judicial:null,renegotiated:data.flags?data.flags.renegotiated:null},
    parsed_at:String(data.parsed_at||new Date().toISOString())
  };
}
function renderCrc(entry){
  var box=document.getElementById("crc-summary"),status=document.getElementById("crc-status");
  if(!entry||entry.status!=="done"||!entry.data){box.innerHTML="";status.textContent="Ainda não escolheste um mapa neste navegador.";return;}
  var d=entry.data,late=Number(d.overdue_debt_eur)>0;
  status.textContent="Resumo local do mapa de "+String(d.reference_month||"")+".";
  box.innerHTML='<div class="crc-card">'+(late?'<p class="crc-alert"><b>Atenção:</b> o mapa indica montante vencido.</p>':'<p class="ok">Sem montante vencido no mapa.</p>')+
    '<div class="crc-grid"><div><small>Dívida efetiva</small><b class="crc-value">'+esc(money(d.effective_debt_eur))+'</b></div>'+
    '<div><small>Montante vencido</small><b class="crc-value">'+esc(money(d.overdue_debt_eur))+'</b></div>'+
    '<div><small>Crédito potencial</small><b class="crc-value">'+esc(money(d.potential_credit_eur))+'</b></div>'+
    '<div><small>Contratos</small><b class="crc-value">'+esc(d.contracts==null?"-":d.contracts)+'</b></div></div>'+
    '<p class="small">Crédito potencial não é dívida utilizada: inclui limites e responsabilidades que só se tornam efetivas se forem acionadas.</p></div>';
}
function storeCrcSummary(data,callback){
  var clean=crcDataOnly(data);
  chrome.storage.local.get(PROFILE_KEY,function(s){
    var p=s[PROFILE_KEY];
    if(!p||p.version!==1||Date.now()>=Number(p.expiresAt||0))p={version:1,partitions:{},documents:{},expiresAt:endOfDay()};
    p.partitions=p.partitions||{};p.documents=p.documents||{};
    p.documents.crc={status:"done",fetchedAt:new Date().toISOString(),data:clean};p.expiresAt=endOfDay();
    chrome.storage.local.set({[PROFILE_KEY]:p},function(){renderCrc(p.documents.crc);if(callback)callback();});
  });
}
function pdfRows(items){
  var rows=[];
  items.forEach(function(item){
    if(!item||!String(item.str||"").trim())return;
    var x=Number(item.transform&&item.transform[4])||0,y=Number(item.transform&&item.transform[5])||0;
    var row=rows.find(function(candidate){return Math.abs(candidate.y-y)<2;});
    if(!row){row={y:y,items:[]};rows.push(row);}row.items.push({x:x,text:String(item.str).trim()});
  });
  return rows.sort(function(a,b){return b.y-a.y;}).map(function(row){return row.items.sort(function(a,b){return a.x-b.x;}).map(function(item){return item.text;}).join(" ");}).join("\n");
}
async function parseCrcPdf(bytes){
  var sig=String.fromCharCode.apply(null,Array.from(new Uint8Array(bytes.slice(0,5))));
  if(sig!=="%PDF-")throw new Error("O ficheiro escolhido não parece ser um PDF válido.");
  var pdfjs=await import(chrome.runtime.getURL("vendor/pdf.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL("vendor/pdf.worker.mjs");
  var loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}),pdf;
  try{
    pdf=await loading.promise;var pages=[];
    for(var n=1;n<=pdf.numPages;n++){var page=await pdf.getPage(n),content=await page.getTextContent();pages.push(pdfRows(content.items));page.cleanup();}
    return FiscalidadeCrcParser.parseCrcText(pages.join("\n"));
  }finally{if(pdf)await pdf.destroy();else if(loading)await loading.destroy();}
}
async function loadCrcFile(file){
  var status=document.getElementById("crc-status");
  if(!file)return;
  if(file.size<1000||file.size>CRC_MAX_BYTES||(!/\.pdf$/i.test(file.name||"")&&file.type!=="application/pdf")){status.textContent="Escolhe um PDF do mapa CRC com menos de 25 MB.";return;}
  status.textContent="A ler o PDF apenas neste dispositivo...";
  try{var summary=await parseCrcPdf(await file.arrayBuffer());storeCrcSummary(summary,function(){status.textContent="Mapa lido e resumo guardado localmente até ao fim do dia.";});}
  catch(error){status.textContent=(error&&error.message)||"Não foi possível ler este mapa CRC.";}
}
function render(){
  chrome.storage.local.get([PROFILE_KEY,CONSENT_KEY,SETTINGS_KEY],function(s){
    var p=s[PROFILE_KEY], expired=!p||Date.now()>=Number(p.expiresAt||0);
    if(expired&&p) chrome.storage.local.remove(PROFILE_KEY);
    var parts=expired?{}:(p.partitions||{}), done=Object.keys(parts).filter(function(k){return parts[k]&&parts[k].status==="done";});
    document.getElementById("status").textContent=done.length+" de "+Object.keys(NAMES).length+" fontes reunidas";
    document.getElementById("sources").innerHTML=Object.keys(NAMES).map(function(id){var x=parts[id];return '<div class="source"><b>'+esc(NAMES[id])+'</b><span class="'+(x?'ok':'missing')+'">'+(x?fact(id,x.data||{}):"ainda não lida")+'</span></div>';}).join("");
    var c=s[CONSENT_KEY];
    document.getElementById("consent").innerHTML=c&&c.localAnalysis===true?'<p class="ok">Leituras locais autorizadas. Continuam a exigir um clique em cada página.</p>':'<p class="missing">Leituras locais não autorizadas.</p>';
    var settings=s[SETTINGS_KEY]||{};
    document.getElementById("share-merchants").checked=settings.share===true;
    document.getElementById("share-shapes").checked=settings.shareShapes===true;
    renderCrc(expired?null:(p.documents&&p.documents.crc));
  });
}
function saveChoice(key,value){chrome.storage.local.get(SETTINGS_KEY,function(s){var current=s[SETTINGS_KEY]||{};current[key]=value===true;chrome.storage.local.set({[SETTINGS_KEY]:current});});}
function clearInvoiceSnapshot(callback){if(chrome.storage.session)chrome.storage.session.remove(INVOICE_SNAPSHOT_KEY,callback);else if(callback)callback();}
function returnToEfatura(){chrome.runtime.sendMessage({type:"fb-return-to-efatura"});}
document.getElementById("refresh").onclick=render;
document.getElementById("return-efatura-profile").onclick=returnToEfatura;
document.getElementById("revoke").onclick=function(){chrome.storage.local.remove(CONSENT_KEY,function(){clearInvoiceSnapshot(render);});};
document.getElementById("erase").onclick=function(){chrome.storage.local.clear(function(){clearInvoiceSnapshot(render);});};
document.getElementById("share-merchants").onchange=function(){saveChoice("share",this.checked);};
document.getElementById("share-shapes").onchange=function(){saveChoice("shareShapes",this.checked);};
document.getElementById("open-crc").onclick=function(){chrome.tabs.create({url:CRC_URL});};
document.getElementById("crc-file").onchange=function(){var input=this;loadCrcFile(input.files&&input.files[0]).finally(function(){input.value="";});};
globalThis.FiscalidadeCrcProfile=Object.freeze({storeCrcSummary:storeCrcSummary,renderCrc:renderCrc,pdfRows:pdfRows});
if(chrome.runtime.getManifest){var manifest=chrome.runtime.getManifest();if(/-dev(?:\.|$)/.test(manifest.version_name||"")){document.querySelectorAll(".devtag").forEach(function(node){node.hidden=false;});document.title+=" DEV";}}
render();
