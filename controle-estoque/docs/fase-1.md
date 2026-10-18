# Controle de Estoque — Fase 1 (Base)

Versão 1.1 — 17/10/2026 (1.0 de 16/10/2026; registro de implementação na seção 11). Projeto Controle Total GGE. Módulo em `/controle-estoque/`, tabelas prefixadas `est_`, mesmo Supabase (`opceujqpqyvxsatzdarg`), mesmo repositório (`gge-painel`).

Objetivo do todo: enxergar entrada e saída de mercadorias pelo lado físico (estoque) e pelo lado financeiro (quanto e quando o dinheiro entra e sai), associado aos produtos. A fase 1 é a base: lugares, livro de movimentos, saldo inicial, entrada por NF e manual, painel com o Bling, perfis.

Fases previstas: 1 Base · 2 Trânsito e transformação · 3 Motor de projeção · 4 Custos e análise · 5 Financeiro. Cada fase é usável sozinha.

---

## 1. Princípios

1. **Livro de movimentos, não tabela de saldos.** Saldo é a soma dos movimentos. Nada muda de quantidade sem um movimento com tipo, documento, usuário e data.
2. **Partida dobrada.** Todo movimento tem origem e/ou destino. Transferência = sai de um depósito e entra em outro, no mesmo registro. Nada "some".
3. **Empresa separa tudo.** GGE e Toow nunca se somam em valor. O mesmo galpão é dois depósitos (um por empresa).
4. **Custo é da NF.** Movimentos de compra carregam o custo da NF. Entrada manual move quantidade, não custo. Custo segue a skill `calculo-margem` (CIF GGE com créditos; CIF Toow = bruto). Nenhuma fórmula nova aqui.
5. **Bling é a referência oficial; o nosso livro é a verdade operacional.** Divergência entre os dois é informação, nunca é escondida. Enviar ao Bling é ação explícita, com confirmação, registrada.
6. **Nada é apagado.** Movimento errado se estorna com movimento inverso.

---

## 2. Lugares (depósitos)

Três tipos:

| Tipo | O que é | Editável na tela | Fonte do saldo |
|---|---|---|---|
| **físico** | Mercadoria está ali | sim | nosso livro + Bling |
| **virtual** | Estado de passagem; mercadoria é nossa mas não está disponível | não (só por movimento) | nosso livro |
| **externo** | Terceiro guarda (Full ML, Full Shopee) | não | API da plataforma |

### 2.1 Depósitos da fase 1

| Código | Empresa | Nome | Tipo | Observações |
|---|---|---|---|---|
| `HUB_GGE` | GGE | Compras a receber | virtual | NF de compra emitida, mercadoria não chegou. É o "hub" da figura. |
| `HUB_TOOW` | TOOW | Compras a receber | virtual | idem, para compras diretas da Toow |
| `MATRIZ_GGE` | GGE | Matriz RJ | físico | Bling GGE depósito 125953709 |
| `FILIAL_GGE` | GGE | Filial SP | físico | Bling GGE depósito 14888666000 |
| `MATRIZ_TOOW` | TOOW | Matriz RJ (Toow) | físico | **Único depósito que pode ficar negativo.** Mesmo galpão da Matriz GGE. Bling Toow: id a confirmar. |
| `TRANS_MATRIZ_FULLML_GGE` | GGE | Trânsito Matriz → Full ML | virtual | fase 2 |
| `TRANS_MATRIZ_FULLSHOPEE_GGE` | GGE | Trânsito Matriz → Full Shopee | virtual | fase 2 |
| `TRANS_MATRIZ_FILIAL_GGE` | GGE | Trânsito Matriz → Filial | virtual | fase 2 |
| `TRANS_FILIAL_MATRIZ_GGE` | GGE | Trânsito Filial → Matriz | virtual | fase 2 |
| `TRANS_MATRIZ_FULLML_TOOW` | TOOW | Trânsito Matriz → Full ML Toow | virtual | fase 2 |
| `REEMB_GGE` | GGE | Em reembalagem | virtual | fase 2 (transformação na volta) |
| `TRIAGEM_GGE` / `TRIAGEM_TOOW` | — | Triagem de devoluções | virtual | fase 2 |
| `FULL_ML_GGE` | GGE | Full Mercado Livre GGE | externo | Bling 14888176722; saldo pela API ML (`inventory_id`) |
| `FULL_ML_TOOW` | TOOW | Full Mercado Livre Toow | externo | API ML |
| `FULL_SHOPEE_GGE` | GGE | Full Shopee GGE | externo | inativo até existir acesso à API |

Os depósitos de fase 2 já são criados (inativos) para o livro nascer com o modelo completo.

Ficam **fora** do controle (já faturado e expedido): Coleta, Flex, Balcão, Venda Direta B2B (pontos 14, 15, 22, 23, 24, 31 da figura). Eles aparecem só como **motivo de saída** do depósito que os atende.

