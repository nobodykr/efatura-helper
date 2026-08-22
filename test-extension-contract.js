// Static release-contract guard: exact official hosts, local executable assets, internal-only
// distribution, direct privacy policy, and no active bookmarklet/indexing surface.
const { readFileSync, existsSync, readdirSync } = require("fs");
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const runtime = JSON.parse(readFileSync("fiscalidade.config.json", "utf8"));
const exact = [
  "https://faturas.portaldasfinancas.gov.pt/*",
  "https://imoveis.portaldasfinancas.gov.pt/*",
  "https://sitfiscal.portaldasfinancas.gov.pt/*",
  "https://irs.portaldasfinancas.gov.pt/*",
  "https://www.seg-social.pt/*"
];
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(JSON.stringify(manifest.host_permissions) === JSON.stringify(exact), "host permissions are not the reviewed exact list");
assert(JSON.stringify(manifest.content_scripts[0].matches) === JSON.stringify(exact), "content-script matches diverge from permissions");
assert(!JSON.stringify(manifest).includes("https://*."), "wildcard subdomain permission found");
assert(manifest.background.service_worker === "background.js", "unexpected background entrypoint");
assert(runtime.environment === "internal-preview", "runtime is not internal preview");
assert(runtime.publicOrigin === "https://fiscalida.de", "canonical origin mismatch");
assert(runtime.bookmarkletInstallationEnabled === false, "bookmarklet installation re-enabled");
assert(runtime.publicIndexingEnabled === false, "public indexing re-enabled");
assert(runtime.extension.profileRetention === "end-of-local-day", "runtime retention policy diverges from the implemented expiry");
assert(!existsSync("sitemap.xml"), "sitemap must not exist during internal preview");
assert(!existsSync("consulta.html") && !existsSync("contrato.html"), "retired lookup pages still exist");
assert(/Disallow:\s*\//.test(readFileSync("robots.txt", "utf8")), "robots.txt does not block crawling");
assert(/X-Robots-Tag:\s*noindex, nofollow, noarchive/i.test(readFileSync("_headers", "utf8")), "noindex response header missing");
assert(!/\/tool\.js[\s\S]{0,120}Access-Control-Allow-Origin:\s*\*/.test(readFileSync("_headers", "utf8")), "cross-origin executable tool was re-enabled");
const html = readdirSync(".").filter((f) => f.endsWith(".html")).map((f) => readFileSync(f, "utf8")).join("\n");
for (const file of readdirSync(".").filter((f) => f.endsWith(".html"))) {
  const source = readFileSync(file, "utf8");
  assert(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(source), `${file} is missing the internal-preview robots meta`);
}
assert(!/href\s*=\s*["']javascript:/i.test(html), "active javascript bookmarklet link found");
assert(!/href\s*=\s*["']\/(?:consulta|contrato)(?:[?"'#])/i.test(html), "link to retired lookup surface found");
assert(!/analytics\.d1060\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|challenges\.cloudflare\.com/.test(html), "retired analytics/font/widget host remains active");
const privacy = readFileSync("privacidade.html", "utf8");
assert(/https:\/\/fiscalida\.de\/privacidade/.test(privacy), "direct canonical privacy URL missing");
assert(/400 dias/.test(privacy) && /chrome\.storage\.local/.test(privacy), "retention/storage disclosure incomplete");
const ext = ["background.js", "bar.js", "profile.js", "config.js"].map((f) => readFileSync("extension/" + f, "utf8")).join("\n");
assert(!/<script[^>]+https?:|importScripts\s*\(\s*["']https?:/i.test(ext), "remote executable code found");
console.log("  extension release contract passed");
