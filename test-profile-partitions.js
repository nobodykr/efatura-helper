const fs = require("fs");

const tool = fs.readFileSync("tool.js", "utf8");
const background = fs.readFileSync("extension/background.js", "utf8");
const profile = fs.readFileSync("perfil.html", "utf8");
const extensionProfile = fs.readFileSync("extension/profile.js", "utf8");
const home = fs.readFileSync("index.html", "utf8");
const contract = fs.readFileSync("profile-contract.js", "utf8");

let fails = 0;
function check(ok, message) {
  if (ok) console.log("  ok  ", message);
  else { console.log("  FAIL", message); fails += 1; }
}

const splitIds = ["atividade_integrada", "declaracoes", "deducoes", "despesas_atividade"];
for (const id of splitIds) {
  check(new RegExp(`id:\\s*"${id}"`).test(tool), `tool exposes separate ${id} partition`);
  check(new RegExp(`id:\\s*"${id}"`).test(contract), `shared contract accepts ${id} handoff`);
  check(/profile-contract\.js/.test(background) && /profile-contract\.js/.test(profile), `extension and web load the ${id} contract`);
  check(extensionProfile.includes(`${id}:`), `legacy extension profile still labels ${id}`);
}

const activityBlock = (tool.match(/function readAtividade\(\)[\s\S]*?\n  }\n\n  \/\* "Atividade Exercida"/) || [""])[0];
check(activityBlock && !/readAtividadeExercida\s*\(/.test(activityBlock),
  "declarations reader does not cross into the PFAP activity session");
check(/location\.href\s*=\s*href/.test(tool),
  "signed integrated activity screen uses top-level read-only navigation");
check(/disponivel:\s*false[\s\S]*estado desconhecido/.test(tool),
  "missing integrated activity menu remains unknown");
check(/cessada:\s*null[\s\S]*ultimaDeclaracaoTipo/.test(activityBlock),
  "declaration history never claims the current activity state");
check(/function atividadeTemporal\([\s\S]*ultimoI > ultimoC/.test(tool),
  "integrated activity compares the latest effective start and cessation");
check(/proximoInicio/.test(tool) && /estadoAtual === "aberta"/.test(tool),
  "future activity stays separate from the current-open signal");

const receiptsBlock = (tool.match(/function readRecibos\(\)[\s\S]*?\n  }\n\n  \/\* DEDU/) || [""])[0];
check(/pullYear\(ano, offset \+ rows\.length, all\)/.test(receiptsBlock),
  "green receipts paginate until the declared total is reconciled");
check(!/readDeclaracoes\(|readDeducoesOficiais\(|readDespesasAtividade\(/.test(receiptsBlock),
  "green-receipt session does not call other IRS SSO partitions");

check(/consultarDespesasDeducoesService\.action\?anoDashboard=/.test(tool),
  "official deductions use the portal's year-specific JSON service");
check(/\[y - 1, y - 2, y - 3, y - 4\]/.test(tool),
  "deductions request four completed income years, not the refused open year");
check(/Number\(ano\) !== Number\(requestedYear\)/.test(tool),
  "deductions reject a response for the wrong year");

check(profile.includes("0 de 13") || !profile.includes("0 de 9"), "profile has no stale 9-source counter");
check(home.includes("0 de 13 fontes reunidas"), "homepage mirror starts at 0 of 13 sources");
check(!/detalhes\.recibos\.declaracoes/.test(profile), "declarations are no longer nested under receipts");

console.log(fails ? `\n  ${fails} profile partition failure(s)` : "\n  profile SSO partition contract holds");
process.exit(fails ? 1 : 0);