### 2.2 Canal não é depósito
- Matriz RJ atende: balcão, B2B, Shopee Rio, ML GGE Rio (coleta/flex), ML Toow.
- Filial SP atende: ML GGE SP, Shopee GGE SP.
- Cada Full atende só o próprio canal.

---

## 3. Movimentos

### 3.1 Tipos (fase 1 em negrito)

| Código | Origem → Destino | Documento | Custo |
|---|---|---|---|
| **SALDO_INICIAL** | ∅ → depósito | inventário de abertura | opcional (custo vigente) |
| **COMPRA_NF** | ∅ → HUB | NF de entrada (CFOP de compra, fornecedor homologado) | da NF, item a item |
| **RECEBIMENTO** | HUB → físico | conferência de chegada | herda |
| **ENTRADA_MANUAL** | ∅ → depósito | digitação | nenhum |
| **VENDA** | físico/externo → ∅ | NF de saída / pedido ML / Shopee | — |
| **VENDA_GGE_TOOW** | MATRIZ_GGE → MATRIZ_TOOW | NF GGE → Toow | define o custo Toow (bruto da NF) |
| **AJUSTE** | ∅ ↔ depósito | contagem / correção, com motivo obrigatório | — |
| **ESTORNO** | inverso de outro movimento | referência ao movimento original | — |
| **BLING_SYNC** | ∅ ↔ físico | webhook/leitura do Bling, quando o nosso livro não tinha o movimento | — |
| TRANSF_SAIDA / TRANSF_ENTRADA | físico → trânsito → destino | NF de transferência / remessa | fase 2 |
| DEVOLUCAO | ∅ → TRIAGEM | NF de devolução | fase 2 |
| TRIAGEM_OK / PERDA | TRIAGEM → físico / ∅ | decisão | fase 2 |
| TRANSF_REEMB / RETORNO_REEMB | físico → REEMB → físico | transformação | fase 2 |
| TRANSFORMACAO | consome N, gera M | receita | fase 2 |

### 3.2 Registro de um movimento
`est_movimentos`: data, empresa, sku, tipo, depósito origem, depósito destino, quantidade (> 0), unidade, custo unitário (quando houver), documento (tipo, id, número), lote (agrupa partes de uma mesma operação), observação, usuário, origem do registro (painel, edge, import), criado_em.

Regras:
- Quantidade sempre positiva; o sinal vem de origem (−) e destino (+).
- Depósito físico não fica negativo, **exceto `MATRIZ_TOOW`**. Tentativa de saída acima do saldo é bloqueada com mensagem; a exceção da Toow é marcada em `est_depositos.permite_negativo`.
- Movimento nunca é alterado nem apagado. Correção = ESTORNO + novo movimento.
- `SALDO_INICIAL` só pode existir uma vez por (empresa, sku, depósito) antes de qualquer outro movimento; depois disso, diferença de contagem é `AJUSTE`.

### 3.3 Saldo
`vw_est_saldos`: soma por (empresa, sku, depósito). `vw_est_saldos_sku`: uma linha por (empresa, sku) com uma coluna por depósito, mais total, mais colunas Bling e divergência.

---

## 4. Saldo inicial (inventário de abertura)

Primeira tarefa operacional. Tela "Abertura":
1. Escolher empresa, depósito e **data de corte**.
2. A tela pré-preenche com o saldo lido do Bling naquele depósito (quando houver) para acelerar a contagem.
3. Usuário confirma/corrige quantidade por SKU. Pode importar CSV (`sku;quantidade`).
4. Gravar gera `SALDO_INICIAL` por SKU, com custo vigente (`vw_custo_precificacao`) quando existir.
5. Depois da abertura de um depósito, a tela some para ele; só `AJUSTE` por contagem.

Toow: a abertura da `MATRIZ_TOOW` vale com saldo negativo se for a realidade.

---

## 5. Entrada por NF

Reaproveita `nfs_entrada` / `nfs_entrada_itens` (importador `sync-bling-nfs-detalhe`) e o mapeamento `bling_produtos_depara` → `nf_itens_depara` → código = SKU → EAN.

Fluxo:
1. NF nova aparece em "Entradas pendentes" quando: CFOP de compra, emitente em `fornecedores_reais`/`fornecedores_aprovados`, ainda sem movimento `COMPRA_NF`.
2. Cada item mostra: código do fornecedor, descrição, quantidade, unidade da NF, SKU mapeado, **unidade de estoque** e fator de conversão (ex.: `PNF30CX1` na NF = 1 caixa → SKU `PNF30CX5`, 1 un).
3. Alertas por item, que impedem a entrada daquele item até resolver:
   - **Sem SKU** (não mapeado) → `vw_nf_itens_sem_sku`, usuário mapeia na hora (grava em `nf_itens_depara`).
   - **SKU não existe no Bling** (`bling_produtos` da empresa da NF) → aviso; a entrada no nosso livro é permitida, o envio ao Bling fica bloqueado para esse SKU até o cadastro existir.
   - **Unidade em dúvida** (`confirmado = false` no de-para).
   - `sku = 'IGNORAR'` (embalagem, insumo): não entra no estoque.
