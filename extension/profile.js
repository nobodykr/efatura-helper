"use strict";
var PROFILE_KEY = "fiscalidade-profile-v1";
var CONSENT_KEY = "fiscalidade-consent-v1";
var SETTINGS_KEY = "fiscalidade-settings-v1";
var NAMES = {
  efatura:"e-Fatura", rendas:"Rendas", situacao:"Situação fiscal", atividade:"Atividade e IVA",
  irs:"IRS", movfin:"Movimentos financeiros", recibos:"Recibos verdes", ss:"Segurança Social",
  patrimonio:"Património predial"
};
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function fact(id,d){
  if(id==="efatura") return esc(d.totalFaturas||0)+" faturas; "+esc(d.porClassificar||0)+" por classificar";
  if(id==="rendas") return esc(d.activos||0)+" contratos ativos";
  if(id==="situacao") return esc((d.dividas&&d.dividas.n)||0)+" dívidas ativas";
  if(id==="atividade") return d.cessada===true?"atividade cessada":d.cessada===false?"atividade aberta":"estado por confirmar";
  if(id==="irs") return esc(d.liquidacoes||0)+" liquidações";
  if(id==="movfin") return esc(d.movimentos||0)+" movimentos";
  if(id==="recibos") return esc(d.recibosVerdes||0)+" recibos";
  if(id==="ss") return d.estado?"situação "+esc(d.estado):"lida; estado indisponível";
  if(id==="patrimonio") return esc(d.imoveis||0)+" imóveis";
  return "lida";
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
  });
}
function saveChoice(key,value){chrome.storage.local.get(SETTINGS_KEY,function(s){var current=s[SETTINGS_KEY]||{};current[key]=value===true;chrome.storage.local.set({[SETTINGS_KEY]:current});});}
document.getElementById("refresh").onclick=render;
document.getElementById("revoke").onclick=function(){chrome.storage.local.remove(CONSENT_KEY,render);};
document.getElementById("erase").onclick=function(){chrome.storage.local.clear(render);};
document.getElementById("share-merchants").onchange=function(){saveChoice("share",this.checked);};
document.getElementById("share-shapes").onchange=function(){saveChoice("shareShapes",this.checked);};
render();
