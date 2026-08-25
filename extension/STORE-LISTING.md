# Chrome Web Store listing - Fatura Boa

Production submission copy. `https://fiscalida.de/privacidade` must remain directly available
without authentication and the release checklist must pass for every submitted package.

## Name

Fatura Boa

## Summary (132 characters maximum)

Revê faturas e reúne a tua situação fiscal a partir das páginas oficiais, localmente e só quando pedires.

## Category

Productivity

## Language

Portuguese (Portugal)

## Detailed description

Fatura Boa ajuda a rever o e-Fatura e a reunir informação fiscal dispersa por páginas oficiais,
diretamente no navegador.

A extensão permanece inativa até autorizares leituras locais. Mesmo depois da autorização, só lê a
página quando carregas num botão de leitura, como "Ler e voltar à Fiscalidade" ou "Painel de
faturas". Usa a sessão que já abriste no
Portal das Finanças ou na Segurança Social; nunca pede nem vê a tua password.

Pode:

- encontrar faturas por classificar e mostrar setores de dedução possíveis;
- organizar as faturas num painel local com pesquisa, filtros e ligação ao documento oficial;
- indicar a origem e os limites usados em cada cálculo;
- reunir num perfil local dados de rendas, atividade, IRS, movimentos fiscais, património, recibos
  verdes e situação contributiva;
- abrir a página oficial correspondente para confirmares ou corrigires a informação.

O perfil fiscal completo fica no armazenamento local de fiscalida.de e expira no fim do dia. Não
existe conta Fiscalidade. Antes do perfil guiado, o utilizador aceita explicitamente a troca do modo
gratuito: cada fonte envia apenas a estrutura sem valores de respostas conhecidas; o e-Fatura envia
também agregados empresa/ano para pessoas coletivas, sem identidade do comprador, datas, documentos,
nomes de emitentes ou linhas individuais. A fonte só fica concluída depois da receção. As faturas
individuais do painel permanecem na memória da sessão da extensão e não são enviadas para a
Fiscalidade. A classificação final é sempre uma decisão do utilizador e deve ser confirmada no
portal oficial.

Código e verificação: https://fiscalida.de/verificar

## Single purpose (required field)

Ajudar o utilizador a rever e organizar a sua situação fiscal a partir das páginas oficiais que ele
abre, processando os dados localmente e apenas após autorização e ação explícitas.

## Permission justifications (required)

- `storage`: guarda no dispositivo a autorização e as preferências da extensão. A cópia temporária
  do painel de faturas usa apenas a memória de sessão e não é exposta aos scripts das páginas.
- `alarms`: agenda a eliminação da cópia temporária do painel no fim do dia. Não executa leituras
  periódicas nem acorda o dispositivo.
- `scripting`: injeta o analisador incluído no pacote apenas depois de o utilizador carregar num
  botão de análise. Não existe código remoto.
- `https://faturas.portaldasfinancas.gov.pt/*`: leitura e revisão do e-Fatura.
- `https://imoveis.portaldasfinancas.gov.pt/*`: leitura de rendas e património predial.
- `https://sitfiscal.portaldasfinancas.gov.pt/*`: leitura de situação cadastral, atividade, IRS e
  movimentos financeiros.
- `https://irs.portaldasfinancas.gov.pt/*`: leitura de recibos verdes.
- `https://www.seg-social.pt/*`: leitura da situação contributiva.

Não é pedida uma permissão wildcard para todos os subdomínios ou para todos os sites.

## Privacy

- Privacy policy URL: https://fiscalida.de/privacidade
- A extensão lê dados fiscais e financeiros da página oficial apenas para fornecer a função pedida
  pelo utilizador.
- Esses dados são processados localmente e o perfil completo permanece no dispositivo.
- O perfil gratuito exige, antes de começar, um acordo explícito para estruturas sem valores e,
  apenas no e-Fatura, agregados empresa/ano. Nunca envia identidade do comprador, datas de compra,
  números de documento, nomes de emitentes, descrições ou linhas de fatura.
- O painel local de faturas é separado do perfil e não envia este contributo.
- Outras transmissões opcionais (correções de atividade, impacto agregado e sala de agregado)
  mantêm escolhas próprias e desligadas de origem.
- Não declarar "does not collect" em categorias incompatíveis com estas opções. Responder ao
  questionário da loja de acordo com o comportamento efetivamente incluído no pacote submetido.

## Screenshots

Gerar de novo depois de o fluxo final ser aprovado. Não reutilizar imagens que mostrem o antigo
fluxo automático ou o favorito desativado.

## Homepage / support

- Website: https://fiscalida.de
- Support: https://fiscalida.de/sobre