4. "Dar entrada" gera `COMPRA_NF` ∅ → `HUB_<empresa>` por item, com custo unitário da NF (campo `custo_cif_unitario` já calculado pelo importador segundo a skill).
5. Quando a mercadoria chega: "Receber" gera `RECEBIMENTO` HUB → depósito físico escolhido, com quantidade conferida. Diferença entre NF e conferido fica registrada no movimento (`qtd_documento` × `quantidade`) e vira alerta de divergência de fornecedor.
6. Datas gravadas: emissão da NF, data de entrada (dar entrada), data de recebimento. São a base do lead time NF → galpão da fase 2/5.

Entrada manual: mesma tela, sem NF. Gera `ENTRADA_MANUAL` direto no depósito físico, sem custo. Obrigatório informar motivo.

---

## 6. Painel de saldos e Bling

### 6.1 Colunas
A SKU · B Descrição · C Produto · D Unidade de estoque · E Último FOB · F Último CIF (empresa selecionada) · G Total da empresa · H Compras a receber (HUB) · I Em trânsito (fase 2) · J Triagem (fase 2) · K… depósitos físicos (editáveis) · depois os externos (Full, só leitura).

Seletor de empresa no topo (GGE / Toow). Nunca soma as duas em valor. Botão "Total físico do galpão" mostra GGE + Toow só em quantidade, para conferência de contagem.

### 6.2 Três números por célula física
- **Nosso**: saldo pelo livro.
- **Bling**: último saldo lido (`est_bling_saldos`, por depósito Bling).
- **Divergência** = Nosso − Bling.

Alternância "Ver: Nosso | Bling". Células divergentes destacadas nas duas visões. Filtro "só divergentes".

### 6.3 Como o Bling entra no livro
- **Webhook `stock`** do Bling (dispara a cada lançamento físico: venda, NF, tela). Edge function recebe, identifica SKU e depósito, e: se já existe movimento nosso correspondente (mesmo documento), ignora; senão grava `BLING_SYNC`. Campos exatos do payload serão confirmados na implementação (documentação não os lista).
- **Leitura de saldos** (`/estoques/saldos`, lotes de 25 ids, como `bling-estoque-depositos` já faz) a cada N horas e sob demanda pelo botão "Reler Bling", gravando em `est_bling_saldos` (sku, depósito Bling, saldo físico, saldo virtual, lido_em).
- Divergência persistente após webhook + leitura = erro real a investigar (contagem, movimento manual no Bling sem SKU, etc.).

### 6.4 Editar e enviar
1. Editar uma célula física não altera nada. Gera uma **pendência** (`est_pendencias_bling`: sku, depósito, saldo lido, saldo novo, delta, motivo).
2. "Enviar este" ou "Enviar todos os alterados" abre confirmação listando SKU, depósito, de → para, delta.
3. Ao confirmar, por linha: relê o saldo do Bling; se mudou desde a leitura, **bloqueia** a linha e mostra; se não mudou, envia a **diferença** como Entrada/Saída (`POST /estoques`, operação E/S, nunca balanço), grava `AJUSTE` no nosso livro com o mesmo delta, e registra na pendência: quem, quando, resposta do Bling.
4. Pendências bloqueadas ou com erro ficam visíveis até serem reenviadas ou canceladas.

Depósitos externos (Full) não têm edição nem envio.

---

## 7. Perfis e funções

Login por Supabase Auth (e-mail e senha; já há usuários e a edge function `create-user`). Dois papéis: **admin** e **usuário**. Admin cria e desativa usuários.

Matriz `est_usuarios_funcoes` (usuário × função × visualizar × editar). Funções da fase 1:

| Função | O que libera |
|---|---|
| `saldos` | ver o painel |
| `editar_saldos` | criar pendências de alteração |
| `enviar_bling` | confirmar envio ao Bling (separada de editar) |
| `movimentos` | ver o livro |
| `entrada_nf` | dar entrada e receber NF |
| `entrada_manual` | entrada manual e ajuste |
| `abertura` | inventário de abertura |
| `config` | parâmetros e depósitos |
| `usuarios` | gerir usuários e esta matriz |

Função sem "visualizar" não aparece no menu para aquele usuário. Admin tem tudo. Toda gravação guarda e-mail do usuário; não há exclusão.

---

## 8. Parâmetros (`est_config`)

| Chave | Valor inicial | Uso |
|---|---|---|
| `taxa_capital_mes` | 0,05 | custo de capital (fase 4) |
| `rateio_peso_preco` / `rateio_peso_kg` | 4 / 1 | importação (fase 4) |
| `reserva_provisoria_dias` | 14 | reservas (fase 2) |
| `toow_negativo_alerta_qtd` | a definir | sugerir NF GGE → Toow |
| `bling_releitura_horas` | 6 | frequência da leitura de saldos |

