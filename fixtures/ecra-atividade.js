// Real-shaped signed "Atividade Exercida" screen (ecraActividade), SYNTHETIC values only.
//
// The markup and label order follow a read-only live run on 06/10/2026 that returned ONLY the
// ordered labels (no value, code, date, name or NIF): .panel-title sections holding <dt>/<dd>
// pairs, and a Tipo / Codigo / Descricao / Data de Inicio table for the CAE/CIRS codes. Labels the
// probe withheld because they contain digits are stood in by "Rotulo omitido n". Panel titles other
// than "Atividade em IVA" / "Atividade em IRS" were not collected and are placeholders too.
//
//   ecraAtividade({ iva, irs, inicio, cessacao, tipoSujeito, contabilidade, codigos })
// `iva` / `irs` are the Enquadramento texts; null renders an empty <dd>.
function ecraAtividade(o) {
  o = o || {};
  const v = (x) => (x == null ? "" : String(x));
  const pair = (label, value) => "<dt>" + label + "</dt><dd>" + v(value) + "</dd>";
  const head = (label) => "<dt>" + label + "</dt>";
  const panel = (title, body) => '<div class="panel panel-default"><div class="panel-heading">' +
    '<div class="panel-title">' + title + '</div></div><div class="panel-body"><dl class="dl-horizontal">' +
    body + "</dl></div></div>";
  const codigos = o.codigos || [
    ["CIRS Principal", "0001", "DESCRICAO SINTETICA A", "2001-01-01"],
    ["CAE Secundário 1", "00002", "DESCRICAO SINTETICA B", "2001-01-01"],
    ["CAE Secundário 2", "00003", "DESCRICAO SINTETICA C", "2001-01-01"]
  ];
  const tabela = '<div class="panel panel-default"><div class="panel-heading"><div class="panel-title">' +
    "Titulo sintetico D</div></div><table class=\"table\"><thead><tr>" +
    ["Tipo", "Código", "Descrição", "Data de Início"].map((t) => '<th class="text-center">' + t + "</th>").join("") +
    "</tr></thead><tbody>" +
    codigos.map((c) => "<tr>" + c.map((x) => '<td class="text-center">' + x + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
  return "<main>" +
    panel("Titulo sintetico A",
      pair("Data de Início", o.inicio === undefined ? "2001-01-01" : o.inicio) +
      pair("Tipo de Sujeito Passivo", o.tipoSujeito === undefined ? "SUJEITO PASSIVO SINTETICO" : o.tipoSujeito)) +
    panel("Titulo sintetico B",
      pair("Tipo de Contabilidade", o.contabilidade || "Não organizada") +
      pair("Local de Centralização", "") + head("Morada") + pair("Av./Rua", "") + pair("Localidade", "") +
      head("Código Postal") + head("Contabilista Certificado") + pair("NIF", "") +
      pair("Número de Inscrição na OCC", "") + pair("Pleno Poderes Declarativos", "") +
      head("Contabilista Certificado Suplente") + pair("NIF", "") +
      pair("Número de Inscrição na OCC", "") + pair("Pleno Poderes Declarativos", "")) +
    panel("Titulo sintetico C",
      pair("Número EORI", "") + pair("Data Início EORI", "") + pair("Data Fim EORI", "")) +
    tabela +
    panel("Atividade em IVA",
      pair("Enquadramento", o.iva) + pair("Data de Enquadramento", "2001-01-01") + pair("Situação", "") +
      pair("Data de Cessação", o.cessacao) + pair("Motivo de Cessação", "") +
      pair("NIF do Cessionário", "") + pair("Nome do Cessionário", "") + pair("Rotulo omitido 1", "") +
      head("Regime Especial") + pair("Descrição", "") +
      head("Operações e Opções") + pair("Tipo de Operações", "") +
      pair("Pro Rata para Dedução de IVA", "") + pair("Transações Intracomunitárias de Bens", "") +
      pair("Rotulo omitido 2", "") + pair("Opção por Regime de Tributação", "") +
      pair("Opção por Periodicidade Mensal", "") + pair("Rotulo omitido 3", "") +
      pair("Importações", "") + pair("Exportações", "") +
      head("Transações Intracomunitárias") + pair("Aquisições", "") + pair("Transmissões", "") +
      head("Regime de Reembolso Mensal de IVA") + pair("Situação", "") +
      pair("Data de Início", "") + pair("Data de Fim", "") +
      head("Regime de IVA de Caixa") + pair("Data de Início", "") + pair("Data de Fim", "") +
      pair("Motivo de Exclusão", "") +
      head("Rotulo omitido 4") + pair("Data de Início", "") + pair("Data de Fim", "") +
      pair("Motivo de Cancelamento", "") +
      head("Rotulo omitido 5") + pair("Data de Início", "") + pair("Data de Fim", "") + pair("Motivo", "")) +
    panel("Atividade em IRS",
      pair("Enquadramento", o.irs) + pair("Data de Enquadramento", "2001-01-01") +
      pair("Data de Fim de Enquadramento", "") + pair("Regime de Tributação", "") +
      pair("Data de Início do Período", "") + pair("Data de Cessação", o.cessacao) +
      pair("Motivo de Cessação", "") + head("Rotulo omitido 6") + pair("Data da Opção", "") +
      pair("Data de Fim", "") + pair("Motivo", "")) +
    "</main>";
}
module.exports = { ecraAtividade };
