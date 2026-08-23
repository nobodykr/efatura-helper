"use strict";
// Identifier-free Banco de Portugal CRC summary parser. Input text never leaves the browser.
(function (root) {
  var MONTHS={janeiro:"01",fevereiro:"02",marco:"03",abril:"04",maio:"05",junho:"06",julho:"07",agosto:"08",setembro:"09",outubro:"10",novembro:"11",dezembro:"12"};
  function fold(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function cents(v){var n=Number(String(v).replace(/[.\s]/g,"").replace(",","."));if(!isFinite(n))throw new Error("O resumo CRC contém um montante inválido.");return Math.round(n*100);}
  function eur(v){return +(v/100).toFixed(2);}
  function referenceMonth(text){
    var s=fold(text),patterns=[
      /31\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})/,
      /(?:referencia|centralizad[ao]s?).{0,80}?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro).{0,20}?(20\d{2})/
    ];
    for(var i=0;i<patterns.length;i++){var m=s.match(patterns[i]);if(m)return m[2]+"-"+MONTHS[m[1]];}
    throw new Error("Não encontrei o mês de referência no mapa CRC.");
  }
  function rows(lines,start){
    var money=/(?:\d{1,3}(?:[.\s]\d{3})*|\d+),\d{2}/g,out=[];
    lines.slice(start,start+24).forEach(function(line){
      var amounts=line.match(money)||[];if(amounts.length<3)return;
      var tail=line.replace(money," ").match(/\b\d+\b/g)||[];
      out.push({effective:cents(amounts[0]),overdue:cents(amounts[1]),potential:cents(amounts[2]),contracts:tail.length?Number(tail[0]):null,institutions:tail.length>1?Number(tail[1]):null});
    });
    return out;
  }
  function sum(list,key){return list.reduce(function(total,row){return total+row[key];},0);}
  function parse(text,parsedAt){
    if(!text||typeof text!=="string")throw new Error("O mapa CRC não contém texto legível.");
    if(text.indexOf("\ufffd")>=0)throw new Error("O mapa CRC contém caracteres que não foi possível ler com segurança.");
    var lines=text.split(/\r?\n/).map(function(line){return line.replace(/\s+/g," ").trim();}).filter(Boolean);
    var debt=-1,potential=-1;
    lines.forEach(function(line,index){var f=fold(line);if(debt<0&&f.indexOf("montante em divida")>=0)debt=index;if(debt>=0&&potential<0&&f.indexOf("montante potencial")>=0)potential=index;});
    if(debt<0||potential<0)throw new Error("Não encontrei o quadro-resumo do mapa CRC.");
    var all=rows(lines,debt);if(all.length<2)throw new Error("Não encontrei as linhas de totais do mapa CRC.");
    var total=all[all.length-1],parts=all.slice(0,-1);
    if(total.effective!==sum(parts,"effective")||total.overdue!==sum(parts,"overdue")||total.potential!==sum(parts,"potential"))throw new Error("Os totais do mapa CRC não conciliam com as linhas do documento.");
    if(total.contracts!=null&&parts.every(function(row){return row.contracts!=null;})&&total.contracts!==sum(parts,"contracts"))throw new Error("O total de contratos do mapa CRC não concilia.");
    var normalized=fold(text);
    return {schema:"credit-responsibilities.v1",source:"bportugal-crc",reference_month:referenceMonth(text),effective_debt_eur:eur(total.effective),overdue_debt_eur:eur(total.overdue),potential_credit_eur:eur(total.potential),contracts:total.contracts,institutions:total.institutions,roles:{debtor_present:/\bdevedor\b/.test(normalized),guarantor_present:/fiador|avalista/.test(normalized)},flags:{arrears:total.overdue>0,judicial:null,renegotiated:null},parsed_at:parsedAt||new Date().toISOString()};
  }
  root.FiscalidadeCrcParser=Object.freeze({parseCrcText:parse});
})(globalThis);
