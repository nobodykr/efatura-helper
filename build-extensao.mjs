// Assemble extensao.html from index.html's EXACT shell (head+style, icon sprite, masthead+menu,
// footer, menu-toggle script) so the new page is byte-for-byte on-brand, plus a hand-written
// <main>. Re-run after index.html shell edits. NOT served (excluded: *.mjs). Node ESM.
//   node build-extensao.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CWS_ID = 'epaillcckgnnimpepilnkphmkjbggjoi';
const STORE_URL = `https://chromewebstore.google.com/detail/${CWS_ID}`;

const raw = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
// Marker-based slices (NOT line numbers) so this survives edits to index.html's body.
const between = (startMarker, endMarker, inclusiveEnd = true) => {
  const i = raw.indexOf(startMarker);
  const j = raw.indexOf(endMarker, i + startMarker.length);
  if (i < 0 || j < 0) throw new Error('marker not found: ' + startMarker + ' .. ' + endMarker);
  return raw.slice(i, inclusiveEnd ? j + endMarker.length : j);
};

let head = raw.slice(0, raw.indexOf('</head>') + '</head>'.length);   // <!doctype> .. </head>
// page-specific meta swaps (only these differ from the homepage)
head = head
  .replace('<title>Fatura Boa | A tua situação fiscal, das fontes oficiais (grátis, sem password)</title>',
           '<title>Extensão Fatura Boa para Chrome | e-Fatura mais fácil</title>')
  .replace(/<meta name="description" content="[^"]*">/,
           '<meta name="description" content="A extensão Fatura Boa põe uma barra no topo do e-Fatura: analisa as tuas faturas, sugere o melhor setor de dedução e mostra os tetos do IRS. Corre no teu navegador, sem password. Grátis.">')
  .replace('<link rel="canonical" href="https://faturas.diogoandrade.com/">',
           '<link rel="canonical" href="https://faturas.diogoandrade.com/extensao">')
  .replace('<meta property="og:url" content="https://faturas.diogoandrade.com/">',
           '<meta property="og:url" content="https://faturas.diogoandrade.com/extensao">')
  .replace('<meta property="og:title" content="Fatura Boa | A tua situação fiscal, das fontes oficiais">',
           '<meta property="og:title" content="Extensão Fatura Boa para Chrome">')
  // drop the homepage-only FAQ/SoftwareApplication JSON-LD duplication is fine to keep; harmless.
  ;

const bodyOpen = '<body>';
// everything between <body> and the masthead = license canary + hidden hp link + icon sprite
const sprite = between('<body>', '<div class="mast">', false).replace(/^<body>\s*/, '').trimEnd();
// masthead + overflow menu: from <div class="mast"> up to the hero <header>
const mast = between('<div class="mast">', '<header>', false).trimEnd();
const footer = between('<footer>', '</footer>');
const menuScript = between('// Masthead menu', '})();');   // the masthead menu IIFE

const main = `
<main>

<header>
  <div class="wrap">
    <h1><span class="eyebrow">Extensão para Chrome</span>O e-Fatura, num clique.</h1>
    <p class="sub">A extensão Fatura Boa põe uma barra no topo do e-Fatura com o resumo do teu ano e um botão para analisar as faturas. Corre na tua sessão, <b>sem password</b>, e nada sai do navegador. É o mesmo motor do favorito, agora sempre à mão.</p>
    <div class="cta-row">
      <a class="cta-main" id="cta-chrome" href="${STORE_URL}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-external"/></svg>Adicionar ao Chrome</a>
      <a class="cta-alt" href="/#instalar">ou usa o favorito (sem instalar)</a>
    </div>
    <div class="trust-row" style="margin-top:22px">
      <div class="trust-item"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg><span>Nunca pede a password</span></div>
      <div class="trust-item"><svg class="icon" aria-hidden="true"><use href="#i-doc"/></svg><span>As faturas não saem do navegador</span></div>
      <div class="trust-item"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>Código público e <a href="/verificar">verificável</a></span></div>
    </div>
  </div>
</header>

<section>
  <div class="wrap">
    <h2>O que faz por ti</h2>
    <div class="cards">
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-monitor"/></svg><h3>Sempre à mão</h3><p>Uma barra no topo do e-Fatura, com o resumo do ano e o botão de analisar. Sem procurar favoritos.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-receipt-euro"/></svg><h3>Melhor setor de dedução</h3><p>Para cada fatura por classificar, sugere o setor que mais deduz e ainda tem espaço no teto - e mostra também o provável.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-user"/></svg><h3>Lembra a tua situação</h3><p>Respondes uma vez se entregas o IRS em conjunto ou separado. Fica guardado no teu navegador, não volta a perguntar.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-check"/></svg><h3>Mesmo código aberto</h3><p>A extensão corre exactamente o mesmo código publicado e <a href="/verificar">verificável</a>. Nada de diferente escondido.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Instalar é rápido</h2>
    <div class="hgrid">
      <div class="hstep"><span class="hn"><span class="num">01</span></span><div><h3>Adicionar ao Chrome</h3><p>Um clique na loja do Chrome. A extensão só actua no portal das Finanças - em mais lado nenhum.</p><p><a class="btn" href="${STORE_URL}" target="_blank" rel="noopener">Adicionar ao Chrome</a></p></div></div>
      <div class="hstep"><span class="hn"><span class="num">02</span></span><div><h3>Abre o e-Fatura e faz login</h3><p>Na tua sessão normal das Finanças. A extensão nunca vê nem pede a password.</p></div></div>
      <div class="hstep"><span class="hn"><span class="num">03</span></span><div><h3>Clica em Analisar</h3><p>Na barra da Fatura Boa. Vês o resumo do ano e o plano de classificação, e aplicas tu no e-Fatura.</p></div></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Como fica</h2>
    <div style="display:grid;gap:26px;margin-top:8px">
      <figure style="margin:0"><img src="/img/extensao/detalhe.png" width="1280" height="800" alt="Painel da Fatura Boa no e-Fatura: faturas por setor, com ligacao directa a cada fatura" loading="lazy" style="width:100%;height:auto;border:1px solid var(--rule);border-radius:10px"><figcaption class="note" style="margin-top:8px">O plano por fatura, com ligação directa a cada uma no e-Fatura.</figcaption></figure>
      <figure style="margin:0"><img src="/img/extensao/resumo.png" width="1280" height="800" alt="Resumo do ano da Fatura Boa" loading="lazy" style="width:100%;height:auto;border:1px solid var(--rule);border-radius:10px"><figcaption class="note" style="margin-top:8px">O resumo do ano, logo ao abrir.</figcaption></figure>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Extensão ou favorito?</h2>
    <p class="sub">Fazem o mesmo e correm o mesmo código. A diferença é só o conforto.</p>
    <div class="box">
      <p><b>Extensão</b> (recomendada): a barra está sempre lá quando abres o e-Fatura, guarda a tua situação, e é um clique. Precisa de instalar, e por agora só Chrome.</p>
      <p style="margin-bottom:0"><b>Favorito</b> (bookmarklet): não instala nada e funciona em qualquer navegador. Tens de o clicar cada vez, na página do e-Fatura. <a href="/#instalar">Ver como instalar o favorito</a>.</p>
    </div>
    <p class="note" style="margin-top:14px">Firefox brevemente.</p>
  </div>
</section>

</main>
`;

const out = [
  head,
  bodyOpen,
  sprite,
  mast,
  main,
  footer,
  '<script>',
  menuScript,
  '</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

writeFileSync(new URL('./extensao.html', import.meta.url), out);
console.log('extensao.html written (' + out.length + ' bytes), CTA ->', STORE_URL);