---

## 9. Pendências abertas

| # | Pendência | Quem |
|---|---|---|
| 1 | Contagem de abertura: 30/10/2026, só Matriz RJ (Filial SP com saldo zero), entregue em 02/11 (ver seção 11). Responsável pela contagem a definir | Neco |
| 9 | Reativar `FILIAL_GGE` no banco (ativo = true, editável = true) — comando cancelado 2× por falta de aprovação | aprovação do Neco |
| 2 | Id do depósito da Toow no Bling | implementação (listar depósitos com token Toow) |
| 3 | Campos do payload do webhook `stock` do Bling | implementação |
| 4 | Acesso à API da Shopee | Neco |
| 5 | ICMS na transferência RJ → SP | Neco / contador |
| 6 | Implicação fiscal de a Toow vender antes de comprar | Neco / contador (decisão já tomada; só registro) |
| 7 | Quais impostos de importação formal a GGE credita e com que base | contador |
| 8 | ~~Cache da coleta de compras~~ — resolvido em 18/10 (só GR9038 estava errado; ver seção 11) | — |

---

## 10. Entregáveis da fase 1

1. Migração `est_*` (tabelas, views, funções, RLS, seeds de depósitos, tipos e config).
2. Edge functions: `est-bling-saldos` (leitura), `est-bling-webhook` (recepção), `est-bling-enviar` (envio com releitura).
3. Páginas em `/controle-estoque/`: `index` (saldos), `movimentos`, `entradas`, `abertura`, `config`, `usuarios`. `est.js` compartilhado (auth, permissões, Supabase).
4. Menu do Controle Total com o grupo "Controle de Estoque".

| Entregável | Situação em 17/10/2026 |
|---|---|
| 1 Migração | ✅ aplicada, auditada e endurecida |
| 2 `est-bling-saldos` | ✅ testada (leitura) |
| 2 `est-bling-enviar` | ✅ v3 revisada; ainda sem uso real (não há tela) |
| 2 `est-bling-webhook` | ⏳ não iniciada |
| 3 Páginas | ⏳ não iniciadas |
| 4 Menu | ⏳ não iniciado |

---

## 11. Registro de implementação

### 17/10/2026 — retomada, auditoria e endurecimento

**Estado conferido no banco** (não pelo resumo da conversa anterior):
- Migração `est_*` completa: 10 tabelas, 6 views, 11 funções, RLS em todas as tabelas, seeds (16 depósitos, 18 tipos, 6 parâmetros, 9 funções, 1 usuário admin: Neco).
- `est-bling-saldos` e `est-bling-enviar` já estavam publicadas (17/10, 17h56 e 18h08), nunca usadas. `est-bling-webhook` ainda não existe.
- Livro vazio (0 movimentos, 0 pendências).

**Tipos de movimento como implementados** (diferem do nome na seção 3.1): `AJUSTE` virou `AJUSTE_ENTRADA` / `AJUSTE_SAIDA`; `BLING_SYNC` virou `BLING_SYNC_ENTRADA` / `BLING_SYNC_SAIDA`; transformação virou `TRANSFORMACAO_SAIDA` / `TRANSFORMACAO_ENTRADA`. Motivo continua obrigatório em ajuste e entrada manual.

**Correções aplicadas** (migrações `est_hardening_20261017` e `est_venda_gge_toow_20261017`):
1. Views `vw_est_*` eram legíveis com a chave pública (anon), sem login. Acesso anônimo revogado.
2. Funções `est_*` executáveis por anônimo: revogado; só usuários logados e servidor.
3. Trava por (empresa, SKU, depósito) na validação de saída: duas saídas simultâneas não furam o saldo.
4. `VENDA_GGE_TOOW` era bloqueado pela regra "depósito de outra empresa". Agora: único movimento que cruza empresas, só GGE → Toow, registrado pela GGE. O saldo passou a ser atribuído à empresa dona do depósito (antes ia para a empresa do registro, o que colocaria a entrada da Toow como estoque da GGE).
5. `est_pendencias_bling` ganhou o status `enviando`.

**`est-bling-enviar` v3** (única função que escreve no Bling):
- Trava contra envio duplicado (clique duplo / duas abas): a pendência passa a `enviando` antes de qualquer chamada.
- Bloqueia se não houve leitura prévia do Bling (antes enviava sem conferir).
- Bloqueia saldo novo negativo em depósito que não permite.
- **Só envia produto simples** (formato `S` no Bling). Kits/produtos com composição (161 na GGE) têm estoque calculado pelo Bling a partir dos componentes; ajuste deve ser feito no componente.
- Escrita ao Bling nunca é repetida automaticamente; se falhar, a releitura no reenvio impede aplicar duas vezes.
- Se o Bling aceitar e o livro falhar, o aviso fica gravado na pendência (`resposta_bling.aviso_livro`).
- Recusa chamadas sem usuário logado, inclusive com a chave de servidor (testado: 403/401).

