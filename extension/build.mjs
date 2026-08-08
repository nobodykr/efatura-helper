// Build the Fatura Boa extension package:
//   node extension/build.mjs        (run from the repo root)
// 1. copies the CURRENT ../tool.js into the extension (the bundle IS the pinned code -
//    bump manifest.json "version" whenever tool.js changes, mirroring FB_VERSION)
// 2. renders icon16/48/128.png from ../icon.svg with the Playwright chromium
//    (same approach as make-icons.mjs - no PIL/ImageMagick on this box)
// 3. zips extension/ -> dist/fatura-boa-extension-<version>.zip (Web Store upload artifact)
// Requires playwright-core + a chromium; point these at your own install via env.
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(PW);
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const EXE = process.env.CHROMIUM_BIN || undefined;
const here = (f) => new URL('./' + f, import.meta.url).pathname;
const root = (f) => new URL('../' + f, import.meta.url).pathname;

copyFileSync(root('tool.js'), here('tool.js'));
console.log('tool.js copied into extension/');

const svg = readFileSync(root('icon.svg'), 'utf8').replace(/^[\s\S]*?(?=<svg)/, '');
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage();
for (const size of [16, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px">` +
    svg.replace('<svg', `<svg width="${size}" height="${size}"`) + '</div></body>');
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  writeFileSync(here(`icon${size}.png`), buf);
  console.log(`icon${size}.png rendered`);
}
await browser.close();

const version = JSON.parse(readFileSync(here('manifest.json'), 'utf8')).version;
mkdirSync(root('dist'), { recursive: true });
// Ship ONLY runtime files - dev scripts (build.mjs, shots.mjs) must not go to the Web Store.
execSync(`cd ${here('')} && rm -f ../dist/fatura-boa-extension-${version}.zip && zip -qr ../dist/fatura-boa-extension-${version}.zip . -x build.mjs shots.mjs`, { stdio: 'inherit' });
console.log(`dist/fatura-boa-extension-${version}.zip written`);
