// parseDespesasAtividadeHtml (tool.js) on invented pages in the real shape of /app/dashboard-regime-simplificado:
// every "Valor a considerar" block is kept with its full label, an unknown label surfaces flagged with a warning,
// and each "Ver Detalhes" table is attached to the block before it. The Faturação reader is pinned to
// these same pages and outputs.
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const pages = require("./fixtures/despesas-atividade.js");
const src = readFileSync("tool.js", "utf8");
let failures = 0;
function ok(name, cond) { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failures++; }
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  let j = src.indexOf("{", i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (!depth) { k++; break; } } }
  return src.slice(i, k);
}
const labelsAt = src.indexOf("var DESPESAS_ATIVIDADE_LABELS");
const dom = new JSDOM("", { runScripts: "outside-only" });
dom.window.eval([src.slice(labelsAt, src.indexOf("];", labelsAt) + 2), grab("despesasAtividadeText"),
  grab("despesasAtividadeTables"), grab("parseDespesasAtividadeHtml")].join("\n") + "\nwindow.parse = parseDespesasAtividadeHtml;");
const parse = html => JSON.parse(JSON.stringify(dom.window.parse(html)));

const real = parse(pages.REAL_SHAPE);
ok("real shape: the year comes from 'Ano 2025 Esta pagina'", real.ano === 2025);
ok("real shape: all five summary blocks with their full labels", JSON.stringify(Object.keys(real.categorias)) === JSON.stringify([
  "Despesas com pessoal", "Despesas com rendas",
  "VPT dos imóveis afetos à atividade empresarial/profissional",
  "VPT dos imóveis afetos à atividade hoteleira ou de alojamento local",
  "Outras despesas com aquisição de bens e prestações de serviços"]));
ok("real shape: amounts", real.categorias["Despesas com rendas"].valor === 7200 && real.categorias["Despesas com rendas"].considerar === 6000 &&
  real.categorias["VPT dos imóveis afetos à atividade empresarial/profissional"].valor === 95000);
ok("real shape: every block recognised, no warnings", Object.values(real.categorias).every(c => c.reconhecida) && !real.avisos);
const rendas = real.categorias["Despesas com rendas"].detalhes;
ok("real shape: both rents tables go to the rents block, in page order", rendas.length === 2 &&
  rendas[0].grupo === "DESPESAS COM RENDAS TOTALMENTE AFETAS" && rendas[1].grupo === "DESPESAS COM RENDAS PARCIALMENTE AFETAS");
ok("real shape: a '-' detail value is published as none (valor null, publicado '-')",
  rendas[0].linhas[0].valor === null && rendas[0].linhas[0].publicado === "-" && rendas[1].linhas[3].valor === 2400);
ok("real shape: 'Importancias suportadas...' detail lines are not summary blocks",
  Object.values(real.categorias).reduce((n, c) => n + c.detalhes.length, 0) === 6 && !real.categorias["Importâncias"]);
const outras = real.categorias["Outras despesas com aquisição de bens e prestações de serviços"].detalhes[0].linhas;
ok("real shape: detail values are euros as text, the 'Ver Mais' link is not data",
  outras.map(l => l.valor).join() === "700,300" && outras.every(l => Object.keys(l).join() === "descricao,valor,publicado"));

const unknown = parse(pages.UNKNOWN_LABEL);
const viaturas = unknown.categorias["Despesas com viaturas afetas à atividade"];
ok("unknown label: kept with its amounts and details, flagged", viaturas && viaturas.reconhecida === false &&
  viaturas.valor === 640 && viaturas.considerar === 320 && viaturas.detalhes[0].linhas[0].valor === 640);
ok("unknown label: one warning naming it", unknown.avisos && unknown.avisos.length === 1 &&
  /categoria não reconhecida «Despesas com viaturas afetas à atividade»/.test(unknown.avisos[0]));
ok("unknown label: the blocks around it are unchanged", unknown.categorias["Despesas com pessoal"].reconhecida === true &&
  unknown.categorias["Outras despesas com aquisição de bens e prestações de serviços"].considerar === 42.5);

const zero = parse(pages.ALL_ZERO);
ok("all-zero year: five zero blocks, not an empty page", zero.ano === 2023 && Object.keys(zero.categorias).length === 5 &&
  !zero.vazio && Object.values(zero.categorias).every(c => c.valor === 0 && c.considerar === 0));

const odd = parse(pages.ODD);
ok("a longer label ending in an old short label stays whole and unrecognised",
  odd.categorias["Encargos diversos Outras despesas"] && odd.categorias["Encargos diversos Outras despesas"].reconhecida === false &&
  odd.categorias["Outras despesas"].reconhecida === true && odd.avisos.length === 1);
ok("detail values: only 1.234,56 (EUR sign allowed) is an amount; the published text stays",
  JSON.stringify(odd.categorias["Encargos diversos Outras despesas"].detalhes[0].linhas.map(l => [l.valor, l.publicado])) ===
  JSON.stringify([[null, "n/d"], [null, "12"], [5, "5,00 \u20ac"]]));
ok("a hidden element is not read as a block", !odd.categorias["Despesas com pessoal"] && Object.keys(odd.categorias).length === 2);

for (const [name, html] of Object.entries(pages)) {
  const doc = new JSDOM(html).window.document;
  doc.querySelectorAll("[hidden]").forEach(n => n.remove());
  const blocks = (doc.body.textContent.match(/Valor a considerar/g) || []).length;
  ok(name + ": one category per 'Valor a considerar' pair", Object.keys(parse(html).categorias).length === blocks);
}
ok("older text shape still reads", JSON.stringify(parse("<p>Despesas Afetas à Atividade Ano 2024 Esta página Despesas com pessoal 1.000,00 € Valor a considerar 800,00 € Outras despesas 200,00 € Valor a considerar 150,50 €</p>").categorias) ===
  JSON.stringify({ "Despesas com pessoal": { valor: 1000, considerar: 800, reconhecida: true, detalhes: [] },
    "Outras despesas": { valor: 200, considerar: 150.5, reconhecida: true, detalhes: [] } }));
ok("no page marker is not available", parse("<p>Outra página</p>") === null);

if (failures) { console.error(failures + " failure(s)"); process.exit(1); }
