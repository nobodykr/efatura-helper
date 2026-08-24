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
  .replace('<title>Fiscalidade | A tua situação fiscal, das fontes oficiais (grátis, sem password)</title>',
           '<title>Extensão Fiscalidade para Chrome | e-Fatura mais fácil</title>')
  .replace(/<meta name="description" content="[^"]*">/,
           '<meta name="description" content="A extensão Fiscalidade põe uma barra no topo do e-Fatura: analisa as tuas faturas, sugere o melhor setor de dedução e mostra os tetos do IRS. Corre no teu navegador, sem password. Grátis.">')
  .replace('<link rel="canonical" href="https://fiscalida.de/">',
           '<link rel="canonical" href="https://fiscalida.de/extensao">')
  .replace('<meta property="og:url" content="https://fiscalida.de/">',
           '<meta property="og:url" content="https://fiscalida.de/extensao">')
  .replace('<meta property="og:title" content="Fiscalidade | A tua situação fiscal, das fontes oficiais">',
           '<meta property="og:title" content="Extensão Fiscalidade para Chrome">')
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
    <p class="sub">A extensão Fiscalidade põe uma barra no topo das páginas oficiais que lês. Só atua depois da tua autorização e devolve a leitura à área pessoal em fiscalida.de, guardada neste navegador até ao fim do dia. Corre na tua sessão, <b>sem password</b>.</p>
    <div class="cta-row">
      <span class="cta-main" aria-disabled="true"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>Em revisão na Chrome Web Store</span>
      <a class="cta-alt" href="/privacidade">ver a política de privacidade</a>
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
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-monitor"/></svg><h3>Um caminho claro</h3><p>Uma barra no topo da fonte oficial, com um único botão: ler e voltar à Fiscalidade.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-receipt-euro"/></svg><h3>Melhor setor de dedução</h3><p>Para cada fatura por classificar, sugere o setor que mais deduz e ainda tem espaço no teto - e mostra também o provável.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-user"/></svg><h3>Lembra a tua situação</h3><p>Respondes uma vez se entregas o IRS em conjunto ou separado. Fica guardado no teu navegador, não volta a perguntar.</p></div>
      <div class="card"><svg class="icon ci" aria-hidden="true"><use href="#i-check"/></svg><h3>Mesmo código aberto</h3><p>A extensão corre exactamente o mesmo código publicado e <a href="/verificar">verificável</a>. Nada de diferente escondido.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Como funciona</h2>
    <div class="hgrid">
      <div class="hstep"><span class="hn"><span class="num">01</span></span><div><h3>Adicionar ao Chrome</h3><p>A versão de produção foi submetida. A Chrome Web Store ativa a instalação pública depois de concluir a revisão.</p></div></div>
      <div class="hstep"><span class="hn"><span class="num">02</span></span><div><h3>Abre o e-Fatura e faz login</h3><p>Na tua sessão normal das Finanças. A extensão nunca vê nem pede a password.</p></div></div>
      <div class="hstep"><span class="hn"><span class="num">03</span></span><div><h3>Clica em Ler e voltar</h3><p>Na barra da Fiscalidade. A leitura regressa à tua área pessoal e indica a fonte seguinte.</p></div></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Como fica</h2>
    <div style="display:grid;gap:26px;margin-top:8px">
      <figure style="margin:0"><img src="/img/extensao/detalhe.png" width="1280" height="800" alt="Painel da Fiscalidade no e-Fatura: faturas por setor, com ligacao directa a cada fatura" loading="lazy" style="width:100%;height:auto;border:1px solid var(--rule);border-radius:10px"><figcaption class="note" style="margin-top:8px">O plano por fatura, com ligação directa a cada uma no e-Fatura.</figcaption></figure>
      <figure style="margin:0"><img src="/img/extensao/resumo.png" width="1280" height="800" alt="Resumo do ano da Fiscalidade" loading="lazy" style="width:100%;height:auto;border:1px solid var(--rule);border-radius:10px"><figcaption class="note" style="margin-top:8px">O resumo do ano, logo ao abrir.</figcaption></figure>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Estado da distribuição</h2>
    <p class="sub">A versão de produção foi submetida à Chrome Web Store e aguarda a revisão da loja.</p>
    <div class="box">
      <p style="margin-bottom:0"><b>Próximo passo:</b> a instalação pública será ativada automaticamente depois da aprovação da Chrome Web Store.</p>
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
