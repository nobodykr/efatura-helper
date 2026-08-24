const { readFileSync } = require("fs");
const contract = readFileSync("profile-contract.js", "utf8");
const profile = readFileSync("perfil.html", "utf8");
const tool = readFileSync("tool.js", "utf8");
const bar = readFileSync("extension/bar.js", "utf8");
const headers = readFileSync("_headers", "utf8");
const pages = ["404.html","auditoria.html","deducoes.html","index.html","perfil.html","privacidade.html","sobre.html","termos.html","verificar.html"];
function assert(ok, message) { if (!ok) throw new Error(message); }
assert((contract.match(/id:\s*"[a-z_]+"/g) || []).length === 13, "shared contract does not contain exactly 13 sources");
assert(/CONTRACT\.next\(store\)/.test(profile) && !/id="srcsel"/.test(profile), "profile still exposes competing source actions");
assert(/target="fiscalidade-oficial"/.test(profile), "guided source tab is not reused");
assert(/fiscalidade-intake-ready-v3/.test(contract) && /requestId/.test(profile + tool) && /nonce/.test(profile + tool),
  "nonce/request-bound browser handoff missing");
assert(!/handoffUrl\(|location\.href\s*=\s*handoff/.test(tool), "new handoff can still put fiscal data in a URL fragment");
assert(/MARKET_INTAKE_ENABLED\s*=\s*false/.test(profile), "optional market intake is not explicitly disabled");
assert(/status:envelope\.status/.test(profile), "local completion still depends on market intake");
assert(/Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/.test(headers), "site headers would sever the official-tab handoff");
assert(/submissionToken/.test(profile) && /company-year-v1/.test(profile), "scoped market dedupe tokens missing");
assert(/Ler e voltar à Fiscalidade/.test(bar) && !/Painel de faturas|Adicionar ao perfil|Analisar faturas/.test(bar),
  "extension bar still has duplicate workflow actions");
for (const page of pages) assert(!/launcher\.js/.test(readFileSync(page, "utf8")), `${page} still loads the website launcher`);
assert(!require("fs").existsSync("launcher.js"), "website launcher file survived");
console.log("  canonical profile, single action, reusable tab and shared handoff contract passed");
