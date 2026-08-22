# Chrome Web Store listing - Fatura Boa

Internal draft only. Do not upload or resubmit until `https://fiscalida.de/privacidade` is directly
available without authentication and the release checklist has passed.

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
página quando carregas em "Analisar faturas" ou "Ler para o perfil". Usa a sessão que já abriste no
Portal das Finanças ou na Segurança Social; nunca pede nem vê a tua password.

Pode:

- encontrar faturas por classificar e mostrar setores de dedução possíveis;
- indicar a origem e os limites usados em cada cálculo;
- reunir num perfil local dados de rendas, atividade, IRS, movimentos fiscais, património, recibos
  verdes e situação contributiva;
- abrir a página oficial correspondente para confirmares ou corrigires a informação.

O perfil fica no armazenamento local da extensão e expira no fim do dia. Não existe conta
Fiscalidade. As contribuições para melhorar a ferramenta são opcionais, separadas e desligadas de
origem. A classificação final é sempre uma decisão do utilizador e deve ser confirmada no portal
oficial.

Código e verificação: https://fiscalida.de/verificar

## Single purpose (required field)

Ajudar o utilizador a rever e organizar a sua situação fiscal a partir das páginas oficiais que ele
abre, processando os dados localmente e apenas após autorização e ação explícitas.

## Permission justifications (required)

- `storage`: guarda no dispositivo a autorização, a preferência de visibilidade da barra e o perfil
  temporário. O perfil expira no fim do dia e pode ser apagado na página da extensão.
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
- Esses dados são processados localmente e o perfil permanece no dispositivo.
- Existem transmissões opcionais e consentidas de dados minimizados: correções relativas a NIFs de
  pessoas coletivas, estruturas sem valores, impacto imediatamente agregado e totais de uma sala de
  agregado sob chave aleatória. Cada opção está desligada de origem e a política explica campos,
  finalidade, retenção e eliminação.
- Não declarar "does not collect" em categorias incompatíveis com estas opções. Responder ao
  questionário da loja de acordo com o comportamento efetivamente incluído no pacote submetido.

## Screenshots

Gerar de novo depois de o fluxo final ser aprovado. Não reutilizar imagens que mostrem o antigo
fluxo automático ou o favorito desativado.

## Homepage / support

- Website: https://fiscalida.de
- Support: https://fiscalida.de/sobre
