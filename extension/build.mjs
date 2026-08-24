// Build the Fatura Boa extension package:
//   node extension/build.mjs                    (stable package, run from the repo root)
//   node extension/build.mjs --channel=dev      (separate unpacked DEV package + ZIP)
// 1. copies the CURRENT ../tool.js into the extension (the bundle IS the pinned code -
//    bump manifest.json "version" whenever tool.js changes, mirroring FB_VERSION)
// 2. bundles the canonical runtime config and offers data; no executable dependency is remote
// 3. renders icon16/48/128.png from ../icon.svg with the Playwright chromium
//    (same approach as make-icons.mjs - no PIL/ImageMagick on this box)
// 4. zips extension/ -> dist/fatura-boa-extension-<version>.zip (internal review artifact)
// Requires playwright-core + a chromium; point these at your own install via env.
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(PW);
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const EXE = process.env.CHROMIUM_BIN || undefined;
const here = (f) => new URL('./' + f, import.meta.url).pathname;
const root = (f) => new URL('../' + f, import.meta.url).pathname;
const channelArg = process.argv.find((arg) => arg.startsWith('--channel='));
const channel = channelArg ? channelArg.slice('--channel='.length) : 'stable';
if (!['stable', 'dev'].includes(channel)) throw new Error('channel must be stable or dev');
const isDev = channel === 'dev';
const manifestSource = here(isDev ? 'manifest.dev.json' : 'manifest.json');

copyFileSync(root('tool.js'), here('tool.js'));
copyFileSync(root('profile-contract.js'), here('profile-contract.js'));
console.log('tool.js copied into extension/');

const runtime = JSON.parse(readFileSync(root('fiscalidade.config.json'), 'utf8'));
if (runtime.environment !== 'production' || runtime.bookmarkletInstallationEnabled !== false ||
    runtime.extension?.remoteCodeAllowed !== false)
  throw new Error('refusing extension build outside the approved production configuration');
const configText = `/* Generated from fiscalidade.config.json. */\n`+
  `globalThis.__FISCALIDADE_CONFIG__ = Object.freeze(${JSON.stringify({
    publicOrigin: runtime.publicOrigin,
    apiBase: runtime.apiBase,
    extension: true,
    channel,
    remoteCodeAllowed: false
  }, null, 2).replace(/\n}\s*$/, ',\n  "offersUrl": chrome.runtime.getURL("offers.json")\n}')});\n`;
if (!isDev) writeFileSync(here('config.js'), configText);
copyFileSync(root('offers.json'), here('offers.json'));
mkdirSync(here('vendor'), { recursive: true });
copyFileSync(root('node_modules/pdfjs-dist/build/pdf.mjs'), here('vendor/pdf.mjs'));
copyFileSync(root('node_modules/pdfjs-dist/build/pdf.worker.mjs'), here('vendor/pdf.worker.mjs'));
copyFileSync(root('node_modules/pdfjs-dist/LICENSE'), here('vendor/LICENSE'));
console.log('config, offers and the reviewed local PDF reader bundled into extension/');

const fontFiles = [
  'fonts/ibm-plex-mono-400-latin-ext.woff2', 'fonts/ibm-plex-mono-400-latin.woff2',
  'fonts/ibm-plex-mono-600-latin-ext.woff2', 'fonts/ibm-plex-mono-600-latin.woff2',
  'fonts/ibm-plex-sans-400-latin-ext.woff2', 'fonts/ibm-plex-sans-400-latin.woff2',
  'fonts/ibm-plex-sans-500-latin-ext.woff2', 'fonts/ibm-plex-sans-500-latin.woff2',
  'fonts/ibm-plex-sans-600-latin-ext.woff2', 'fonts/ibm-plex-sans-600-latin.woff2',
  'fonts/ibm-plex-sans-700-latin-ext.woff2', 'fonts/ibm-plex-sans-700-latin.woff2'
];
if (!isDev) {
  copyFileSync(root('fonts.css'), here('fonts.css'));
  mkdirSync(here('fonts'), { recursive: true });
  fontFiles.forEach((file) => copyFileSync(root(file), here(file)));
}

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

const manifest = JSON.parse(readFileSync(manifestSource, 'utf8'));
const version = manifest.version;
const releaseName = manifest.version_name || version;
// CI/container runs can leave the default dist directory owned by another uid. Allow a caller to
// choose a writable artifact directory without changing package contents or the deterministic hash.
const distDir = process.env.FISCALIDADE_EXTENSION_DIST || root('dist');
mkdirSync(distDir, { recursive: true });
// Ship ONLY runtime files - dev scripts and store-copy working notes stay out of the package.
const runtimeFiles = [
  'manifest.json', 'background.js', 'config.js', 'profile-contract.js', 'bar.js', 'tool.js', 'offers.json',
  'icon16.png', 'icon48.png', 'icon128.png', 'profile.html', 'profile.css', 'crc-parser.js',
  'profile.js', 'brand.css', 'fonts.css', ...fontFiles,
  'invoices.html', 'invoices.css', 'invoices.js',
  'vendor/pdf.mjs', 'vendor/pdf.worker.mjs', 'vendor/LICENSE'
];
// ZIP stores mtimes. Normalize them and omit platform-specific extra fields so the same reviewed
// source produces the same artifact hash on every build. 1980-01-01 is the ZIP epoch.
const epochSeconds = Number(process.env.SOURCE_DATE_EPOCH || 315532800);
if (!Number.isInteger(epochSeconds) || epochSeconds < 315532800)
  throw new Error('SOURCE_DATE_EPOCH must be an integer at or after the ZIP epoch');
const epoch = new Date(epochSeconds * 1000);
if (isDev) {
  const releaseDir = `${distDir.replace(/\/$/, '')}/dev/${releaseName}`;
  const unpackedDir = `${releaseDir}/unpacked`;
  const zipPath = `${releaseDir}/fatura-boa-dev-${releaseName}.zip`;
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(unpackedDir, { recursive: true });
  runtimeFiles.forEach((file) => {
    const source = file === 'manifest.json' ? manifestSource :
      file === 'fonts.css' || file.startsWith('fonts/') ? root(file) : here(file);
    const target = `${unpackedDir}/${file}`;
    mkdirSync(dirname(target), { recursive: true });
    if (file === 'config.js') writeFileSync(target, configText);
    else copyFileSync(source, target);
    utimesSync(target, epoch, epoch);
  });
  execFileSync('zip', ['-X', '-q', zipPath, ...runtimeFiles], { cwd: unpackedDir, stdio: 'inherit' });
  console.log(`${unpackedDir} and ${zipPath} written`);
} else {
  const zipPath = `${distDir.replace(/\/$/, '')}/fatura-boa-extension-${version}.zip`;
  runtimeFiles.forEach((file) => utimesSync(here(file), epoch, epoch));
  rmSync(zipPath, { force: true });
  execFileSync('zip', ['-X', '-q', zipPath, ...runtimeFiles], { cwd: here(''), stdio: 'inherit' });
  console.log(`${zipPath} written`);
}
