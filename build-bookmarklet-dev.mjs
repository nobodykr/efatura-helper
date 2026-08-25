// Deterministic DEV bookmarklet using the small July loader strategy. The loader fetches only the
// current reviewed contract and tool from the asset-only hostname, with SRI on both files.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = (file) => new URL('./' + file, import.meta.url).pathname;
const contract = readFileSync(root('profile-contract.js'), 'utf8');
const contractVersion = Number((contract.match(/version:\s*(\d+)/) || [])[1]);
if (!Number.isInteger(contractVersion)) throw new Error('profile contract version not found');
const tool = readFileSync(root('tool.js'), 'utf8');
const release = (tool.match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1];
if (!release) throw new Error('tool version not found');
const versions = JSON.parse(readFileSync(root('versions.json'), 'utf8'));
const sri = (source) => 'sha384-' + createHash('sha384').update(source).digest('base64');
const toolSri = sri(tool);
const contractSri = sri(contract);
if (versions.files?.['tool.js']?.integrity !== toolSri)
  throw new Error('versions.json does not pin the current tool.js');
const asset = 'https://faturas.diogoandrade.com';
const javascript = `javascript:(function(){` +
  `if(!/^(?:(?:faturas|imoveis|sitfiscal|irs)\\.portaldasfinancas\\.gov\\.pt|www\\.seg-social\\.pt)$/.test(location.host)){alert('Abre uma pagina oficial das Financas ou da Seguranca Social e faz login.');return}` +
  `var p=window.open('about:blank','fiscalidade-perfil');window.__FISCALIDADE_PROFILE_TARGET__=p;try{p.document.title='Fiscalidade';p.document.body.textContent='Fiscalidade: a ler esta fonte oficial...';p.document.body.style.cssText='font:600 16px system-ui;color:#021c51;padding:40px'}catch(e){}window.__FB_PROFILE=1;` +
  `window.__FISCALIDADE_CONFIG__=Object.assign({},window.__FISCALIDADE_CONFIG__||{},{publicOrigin:'https://fiscalida.de',apiBase:'https://fiscalida.de/api/v1',channel:'dev-bookmarklet',remoteCodeAllowed:false});` +
  `var d=document.getElementById('fb-loader-status');if(!d){d=document.createElement('div');d.id='fb-loader-status';d.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;padding:10px 14px;background:#021c51;color:#fff;border-radius:6px;font:600 13px system-ui';document.documentElement.appendChild(d)}d.textContent='Fiscalidade: a carregar...';` +
  `function l(u,i,n,f){var s=document.createElement('script');s.charset='utf-8';s.crossOrigin='anonymous';s.integrity=i;s.onload=f;s.onerror=function(){d.style.background='#8b1e1e';d.textContent='Fiscalidade: erro a carregar '+n};s.src=u;document.documentElement.appendChild(s)}` +
  `l('${asset}/profile-contract.js?v=${release}','${contractSri}','o contrato',function(){l('${asset}/tool.js?v=${versions.current}','${toolSri}','a ferramenta',function(){d.remove()})})` +
  `})()`;
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
  `<p>Este instalador é interno e não indexado. O favorito usa o carregador pequeno de julho; contrato e ferramenta atual são verificados por SRI antes de executar.</p></main></html>\n`;
writeFileSync(outDir + '/install.html', installer);
writeFileSync(publicInstaller, installer);
console.log(`${outDir}/install.html, bookmarklet.txt and ${publicInstaller} written (${digest})`);
