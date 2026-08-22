// Build the Fatura Boa extension package:
//   node extension/build.mjs        (run from the repo root)
// 1. copies the CURRENT ../tool.js into the extension (the bundle IS the pinned code -
//    bump manifest.json "version" whenever tool.js changes, mirroring FB_VERSION)
// 2. bundles the canonical runtime config and offers data; no executable dependency is remote
// 3. renders icon16/48/128.png from ../icon.svg with the Playwright chromium
//    (same approach as make-icons.mjs - no PIL/ImageMagick on this box)
// 4. zips extension/ -> dist/fatura-boa-extension-<version>.zip (internal review artifact)
// Requires playwright-core + a chromium; point these at your own install via env.
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(PW);
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const EXE = process.env.CHROMIUM_BIN || undefined;
const here = (f) => new URL('./' + f, import.meta.url).pathname;
const root = (f) => new URL('../' + f, import.meta.url).pathname;

copyFileSync(root('tool.js'), here('tool.js'));
console.log('tool.js copied into extension/');

const runtime = JSON.parse(readFileSync(root('fiscalidade.config.json'), 'utf8'));
if (runtime.environment !== 'internal-preview' || runtime.bookmarkletInstallationEnabled !== false)
  throw new Error('refusing extension build outside the approved internal-preview configuration');
writeFileSync(here('config.js'), `/* Generated from fiscalidade.config.json. */\n`+
  `globalThis.__FISCALIDADE_CONFIG__ = Object.freeze(${JSON.stringify({
    publicOrigin: runtime.publicOrigin,
    apiBase: runtime.apiBase,
    extension: true,
    remoteCodeAllowed: false
  }, null, 2).replace(/\n}\s*$/, ',\n  "offersUrl": chrome.runtime.getURL("offers.json")\n}')});\n`);
copyFileSync(root('offers.json'), here('offers.json'));
console.log('config and offers bundled into extension/');

const svg = readFileSync(root('icon.svg'), 'utf8').replace(/^[\s\S]*?(?=<svg)/, '');
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
for (const size of [16, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px">` +
    svg.replace('<svg', `<svg width="${size}" height="${size}"`) + '</div></body>',
    { waitUntil: 'domcontentloaded' });
  const buf = await page.locator('svg').screenshot({ omitBackground: true, timeout: 10000 });
  writeFileSync(here(`icon${size}.png`), buf);
  await page.close();
  console.log(`icon${size}.png rendered`);
}
await browser.close();

const version = JSON.parse(readFileSync(here('manifest.json'), 'utf8')).version;
mkdirSync(root('dist'), { recursive: true });
// Ship ONLY runtime files - dev scripts and store-copy working notes stay out of the package.
const zipPath = root(`dist/fatura-boa-extension-${version}.zip`);
rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', zipPath, '.', '-x', 'build.mjs', 'shots.mjs', 'store-shots.mjs',
  'STORE-LISTING.md', 'FIREFOX.md'], { cwd: here(''), stdio: 'inherit' });
console.log(`${zipPath} written`);