**Testes executados** (em transação desfeita; nenhum dado ficou):
saída acima do saldo bloqueada · saldo correto após saída · movimento não altera nem apaga · segunda abertura bloqueada · Toow fica negativa · GGE → Toow zera o negativo da Toow e baixa a GGE · GGE não fica negativa no GGE → Toow · sentido Toow → GGE bloqueado · outro tipo não cruza empresas · ajuste sem motivo bloqueado.

**Leitura do Bling testada** (`est-bling-saldos`, 3 SKUs, só leitura): 8 de 9 saldos iguais à coleta diária existente. A diferença (GR3515CX5: 558 × 2.791,8) é de **nível**, não de erro: a nova lê a caixa (kit), a antiga lê o componente avulso (GR3515, ×5 por caixa; 2.791,8 ÷ 5 = 558).

### Cache da coleta de compras (`bling_produto_ids`) — corrigido em 18/10/2026
- **Diagnóstico de 17/10 estava errado.** Eu havia apontado 13 SKUs "ligados ao produto errado". Conferindo o cadastro do Bling: os 13 SKUs de compra são **kits com estoque virtual** (formato `E`, `tipoEstoque = V`), cujo saldo o Bling calcula a partir do componente. 12 dos 13 apontam de propósito para o **componente** (o produto que tem estoque físico): GR3515CX5→GR3515, GR3518CX5→GR3518, GR80xx→UNGR80xx, GR9015→PACK9015, GR9019→PACK9019, GR9025→UNGR9025, PNFxxCX5→PNFxxCX1. Estão corretos e não foram alterados.
- **Único erro real:** GR9038 apontava para o kit GR9025 (outro produto). Corrigido para o componente UNGR9038 (id 16393022449), no mesmo padrão dos irmãos. Coleta rodada de novo e conferida: Matriz passou de 514 (saldo do 90/25) para 255 (90/38).
- As telas de compras (`vw_sugestao_reposicao`, `vw_necessidade_rio_pinos`) **não** usam `estoque_snapshot`; usam `vw_estoque_tempo_real` e `vw_estoque_full_sku`. O erro do GR9038 afetava só o histórico do `estoque_snapshot`.
- A coleta registra 11 SKUs de `config_skus_compra` sem produto no Bling (PRG2345R, PRG2350R, PRG2355R, PRG2555R, GR9030CX11600, GR9035CX11600, GR9040CX12670, GRPCN13AFX, GRPCN16AFX, GRPCN19AFX, GRPCN22AFX). Os pregos parecem ter sido recodificados no Bling para `PRER…` (PRG2550R e PRG2765R já estão ligados assim). Não alterado.

### Kits e estoque físico (consequência para todo o módulo)
- No Bling da GGE, 160 dos 161 kits têm estoque **virtual** (calculado dos componentes); 1 tem estoque físico.
- O estoque real está no **componente** (formato `S`). Contagem, abertura, livro e envio ao Bling trabalham só com componentes. Kits aparecem no painel como "derivado", sem edição. `est-bling-enviar` já recusa kits.
- Atenção à unidade: componentes podem ter unidade fracionada (GR3515 com 2.791,8). A folha de contagem mostra a unidade do Bling de cada componente.
- `vw_estoque_full_sku` e `vw_estoque_tempo_real` (antigas) também são legíveis sem login.
- `bling_produtos` não tem nenhum produto da Toow: a leitura de saldos da Toow sem lista de SKUs retorna vazio, e o depósito Toow no Bling ainda não tem id (pendência 2).

### Decisões de desenho registradas
- Kits (formato `E`) não têm estoque próprio no livro; o estoque físico é do componente. A tela de abertura e o painel precisam marcar kits como "derivado" e não oferecer edição.

### 17/10/2026 — confiabilidade das fontes (definido pelo Neco)

| Fonte | Confiável? | Uso no módulo |
|---|---|---|
| Full ML (API do Mercado Livre) | **Sim — única fonte confiável hoje** | Saldo dos depósitos `FULL_ML_GGE` / `FULL_ML_TOOW` via `vw_est_full_ml` |
| Bling (Matriz, Filial) | Tende a correto, ainda não validado | **Ensaio** do programa e pré-preenchimento da contagem |
| Estoque declarado no anúncio ML (`anuncios.estoque_declarado`) | **Não — inflado de propósito** (estratégia comercial) | **Nunca** usado como estoque |
| Contagem manual de fim de mês | Sim | Verdade do físico; vira a abertura oficial e, depois, ajustes mensais |

