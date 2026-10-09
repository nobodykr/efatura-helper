// Invented pages in the shape of /app/dashboard-regime-simplificado (labels, block order, detail tables and
// the "-" empty value as captured on 2026-10-07; every amount here is made up). Shared by
// test-despesas-atividade.js and by the Faturação reader's parity tests (same pages, same output).
"use strict";

function table(header, rows) {
  return "<table class=\"table\"><thead><tr><th>" + header + "</th><th>Valor (em EUR)</th><th>Ações disponíveis</th></tr></thead><tbody>" +
    rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + (r[2] ? "<a href=\"#\">" + r[2] + "</a>" : "") + "</td></tr>"; }).join("") +
    "</tbody></table>";
}
function block(label, valor, considerar, tables) {
  return "<div class=\"panel\"><div class=\"panel-heading\"><span class=\"titulo\">" + label + "</span> <span class=\"valor\">" + valor + " &euro;</span></div>" +
    "<div class=\"panel-body\"><p>Valor a considerar para determinação do Rendimento Líquido <strong>" + considerar + " &euro;</strong></p>" +
    "<a href=\"#\">Ver Detalhes</a>" + tables.join("") + "</div></div>";
}
function page(year, blocks) {
  return "<html><body><header><a href=\"#\">Ir para o conteúdo principal</a> <span>1 Mensagem</span></header><main>" +
    "<h1>Consultar Despesas Afetas à Atividade</h1>" +
    "<select><option>2025</option><option>2024</option><option>2023</option></select> <button>Pesquisar</button>" +
    "<h2>Ano " + year + "</h2><p>Esta página destina-se à consulta das despesas e encargos e do valor patrimonial tributário de imóveis próprios. (+ info)</p>" +
    "<p>Nesta página pessoal encontram-se as despesas comunicadas à AT, bem como as respetivas percentagens legais consideradas.</p>" +
    blocks.join("") + "</main><footer><h3>Links Úteis</h3><p>Última atualização em 2026-08-18 | 2.19.18-104491</p></footer>" +
    "<script>var loginForm = 'https://acesso.gov.pt';</script></body></html>";
}
var RENDAS_ROWS = function (fatura, recibo, outros, total) {
  return [["Importâncias suportadas com rendas, tituladas com fatura", fatura],
    ["Importâncias suportadas com rendas, tituladas com recibo de renda eletrónico", recibo],
    ["Importâncias suportadas com rendas, tituladas com outros documentos", outros], ["TOTAL", total]];
};
var REAL_SHAPE = page(2025, [
  block("Despesas com pessoal", "1.250,00", "1.250,00", [table("Descrição da Despesa",
    [["Despesas suportadas com pessoal e encargos a título de remunerações, ordenados ou salários", "1.250,00"]])]),
  block("Despesas com rendas", "7.200,00", "6.000,00", [
    table("DESPESAS COM RENDAS TOTALMENTE AFETAS", RENDAS_ROWS("-", "4.800,00", "-", "4.800,00")),
    table("DESPESAS COM RENDAS PARCIALMENTE AFETAS", RENDAS_ROWS("2.400,00", "-", "-", "2.400,00"))]),
  block("VPT dos imóveis afetos à atividade empresarial/profissional", "95.000,00", "1.900,00", [table("Descrição da Despesa", [
    ["Valor patrimonial tributário dos imóveis totalmente afetos à atividade, com exceção dos afetos a atividades hoteleiras ou ao alojamento local", "95.000,00"],
    ["Valor patrimonial tributário dos imóveis parcialmente afetos à atividade, com exceção dos afetos a atividades hoteleiras ou ao alojamento local", "-"]])]),
  block("VPT dos imóveis afetos à atividade hoteleira ou de alojamento local", "0,00", "0,00", [table("Descrição da Despesa", [
    ["Valor patrimonial tributário dos imóveis totalmente afetos a atividades hoteleiras ou ao alojamento local", "-"],
    ["Valor patrimonial tributário dos imóveis parcialmente afetos a atividades hoteleiras ou ao alojamento local", "-"]])]),
  block("Outras despesas com aquisição de bens e prestações de serviços", "1.000,00", "850,00", [table("Descrição da Despesa", [
    ["Despesas com a aquisição de bens e prestações de serviços relacionadas com a atividade totalmente afetas", "700,00", "Ver Mais"],
    ["Despesas com a aquisição de bens e prestações de serviços relacionadas com a atividade parcialmente afetas", "300,00", "Ver Mais"]])])
]);
// A label neither reader knows, between two known ones: it must surface, flagged, with its own details.
var UNKNOWN_LABEL = page(2024, [
  block("Despesas com pessoal", "100,00", "100,00", [table("Descrição da Despesa",
    [["Despesas suportadas com pessoal e encargos a título de remunerações, ordenados ou salários", "100,00"]])]),
  block("Despesas com viaturas afetas à atividade", "640,00", "320,00", [table("Descrição da Despesa",
    [["Despesas com viaturas ligeiras de passageiros", "640,00"]])]),
  block("Outras despesas com aquisição de bens e prestações de serviços", "50,00", "42,50", [])
]);
// Every block zero, as on an account with no expenses in a year (the real 2025 capture's shape).
var ALL_ZERO = page(2023, [
  block("Despesas com pessoal", "0,00", "0,00", []),
  block("Despesas com rendas", "0,00", "0,00", []),
  block("VPT dos imóveis afetos à atividade empresarial/profissional", "0,00", "0,00", []),
  block("VPT dos imóveis afetos à atividade hoteleira ou de alojamento local", "0,00", "0,00", []),
  block("Outras despesas com aquisição de bens e prestações de serviços", "0,00", "0,00", [])
]);

// Odd shapes: a longer label ending in an old short label must stay whole (and unrecognised), and a detail
// value other than "1.234,56" or "-" is no amount. A hidden element is not page text.
var ODD = page(2022, [
  block("Encargos diversos Outras despesas", "10,00", "8,00", [table("Descrição da Despesa", [
    ["Linha sem valor publicado", "n/d"], ["Linha sem decimais", "12"], ["Linha com símbolo do euro", "5,00 €"]])]),
  "<div hidden>Despesas com pessoal 99,00 &euro; Valor a considerar 99,00 &euro;</div>",
  block("Outras despesas", "20,00", "17,00", [])
]);

module.exports = { REAL_SHAPE: REAL_SHAPE, UNKNOWN_LABEL: UNKNOWN_LABEL, ALL_ZERO: ALL_ZERO, ODD: ODD };
