// Execute the actual href produced by the gated installer in Chromium. This catches the exact
// regression that source-level tests missed: a dragged HTML href is URL-normalized before use.
const { chromium } = require("playwright-core");
const { readFileSync } = require("fs");

const installer = readFileSync("favorito-dev.html", "utf8");
const contract = readFileSync("profile-contract.js", "utf8");
const tool = readFileSync("tool.js", "utf8");
const profile = readFileSync("perfil.html", "utf8");
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
    if (url === "https://fiscalida.de/profile-contract.js")
      return route.fulfill({ status:200, contentType:"application/javascript; charset=utf-8", body:contract });
    if (url === "https://fiscalida.de/api/v1/intake") {
      const body = route.request().postDataJSON();
      return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true,
        accepted:{ shapes:Object.keys(body.shapes || {}).length, companies:(body.companies || []).length } }) });
    }
    if (url.startsWith("https://fiscalida.de/perfil"))
      return route.fulfill({ contentType:"text/html; charset=utf-8", body:profile,
        headers:{ "cross-origin-opener-policy":"same-origin-allow-popups" } });
    if (url.includes("faturas.portaldasfinancas.gov.pt/json/obterDocumentosAdquirente.action"))
      return route.fulfill({ contentType:"application/json", body:JSON.stringify({ linhas:[], totalElementos:0 }) });
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
  await installerPage.evaluate(() => localStorage.setItem("fiscalidade-market-agreement-v1",
    JSON.stringify({ version:"market-v1", accepted:true, acceptedAt:new Date().toISOString() })));
  const href = await installerPage.locator(".fav").evaluate((anchor) => anchor.href);
  if (!href.startsWith("javascript:") || href.length > 4000 || /[\r\n]/.test(href))
    throw new Error(`installer href is not a small bookmarklet (${href.length} chars)`);

  // Model the real guided flow: /perfil opens and owns the named official tab. With the production
  // opener policy this direction of the relationship is what keeps the nonce channel available.
  const profileStart = await context.newPage();
  await profileStart.goto("https://fiscalida.de/perfil");
  const officialOpened = context.waitForEvent("page");
  await profileStart.evaluate(() => window.open(
    "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action", "fiscalidade-oficial"));
  const officialPage = await officialOpened;
  await officialPage.waitForLoadState("domcontentloaded");
  const officialClosed = officialPage.waitForEvent("close", { timeout:5000 });
  await officialPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  await officialPage.waitForSelector("#efh-panel", { timeout:15000 });
  const panel = await officialPage.locator("#efh-panel").innerText();
  if (!/Fatura Boa/.test(panel)) throw new Error("current tool panel did not execute");
  if (await officialPage.locator("#fb-prof-go").count())
    throw new Error("gated bookmarklet still asks for a redundant page-origin confirmation");
  if (!requests.some((url) => url.startsWith("https://faturas.diogoandrade.com/profile-contract.js")) ||
      !requests.some((url) => url.startsWith("https://faturas.diogoandrade.com/tool.js")))
    throw new Error("bookmarklet did not load both current browser assets");
  try {
    await officialPage.waitForFunction(() => {
      const store = JSON.parse(localStorage.getItem("fb-profile-v1") || "{}");
      return store.partitions && store.partitions.efatura && store.partitions.efatura.handoff &&
        store.partitions.efatura.handoff.status === "accepted";
    }, null, { timeout:15000 });
  } catch (error) {
    throw new Error("e-Fatura handoff never reached accepted: " + await officialPage.locator("#efh-body").innerText());
  }
  const firstProfile = profileStart;
  if (!firstProfile) throw new Error("profile tab did not open after the e-Fatura read");
  await firstProfile.waitForFunction(() => {
    const store = JSON.parse(localStorage.getItem("fb-profile-v2") || "{}");
    return store.partitions && store.partitions.efatura && store.partitions.efatura.status === "done";
  }, null, { timeout:5000 });
  await officialClosed;

  // Start the exceptional integrated flow with a clean profile so the progress assertion is exact.
  await firstProfile.evaluate(() => {
    localStorage.removeItem("fb-profile-v2");
    localStorage.removeItem("fiscalidade-active-intake-v3");
    localStorage.removeItem("fiscalidade-signed-navigation-v1");
  });

  // The integrated activity detail rejects a background fetch and requires a signed top-level
  // navigation. A bookmarklet cannot survive replacing its document. The first click must clearly
  // announce that exceptional continuation in /perfil and navigate the official tab; the second
  // click must then reach accepted and move /perfil from 0/13 to 1/13.
  const integratedStart = requests.length;
  const integratedHub = "https://sitfiscal.portaldasfinancas.gov.pt/integrada/presentation";
  const integratedOpened = context.waitForEvent("page");
  await firstProfile.evaluate((url) => window.open(url, "fiscalidade-oficial"), integratedHub);
  const integratedPage = await integratedOpened;
  await integratedPage.waitForLoadState("domcontentloaded");
  await integratedPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  await integratedPage.waitForURL(/targetScreen=ecraActividade/, { timeout:15000 });
  const continuationProfile = firstProfile;
  if (!continuationProfile) throw new Error("profile tab did not open for the signed activity continuation");
  await continuationProfile.waitForSelector("#signed-continuation", { timeout:5000 });
  const instruction = await continuationProfile.locator("#signed-continuation").innerText();
  if (!/mais uma vez no mesmo favorito/.test(instruction) || !/Não procures Guardar/.test(instruction))
    throw new Error("signed activity continuation is not explicit enough for the user");
  const bridgeRequests = requests.slice(integratedStart);
  if (!bridgeRequests.some((url) => /sitfiscal\.portaldasfinancas\.gov\.pt\/integrada\/presentation.*targetScreen=ecraActividade/.test(url)))
    throw new Error("first click did not perform the signed top-level activity navigation");
  const integratedClosed = integratedPage.waitForEvent("close", { timeout:5000 });
  await integratedPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  await integratedPage.waitForFunction(() => {
    const store = JSON.parse(localStorage.getItem("fb-profile-v1") || "{}");
    const row = store.partitions && store.partitions.atividade_integrada;
    return row && row.handoff && row.handoff.status === "accepted";
  }, null, { timeout:15000 });
  await continuationProfile.waitForFunction(() => {
    const store = JSON.parse(localStorage.getItem("fb-profile-v2") || "{}");
    const row = store.partitions && store.partitions.atividade_integrada;
    return row && row.status === "done" && !localStorage.getItem("fiscalidade-signed-navigation-v1");
  }, null, { timeout:5000 });
  if (!/1 de 13 fontes reunidas/.test(await continuationProfile.locator(".plabel").innerText()))
    throw new Error("profile did not move to 1/13 after the accepted second click");
  await integratedClosed;

  // An arbitrary official tab has no reliable profile-owned WindowProxy under COOP. It must stop
  // before reading and explain the guided start, never enter another endless "A concluir" state.
  const unownedPage = await context.newPage();
  await unownedPage.goto("https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action");
  let guardMessage = "";
  unownedPage.once("dialog", async (dialog) => { guardMessage = dialog.message(); await dialog.accept(); });
  await unownedPage.evaluate((bookmarklet) => { location.href = bookmarklet; }, href);
  await unownedPage.waitForTimeout(300);
  if (!/Comeca em fiscalida\.de\/perfil/.test(guardMessage) || await unownedPage.locator("#efh-panel").count())
    throw new Error("unowned official tab was read instead of being redirected to the guided start");
  if (unownedPage.isClosed()) throw new Error("a stopped/unowned official tab was closed without an accepted receipt");
  await browser.close();
  console.log("  dragged bookmarklet accepts e-Fatura in one click and signed activity in one explicit continuation");
})().catch((error) => { console.error(error); process.exit(1); });
