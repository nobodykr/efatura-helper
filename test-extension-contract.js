// Static production-release guard: exact official hosts, local executable assets, direct privacy
// policy, and no bookmarklet/indexing expansion during the controlled extension launch.
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
assert(JSON.stringify(manifest.permissions) === JSON.stringify(["scripting", "storage", "alarms"]), "extension permissions exceed the reviewed set");
assert(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'none';", "extension pages are missing the hardened CSP");
assert(!JSON.stringify(manifest).includes("https://*."), "wildcard subdomain permission found");
assert(manifest.background.service_worker === "background.js", "unexpected background entrypoint");
assert(runtime.environment === "production", "runtime is not production");
assert(runtime.publicOrigin === "https://fiscalida.de", "canonical origin mismatch");
assert(runtime.bookmarkletInstallationEnabled === false, "bookmarklet installation re-enabled");
assert(runtime.adminBookmarkletInstallationEnabled === true, "gated admin bookmarklet is not enabled");
assert(runtime.marketIntake.enabled === true && runtime.marketIntake.requiredForLocalCompletion === true,
  "mandatory minimized market intake is not declared in the production contract");
assert(runtime.publicIndexingEnabled === false, "public indexing re-enabled");
assert(runtime.extension.profileRetention === "end-of-local-day", "runtime retention policy diverges from the implemented expiry");
assert(JSON.stringify(runtime.extension.localDocumentSchemas) === JSON.stringify(["credit-responsibilities.v1"]), "local CRC document contract missing");
assert(!existsSync("sitemap.xml"), "sitemap must not exist during the controlled launch");
assert(!existsSync("consulta.html") && !existsSync("contrato.html"), "retired lookup pages still exist");
assert(/Disallow:\s*\//.test(readFileSync("robots.txt", "utf8")), "robots.txt does not block crawling");
assert(/X-Robots-Tag:\s*noindex, nofollow, noarchive/i.test(readFileSync("_headers", "utf8")), "noindex response header missing");
const headers = readFileSync("_headers", "utf8");
assert(["/tool.js", "/profile-contract.js"].every((path) =>
  new RegExp(path.replace(".", "\\.") + "[\\s\\S]{0,180}Access-Control-Allow-Origin:\\s*\\*[\\s\\S]{0,120}Cross-Origin-Resource-Policy:\\s*cross-origin").test(headers)),
  "July-style loader assets are not explicitly cross-origin");
const hostGate = readFileSync("functions/[[path]].js", "utf8");
assert(/faturas\.diogoandrade\.com/.test(hostGate) && /BROWSER_ASSETS/.test(hostGate),
  "asset hostname is not limited to the reviewed browser files");
const htmlFiles = readdirSync(".").filter((f) => f.endsWith(".html"));
const publicHtml = htmlFiles.filter((f) => f !== "favorito-dev.html").map((f) => readFileSync(f, "utf8")).join("\n");
for (const file of htmlFiles) {
  const source = readFileSync(file, "utf8");
  assert(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(source), `${file} is missing the controlled-launch robots meta`);
}
assert(!/href\s*=\s*["']javascript:/i.test(publicHtml), "bookmarklet escaped the gated admin installer");
assert(!/href\s*=\s*["']\/(?:consulta|contrato)(?:[?"'#])/i.test(publicHtml), "link to retired lookup surface found");
assert(!/analytics\.d1060\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|challenges\.cloudflare\.com/.test(publicHtml), "retired analytics/font/widget host remains active");
assert(existsSync("favorito-dev.html"), "gated bookmarklet installer was not generated");
const bookmarklet = readFileSync("favorito-dev.html", "utf8");
assert(/href="javascript:/.test(bookmarklet) && /SHA-256/.test(bookmarklet) && /href="\/perfil"/.test(bookmarklet),
  "gated bookmarklet installer is incomplete");
const privacy = readFileSync("privacidade.html", "utf8");
assert(/https:\/\/fiscalida\.de\/privacidade/.test(privacy), "direct canonical privacy URL missing");
assert(/400 dias/.test(privacy) && /chrome\.storage\.local/.test(privacy), "retention/storage disclosure incomplete");
assert(/chrome\.storage\.session/.test(privacy), "temporary invoice dashboard storage is not disclosed");
assert(/<code>alarms<\/code>/.test(privacy) && /Contributo minimizado do modo gratuito/.test(privacy) &&
  /Uma fonte só conta como concluída/.test(privacy) && /datas de compra/.test(privacy),
  "privacy policy does not disclose the mandatory minimized intake");
const listing = readFileSync("extension/STORE-LISTING.md", "utf8");
assert(/`alarms`/.test(listing) && /troca do modo\s+gratuito/i.test(listing) && /agregados empresa\/ano/.test(listing),
  "store permission/privacy copy diverges from the packaged extension");
const ext = ["background.js", "bar.js", "profile.js", "crc-parser.js", "invoices.js", "config.js"].map((f) => readFileSync("extension/" + f, "utf8")).join("\n");
assert(!/<script[^>]+https?:|importScripts\s*\(\s*["']https?:/i.test(ext), "remote executable code found");
assert(/sender\.id === chrome\.runtime\.id/.test(ext) && /sender\.frameId === 0/.test(ext) && /senderEfatura/.test(ext),
  "extension message boundary is not pinned to the extension top frame and e-Fatura snapshot source");
assert(/setAccessLevel\(\{ accessLevel: "TRUSTED_CONTEXTS" \}\)/.test(ext) && /INVOICE_EXPIRY_ALARM/.test(ext),
  "temporary invoice data is not restricted and actively expired");
const build = readFileSync("extension/build.mjs", "utf8");
assert(/const runtimeFiles = \[/.test(build) && /utimesSync/.test(build) && /\['-X', '-q', zipPath, \.\.\.runtimeFiles\]/.test(build),
  "extension package is not built from a deterministic explicit allowlist");
assert(/node_modules\/pdfjs-dist\/build\/pdf\.mjs/.test(build) && /vendor\/pdf\.worker\.mjs/.test(build), "local PDF reader is not pinned into the extension package");
assert(/O PDF e o respetivo texto são processados localmente/.test(privacy), "CRC PDF privacy disclosure missing");
console.log("  extension release contract passed");