Consequências:
- **Full ML:** criada `vw_est_full_ml` (empresa × SKU, cada `inventory_id` contado uma vez, separa GGE e Toow pela conta ML). A view antiga `vw_estoque_full_sku` conta em dobro quando dois anúncios compartilham estoque (29 casos) e mistura GGE e Toow (5 SKUs): total 1.054 un. contra 702 reais em 17/10 (GGE 671 em 87 SKUs; Toow 31 em 14 SKUs). Não foi alterada (pode ser usada por outras telas). O saldo do Full lido do Bling (que mostra até negativos) fica só como informação.
- **Ensaio até a contagem:** o livro é imutável e a abertura só pode ser feita uma vez. Por isso, até a contagem de fim de mês, o painel funciona em modo ensaio: mostra Bling × Full ML × divergências, **sem gravar movimentos e sem enviar nada ao Bling**.
- **Abertura oficial** = contagem manual do fim do mês (pendência 1). A tela de abertura vem pré-preenchida com o Bling; os contadores corrigem; isso gera o `SALDO_INICIAL`.
- **Meses seguintes:** contagem mensal gera `AJUSTE_ENTRADA`/`AJUSTE_SAIDA` com motivo "contagem mensal", e a diferença contagem × livro vira indicador de qualidade do controle.

### Contagem de abertura — 30/10/2026 (definido pelo Neco em 18/10)
- **Data de corte:** sexta 30/10, ao fim do expediente (31/10 é sábado, empresa fechada). Resultado entregue em **02/11**; o `SALDO_INICIAL` é gravado com data 30/10.
- **Método (decidido na implementação):** contagem **cega**. A folha não mostra o saldo do Bling, para não induzir o contador. Depois, a tela compara contagem × Bling, e só os SKUs com diferença acima da tolerância são recontados antes de gravar.
- **O que se conta:** só componentes (formato `S`), na unidade do Bling, por depósito físico. Kits não se contam. Full não se conta (vem da API do ML).
- **Toow:** não se conta à parte (estoque virtual, mesmo galpão). A abertura de `MATRIZ_TOOW` vem do saldo do Bling da Toow, mesmo negativo.
- **Entre o corte e a gravação:** sábado e domingo sem movimento na Matriz. Movimentos de segunda 02/11 antes da gravação precisam entrar no livro depois da abertura. Para isso, o recebimento de movimentos do Bling (`est-bling-webhook` ou releitura com diferença) tem de estar pronto até 02/11.
- **Filial SP:** sem operação, **saldo zero**, reativação prevista em ~3 meses. Decisão do Neco (18/10): o depósito `FILIAL_GGE` **continua existindo e ativo**, para o programa rodar completo e não precisar de mudança na reativação. Não se conta em 30/10; a abertura dela é zero (nenhum movimento). Conferido em 18/10: Bling sem saldo na Filial nos SKUs lidos. Qualquer saldo que aparecer no Bling da Filial vira divergência no painel.
  - Estado no banco: em 18/10 foi marcado inativo por engano meu (entendi "desativada" como "remover do programa"); a reversão para ativo foi tentada duas vezes e cancelada por falta de aprovação na tela. **Pendente de aplicar.**
- **Full ML GGE e Full ML Toow:** não se contam; o saldo de 30/10 vem da API do Mercado Livre (fonte confiável). Os dois depósitos já existem (`FULL_ML_GGE`, `FULL_ML_TOOW`) e estão em `vw_est_full_ml`.

### Full ML — lacuna de leitura (achado em 18/10)
- A coleta diária (`coleta-estoque-precos`) só lê anúncios **ativos**. Estoque no Full de anúncio **pausado** fica com o último valor lido, que pode ser antigo.
- Em 18/10: GGE 131 estoques no Full, 25 sem leitura recente (2 un.); **Toow 17 estoques, 10 sem leitura recente (13 de 31 un., 42%)** — ex.: KTPN5X1000 6 un. (lido 06/10), PNF20CX5 4 un. (26/09), PNF15CX5 2 un. (04/10).
- `vw_est_full_ml` agora mostra a idade do dado por SKU (`data_ref_mais_antiga`, `inventarios_sem_leitura_recente`, `un_leitura_antiga`).
- **Correção necessária antes de 30/10:** ler o saldo do Full por `inventory_id` (todos, independentemente do status do anúncio), direto da API do ML, só leitura. Sem isso o Full da abertura fica incompleto.

### Próximos passos (ordem de entrega, prazo 30/10)
0. Leitura do Full por `inventory_id` (GGE e Toow), incluindo anúncios pausados — antes de 30/10.
1. Folha de contagem da Matriz RJ (componentes, unidade do Bling, sem saldo) — antes de 30/10.
2. Tela de contagem/abertura: digitação ou importação da planilha, comparação com o Bling, lista de recontagem, gravação do `SALDO_INICIAL` — pronta para 02/11.
3. Recebimento dos movimentos do Bling após o corte — pronto para 02/11.
4. Tela de saldos em modo ensaio (Bling × Full ML).
5. Id do depósito Toow no Bling + carga de `bling_produtos` da Toow (necessário para a abertura da Toow).
3. Tela de saldos (`index`) em modo ensaio: Bling (Matriz, Filial) + Full ML (`vw_est_full_ml`), divergências, sem edição; depois a tela de contagem/abertura para o fim do mês; envio ao Bling só depois da abertura.
4. `est-bling-webhook`.

