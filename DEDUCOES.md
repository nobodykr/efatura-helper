# Como o Fatura Boa decide o sector de cada fatura

Este documento existe para poder ser **contestado**. A ferramenta sugere em que sector de dedução
cada fatura deve entrar, e uma sugestão errada é uma declaração errada à AT feita em nome de quem a
usa. Por isso o raciocínio está todo aqui, com a base legal de cada decisão e com os casos em que a
lei não é clara assinalados como tal.

Se é contabilista e encontrar um erro: os pontos mais frágeis estão na secção **Casos ambíguos** e
em **O que ainda não está verificado**. É aí que vale a pena olhar primeiro.

> Nada disto é aconselhamento fiscal. É a leitura de quem construiu a ferramenta, publicada para
> poder ser corrigida.

---

## 1. Os sectores

Cada fatura pendente no e-Fatura tem de ser atribuída a um sector. Os que a ferramenta usa:

| Cód. | Sector | Benefício | Base legal |
|------|--------|-----------|------------|
| C05 | Saúde | 15% até 1.000 EUR | art. 78.º-C CIRS |
| C06 | Educação | 30% até 800 EUR | art. 78.º-D CIRS |
| C07 | Imóveis (rendas) | 15% até 502 EUR | art. 78.º-E CIRS |
| C08 | Lares | 25% até 403 EUR | art. 84.º CIRS |
| C09 | Veterinário | 15% do IVA | art. 78.º-F CIRS |
| C01 | Reparação de automóveis | 15% do IVA | art. 78.º-F |
| C02 | Reparação de motociclos | 15% do IVA | art. 78.º-F |
| C03 | Restauração e alojamento | 15% do IVA | art. 78.º-F |
| C04 | Cabeleireiros e institutos de beleza | 15% do IVA | art. 78.º-F |
| C10 | Passes de transporte público | 15% do IVA | art. 78.º-F n.º 3 |
| C11 | Ginásios e clubes desportivos | 15% do IVA | art. 78.º-F n.º 8 |
| C12 | Jornais e revistas | 15% do IVA | art. 78.º-F n.º 7 |
| C13 | Livros | 15% do IVA | art. 78.º-F |
| C14 | Cultura (bibliotecas, museus, espectáculos) | 15% do IVA | art. 78.º-F |
| C99 | Despesas gerais familiares | 35% até 250 EUR | art. 78.º-B |

Os sectores C01 a C04 e C09 a C14 **partilham um tecto conjunto de 250 EUR** (art. 78.º-F n.º 1).
Isto é decisivo: encher C03 não deixa espaço para C11. O tecto é do conjunto, não de cada um.

---

## 2. A regra central: C99 nunca é "nada"

O erro mais comum é pensar que uma fatura que cai em despesas gerais está perdida. Não está.

C99 devolve **35% até 250 EUR**, a taxa mais alta de todas. Um sector específico só é melhor quando
o seu próprio tecto ainda tem espaço. Uma fatura de restaurante de 20 EUR vale mais em C99 (35% da
despesa) do que em C03 (15% do IVA, ou seja 15% de ~1,30 EUR).

Por isso a ferramenta **nunca força** um sector específico: sugere uma cascata ordenada e o
utilizador decide. E por isso o mapa público omite os comerciantes que dão C99 - é o valor por
omissão, listá-los não mudava nada.

---

## 3. Como se chega ao sector: do NIF ao CAE

1. A fatura traz o **NIF do emitente**.
2. O NIF é procurado no registo do Estado (**SICAE**), que devolve o nome oficial, o **CAE
   principal** e os **CAE secundários**.
