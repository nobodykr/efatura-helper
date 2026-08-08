# Chrome Web Store listing - Fatura Boa (copy for submission)

Not served (excluded from deploy). This is the text to paste into the CWS Developer Dashboard
listing fields for the item created by `tools/cws.py create`.

## Name
Fatura Boa

## Summary (132 char max)
Poe o teu e-Fatura em ordem: le as tuas faturas na tua sessao, sugere o melhor setor de deducao e mostra os tetos do IRS. Gratis.

## Category
Productivity

## Language
Portuguese (Portugal)

## Detailed description
Fatura Boa ajuda-te a tratar do e-Fatura sem complicacoes, directamente no teu navegador.

Quando abres o portal e-Fatura (faturas.portaldasfinancas.gov.pt) e fazes login, a Fatura Boa
poe uma barra no topo com um resumo do teu ano e um botao "Analisar". Ao analisar, ela:

- le as tuas faturas do ano na sessao que ja tens aberta (nunca pede, nem ve, a tua password);
- sugere, para cada fatura por classificar, o setor de deducao mais vantajoso que ainda tem
  espaco no teto - e mostra tambem o setor "provavel" (a atividade principal do comerciante), para
  poderes decidir com criterio;
- mostra os tetos de deducao do IRS e quanto ja usaste;
- liga cada fatura directamente a sua pagina no e-Fatura, para corrigires com um clique.

Nada das tuas faturas sai do navegador. A classificacao e sempre uma decisao tua - a ferramenta
mostra o plano, tu aplicas no e-Fatura. O codigo e publico e verificavel em
https://faturas.diogoandrade.com/verificar (a versao que corre e a mesma que esta publicada).

Preferes nao instalar nada? A mesma ferramenta existe como favorito (bookmarklet) em
https://faturas.diogoandrade.com.

Gratuito, sem contas, sem publicidade intrusiva.

## Single purpose (required field)
Ajudar o utilizador a rever e classificar as suas faturas do e-Fatura (portal das Financas) para
efeitos de deducao no IRS, correndo inteiramente no navegador do utilizador, na sua propria sessao.

## Permission justifications (required)
- scripting: injeta o analisador (o mesmo tool.js publicado e verificavel) na pagina do e-Fatura
  que o utilizador ja abriu, para ler e organizar as faturas dessa sessao. So corre quando o
  utilizador carrega em "Analisar".
- storage: guarda LOCALMENTE as respostas de situacao do agregado (IRS em conjunto/separado,
  monoparental) para nao voltar a perguntar. Nunca sai do dispositivo.
- host_permissions https://*.portaldasfinancas.gov.pt/*: a extensao so actua no portal das
  Financas - e onde estao as faturas e a sessao do utilizador. Nao acede a mais nenhum site.

## Privacy
- Privacy policy URL: https://faturas.diogoandrade.com/privacidade
- Data usage: does NOT collect or transmit user data. Faturas and profile stay in the browser.
  (Declare "does not collect" for all categories; the only network calls are same-origin to the
  portal and a public read-only sector map that sends nothing about the user.)

## Screenshots (dist/store/, 1280x800)
1. 01-gate.png  - consent + situacao questions ("what it asks, before anything")
2. 02-resumo.png - the year summary / payoff
3. 03-detalhe.png - per-invoice table with deep links (the workhorse)

## Homepage / support
- Website: https://faturas.diogoandrade.com
- Support: https://faturas.diogoandrade.com/sobre
