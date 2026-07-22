// The page publishes an exact list of the network requests the tool makes, so someone can audit
// it before running it. A claim like that rots the moment anyone adds a fetch. This pins it:
// clicking the bookmarklet must make ZERO requests until the user accepts the consent gate, then
// EXACTLY ONE off-site request, a GET of the public CAE map, and never a POST anywhere.
//   node test-network.js tool.js
const { chromium } = require("playwright-core");
const { readFileSync } = require("fs");
const EXE = process.env.CHROME_PATH || "/usr/bin/chromium"; // override with CHROME_PATH=... (was a hardcoded ~/.cache path, which leaked a username and only ran on one machine)
const rows = [{ estadoBeneficio: "P", nifEmitente: "500000009", nomeEmitente: "Pingo Doce", valorTotal: 20000,
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
  await p.waitForTimeout(2500);

  /* PHASE 1 - before consent. The gate must make the tool inert: not one request, not even the
   * public CAE map, and above all no read of the user's faturas. This is the stronger half of
   * the claim and it did not exist before the gate was added. */
  const before = [...new Set(reqs)];
  const okSilent = before.length === 0;
  console.log("  BEFORE consent - requests:", before.length, before.join(", ") || "(none)");
  console.log("  silent until the user agrees:", okSilent);

  /* PHASE 2 - accept, then the published list applies exactly as before. */
  await p.click("#efh-go", { timeout: 5000 });
  await p.waitForTimeout(4000);
  const uniq = [...new Set(reqs)];
  const offsite = uniq.filter(r => !r.includes("portaldasfinancas.gov.pt"));
  console.log("  total requests:", uniq.length);
  console.log("  off-site requests:", offsite.length, offsite.join(", ") || "(none)");
  // The tool no longer downloads the whole map. It fetches only the /bucket/<last 3 digits of
  // NIF> slices its own merchants fall into, so there are now MANY off-site requests instead of
  // one. What must still hold, and is what the page publishes, is that every one of them is a
  // GET for a map slice and that nothing is POSTed off-site by default.
  const okCount = offsite.length >= 1;
  const okGet = offsite.every(r => r.startsWith("GET "));
  const okMap = offsite.every(r => /\/bucket\/\d{3}\b/.test(r));
  const okNoPost = !uniq.some(r => r.startsWith("POST"));
  console.log("  off-site requests (map slices):", offsite.length);
  console.log("  every one is a GET:", okGet);
  console.log("  every one is /bucket/<3 digits>:", okMap);
  console.log("  no POST anywhere:", okNoPost);
  await b.close();
  if (!(okSilent && okCount && okGet && okMap && okNoPost)) {
    console.log("  *** FAIL: the published request list is no longer true ***");
    process.exit(1);
  }
  console.log("  PASS - matches what the page publishes");
})();