3. Cada CAE é traduzido para um sector pela tabela em
   [`cae-db.diogoandrade.com/cae-map.json`](https://cae-db.diogoandrade.com/cae-map.json).
4. Ganha sempre o **prefixo mais longo**: um código de 5 dígitos específico prevalece sobre a
   divisão em que está.

### Porque é que os CAE secundários são o ponto essencial

Quase nenhum serviço mostra os CAE secundários, e são eles que mudam o resultado. Um Pingo Doce é
47111 (hipermercado), mas também 47730 (farmácia), 47610 (livros) e 56120 (restauração). Sem os
secundários, uma fatura de farmácia feita num hipermercado só poderia ser despesa geral.

### A ordem da cascata

A lista devolvida está ordenada assim:

1. O sector do **CAE principal** primeiro. É o que a empresa faz sobretudo, e é a lógica que a
   própria AT segue.
2. Os restantes por **benefício** (saúde > educação > rendas > lares > os de tecto partilhado).
3. **C99 sempre em último**, como recolha.

O cliente percorre a lista e usa o primeiro sector cujo tecto anual ainda não esteja cheio.

---

## 4. CAE Rev.3 e Rev.4 - a migração

O DL 9/2025 substituiu a CAE Rev.3 pela Rev.4, e **o SICAE já serve Rev.4**.

Em 2026-07-21 testaram-se os 33 códigos de 5 dígitos do mapa contra o SICAE: **15 devolvem zero
empresas**. Duas consequências graves, entretanto corrigidas:

- **C04 e C14 não tinham nenhum código vivo.** Todos os códigos que lhes correspondiam eram só
  Rev.3, portanto nenhum comerciante do país podia ser classificado como cabeleireiro ou cultura.
- Outros sectores perdiam parte do universo (papelarias, transportes, produtos médicos).

Os equivalentes Rev.4 foram descobertos **empiricamente** - pesquisando o SICAE por nome
(`CABELEIREIRO` -> 96210, `MUSEU` -> 91210, `BIBLIOTECA` -> 91110, `PAPELARIA` -> 47621) e
confirmando depois que cada código devolve páginas de empresas reais. Não foram tirados de um PDF:
uma tentativa de extrair a lista do PDF oficial do INE perdeu silenciosamente o código 47111, que o
SICAE claramente conhece, e por isso essa fonte foi rejeitada.

| Rev.3 (morto) | Rev.4 (vivo) | Sector |
|---|---|---|
| 45200 | 95310 | C01 |
| 45402 | 95320 | C02 |
| 96021 | 96210 | C04 |
| 96022 | 96220 | C04 |
| 91011 | 91110 | C14 |
| 91012 | 91120 | C14 |
| 91020 | 91210 | C14 |
| 47620 | 47621 | C12 |
| 49310 | 49311 | C10 |
| 49391 / 49392 | 49390 | C10 |

**Os códigos Rev.3 foram mantidos, não substituídos.** Um comerciante ainda registado com um deles
tem de continuar a funcionar.

---

## 5. Casos ambíguos (onde a lei não decide por nós)

Registados em `ambiguous` no ficheiro do mapa. Os que mais pesam:

- **47610 livros** - nomeado **duas vezes**, no art. 78.º-F (livros, IVA) e no art. 78.º-D
  (educação). Resolvido para C13. Quem queira maximizar educação usaria C06.
- **85510 ensino desportivo** - está na Secção P (educação, C06) mas é nomeado no art. 78.º-F n.º 8
  ao lado dos ginásios (C11). Deixado a cair em C06.
- **49100 comboio interurbano** - **não** consta da enumeração taxativa do art. 78.º-F n.º 3, que
  lista 49310/49391/49392/50102/50300. Na prática os passes da CP são dedutíveis. **Não mapeado -
  a confirmar.**
- **93110 gestão de instalações desportivas** - muitas piscinas municipais usam este código, mas a
  lei só nomeia 93120/93130. **Não mapeado - a confirmar.**
- **47620 papelaria** - a lei nomeia os *editores* (58130/58140), não o retalho. Mantido em C12 por
  coerência com a prática, mas juridicamente não está nomeado.
- **68100 compra e venda de imóveis** - o art. 78.º-E nomeia **só** 68200 (arrendamento). O mapa
  original usava o prefixo `681`, demasiado lato. Não mapeado.
- **47782 material óptico** - já foi C05 e **a AT rejeitou** ("o emitente não tem atividade
  registada pertencente ao setor indicado"), porque a subclasse junta óptico com fotográfico e
  cinematográfico. Corrigido para C99 com base numa rejeição real (NIF 504225510, 2026-07-18).

Este último é o aviso mais útil do documento: **a AT tem a sua própria validação**, e um mapeamento
logicamente defensável pode na mesma ser recusado.

---

## 6. O que ainda não está verificado

Por ordem de risco, para quem quiser rever:

1. **Os códigos-ponte Rev.4 não foram validados contra a AT.** Sabemos que existem no SICAE e que
   têm empresas. Não sabemos se a AT aceita esses sectores para esses códigos - só uma submissão
   real o confirma, como aconteceu com o 47782.
2. **49100 (CP) e 93110 (piscinas municipais)** continuam por decidir.
3. **91030 (monumentos)** morreu na Rev.4 e o equivalente ainda não foi procurado.
4. Os tectos e taxas da secção 1 são os do CIRS à data de escrita e **não são actualizados
   automaticamente** quando o Orçamento do Estado os altera.
5. Ainda **não há testes automáticos** sobre esta tabela. Estão previstos: o objectivo é que uma
   alteração ao mapa que quebre um caso conhecido falhe imediatamente, em vez de aparecer numa
   declaração.

---

## 7. Onde estão os dados

- **Tabela viva, sempre actual:** `https://cae-db.diogoandrade.com/cae-map.json`
- **Cópia neste repositório:** [`cae_sectors.json`](cae_sectors.json), para poder ser lida, revista
  e comentada em pull request. Uma verificação automática compara-a com a versão servida, porque uma
  cópia desactualizada de regras fiscais é pior do que não ter cópia nenhuma.
- **A lógica que a aplica:** `sectors_for()` e a cascata, descritas na secção 3.
