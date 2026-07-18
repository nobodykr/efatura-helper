// The page publishes an exact list of the network requests the tool makes, so someone can audit
// it before running it. A claim like that rots the moment anyone adds a fetch. This pins it:
// clicking the bookmarklet must make EXACTLY ONE off-site request, a GET of the public CAE map,
// and never a POST anywhere.
//   node test-network.js tool.js
const { chromium } = require("playwright-core");
const { readFileSync } = require("fs");
const EXE = "/home/diogo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const rows = [{ estadoBeneficio: "P", nifEmitente: "9", nomeEmitente: "Pingo Doce", valorTotal: 20000,
                valorTotalIva: 1200, dataEmissaoDocumento: "2026-06-01", idDocumento: "p1" }];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const p = await b.newPage();
  const reqs = [];
  p.on("request", r => reqs.push(`${r.method()} ${r.url().split("?")[0]}`));
  await p.route("**/*", r => {
    const u = r.request().url();
    if (u.includes("portaldasfinancas") && u.includes("obterDocumentos"))
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ linhas: rows }) });
    if (u.startsWith("https://faturas.portaldasfinancas.gov.pt/"))
      return r.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" });
    return r.continue();
  });
  await p.goto("https://faturas.portaldasfinancas.gov.pt/x");
  reqs.length = 0;                       // count only what the tool itself does
  await p.addScriptTag({ content: readFileSync(process.argv[2], "utf8") });
  await p.waitForSelector("#efh-panel", { timeout: 15000 });
  await p.waitForTimeout(4000);
  const uniq = [...new Set(reqs)];
  const offsite = uniq.filter(r => !r.includes("portaldasfinancas.gov.pt"));
  console.log("  total requests:", uniq.length);
  console.log("  off-site requests:", offsite.length, offsite.join(", ") || "(none)");
  const okCount = offsite.length === 1;
  const okGet = offsite.every(r => r.startsWith("GET "));
  const okMap = offsite.every(r => r.includes("/sectors.json"));
  const okNoPost = !uniq.some(r => r.startsWith("POST"));
  console.log("  exactly one off-site request:", okCount);
  console.log("  it is a GET:", okGet);
  console.log("  it is the public CAE map:", okMap);
  console.log("  no POST anywhere:", okNoPost);
  await b.close();
  if (!(okCount && okGet && okMap && okNoPost)) {
    console.log("  *** FAIL: the published request list is no longer true ***");
    process.exit(1);
  }
  console.log("  PASS - matches what the page publishes");
})();