---

## 12. Revisão completa — 18/10/2026

Pedido do Neco: "revisão completa: alimentações do Supabase, tabelas, o programa em si, as lógicas; tudo". Feita em quatro frentes. **Correção ao que eu disse em 17/10:** as páginas do módulo **já existiam** no repositório (commit de 17/10 17h05: `index`, `entradas`, `movimentos`, `abertura`, `config`, `usuarios`, `login`, `est.js`), ligadas no menu do Controle Total. Eu havia afirmado que não estavam iniciadas; estava errado.

### 12.1 Estado atual (verificado no banco e no repositório)

| Peça | Situação |
|---|---|
| Tabelas `est_*` | 12 (10 originais + `est_fator_nf` + `est_full_saldos`), RLS em todas, anon sem privilégio |
| Views `vw_est_*` | 7 (6 originais + `vw_est_full_ml`), sem acesso anônimo |
| Funções `est_*` | 18, nenhuma executável por anônimo |
| Edge functions | `est-bling-saldos` v2, `est-bling-enviar` v4, **`est-ml-full` v1 (nova)**, **`est-bling-produtos` v1 (nova)** |
| Agendamentos | saldos Bling GGE e Toow a cada 6 h; Full ML a cada 6 h; catálogo Bling 1×/dia |
| Páginas | 7 no repositório, revisadas nesta data (ver 12.4) |
| Livro | vazio (0 movimentos); nada enviado ao Bling |

### 12.2 Problemas encontrados e corrigidos (lógica do banco)

1. **Estorno de NF GGE→Toow era impossível** (regra de empresa bloqueava). O estorno agora herda o sentido do movimento original. Estorno de estorno é proibido (registra-se movimento novo).
2. **Abertura datada à meia-noite**: movimentos do próprio dia 30/10 ficariam "depois" da abertura. Agora a abertura é gravada às 23:59:59 do dia de corte (hora de Brasília).
3. **Custo "vazava" entre SKUs na abertura** (variável não zerada no laço): SKU sem custo herdava o custo do anterior. Corrigido.
4. **NFs de antes da contagem podiam ser lançadas** e duplicar o estoque. Criado o parâmetro `data_corte_abertura` (preenchido automaticamente na primeira abertura); `est_entrada_nf` recusa NF com entrada até o corte; `est_entrada_nf_sem_corte` lança mesmo assim, com aviso na tela.
5. **Lista de NFs pendentes mostrava NFs de clientes** (devoluções com CPF) porque aceitava emitente sem CNPJ. Agora só emitente homologado (`fn_fornecedor_homologado`) e só NF com itens. De 463 passou a 459, todas de fornecedores reais (Tecnofast, Bacchi, Pacar…); com o corte definido, as anteriores a 30/10 ficam ocultas por padrão.
6. **Duas listas de CFOP de compra divergentes** (página e função). Unificadas na função canônica `fn_cfop_compra` (a mesma do importador de NFs).
7. **Sem conversão de unidade NF→estoque.** Criada `est_fator_nf` (por código+descrição do fornecedor) e `est_definir_fator_nf`; `est_entrada_nf` multiplica a quantidade e divide o custo unitário pelo fator. Testado: fator 2 → 20 na NF viram 40 no estoque, custo 245,04 → 122,52.
8. **Kits entravam no livro.** Agora bloqueados no validador, na abertura, no mapeamento de NF e na entrada; excluídos das divergências. Regra `est_eh_kit(empresa, sku)`: formato ≠ S no Bling daquela empresa, ignorando cadastros excluídos. **Descoberta:** o mesmo código pode ser kit na GGE e produto simples na Toow (ex.: PNF30CX5) — por isso a regra é por empresa.
9. **Pendência de envio duplicada por célula**: índice único em (empresa, sku, depósito) para status pendente/enviando.
10. Defesa extra: privilégios de `anon` revogados nas tabelas, views e funções do módulo (RLS já bloqueava; agora nem chega lá).

**Testes** (11 casos, em transação desfeita; livro continua vazio): kit bloqueado · abertura grava 23:59 e define o corte · NF pré-corte bloqueada · lançamento sem corte com fator 2 (quantidade e custo) · NF duplicada bloqueada · estorno GGE→Toow devolve o saldo · estorno de estorno bloqueado · segundo estorno bloqueado · pendência duplicada bloqueada · reabertura bloqueada · tudo revertido.

### 12.3 Alimentações

