// Chrome Web Store listing screenshots: exactly 1280x800 PNG, full-bleed (the store crops/frames
// to that ratio). Same mock-portal harness as shots.mjs (no login, fake invoices), but the viewport
// IS the store canvas so the panel sits on a realistic portal-grey backdrop. Outputs to dist/store/.
//   PLAYWRIGHT_CORE=... CHROMIUM_BIN=... node extension/store-shots.mjs
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(PW);
import { readFileSync, mkdirSync } from 'node:fs';

const root = (f) => new URL('../' + f, import.meta.url).pathname;
mkdirSync(root('dist/store'), { recursive: true });

const rows = [
  { idDocumento: 'a1', dataEmissaoDocumento: '2026-07-03', nomeEmitente: 'FARMACIA CENTRAL DO PORTO, LDA', nifEmitente: '508210500', valorTotal: 2345, valorTotalIva: 449, estadoBeneficio: 'P', actividadeEmitente: null },
  { idDocumento: 'a2', dataEmissaoDocumento: '2026-07-09', nomeEmitente: 'CONFEITARIA LECA, LDA', nifEmitente: '515431320', valorTotal: 860, valorTotalIva: 112, estadoBeneficio: 'P', actividadeEmitente: null },
  { idDocumento: 'a3', dataEmissaoDocumento: '2026-07-15', nomeEmitente: 'PHYSICAL GET EXCITED LECA DA PALMEIRA, UNIPESSOAL LDA', nifEmitente: '517276909', valorTotal: 1500, valorTotalIva: 345, estadoBeneficio: 'R', actividadeEmitente: 'C99' },
];
const caemap = { '508210500': ['C05'], '515431320': ['C03'], '517276909': ['C11'] };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// portal-grey backdrop with a faux content block, so the panel reads as "on the e-Fatura page"
const HARNESS = '<html><body style="margin:0;background:#eef1f5;font-family:system-ui">' +
  '<div style="height:56px;background:#0d3b66;color:#fff;display:flex;align-items:center;padding:0 28px;font-weight:600">Portal das Financas - e-Fatura</div>' +
  '<div style="max-width:900px;margin:28px auto;background:#fff;border:1px solid #d7dde6;border-radius:8px;height:560px"></div>' +
  '</body></html>';

await page.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('https://faturas.portaldasfinancas.gov.pt/') && !u.includes('.action'))
    return route.fulfill({ contentType: 'text/html', body: HARNESS });
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

const tool = readFileSync(root('tool.js'), 'utf8');
const shot = (name) => page.screenshot({ path: root('dist/store/' + name), clip: { x: 0, y: 0, width: 1280, height: 800 } });

await page.goto('https://faturas.portaldasfinancas.gov.pt/');

// 1. consent gate with the situacoes questions (the honest "what it asks")
await page.evaluate(tool);
await page.waitForSelector('#efh-go');
await page.waitForTimeout(700);
await shot('01-gate.png');

// 2. results, resumo (the payoff figure)
await page.click('#efh-go');
await page.waitForSelector('#efh-tab-d', { timeout: 15000 });
await page.waitForTimeout(900);
await shot('02-resumo.png');

// 3. detalhe with the per-invoice table + deep links (the workhorse)
await page.click('#efh-tab-d');
await page.waitForTimeout(400);
await shot('03-detalhe.png');

await browser.close();
console.log('store shots: dist/store/01-gate.png 02-resumo.png 03-detalhe.png (1280x800)');
