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
assert(/MARKET_INTAKE_ENABLED\s*=\s*true/.test(profile), "mandatory minimized market intake is not enabled");
assert(/status:"pending",completionStatus:envelope\.status/.test(profile) &&
  /row\.status=row\.completionStatus\|\|"done"/.test(profile),
  "source completion is not gated on an accepted intake receipt");
assert(/fontes lidas · a confirmar/.test(profile) && /seg\.wait/.test(profile),
  "profile does not show an immediate pending-read state while required intake is confirmed");
assert(/schema_required/.test(profile) && /retry-intake/.test(profile),
  "missing schema or failed intake cannot be recovered safely");
assert(/CONTRACT\.isEndpointId/.test(profile) && /sanitizeShape/.test(profile),
  "browser intake does not allowlist endpoint IDs and sanitize shape leaves before transmission");
assert(/EXTRA_KEY[\s\S]*expiresAt:endOfDayTs\(\)/.test(profile) &&
  /removeItem\(EXTRA_KEY\)/.test(profile), "self-declared fiscal extras do not expire with the profile");
assert(/Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/.test(headers), "site headers would sever the official-tab handoff");
assert(/submissionToken/.test(profile) && /company-year-v1/.test(profile), "scoped market dedupe tokens missing");
assert(/Ler e voltar à Fiscalidade/.test(bar) && /Painel de faturas/.test(bar) &&
  !/Adicionar ao perfil|Analisar faturas/.test(bar),
  "extension bar does not separate the canonical profile action from the local invoice dashboard");
assert(/RUNTIME\.channel === "dev-bookmarklet"/.test(tool) && /bookmarklet: true/.test(tool) &&
  !/fb-save-profile/.test(tool) && /markProfileHandoff/.test(tool),
  "bookmarklet still requires a second consent/save click or cannot auto-retry its handoff");
assert(/__FISCALIDADE_PROFILE_TARGET__/.test(bar + readFileSync("build-bookmarklet-dev.mjs", "utf8") + tool),
  "bookmarklet/extension do not preserve the user-activated profile tab for the async handoff");
assert(/continuationType/.test(readFileSync("profile-contract.js", "utf8")) &&
  /signed-continuation/.test(profile) && /mais uma vez no mesmo favorito/.test(profile) &&
  /N.o procures Guardar/.test(profile),
  "signed AT continuation is not explicit and pinned in the canonical profile UI");
for (const page of pages) assert(!/launcher\.js/.test(readFileSync(page, "utf8")), `${page} still loads the website launcher`);
assert(!require("fs").existsSync("launcher.js"), "website launcher file survived");
console.log("  canonical profile, separate local dashboard, reusable tab and shared handoff contract passed");
