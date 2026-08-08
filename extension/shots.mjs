// Visual-check screenshots of the injected panel, no login and no real data:
// playwright intercepts https://faturas.portaldasfinancas.gov.pt/ and serves a blank harness,
// mocks the two portal endpoints with fake invoices, serves tool.js + fonts from THIS repo.
//   PLAYWRIGHT_CORE=... CHROMIUM_BIN=... node extension/shots.mjs
// Outputs: dist/panel-side.png, dist/panel-wide.png, dist/panel-gate.png
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(PW);
import { readFileSync, mkdirSync } from 'node:fs';

const root = (f) => new URL('../' + f, import.meta.url).pathname;
mkdirSync(root('dist'), { recursive: true });

const rows = [
  { idDocumento: 'a1', dataEmissaoDocumento: '2026-07-03', nomeEmitente: 'FARMACIA CENTRAL DO PORTO, LDA', nifEmitente: '508210500', valorTotal: 2345, valorTotalIva: 449, estadoBeneficio: 'P', actividadeEmitente: null },
  { idDocumento: 'a2', dataEmissaoDocumento: '2026-07-09', nomeEmitente: 'CONFEITARIA LECA, LDA', nifEmitente: '515431320', valorTotal: 860, valorTotalIva: 112, estadoBeneficio: 'P', actividadeEmitente: null },
  { idDocumento: 'a3', dataEmissaoDocumento: '2026-07-15', nomeEmitente: 'PHYSICAL GET EXCITED LECA DA PALMEIRA, UNIPESSOAL LDA', nifEmitente: '517276909', valorTotal: 1500, valorTotalIva: 345, estadoBeneficio: 'R', actividadeEmitente: 'C99' },
];
const caemap = { '508210500': ['C05'], '515431320': ['C03'], '517276909': ['C11'] };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.route('**/*', (route) => {
  const u = route.request().url();
  if (u === 'https://faturas.portaldasfinancas.gov.pt/' || u.startsWith('https://faturas.portaldasfinancas.gov.pt/?'))
    return route.fulfill({ contentType: 'text/html', body: '<html><body style="background:#e8ecf2;font-family:sans-serif"><h2 style="padding:30px">e-Fatura (harness)</h2></body></html>' });
  if (u.includes('obterDocumentosAdquirente'))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ linhas: rows, totalElementos: rows.length }) });
  if (u.includes('sectors.json') || u.includes('/bucket/'))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(caemap) });
  if (u.includes('offers.json'))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ message: 'Isto e gratuito.', offers: [] }) });
  if (u.includes('/fonts/')) {
    const f = u.split('/fonts/')[1].split('?')[0];
    try { return route.fulfill({ contentType: 'font/woff2', body: readFileSync(root('fonts/' + f)) }); }
    catch (e) { return route.fulfill({ status: 404, body: '' }); }
  }
  return route.fulfill({ status: 404, body: '' });
});

await page.goto('https://faturas.portaldasfinancas.gov.pt/');
const tool = readFileSync(root('tool.js'), 'utf8');

// 1. consent gate WITH situacoes questions
await page.evaluate(tool);
await page.waitForSelector('#efh-go');
await page.waitForTimeout(600);
await page.locator('#efh-panel').screenshot({ path: root('dist/panel-gate.png') });

// 2. accept -> results, side mode
await page.click('#efh-go');
await page.waitForSelector('#efh-tab-d', { timeout: 15000 });
await page.waitForTimeout(800);
await page.click('#efh-tab-d');
await page.waitForTimeout(300);
await page.locator('#efh-panel').screenshot({ path: root('dist/panel-side.png') });

// 3. wide mode
await page.click('#efh-expand');
await page.waitForTimeout(300);
await page.locator('#efh-panel').screenshot({ path: root('dist/panel-wide.png') });

await browser.close();
console.log('shots written: dist/panel-gate.png, dist/panel-side.png, dist/panel-wide.png');
