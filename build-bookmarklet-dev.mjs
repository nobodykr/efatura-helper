// Deterministic, self-contained DEV bookmarklet. It embeds the reviewed contract and reader; it
// never loads executable code from a server and therefore cannot silently drift after testing.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = (file) => new URL('./' + file, import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(root('extension/manifest.dev.json'), 'utf8'));
const release = manifest.version_name;
const contract = readFileSync(root('profile-contract.js'), 'utf8');
const contractVersion = Number((contract.match(/version:\s*(\d+)/) || [])[1]);
if (!Number.isInteger(contractVersion)) throw new Error('profile contract version not found');
const tool = readFileSync(root('tool.js'), 'utf8');
const setup = `window.open("https://fiscalida.de/perfil","fiscalidade-perfil");` +
  `window.__FB_PROFILE=1;window.__FISCALIDADE_CONFIG__=Object.assign({},` +
  `window.__FISCALIDADE_CONFIG__||{},{publicOrigin:"https://fiscalida.de",` +
  `apiBase:"https://fiscalida.de/api/v1",channel:"dev-bookmarklet",remoteCodeAllowed:false});`;
const javascript = 'javascript:' + setup + contract + '\n' + tool;
const digest = createHash('sha256').update(javascript).digest('hex');
const escaped = javascript.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const outDir = root(`dist/dev/bookmarklet/${release}`);
const publicInstaller = root('favorito-dev.html');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + '/bookmarklet.txt', javascript);
const installer = `<!doctype html><html lang="pt"><meta charset="utf-8">` +
  `<meta name="robots" content="noindex,nofollow,noarchive"><title>Fiscalidade DEV ${release}</title>` +
  `<style>body{font:16px/1.55 system-ui;max-width:760px;margin:64px auto;padding:0 20px;color:#2B363C}` +
  `.fav{display:inline-block;background:#034ad8;color:white;padding:12px 18px;border-radius:6px;font-weight:700;text-decoration:none}` +
  `.back{color:#034ad8}code{word-break:break-all}.note{padding:12px 14px;background:#f3f6fa;border-radius:6px}` +
  `</style><main><p><a class="back" href="/perfil">Voltar ao perfil</a></p>` +
  `<h1>Favorito Fiscalidade DEV</h1><p>Versão <b>${release}</b> · contrato ${contractVersion}</p>` +
  `<p>Arrasta o botão azul para a barra de favoritos. Depois abre uma das 13 fontes oficiais, faz login e carrega no favorito.</p>` +
  `<p><a class="fav" href="${escaped}">Ler e voltar à Fiscalidade - DEV</a></p>` +
  `<p class="note">O favorito abre/reutiliza <code>fiscalida.de/perfil</code>. Se o acesso gated pedir autenticação, conclui-a nesse separador; a leitura tenta ligar-se durante 120 segundos.</p>` +
  `<p>Diagnóstico sem dados: SHA-256 do URL <code>${digest}</code></p>` +
  `<p>Este instalador é interno, não indexado, e o código executável está todo dentro do favorito.</p></main></html>\n`;
writeFileSync(outDir + '/install.html', installer);
writeFileSync(publicInstaller, installer);
console.log(`${outDir}/install.html, bookmarklet.txt and ${publicInstaller} written (${digest})`);
