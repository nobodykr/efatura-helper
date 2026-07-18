# dev.pt Discord post

Audience is mostly devs, and every one of them files IRS. Lead with the technical problem, not
the pitch. Post in whatever channel fits (projetos / mostra-o-teu-projeto / off-topic).

---

Fiz uma coisa para mim e acabei por publicar, porque é um chato que toda a gente aqui tem.

Todos os anos: dezenas de faturas pendentes no e-Fatura, classificar uma a uma, num menu que não
ajuda nada. E nunca soube se estava a acertar. Não me apetecia entregar isso a alguém e continuar
sem perceber, por isso fui ver de onde vinha a informação.

A parte que me irritou: **a informação já existe toda**. Cada comerciante tem a atividade registada
no SICAE, que é público e do Estado. Uma farmácia é saúde, um restaurante é restauração. Mesmo
assim, cabe a ti adivinhar, fatura a fatura.

Duas coisas que descobri e que talvez vos interessem mais do que a ferramenta em si:

**1. Um comerciante não tem uma CAE, tem várias.** O Pingo Doce tem 16 registadas, incluindo
farmácia, livros e restauração. O Lidl tem 11. Isto muda o problema por completo: deixa de ser
"que setor é este comerciante" e passa a ser "de todos os setores que ele legitimamente permite,
qual é o que ainda tem espaço no teto". Fiz um ranking com cascata: se o teto de saúde está cheio,
desce para o seguinte.

**2. O SICAE tem um endpoint que devolve mais do que o formulário.** O form de pesquisa trunca a
lista de CAE. O `Detalhe.aspx?NIPC=x` é um GET simples, responde em ~30ms e devolve a lista
completa. Sem chave, sem quota, sem captcha. Andei a gastar chaves de APIs pagas de NIF antes de
dar por isso.

O que construí com isso:

- Corre **no teu navegador**, na sessão do e-Fatura que já abriste. Não tem campo de password,
  nem servidor a receber faturas. Funciona como uma extensão, mas é um bookmarklet.
- Mostra os **tetos reais** lidos da própria AT, não estimativas, e diz-te quanto de cada um já
  gastaste enquanto classificas. O e-Fatura não mostra isto, que é precisamente o problema.
- Está em **modo rascunho de propósito**: analisa, mostra o plano, e a submissão fazes tu. Uma
  classificação é uma declaração à AT e não me apetece que um programa faça isso sozinho antes de
  eu ver a coisa a funcionar em contas reais.
- Código à vista, PolyForm Noncommercial: livre para uso pessoal, não se pode monetizar.

<https://faturas.diogoandrade.com>

Admito que não conheço outra ferramenta que faça isto. Pode muito bem existir e eu não ter dado
com ela, e se souberem de alguma digam, que poupo-me a trabalho. Procurei e só encontrei software
de faturação, que é outra coisa: isto não emite faturas nenhumas, só classifica as que já tens.

Quem quiser espreitar o código, dizer que está mal, ou testar e reportar: é a parte mais útil.
Sobretudo classificações erradas, porque cada correção fica no mapa partilhado e beneficia quem
usar a seguir.

Aviso que devia ser óbvio mas digo à mesma: **a password das Finanças só se escreve em páginas que
acabem em `.gov.pt`**. Isto nunca ta pede, e é por isso que corre do lado do cliente.