| Fonte | Antes | Agora |
|---|---|---|
| **Catálogo Bling** (`bling_produtos`) | carga manual de 16/09, só GGE, 557 produtos | `est-bling-produtos` diária, GGE + Toow, todos os cadastros (GGE 1.941 incl. 1.324 excluídos; 225 composições com estrutura; Toow 176). É o que define kit/componente. |
| **Full ML** | coleta diária só de anúncios ativos; Toow mostrava 31 un., 42% com dado velho | `est-ml-full` a cada 6 h lê **todos** os estoques por `inventory_id` (GGE 131, Toow 17). Real em 18/10: **GGE 679 disponíveis (710 no Full), Toow 18**. `vw_est_full_ml` usa a leitura direta e marca `fonte_direta`. |
| **Saldos Bling** | sem agendamento | a cada 6 h (GGE 605 produtos × 3 depósitos; Toow 66). Toow: depósito "Geral" id **14887344235** (pendência 2 resolvida). |
| **NFs de entrada** | — | sem mudança no importador; só a leitura pelo módulo (ver 12.2 itens 4–7). Observações: `sync-bling-nfs-detalhe` processa 3 NFs por rodada, 2×/dia, só GGE; há 203 NFs antigas com item sem SKU (backlog de mapeamento, irrelevante após o corte). |
| Tokens Bling/ML | ok | ok; as funções novas só leem o token (renovação continua centralizada) |

Leitura do Bling de 18/10 (referência para a contagem): Matriz GGE 397 componentes, 174 com saldo, **16 negativos (−540 un.)**; Matriz Toow 66 componentes, 54 com saldo, **50 negativos (−2.281 un.)** — coerente com a regra "Toow vende antes de comprar". Full GGE no Bling: 126 negativos (−7.142) — confirma que o Bling não serve para o Full.

### 12.4 Páginas (revisão e ajustes)

- **Saldos (`index`)**: Full agora vem de `vw_est_full_ml` (API ML), com reservado/quarentena no detalhe e aviso de leitura antiga; **modo ensaio** por depósito (sem abertura → mostra Bling, sem edição, sem divergência); kits marcados e sem edição; botão "Reler Full ML".
- **Abertura**: refeita para **contagem cega** — folha de contagem para imprimir (sem saldos), importação de CSV, comparação com o Bling, filtro "só diferenças acima da tolerância" (parâmetro `tolerancia_recontagem_pct`), kits excluídos, "Usar saldo do Bling como contagem" (para a Toow), data vira o corte.
- **Entradas**: CFOP pela lista canônica; badges "pré-abertura", "kit", "sem CFOP de compra"; NFs anteriores ao corte ocultas por padrão; lançamento ignorando o corte só com aviso explícito; fator de conversão por item.
- **Parâmetros**: botões para forçar catálogo Bling, Full ML e saldos Bling; log da execução.
- **Movimentos, Usuários, Login**: sem alteração (revisados: ok).

### 12.5 Fora do módulo — observado, não alterado
- O painel Controle Total (fora do estoque) protege as telas com senha no navegador e chave pública; o módulo de estoque usa login real (Supabase Auth). As tabelas antigas continuam acessíveis com a chave pública — é a situação anterior, não mudou.
- `coleta-bling` roda todo dia reimportando NFs desde 2024-01-01 (GGE e Toow), em paralelo ao `sync-bling-nfs-*`. Pesado, mas sem duplicar itens (conferido).
- `vw_estoque_full_sku` (compras) conta estoque compartilhado em dobro (1.054 vs 710 reais). Não alterada.
- 11 SKUs de `config_skus_compra` não existem mais no Bling com esse código (pregos recodificados `PRG…`→`PRER…`; grampos 90/30, 90/35, 90/40 e PCN).

### 12.6 Limitação operacional registrada
O Supabase deste projeto **cancela automaticamente** qualquer comando que apague ou altere objeto (`DROP`, `ALTER TABLE`) e a ferramenta de migração. Por isso a revisão foi aplicada só com `CREATE`/`CREATE OR REPLACE` e, onde seria preciso alterar, criou-se objeto novo (`est_fator_nf` em vez de coluna em `nf_itens_depara`; `est_entrada_nf_sem_corte` em vez de parâmetro novo). Para apagar/alterar algo no futuro: SQL Editor do Supabase pela tela.

### 12.7 Pendências (atualizado)
| # | Pendência | Quem |
|---|---|---|
| 1 | Contagem 30/10 (Matriz RJ): responsável pela contagem | Neco |
| 3 | Webhook `stock` do Bling (`est-bling-webhook`) — movimentos pós-corte entram hoje só pela releitura de saldos (divergência), não como movimento | implementação |
| 4 | API Shopee | Neco |
| 5 | ICMS transferência RJ→SP | contador |
| 7 | Créditos de importação formal | contador |
| 10 | Usuários além do Neco: cadastrar em Usuários antes de 30/10 (quem conta, quem lança NF) | Neco |
| 11 | Venda à ordem: CFOP 6923 (remessa física) × 6118/6119 (fiscal) na mesma compra — hoje só o 6118/6119 entra no estoque (lista canônica). Confirmar com o contador se é isso mesmo | contador |
