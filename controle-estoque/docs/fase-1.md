# Controle de Estoque — Fase 1 (Base)

Versão 1.0 — 16/10/2026. Projeto Controle Total GGE. Módulo em `/controle-estoque/`, tabelas prefixadas `est_`, mesmo Supabase (`opceujqpqyvxsatzdarg`), mesmo repositório (`gge-painel`).

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
| 1 | Data de corte e responsável pela contagem de abertura | Neco |
| 2 | Id do depósito da Toow no Bling | implementação (listar depósitos com token Toow) |
| 3 | Campos do payload do webhook `stock` do Bling | implementação |
| 4 | Acesso à API da Shopee | Neco |
| 5 | ICMS na transferência RJ → SP | Neco / contador |
| 6 | Implicação fiscal de a Toow vender antes de comprar | Neco / contador (decisão já tomada; só registro) |
| 7 | Quais impostos de importação formal a GGE credita e com que base | contador |

---

## 10. Entregáveis da fase 1

1. Migração `est_*` (tabelas, views, funções, RLS, seeds de depósitos, tipos e config).
2. Edge functions: `est-bling-saldos` (leitura), `est-bling-webhook` (recepção), `est-bling-enviar` (envio com releitura).
3. Páginas em `/controle-estoque/`: `index` (saldos), `movimentos`, `entradas`, `abertura`, `config`, `usuarios`. `est.js` compartilhado (auth, permissões, Supabase).
4. Menu do Controle Total com o grupo "Controle de Estoque".
