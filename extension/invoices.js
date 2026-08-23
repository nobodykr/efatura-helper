(function () {
  "use strict";

  var SNAPSHOT_KEY = "fatura-boa-invoice-snapshot-v1";
  var SECTORS = {
    C01:"Automóveis",C02:"Motociclos",C03:"Alojamento/restauração",C04:"Cabeleireiros/beleza",
    C05:"Saúde",C06:"Educação",C07:"Habitação",C08:"Lares",C09:"Veterinárias",
    C10:"Transportes",C11:"Ginásios",C12:"Jornais/revistas",C13:"Livros",
    C14:"Atividades artísticas",C15:"Museus/monumentos",C99:"Outros"
  };
  var STATUS = {
    P:{label:"Pendente",group:"pending"},R:{label:"Registada",group:"classified"},
    B:{label:"Benefício atribuído",group:"classified"},E:{label:"Registada posteriormente",group:"classified"},
    A:{label:"Anulada",group:"cancelled"},C:{label:"Anulada posteriormente",group:"cancelled"},
    O:{label:"Duplicada",group:"cancelled"},N:{label:"Sem benefício",group:"classified"}
  };
  var DEMO = {
    version:1,year:2026,fetchedAt:"2026-08-23T14:30:00.000Z",complete:true,mapUnavailable:false,
    issuerSectors:{"DEMO-001":["C03","C99"],"DEMO-002":["C05","C99"],"DEMO-003":["C06"]},
    invoices:[
      {id:"demo-1",date:"2026-08-21",issuerNif:"DEMO-001",issuerName:"Restaurante Exemplo, Lda.",totalCents:4860,vatCents:560,status:"P",sector:"",scope:"profissional",activity:"Consultoria"},
      {id:"demo-2",date:"2026-07-12",issuerNif:"DEMO-001",issuerName:"Restaurante Exemplo, Lda.",totalCents:2275,vatCents:261,status:"R",sector:"C03",scope:"pessoal",activity:""},
      {id:"demo-3",date:"2026-08-18",issuerNif:"DEMO-002",issuerName:"Farmácia de Demonstração",totalCents:1934,vatCents:212,status:"P",sector:"",scope:"parcial",activity:"Design"},
      {id:"demo-4",date:"2026-05-02",issuerNif:"DEMO-002",issuerName:"Farmácia de Demonstração",totalCents:820,vatCents:47,status:"B",sector:"C05",scope:"pessoal",activity:""},
      {id:"demo-5",date:"2026-08-02",issuerNif:"DEMO-003",issuerName:"Academia Fictícia",totalCents:13500,vatCents:0,status:"R",sector:"C06",scope:"profissional",activity:"Formação"},
      {id:"demo-6",date:"2026-03-11",issuerNif:"DEMO-004",issuerName:"Fornecedor Sem Mapa",totalCents:7310,vatCents:1367,status:"P",sector:"",scope:"",activity:""}
    ]
  };

  var liveSnapshot = null;
  var snapshot = null;
  var demoMode = false;
  var euro = new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"});
  var dateFmt = new Intl.DateTimeFormat("pt-PT",{day:"2-digit",month:"short",year:"numeric"});
  var collator = new Intl.Collator("pt",{sensitivity:"base"});

  function byId(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function cents(value) { return value == null || !isFinite(Number(value)) ? 0 : Number(value); }
  function money(value) { return euro.format(cents(value) / 100); }
  function parsedDate(value) {
    var date = new Date(String(value || "") + (String(value || "").length === 10 ? "T12:00:00" : ""));
    return isNaN(date.getTime()) ? null : date;
  }
  function dateLabel(value) { var date = parsedDate(value); return date ? dateFmt.format(date) : (value || "Sem data"); }
  function statusInfo(row) { return STATUS[row.status] || {label:row.status || "Não indicado",group:"unknown"}; }
  function scopeValue(row) { return row.scope === "profissional" || row.scope === "parcial" || row.scope === "pessoal" ? row.scope : "unknown"; }
  function scopeLabel(value) { return {profissional:"Profissional",parcial:"Parcial",pessoal:"Pessoal",unknown:"Não indicado"}[value] || "Não indicado"; }
  function sectorLabel(sector) { return sector ? sector + " - " + (SECTORS[sector] || "Setor") : "Não indicado"; }
  function issuerKey(row) { return row.issuerNif || row.issuerName || "sem-emitente"; }
  function latestTime(rows) { return Math.max.apply(Math, rows.map(function (row) { var d=parsedDate(row.date);return d?d.getTime():0; })); }

  function filteredRows() {
    if (!snapshot) return [];
    var q = byId("query").value.trim().toLocaleLowerCase("pt");
    var month = byId("month").value;
    var state = byId("status-filter").value;
    var scope = byId("scope-filter").value;
    var sector = byId("sector-filter").value;
    var activity = byId("activity-filter").value;
    return (snapshot.invoices || []).filter(function (row) {
      var haystack = ((row.issuerName || "") + " " + (row.issuerNif || "")).toLocaleLowerCase("pt");
      var sectors = (snapshot.issuerSectors && snapshot.issuerSectors[row.issuerNif]) || [];
      return (!q || haystack.indexOf(q) >= 0) && (!month || String(row.date || "").slice(0,7) === month) &&
        (!state || statusInfo(row).group === state) && (!scope || scopeValue(row) === scope) &&
        (!sector || row.sector === sector || sectors.indexOf(sector) >= 0) && (!activity || row.activity === activity);
    });
  }

  function groupsFor(rows) {
    var groups = {};
    rows.forEach(function (row) { var key=issuerKey(row);(groups[key]=groups[key]||[]).push(row); });
    var out = Object.keys(groups).map(function (key) {
      var items = groups[key].sort(function (a,b) { return String(b.date).localeCompare(String(a.date)); });
      var pending = items.filter(function (row) { return statusInfo(row).group === "pending"; }).length;
      return {key:key,rows:items,name:items[0].issuerName||"Emitente não identificado",nif:items[0].issuerNif||"-",
        pending:pending,total:items.reduce(function(sum,row){return sum+cents(row.totalCents);},0),latest:latestTime(items)};
    });
    var sort = byId("sort").value;
    out.sort(function (a,b) {
      if (sort === "name") return collator.compare(a.name,b.name);
      if (sort === "spend") return b.total-a.total || collator.compare(a.name,b.name);
      if (sort === "recent") return b.latest-a.latest || collator.compare(a.name,b.name);
      return b.pending-a.pending || b.latest-a.latest || collator.compare(a.name,b.name);
    });
    return out;
  }

  function chip(text, local) { return el("span","chip"+(local?" local":""),text); }
  function habitualSector(rows) {
    var counts={};rows.forEach(function(row){if(/^C[0-9]{2}$/.test(row.sector||""))counts[row.sector]=(counts[row.sector]||0)+1;});
    return Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];})[0]||"";
  }
  function numberCell(label,value,className) {
    var box=el("div","summary-number"+(className?" "+className:""));box.append(el("span","",label),el("strong","",value));return box;
  }
  function invoiceTable(group) {
    var wrap=el("div","invoice-wrap"),table=el("table"),head=el("thead"),hr=el("tr");
    ["Data","Estado","Âmbito","Atividade","Setor atual","IVA","Total",""].forEach(function(label){hr.appendChild(el("th","",label));});
    head.appendChild(hr);table.appendChild(head);var body=el("tbody");
    group.rows.forEach(function(row){
      var tr=el("tr"),info=statusInfo(row),state=el("span","state "+info.group,info.label);
      tr.appendChild(el("td","",dateLabel(row.date)));var st=el("td");st.appendChild(state);tr.appendChild(st);
      tr.appendChild(el("td","",scopeLabel(scopeValue(row))));tr.appendChild(el("td",row.activity?"":"muted",row.activity||"Não indicada"));
      tr.appendChild(el("td",row.sector?"":"muted",sectorLabel(row.sector)));tr.appendChild(el("td","amount",row.vatCents==null?"-":money(row.vatCents)));
      tr.appendChild(el("td","amount",money(row.totalCents)));var action=el("td");
      if(!demoMode&&row.id&&row.date){var button=el("button","official-link","Ver no e-Fatura");button.type="button";button.addEventListener("click",function(){returnToEfatura({id:row.id,date:row.date});});action.appendChild(button);}else action.appendChild(el("span","muted",demoMode?"Exemplo":"Sem ligação"));
      tr.appendChild(action);body.appendChild(tr);
    });
    table.appendChild(body);wrap.appendChild(table);return wrap;
  }
  function issuerCard(group) {
    var details=el("details","issuer-card"),summary=el("summary"),name=el("div","issuer-name");
    name.append(el("strong","",group.name),el("small","","NIF "+group.nif));summary.appendChild(name);
    var context=el("div","issuer-context"),registered=(snapshot.issuerSectors&&snapshot.issuerSectors[group.nif])||[],habitual=habitualSector(group.rows);
    context.appendChild(el("small","",habitual?"Histórico: "+sectorLabel(habitual):"Sem histórico de setor"));var chips=el("div","chips");
    registered.forEach(function(sector){chips.appendChild(chip(sectorLabel(sector),false));});if(!registered.length)chips.appendChild(chip("Sem setores adicionais",true));context.appendChild(chips);summary.appendChild(context);
    summary.append(numberCell("Faturas",String(group.rows.length)),numberCell("Total",money(group.total)),numberCell("Pendentes",String(group.pending),"pending"),el("span","chevron","›"));
    details.append(summary,invoiceTable(group));return details;
  }

  function metric(label,value,className){var card=el("div","metric"+(className?" "+className:""));card.append(el("span","",label),el("strong","",value));return card;}
  function renderMetrics(rows,groups){var box=byId("metrics"),pending=rows.filter(function(row){return statusInfo(row).group==="pending";}).length,professional=rows.filter(function(row){return scopeValue(row)==="profissional"||scopeValue(row)==="parcial";}).length,total=rows.reduce(function(sum,row){return sum+cents(row.totalCents);},0);box.replaceChildren(metric("Faturas",String(rows.length)),metric("Emitentes",String(groups.length)),metric("Total",money(total)),metric("Pendentes",String(pending),"pending"),metric("Profissionais/parciais",String(professional)));}
  function render() {
    var rows=filteredRows(),groups=groupsFor(rows),list=byId("issuer-list");list.replaceChildren();groups.forEach(function(group){list.appendChild(issuerCard(group));});
    renderMetrics(rows,groups);byId("result-count").textContent=groups.length+" emitente"+(groups.length===1?"":"s")+" - "+rows.length+" fatura"+(rows.length===1?"":"s");
    var noData=!snapshot||(snapshot.invoices||[]).length===0;byId("empty").hidden=groups.length!==0;byId("empty").querySelector("h2").textContent=noData?"Ainda não há faturas para mostrar":"Nenhuma fatura corresponde aos filtros";
    byId("map-warning").hidden=!snapshot||!snapshot.mapUnavailable||demoMode;byId("demo-warning").hidden=!demoMode;
  }
  function fillSelect(id,values,label){var select=byId(id),current=select.value;while(select.options.length>1)select.remove(1);values.forEach(function(value){var option=el("option","",label?label(value):value);option.value=value;select.appendChild(option);});select.value=values.indexOf(current)>=0?current:"";}
  function configureFilters() {
    var rows=(snapshot&&snapshot.invoices)||[],months=[],sectors=[],activities=[];
    rows.forEach(function(row){var month=String(row.date||"").slice(0,7);if(/^\d{4}-\d{2}$/.test(month)&&months.indexOf(month)<0)months.push(month);if(/^C\d{2}$/.test(row.sector||"")&&sectors.indexOf(row.sector)<0)sectors.push(row.sector);if(row.activity&&activities.indexOf(row.activity)<0)activities.push(row.activity);((snapshot.issuerSectors&&snapshot.issuerSectors[row.issuerNif])||[]).forEach(function(sector){if(sectors.indexOf(sector)<0)sectors.push(sector);});});
    months.sort().reverse();sectors.sort();activities.sort(collator.compare);fillSelect("month",months,function(value){var parts=value.split("-");return new Intl.DateTimeFormat("pt-PT",{month:"long",year:"numeric"}).format(new Date(Number(parts[0]),Number(parts[1])-1,1));});fillSelect("sector-filter",sectors,sectorLabel);fillSelect("activity-filter",activities);byId("activity-field").hidden=activities.length===0;
  }
  function setSnapshot(next,isDemo) {
    snapshot=next;demoMode=!!isDemo;configureFilters();var status=byId("snapshot-status");
    if(snapshot){var fetched=parsedDate(snapshot.fetchedAt);status.textContent=(demoMode?"Demonstração":snapshot.year+" - "+snapshot.invoices.length+" faturas lidas")+(fetched&&!demoMode?" - atualizadas "+dateFmt.format(fetched):"");}else status.textContent="À espera de dados do e-Fatura.";
    byId("demo").textContent=demoMode?"Voltar aos meus dados":"Dados de demonstração";render();
  }
  function showMessage(message){var box=byId("runtime-message");box.textContent=message;box.hidden=!message;}
  function returnToEfatura(invoice){
    showMessage(invoice?"A abrir a fatura na página do e-Fatura...":"A voltar à página do e-Fatura...");
    chrome.runtime.sendMessage({type:"fb-return-to-efatura",invoice:invoice||undefined},function(response){
      if(!response||response.ok!==true)showMessage("Não encontrei uma página do e-Fatura. Inicia sessão no Portal e tenta novamente.");
    });
  }
  function loadLive() { chrome.storage.session.get(SNAPSHOT_KEY,function(stored){var next=stored&&stored[SNAPSHOT_KEY];if(next&&next.expiresAt&&Date.now()>=Number(next.expiresAt)){chrome.storage.session.remove(SNAPSHOT_KEY);next=null;}liveSnapshot=next||null;if(!demoMode)setSnapshot(liveSnapshot,false);}); }

  byId("filters").addEventListener("submit",function(event){event.preventDefault();});
  ["query","month","status-filter","scope-filter","sector-filter","activity-filter","sort"].forEach(function(id){byId(id).addEventListener(id==="query"?"input":"change",render);});
  byId("clear-filters").addEventListener("click",function(){["query","month","status-filter","scope-filter","sector-filter","activity-filter"].forEach(function(id){byId(id).value="";});byId("sort").value="pending";render();});
  byId("demo").addEventListener("click",function(){showMessage("");if(demoMode)setSnapshot(liveSnapshot,false);else setSnapshot(DEMO,true);});
  byId("return-efatura").addEventListener("click",function(){returnToEfatura();});
  byId("refresh").addEventListener("click",function(){showMessage("A pedir uma leitura à página do e-Fatura...");chrome.runtime.sendMessage({type:"fb-dashboard-refresh"},function(response){if(response&&response.ok)showMessage("Leitura iniciada. Este painel atualiza quando terminar.");else if(response&&response.error==="consent_required")showMessage("Autoriza primeiro as leituras locais na barra Fatura Boa do e-Fatura.");else showMessage("Abre uma página do e-Fatura com sessão iniciada e tenta novamente.");});});
  if(chrome.storage.onChanged)chrome.storage.onChanged.addListener(function(changes,area){if(area==="session"&&changes[SNAPSHOT_KEY]){liveSnapshot=changes[SNAPSHOT_KEY].newValue||null;if(!demoMode){showMessage("");setSnapshot(liveSnapshot,false);}}});
  var manifest=chrome.runtime.getManifest(),isDev=/-dev(?:\.|$)/.test(manifest.version_name||"");
  if(isDev){document.querySelectorAll(".devtag").forEach(function(node){node.hidden=false;});document.title+=" DEV";}
  byId("version").textContent="v"+(manifest.version_name||manifest.version);loadLive();
})();
