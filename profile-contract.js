/* Fiscalidade profile contract.
 *
 * This is inert, bundled data plus validators. It is the single source of truth used by the
 * website, the extension wrapper and the local DEV bookmarklet. It never reads an account page,
 * storage or the network.
 */
(function (root) {
  "use strict";

  var PARTITIONS = [
    { id: "efatura", label: "e-Fatura", short: "e-Fatura", icon: "i-receipt",
      host: "faturas.portaldasfinancas.gov.pt", open: "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action",
      why: "As tuas faturas e o setor de dedução de cada uma." },
    { id: "rendas", label: "Rendas (Imóveis)", short: "Rendas", icon: "i-home",
      host: "imoveis.portaldasfinancas.gov.pt", path: "/arrendamento",
      open: "https://imoveis.portaldasfinancas.gov.pt/arrendamento/consultarContratos/locador",
      why: "Contratos de arrendamento e recibos de renda." },
    { id: "situacao", label: "Situação fiscal (dívidas e prazos)", short: "Situação fiscal", icon: "i-shield",
      host: "sitfiscal.portaldasfinancas.gov.pt", path: "/geral",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/geral/dashboard",
      why: "Dívidas e coimas em aberto, e os próximos prazos da agenda fiscal." },
    { id: "atividade", label: "Atividade (cadastro e IVA)", short: "Atividade", icon: "i-work",
      host: "sitfiscal.portaldasfinancas.gov.pt", path: "/atividade",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/atividade/atividade/consultardeclaracoes",
      why: "Declarações de início, alteração e cessação de atividade." },
    { id: "atividade_integrada", label: "Atividade exercida (cadastro atual)", short: "Atividade exercida", icon: "i-work",
      host: "sitfiscal.portaldasfinancas.gov.pt", path: "/integrada",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/integrada/presentation",
      why: "CAE/CIRS, datas de início e cessação, contabilidade e enquadramento de IVA/IRS." },
    { id: "patrimonio", label: "Património predial (IMI)", short: "Património", icon: "i-building",
      host: "imoveis.portaldasfinancas.gov.pt", path: "/matrizesinter",
      open: "https://imoveis.portaldasfinancas.gov.pt/matrizesinter/web/consultar-patrimonio-predial",
      why: "Imóveis e VPT usados como base do IMI." },
    { id: "irs", label: "IRS (liquidações e reembolsos)", short: "IRS", icon: "i-doc",
      host: "sitfiscal.portaldasfinancas.gov.pt", path: "/inffin",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/inffin/entrada.html",
      why: "Liquidações de IRS e reembolsos de todos os anos." },
    { id: "movfin", label: "Movimentos financeiros", short: "Movimentos", icon: "i-euro",
      host: "sitfiscal.portaldasfinancas.gov.pt", path: "/movfin",
      open: "https://sitfiscal.portaldasfinancas.gov.pt/movfin/resumoCobranca",
      why: "Pagamentos e reembolsos de impostos." },
    { id: "recibos", label: "Recibos verdes (atividade)", short: "Recibos verdes", icon: "i-receipt",
      host: "irs.portaldasfinancas.gov.pt", path: "/recibos",
      open: "https://irs.portaldasfinancas.gov.pt/recibos/portal/consultar",
      why: "Recibos verdes emitidos e rendimentos de categoria B." },
    { id: "declaracoes", label: "Declarações de IRS", short: "Declarações", icon: "i-doc",
      host: "irs.portaldasfinancas.gov.pt", path: "/app/consulta",
      open: "https://irs.portaldasfinancas.gov.pt/app/consulta",
      why: "Declarações efetivas de cada ano, incluindo substituições." },
    { id: "deducoes", label: "Deduções oficiais", short: "Deduções", icon: "i-euro",
      host: "irs.portaldasfinancas.gov.pt", path: "/consultarDespesasDeducoes",
      open: "https://irs.portaldasfinancas.gov.pt/consultarDespesasDeducoes.action",
      why: "Totais oficiais da AT por categoria e por ano concluído." },
    { id: "despesas_atividade", label: "Despesas afetas à atividade", short: "Despesas de atividade", icon: "i-work",
      host: "irs.portaldasfinancas.gov.pt", path: "/app/dashboard-regime-simplificado",
      open: "https://irs.portaldasfinancas.gov.pt/app/dashboard-regime-simplificado",
      why: "Despesas reconhecidas para o regime simplificado da categoria B." },
    { id: "ss", label: "Segurança Social", short: "Segurança Social", icon: "i-shield",
      host: "www.seg-social.pt", path: "/ptss",
      open: "https://www.seg-social.pt/ptss/pssd/home",
      why: "Situação contributiva e pagamentos." }
  ];

  var ENDPOINT_RULES = [
    [/obterDocumentosAdquirente/, "efatura.documents.v1"],
    [/consultarDespesasDeducoes/, "irs.deductions.v1"],
    [/obterContratos\/locador/, "rents.contracts.v1"],
    [/obterRecibos\/locador/, "rents.receipts.v1"],
    [/\/geral\/dividas/, "tax-status.debts.v1"],
    [/\/geral\/coimas/, "tax-status.fines.v1"],
    [/agendaFiscal/, "tax-status.calendar.v1"],
    [/consultardeclaracoes/, "activity.declarations.v1"],
    [/integrada\/presentation/, "activity.integrated.v1"],
    [/liquidacoesIRSDataTables/, "irs.liquidations.v1"],
    [/reembolsosDataTables/, "irs.refunds.v1"],
    [/resumoCobranca/, "finance.movements.v1"],
    [/obtemDocumentosV2/, "receipts.green.v1"],
    [/\/app\/consulta\/pesquisa/, "irs.declarations.v1"],
    [/dashboard-regime-simplificado/, "activity.expenses.v1"],
    [/login\/personalData/, "social.profile.v1"],
    [/payments\/current/, "social.payments.v1"],
    [/situacao-contributiva/, "social.contribution-status.v1"],
    [/matrizesinter\/api\/patrimonio/, "property.assets.v1"]
  ];

  var IDS = new Set(PARTITIONS.map(function (item) { return item.id; }));
  var OFFICIAL_ORIGINS = new Set(PARTITIONS.map(function (item) { return "https://" + item.host; }));
  var DONE = new Set(["done", "unavailable"]);

  function endpointId(url) {
    var source = String(url || "").split("?")[0];
    for (var i = 0; i < ENDPOINT_RULES.length; i++)
      if (ENDPOINT_RULES[i][0].test(source)) return ENDPOINT_RULES[i][1];
    return null;
  }

  function partition(id) {
    for (var i = 0; i < PARTITIONS.length; i++) if (PARTITIONS[i].id === id) return PARTITIONS[i];
    return null;
  }

  function next(store) {
    store = store && store.partitions ? store : { partitions: {} };
    for (var i = 0; i < PARTITIONS.length; i++) {
      var saved = store.partitions[PARTITIONS[i].id];
      if (!saved || !DONE.has(saved.status)) return PARTITIONS[i];
    }
    return null;
  }

  function current(host, path) {
    var matches = PARTITIONS.filter(function (item) { return item.host === host; });
    for (var i = 0; i < matches.length; i++)
      if (matches[i].path && String(path || "").indexOf(matches[i].path) === 0) return matches[i];
    for (var j = 0; j < matches.length; j++) if (!matches[j].path) return matches[j];
    return null;
  }

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function validRequestId(value) {
    return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
  }

  function validEnvelope(value) {
    if (!plain(value) || value.contract !== 3 || !IDS.has(value.partition)) return false;
    if (!DONE.has(value.status) || !plain(value.data)) return false;
    if (typeof value.capturedAt !== "string" || value.capturedAt.length > 50) return false;
    if (value.shapes !== undefined && !plain(value.shapes)) return false;
    if (value.market !== undefined && !plain(value.market)) return false;
    return true;
  }

  var contract = Object.freeze({
    version: 3,
    agreementVersion: "market-v1",
    helloType: "fiscalidade-intake-hello-v3",
    readyType: "fiscalidade-intake-ready-v3",
    messageType: "fiscalidade-profile-envelope-v3",
    acceptedType: "fiscalidade-intake-accepted-v3",
    rejectedType: "fiscalidade-intake-rejected-v3",
    partitions: Object.freeze(PARTITIONS.map(function (item) { return Object.freeze(item); })),
    ids: IDS,
    officialOrigins: OFFICIAL_ORIGINS,
    endpointId: endpointId,
    partition: partition,
    next: next,
    current: current,
    validRequestId: validRequestId,
    isCompleteStatus: function (status) { return DONE.has(status); },
    validEnvelope: validEnvelope
  });

  root.FISCALIDADE_PROFILE_CONTRACT = contract;
  if (typeof module !== "undefined" && module.exports) module.exports = contract;
})(typeof globalThis !== "undefined" ? globalThis : this);
