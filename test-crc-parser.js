// The public extension's CRC parser must return only a validated, identifier-free summary.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
function assert(ok, message) { if (!ok) throw new Error(message); }
function rejects(fn, pattern, message) {
  try { fn(); } catch (error) { if (pattern.test(error.message)) return; }
  throw new Error(message);
}

const dom = new JSDOM("", { runScripts: "outside-only" });
dom.window.eval(readFileSync("extension/crc-parser.js", "utf8"));
const parse = dom.window.FiscalidadeCrcParser.parseCrcText;
const sample = [
  "Central de Responsabilidades de Crédito",
  "Responsabilidades centralizadas em 31 de julho de 2026",
  "Montante em dívida Montante vencido Montante potencial Contratos Instituições",
  "Crédito à habitação 99.371,01 0,00 0,00 2 1",
  "Cartões e linhas 0,00 0,00 15.550,00 4 1",
  "Total 99.371,01 0,00 15.550,00 6 1",
  "Responsabilidade: Devedor"
].join("\n");
const result = parse(sample, "2026-08-23T12:00:00.000Z");
assert(result.schema === "credit-responsibilities.v1", "unexpected CRC schema");
assert(result.reference_month === "2026-07", "reference month was not parsed");
assert(result.effective_debt_eur === 99371.01 && result.overdue_debt_eur === 0, "effective/overdue debt mismatch");
assert(result.potential_credit_eur === 15550 && result.contracts === 6, "potential credit/contracts mismatch");
assert(result.roles.debtor_present === true && result.flags.arrears === false, "CRC flags mismatch");
assert(!/nif|nome|titular/i.test(JSON.stringify(result)), "parser emitted an identifier field");
rejects(() => parse(sample.replace("Total 99.371,01", "Total 99.370,01")), /não conciliam/, "non-conciliating totals were accepted");
rejects(() => parse(sample + "\n\ufffd"), /caracteres/, "replacement characters were accepted");
console.log("  local CRC parser validates totals and emits only the summary contract");
