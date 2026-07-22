// Render the raster favicons from icon.svg (the DA monogram).
//
//   node make-icons.mjs
//
// Outputs apple-icon.png (180x180) and favicon.ico (32x32). icon.svg covers modern browsers on
// its own; these exist because Safari wants a PNG and every browser still probes /favicon.ico,
// which was returning 404.
//
// Uses the Playwright chromium already on the box - there is no PIL or ImageMagick here, and this
// site has no build step, so the outputs are committed.
import { chromium } from '/mnt/data/apps/fiscal-monitor/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const EXE = '/home/diogo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const here = (f) => new URL('./' + f, import.meta.url).pathname;

// strip the leading comment so the SVG starts with <svg
const svg = readFileSync(here('icon.svg'), 'utf8').replace(/^[\s\S]*?(?=<svg)/, '');

async function png(size) {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // transparent page so the SVG's own rounded rect is the whole icon
  await p.setContent(
    `<style>*{margin:0;padding:0}html,body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'domcontentloaded' });
  const buf = await p.screenshot({ type: 'png', omitBackground: true });
  await b.close();
  return buf;
}

/** Wrap a PNG in an ICO container. The ICO format allows PNG-encoded entries, so no re-encoding
 *  is needed - just the 6-byte ICONDIR plus one 16-byte ICONDIRENTRY in front of the PNG. */
function ico(pngBuf, size) {
  const head = Buffer.alloc(6 + 16);
  head.writeUInt16LE(0, 0);            // reserved
  head.writeUInt16LE(1, 2);            // type 1 = icon
  head.writeUInt16LE(1, 4);            // one image
  head.writeUInt8(size === 256 ? 0 : size, 6);   // width  (0 means 256)
  head.writeUInt8(size === 256 ? 0 : size, 7);   // height
  head.writeUInt8(0, 8);               // palette count
  head.writeUInt8(0, 9);               // reserved
  head.writeUInt16LE(1, 10);           // colour planes
  head.writeUInt16LE(32, 12);          // bits per pixel
  head.writeUInt32LE(pngBuf.length, 14);
  head.writeUInt32LE(head.length, 18); // offset to the image data
  return Buffer.concat([head, pngBuf]);
}

const p180 = await png(180);
writeFileSync(here('apple-icon.png'), p180);
const p32 = await png(32);
writeFileSync(here('favicon.ico'), ico(p32, 32));
console.log(`wrote apple-icon.png (${p180.length}b) and favicon.ico (${p32.length + 22}b)`);
