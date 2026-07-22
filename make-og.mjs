// Regenerate assets/og.png (the Open Graph share card).
//
//   node make-og.mjs
//
// Rendered from HTML with the Playwright chromium already installed on the homeserver, rather
// than drawn with an image library, so the card uses exactly the same palette and typeface as
// the site. Re-run it if the wording or the brand colour changes; the PNG is committed, so this
// is not part of any build.
//
// There is no build step for this site and no image tooling on the box (no PIL, no ImageMagick),
// which is why this borrows the browser from fiscal-monitor's node_modules.
import { chromium } from '/mnt/data/apps/fiscal-monitor/node_modules/playwright-core/index.mjs';

const EXE = '/home/diogo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const OUT = new URL('./assets/og.png', import.meta.url).pathname;

const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fff;font-family:'IBM Plex Sans',sans-serif;
       display:flex;flex-direction:column;justify-content:space-between;
       border-left:18px solid #034ad8}
  .top{padding:64px 72px 0}
  .mark{display:inline-flex;align-items:center;gap:14px;margin-bottom:40px}
  .fb{width:56px;height:56px;border-radius:8px;background:#034ad8;color:#fff;font-weight:700;
      font-size:24px;display:flex;align-items:center;justify-content:center;letter-spacing:.5px}
  .nm{font-size:26px;font-weight:600;color:#021c51}
  h1{font-size:62px;line-height:1.1;letter-spacing:-1.5px;color:#021c51;max-width:19ch;font-weight:700}
  p{margin-top:26px;font-size:27px;line-height:1.45;color:#4a5a63;max-width:30ch}
  .foot{background:#f4f6f9;border-top:1px solid #d5dae1;padding:26px 72px;
        display:flex;align-items:center;justify-content:space-between}
  .url{font-family:'IBM Plex Mono',monospace;font-size:23px;color:#034ad8;font-weight:600}
  .tag{font-size:20px;color:#6b7780}
</style></head><body>
  <div class="top">
    <div class="mark"><div class="fb">FB</div><div class="nm">Fatura Boa</div></div>
    <h1>Classificar faturas pendentes no e-Fatura</h1>
    <p>O setor certo para cada fatura, a partir da atividade oficial do comerciante. E os teus tetos de dedução do IRS.</p>
  </div>
  <div class="foot">
    <div class="url">faturas.diogoandrade.com</div>
    <div class="tag">Gratuito · nunca pede a password</div>
  </div>
</body></html>`;

const b = await chromium.launch({ executablePath: EXE });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);                 // let the webfont settle before snapping
await p.screenshot({ path: OUT, type: 'png' });
await b.close();
console.log('wrote', OUT);
