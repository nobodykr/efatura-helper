// Execute the actual href produced by the gated installer in Chromium. This catches the exact
// regression that source-level tests missed: a dragged HTML href is URL-normalized before use.
const { chromium } = require("playwright-core");
const { readFileSync } = require("fs");

const installer = readFileSync("favorito-dev.html", "utf8");
const contract = readFileSync("profile-contract.js", "utf8");
const tool = readFileSync("tool.js", "utf8");
const options = { args:["--no-sandbox"] };
if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;

(async function () {
  const browser = await chromium.launch(options);
  const context = await browser.newContext();
  const requests = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url === "https://fiscalida.de/favorito-dev")
      return route.fulfill({ contentType:"text/html; charset=utf-8", body:installer });
    if (url.startsWith("https://faturas.diogoandrade.com/profile-contract.js"))
      return route.fulfill({ status:200, contentType:"application/javascript; charset=utf-8", body:contract,
        headers:{ "access-control-allow-origin":"*", "cross-origin-resource-policy":"cross-origin" } });
    if (url.startsWith("https://faturas.diogoandrade.com/tool.js"))
      return route.fulfill({ status:200, contentType:"application/javascript; charset=utf-8", body:tool,
        headers:{ "access-control-allow-origin":"*", "cross-origin-resource-policy":"cross-origin" } });
    if (url.startsWith("https://fiscalida.de/perfil"))
      return route.fulfill({ contentType:"text/html; charset=utf-8", body:"<!doctype html><title>Perfil</title>",
        headers:{ "cross-origin-opener-policy":"same-origin-allow-popups" } });
    if (url.startsWith("https://faturas.portaldasfinancas.gov.pt/"))
      return route.fulfill({ contentType:"text/html; charset=utf-8", body:"<!doctype html><body>e-Fatura</body>" });
    if (url.startsWith("https://sitfiscal.portaldasfinancas.gov.pt/integrada/presentation")) {
      const signed = /targetScreen=ecraActividade/.test(url);
      return route.fulfill({ contentType:"text/html; charset=utf-8", body:signed
        ? "<!doctype html><body>Atividade em IRS Data de Início 2023-01-01 Tipo de Contabilidade Não organizada</body>"
        : "<!doctype html><body><a href='/integrada/presentation?targetScreen=ecraActividade&amp;hmac=browser-fixture'>Atividade exercida</a></body>" });
    }
    return route.abort();
  });

  const installerPage = await context.newPage();
  await installerPage.goto("https://fiscalida.de/favorito-dev");
  const href = await installerPage.locator(".fav").evaluate((anchor) => anchor.href);
  if (!href.startsWith("javascript:") || href.length > 4000 || /[\r\n]/.test(href))
    throw new Error(`installer href is not a small bookmarklet (${href.length} chars)`);

  const officialPage = await context.newPage();
  await officialPage.goto("https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action");
  await officialPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  await officialPage.waitForSelector("#efh-panel", { timeout:15000 });
  const panel = await officialPage.locator("#efh-panel").innerText();
  if (!/Fatura Boa/.test(panel)) throw new Error("current tool panel did not execute");
  if (await officialPage.locator("#fb-prof-go").count())
    throw new Error("gated bookmarklet still asks for a redundant page-origin confirmation");
  if (!requests.some((url) => url.startsWith("https://faturas.diogoandrade.com/profile-contract.js")) ||
      !requests.some((url) => url.startsWith("https://faturas.diogoandrade.com/tool.js")))
    throw new Error("bookmarklet did not load both current browser assets");

  // The integrated activity detail rejects a background fetch and requires a signed top-level
  // navigation. The bookmarklet must complete it with the already-reserved profile tab, without
  // replacing its official hub page or requiring a second bookmarklet click.
  for (const page of context.pages())
    if (page !== installerPage && page !== officialPage) await page.close();
  const integratedStart = requests.length;
  const integratedPage = await context.newPage();
  const integratedHub = "https://sitfiscal.portaldasfinancas.gov.pt/integrada/presentation";
  await integratedPage.goto(integratedHub);
  await integratedPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  try {
    await integratedPage.waitForFunction(() => {
      const store = JSON.parse(localStorage.getItem("fb-profile-v1") || "{}");
      const row = store.partitions && store.partitions.atividade_integrada;
      return row && row.status === "done" && row.shape && row.shape["/integrada/presentation"];
    }, null, { timeout:15000 });
  } catch (error) {
    const diagnostic = await integratedPage.evaluate(() => ({
      panel:document.getElementById("efh-body") && document.getElementById("efh-body").innerText,
      store:localStorage.getItem("fb-profile-v1"), handoff:window.__FISCALIDADE_HANDOFF_DIAGNOSTICS__ || null,
      target:window.__FISCALIDADE_PROFILE_TARGET__ ? { closed:window.__FISCALIDADE_PROFILE_TARGET__.closed } : null
    }));
    throw new Error("integrated one-click timeout: " + JSON.stringify({ diagnostic,
      pages:context.pages().map((page) => page.url()), requests:requests.slice(integratedStart) }));
  }
  if (integratedPage.url() !== integratedHub)
    throw new Error("integrated bookmarklet replaced its own page and still needs a second click");
  const bridgeRequests = requests.slice(integratedStart);
  if (!bridgeRequests.some((url) => /sitfiscal\.portaldasfinancas\.gov\.pt\/integrada\/presentation.*targetScreen=ecraActividade/.test(url)))
    throw new Error("reserved profile tab did not perform the signed top-level activity read");
  if (bridgeRequests.filter((url) => url.startsWith("https://fiscalida.de/perfil")).length < 1)
    throw new Error("signed activity bridge did not return to the profile tab");
  await browser.close();
  console.log("  actual dragged installer href loads current assets and completes signed activity in one click");
})().catch((error) => { console.error(error); process.exit(1); });
