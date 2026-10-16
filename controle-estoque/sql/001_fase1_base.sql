-- Controle de Estoque — Fase 1 (Base). Prefixo est_. Ver controle-estoque/docs/fase-1.md
-- ------------------------------------------------------------------------------------

create table if not exists est_depositos (
  id            text primary key,                  -- ex.: MATRIZ_GGE
  empresa       text not null check (empresa in ('GGE','TOOW')),
  nome          text not null,
  tipo          text not null check (tipo in ('fisico','virtual','externo')),
  editavel      boolean not null default false,    -- célula editável na tela (só físico)
  permite_negativo boolean not null default false, -- só MATRIZ_TOOW
  fonte_saldo   text not null default 'livro' check (fonte_saldo in ('livro','bling','ml_full','shopee_full')),
  bling_deposito_id text,                          -- id do depósito no Bling da empresa
  grupo_fisico  text,                              -- mesmo galpão (ex.: 'GALPAO_RJ') para contagem física GGE+Toow
  ordem         int not null default 100,
  ativo         boolean not null default true,
  observacao    text
);

insert into est_depositos (id, empresa, nome, tipo, editavel, permite_negativo, fonte_saldo, bling_deposito_id, grupo_fisico, ordem, ativo, observacao) values
 ('HUB_GGE','GGE','Compras a receber','virtual',false,false,'livro',null,null,10,true,'NF de compra emitida, mercadoria não chegou (hub)'),
 ('HUB_TOOW','TOOW','Compras a receber','virtual',false,false,'livro',null,null,10,true,null),
 ('MATRIZ_GGE','GGE','Matriz RJ','fisico',true,false,'bling','125953709','GALPAO_RJ',20,true,null),
 ('FILIAL_GGE','GGE','Filial SP','fisico',true,false,'bling','14888666000','GALPAO_SP',21,true,null),
 ('MATRIZ_TOOW','TOOW','Matriz RJ (Toow)','fisico',true,true,'bling',null,'GALPAO_RJ',20,true,'Mesmo galpão da Matriz GGE. Pode ficar negativo; GGE cobre com NF GGE→Toow. Id Bling a confirmar.'),
 ('TRANS_MATRIZ_FULLML_GGE','GGE','Trânsito Matriz → Full ML','virtual',false,false,'livro',null,null,30,false,'fase 2'),
 ('TRANS_MATRIZ_FULLSHOPEE_GGE','GGE','Trânsito Matriz → Full Shopee','virtual',false,false,'livro',null,null,31,false,'fase 2'),
 ('TRANS_MATRIZ_FILIAL_GGE','GGE','Trânsito Matriz → Filial','virtual',false,false,'livro',null,null,32,false,'fase 2'),
 ('TRANS_FILIAL_MATRIZ_GGE','GGE','Trânsito Filial → Matriz','virtual',false,false,'livro',null,null,33,false,'fase 2'),
 ('TRANS_MATRIZ_FULLML_TOOW','TOOW','Trânsito Matriz → Full ML Toow','virtual',false,false,'livro',null,null,30,false,'fase 2'),
 ('REEMB_GGE','GGE','Em reembalagem','virtual',false,false,'livro',null,null,40,false,'fase 2'),
 ('TRIAGEM_GGE','GGE','Triagem de devoluções','virtual',false,false,'livro',null,null,50,false,'fase 2'),
 ('TRIAGEM_TOOW','TOOW','Triagem de devoluções','virtual',false,false,'livro',null,null,50,false,'fase 2'),
 ('FULL_ML_GGE','GGE','Full Mercado Livre GGE','externo',false,false,'ml_full','14888176722',null,60,true,'saldo pela API ML (inventory_id)'),
 ('FULL_ML_TOOW','TOOW','Full Mercado Livre Toow','externo',false,false,'ml_full',null,null,60,true,null),
 ('FULL_SHOPEE_GGE','GGE','Full Shopee GGE','externo',false,false,'shopee_full',null,null,61,false,'sem acesso à API ainda')
on conflict (id) do nothing;

-- Tipos de movimento ------------------------------------------------------------------
create table if not exists est_tipos_movimento (
  codigo        text primary key,
  descricao     text not null,
  exige_origem  boolean not null,
  exige_destino boolean not null,
  fase          smallint not null default 1,
  ativo         boolean not null default true
);
insert into est_tipos_movimento (codigo, descricao, exige_origem, exige_destino, fase, ativo) values
 ('SALDO_INICIAL','Inventário de abertura',false,true,1,true),
 ('COMPRA_NF','Compra por NF (entra no hub)',false,true,1,true),
 ('RECEBIMENTO','Recebimento físico (hub → depósito)',true,true,1,true),
 ('ENTRADA_MANUAL','Entrada manual (sem custo)',false,true,1,true),
 ('VENDA','Venda / saída faturada',true,false,1,true),
 ('VENDA_GGE_TOOW','Venda GGE → Toow (cobertura)',true,true,1,true),
 ('AJUSTE_ENTRADA','Ajuste positivo (contagem/correção)',false,true,1,true),
 ('AJUSTE_SAIDA','Ajuste negativo (contagem/correção)',true,false,1,true),
 ('ESTORNO','Estorno de movimento',false,false,1,true),
 ('BLING_SYNC_ENTRADA','Entrada vinda do Bling (webhook/leitura)',false,true,1,true),
 ('BLING_SYNC_SAIDA','Saída vinda do Bling (webhook/leitura)',true,false,1,true),
 ('TRANSF_SAIDA','Transferência: saída para trânsito',true,true,2,false),
 ('TRANSF_ENTRADA','Transferência: chegada no destino',true,true,2,false),
 ('DEVOLUCAO','Devolução (entra na triagem)',false,true,2,false),
 ('TRIAGEM_OK','Triagem: volta ao estoque',true,true,2,false),
 ('PERDA','Baixa por perda/avaria',true,false,2,false),
 ('TRANSFORMACAO_SAIDA','Transformação: consumo',true,false,2,false),
 ('TRANSFORMACAO_ENTRADA','Transformação: produção',false,true,2,false)
on conflict (codigo) do nothing;

-- Livro de movimentos -------------------------------------------------------------------
create table if not exists est_movimentos (
  id                 uuid primary key default gen_random_uuid(),
  data               timestamptz not null default now(),   -- data do fato
  empresa            text not null check (empresa in ('GGE','TOOW')),
  sku                text not null,
  tipo               text not null references est_tipos_movimento(codigo),
  deposito_origem_id text references est_depositos(id),
  deposito_destino_id text references est_depositos(id),
  quantidade         numeric not null check (quantidade > 0),
  unidade            text,
  qtd_documento      numeric,                              -- quantidade no documento (para divergência NF × conferido)
  custo_unitario     numeric,                              -- só quando vem da NF / custo vigente
  documento_tipo     text,                                 -- nf_entrada | nf_saida | pedido | manual | bling_webhook | bling_leitura | abertura | pendencia_bling
  documento_id       text,
  documento_numero   text,
  lote_id            uuid,                                 -- agrupa partes de uma mesma operação
  estorna_id         uuid references est_movimentos(id),
  motivo             text,
  observacao         text,
  usuario_email      text,
  origem_registro    text not null default 'painel' check (origem_registro in ('painel','edge','import','sql')),
  criado_em          timestamptz not null default now(),
  constraint est_mov_origem_ou_destino check (deposito_origem_id is not null or deposito_destino_id is not null),
  constraint est_mov_origem_destino_dif check (deposito_origem_id is distinct from deposito_destino_id)
);
create index if not exists idx_est_mov_sku on est_movimentos(empresa, sku, data desc);
create index if not exists idx_est_mov_dep_o on est_movimentos(deposito_origem_id);
create index if not exists idx_est_mov_dep_d on est_movimentos(deposito_destino_id);
create index if not exists idx_est_mov_doc on est_movimentos(documento_tipo, documento_id);
create unique index if not exists idx_est_mov_doc_unico on est_movimentos(documento_tipo, documento_id, sku, tipo, coalesce(deposito_destino_id,''), coalesce(deposito_origem_id,''))
  where documento_tipo in ('nf_entrada','nf_saida','bling_webhook');

-- Imutabilidade: sem UPDATE nem DELETE
create or replace function est_mov_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'est_movimentos é imutável: use ESTORNO (%).', tg_op;
end $$;
drop trigger if exists trg_est_mov_imutavel on est_movimentos;
create trigger trg_est_mov_imutavel before update or delete on est_movimentos
  for each row execute function est_mov_imutavel();

-- Saldos ---------------------------------------------------------------------------------
create or replace view vw_est_saldos as
with m as (
  select empresa, sku, deposito_destino_id as deposito_id,  quantidade as q from est_movimentos where deposito_destino_id is not null
  union all
  select empresa, sku, deposito_origem_id,  -quantidade from est_movimentos where deposito_origem_id is not null
)
select m.empresa, m.sku, m.deposito_id, d.nome as deposito_nome, d.tipo, sum(q) as saldo
from m join est_depositos d on d.id = m.deposito_id
group by 1,2,3,4,5;

-- Validações de negócio (saldo negativo) ---------------------------------------------------
create or replace function est_mov_validar() returns trigger language plpgsql as $$
declare t est_tipos_movimento%rowtype; d est_depositos%rowtype; s numeric;
begin
  select * into t from est_tipos_movimento where codigo = new.tipo;
  if not found or not t.ativo then raise exception 'Tipo de movimento % inativo ou inexistente', new.tipo; end if;
  if t.exige_origem and new.deposito_origem_id is null then raise exception 'Tipo % exige depósito de origem', new.tipo; end if;
  if t.exige_destino and new.deposito_destino_id is null then raise exception 'Tipo % exige depósito de destino', new.tipo; end if;
  if new.deposito_origem_id is not null then
    select * into d from est_depositos where id = new.deposito_origem_id;
    if d.empresa <> new.empresa then raise exception 'Depósito de origem % é de outra empresa', d.id; end if;
    if not d.ativo then raise exception 'Depósito % inativo', d.id; end if;
    if d.tipo <> 'externo' and not d.permite_negativo then
      select coalesce(saldo,0) into s from vw_est_saldos where empresa=new.empresa and sku=new.sku and deposito_id=new.deposito_origem_id;
      if coalesce(s,0) - new.quantidade < -1e-9 then
        raise exception 'Saldo insuficiente de % em % (saldo %, saída %)', new.sku, d.nome, coalesce(s,0), new.quantidade;
      end if;
    end if;
  end if;
  if new.deposito_destino_id is not null then
    select * into d from est_depositos where id = new.deposito_destino_id;
    if d.empresa <> new.empresa then raise exception 'Depósito de destino % é de outra empresa', d.id; end if;
    if not d.ativo then raise exception 'Depósito % inativo', d.id; end if;
  end if;
  if new.tipo = 'SALDO_INICIAL' and exists (
      select 1 from est_movimentos where empresa=new.empresa and sku=new.sku
        and (deposito_destino_id = new.deposito_destino_id or deposito_origem_id = new.deposito_destino_id)) then
    raise exception 'Já existe movimento de % em %; abertura não permitida (use ajuste)', new.sku, new.deposito_destino_id;
  end if;
  if new.tipo in ('AJUSTE_ENTRADA','AJUSTE_SAIDA','ENTRADA_MANUAL') and coalesce(new.motivo,'') = '' then
    raise exception 'Motivo obrigatório para %', new.tipo;
  end if;
  return new;
end $$;
drop trigger if exists trg_est_mov_validar on est_movimentos;
create trigger trg_est_mov_validar before insert on est_movimentos
  for each row execute function est_mov_validar();

-- Saldos lidos do Bling -------------------------------------------------------------------
create table if not exists est_bling_saldos (
  empresa        text not null,
  sku            text not null,
  deposito_id    text not null references est_depositos(id),
  saldo_fisico   numeric,
  saldo_virtual  numeric,
  bling_produto_id text,
  lido_em        timestamptz not null default now(),
  primary key (empresa, sku, deposito_id)
);

-- Pendências de alteração para o Bling -----------------------------------------------------
create table if not exists est_pendencias_bling (
  id             uuid primary key default gen_random_uuid(),
  empresa        text not null,
  sku            text not null,
  deposito_id    text not null references est_depositos(id),
  saldo_lido     numeric,               -- Bling na hora da edição
  saldo_nosso    numeric,               -- livro na hora da edição
  saldo_novo     numeric not null,
  delta          numeric generated always as (saldo_novo - coalesce(saldo_lido,0)) stored,
  motivo         text,
  status         text not null default 'pendente' check (status in ('pendente','enviado','bloqueado','erro','cancelado')),
  bloqueio_saldo_atual numeric,         -- saldo relido que causou bloqueio
  resposta_bling jsonb,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  enviado_por    text,
  enviado_em     timestamptz,
  movimento_id   uuid references est_movimentos(id)
);
create index if not exists idx_est_pend_status on est_pendencias_bling(status, criado_em desc);

-- Config ----------------------------------------------------------------------------------
create table if not exists est_config (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz default now(),
  atualizado_por text
);
insert into est_config (chave, valor, descricao) values
 ('taxa_capital_mes','0.05','Custo de capital ao mês (fase 4)'),
 ('rateio_peso_preco','4','Peso do preço no rateio de importação'),
 ('rateio_peso_kg','1','Peso do peso (kg) no rateio de importação'),
 ('reserva_provisoria_dias','14','Validade da reserva de proposta (fase 2)'),
 ('toow_negativo_alerta_qtd','null','Quantidade negativa na Toow que sugere NF GGE→Toow'),
 ('bling_releitura_horas','6','Frequência de leitura de saldos do Bling')
on conflict (chave) do nothing;

-- Usuários e funções -----------------------------------------------------------------------
create table if not exists est_usuarios (
  email       text primary key,
  nome        text,
  papel       text not null default 'usuario' check (papel in ('admin','usuario')),
  ativo       boolean not null default true,
  criado_em   timestamptz default now(),
  criado_por  text
);
create table if not exists est_funcoes (
  codigo text primary key, nome text not null, ordem int not null default 100
);
insert into est_funcoes (codigo, nome, ordem) values
 ('saldos','Painel de saldos',10),('editar_saldos','Editar saldos (pendências)',20),('enviar_bling','Enviar ao Bling',30),
 ('movimentos','Livro de movimentos',40),('entrada_nf','Entrada por NF',50),('entrada_manual','Entrada manual e ajuste',60),
 ('abertura','Inventário de abertura',70),('config','Parâmetros e depósitos',80),('usuarios','Usuários e funções',90)
on conflict (codigo) do nothing;
create table if not exists est_usuarios_funcoes (
  email      text not null references est_usuarios(email) on delete cascade,
  funcao     text not null references est_funcoes(codigo),
  visualizar boolean not null default true,
  editar     boolean not null default false,
  primary key (email, funcao)
);

-- Usuário ativo (security definer: dono da tabela, não recursiona na RLS)
create or replace function est_usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from est_usuarios u where u.email = lower(coalesce(auth.jwt() ->> 'email','')) and u.ativo);
$$;

-- Permissão: admin tem tudo; usuário precisa da linha na matriz
create or replace function est_tem_permissao(p_funcao text, p_editar boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from est_usuarios u
    where u.email = lower(coalesce(auth.jwt() ->> 'email',''))
      and u.ativo
      and (u.papel = 'admin' or exists (
        select 1 from est_usuarios_funcoes f
        where f.email = u.email and f.funcao = p_funcao and f.visualizar and (not p_editar or f.editar)))
  );
$$;

-- Minhas permissões (para o frontend montar o menu)
create or replace function est_minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (select * from est_usuarios where email = lower(coalesce(auth.jwt() ->> 'email','')) and ativo)
  select case when not exists (select 1 from u) then '{"ativo":false}'::jsonb
    else jsonb_build_object('ativo', true, 'email', (select email from u), 'nome', (select nome from u), 'papel', (select papel from u),
      'funcoes', (select coalesce(jsonb_object_agg(f.codigo, jsonb_build_object('ver', case when (select papel from u)='admin' then true else coalesce(uf.visualizar,false) end,
                                                                             'editar', case when (select papel from u)='admin' then true else coalesce(uf.editar,false) end)), '{}'::jsonb)
                  from est_funcoes f left join est_usuarios_funcoes uf on uf.funcao = f.codigo and uf.email = (select email from u))) end;
$$;

-- Auditoria genérica (quem mexeu em config/usuários/pendências)
create table if not exists est_auditoria (
  id bigserial primary key, tabela text, acao text, chave text, antes jsonb, depois jsonb,
  usuario_email text, em timestamptz default now()
);
create or replace function est_auditar() returns trigger language plpgsql security definer as $$
begin
  insert into est_auditoria(tabela, acao, chave, antes, depois, usuario_email)
  values (tg_table_name, tg_op,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'chave',
                   (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'email'),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          lower(coalesce(auth.jwt() ->> 'email','sistema')));
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['est_config','est_usuarios','est_usuarios_funcoes','est_pendencias_bling','est_depositos'] loop
    execute format('drop trigger if exists trg_aud_%1$s on %1$s; create trigger trg_aud_%1$s after insert or update or delete on %1$s for each row execute function est_auditar();', t);
  end loop; end $$;

-- RPC: registrar movimento (valida permissão por tipo) --------------------------------------
create or replace function est_registrar_movimento(
  p_empresa text, p_sku text, p_tipo text, p_quantidade numeric,
  p_origem text default null, p_destino text default null,
  p_unidade text default null, p_custo numeric default null, p_qtd_documento numeric default null,
  p_doc_tipo text default null, p_doc_id text default null, p_doc_numero text default null,
  p_lote uuid default null, p_motivo text default null, p_obs text default null, p_data timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_func text; v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  v_func := case p_tipo
    when 'SALDO_INICIAL' then 'abertura'
    when 'COMPRA_NF' then 'entrada_nf'  when 'RECEBIMENTO' then 'entrada_nf'
    when 'ENTRADA_MANUAL' then 'entrada_manual' when 'AJUSTE_ENTRADA' then 'entrada_manual' when 'AJUSTE_SAIDA' then 'entrada_manual'
    when 'ESTORNO' then 'entrada_manual'
    else 'movimentos' end;
  if not est_tem_permissao(v_func, true) then raise exception 'Sem permissão (%) para %', v_func, p_tipo; end if;
  insert into est_movimentos (data, empresa, sku, tipo, deposito_origem_id, deposito_destino_id, quantidade, unidade, qtd_documento,
    custo_unitario, documento_tipo, documento_id, documento_numero, lote_id, motivo, observacao, usuario_email, origem_registro)
  values (coalesce(p_data, now()), p_empresa, p_sku, p_tipo, p_origem, p_destino, p_quantidade, p_unidade, p_qtd_documento,
    p_custo, p_doc_tipo, p_doc_id, p_doc_numero, p_lote, p_motivo, p_obs, v_email, 'painel')
  returning id into v_id;
  return v_id;
end $$;

-- RPC: estorno (inverte origem/destino)
create or replace function est_estornar_movimento(p_id uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m est_movimentos%rowtype; v_id uuid;
begin
  if not est_tem_permissao('entrada_manual', true) then raise exception 'Sem permissão para estornar'; end if;
  select * into m from est_movimentos where id = p_id;
  if not found then raise exception 'Movimento não encontrado'; end if;
  if exists (select 1 from est_movimentos where estorna_id = p_id) then raise exception 'Movimento já estornado'; end if;
  insert into est_movimentos (empresa, sku, tipo, deposito_origem_id, deposito_destino_id, quantidade, unidade, custo_unitario,
    documento_tipo, documento_id, documento_numero, lote_id, estorna_id, motivo, usuario_email, origem_registro)
  values (m.empresa, m.sku, 'ESTORNO', m.deposito_destino_id, m.deposito_origem_id, m.quantidade, m.unidade, m.custo_unitario,
    m.documento_tipo, m.documento_id, m.documento_numero, m.lote_id, p_id, p_motivo, lower(coalesce(auth.jwt() ->> 'email','')), 'painel')
  returning id into v_id;
  return v_id;
end $$;

-- RPC: entrada por NF (todos os itens mapeados, CFOP de compra, fornecedor homologado) ------
create or replace function est_entrada_nf(p_nf_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nf nfs_entrada%rowtype; it record; v_lote uuid := gen_random_uuid(); n int := 0; pul int := 0; v_dest text; v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if not est_tem_permissao('entrada_nf', true) then raise exception 'Sem permissão para entrada por NF'; end if;
  select * into nf from nfs_entrada where id = p_nf_id;
  if not found then raise exception 'NF não encontrada'; end if;
  v_dest := case nf.empresa when 'TOOW' then 'HUB_TOOW' else 'HUB_GGE' end;
  if exists (select 1 from est_movimentos where documento_tipo='nf_entrada' and documento_id = p_nf_id::text and tipo='COMPRA_NF') then
    raise exception 'NF % já tem entrada registrada', nf.numero_nf;
  end if;
  for it in select * from nfs_entrada_itens where nf_entrada_id = p_nf_id loop
    if it.sku is null or it.sku = 'IGNORAR' then pul := pul + 1; continue; end if;
    if it.cfop is not null and left(it.cfop,4) not in ('5101','5102','6101','6102','5401','5403','6401','6403','5119','6119','5405','6108') then
      pul := pul + 1; continue;
    end if;
    insert into est_movimentos (data, empresa, sku, tipo, deposito_destino_id, quantidade, unidade, qtd_documento, custo_unitario,
      documento_tipo, documento_id, documento_numero, lote_id, observacao, usuario_email, origem_registro)
    values (coalesce(nf.data_emissao::timestamptz, now()), coalesce(nf.empresa,'GGE'), it.sku, 'COMPRA_NF', v_dest, it.quantidade, null, it.quantidade,
      it.custo_cif_unitario, 'nf_entrada', p_nf_id::text, nf.numero_nf, v_lote,
      'Fornecedor '||coalesce(nf.fornecedor_nome,'')||' CFOP '||coalesce(it.cfop,'?'), v_email, 'painel');
    n := n + 1;
  end loop;
  return jsonb_build_object('lote', v_lote, 'itens_lancados', n, 'itens_pulados', pul);
end $$;

-- Views de apoio ---------------------------------------------------------------------------
-- Saldo por SKU com uma linha por (empresa, sku) e saldos por depósito em jsonb
create or replace view vw_est_saldos_sku as
select s.empresa, s.sku,
       coalesce(sc.descricao, bp.nome) as descricao,
       coalesce(sc.unidade, 'UN') as unidade,
       cp.custo_gge_rj, cp.custo_gge_sp, cp.custo_toow, sc.preco_fob,
       (bp.bling_id is not null) as existe_no_bling,
       sum(s.saldo) filter (where d.tipo <> 'externo') as total_empresa,
       jsonb_object_agg(s.deposito_id, s.saldo) as saldos
from vw_est_saldos s
join est_depositos d on d.id = s.deposito_id
left join skus_custo sc on sc.sku = s.sku
left join bling_produtos bp on bp.codigo = s.sku and bp.empresa = s.empresa
left join vw_custo_precificacao cp on cp.sku = s.sku
group by s.empresa, s.sku, sc.descricao, bp.nome, sc.unidade, cp.custo_gge_rj, cp.custo_gge_sp, cp.custo_toow, sc.preco_fob, bp.bling_id;

-- Divergência livro × Bling por depósito físico
create or replace view vw_est_divergencias as
select coalesce(s.empresa,b.empresa) empresa, coalesce(s.sku,b.sku) sku, coalesce(s.deposito_id,b.deposito_id) deposito_id,
       coalesce(s.saldo,0) nosso, b.saldo_fisico bling, coalesce(s.saldo,0) - coalesce(b.saldo_fisico,0) divergencia, b.lido_em
from vw_est_saldos s
full join est_bling_saldos b on b.empresa=s.empresa and b.sku=s.sku and b.deposito_id=s.deposito_id
join est_depositos d on d.id = coalesce(s.deposito_id,b.deposito_id)
where d.fonte_saldo = 'bling';

-- NFs de entrada pendentes de lançamento no livro
create or replace view vw_est_nfs_pendentes as
select nf.id, nf.empresa, nf.numero_nf, nf.fornecedor_nome, nf.fornecedor_cnpj, nf.data_emissao, nf.data_entrada, nf.valor_total,
       count(i.id) itens,
       count(i.id) filter (where i.sku is null) itens_sem_sku,
       count(i.id) filter (where i.sku is not null and i.sku <> 'IGNORAR' and not exists (select 1 from bling_produtos bp where bp.codigo=i.sku and bp.empresa=coalesce(nf.empresa,'GGE'))) itens_fora_bling,
       exists (select 1 from est_movimentos m where m.documento_tipo='nf_entrada' and m.documento_id=nf.id::text and m.tipo='COMPRA_NF') lancada
from nfs_entrada nf
left join nfs_entrada_itens i on i.nf_entrada_id = nf.id
where coalesce(nf.tipo_nf,0) = 0
  and (nf.fornecedor_cnpj is null
       or exists (select 1 from fornecedores_reais fr where fr.ativo and left(regexp_replace(nf.fornecedor_cnpj,'\D','','g'),8) = regexp_replace(fr.cnpj_raiz,'\D','','g'))
       or exists (select 1 from fornecedores_aprovados fa where upper(nf.fornecedor_nome) like '%'||upper(fa.nome)||'%'))
group by nf.id;

-- Compras a receber (hub) com idade
create or replace view vw_est_hub_aberto as
select m.empresa, m.sku, m.documento_numero numero_nf, m.documento_id nf_id, m.data data_emissao,
       m.quantidade qtd_nf,
       m.quantidade - coalesce((select sum(r.quantidade) from est_movimentos r where r.tipo='RECEBIMENTO' and r.documento_tipo='nf_entrada' and r.documento_id=m.documento_id and r.sku=m.sku),0) qtd_pendente,
       now()::date - m.data::date dias
from est_movimentos m
where m.tipo = 'COMPRA_NF'
  and m.quantidade > coalesce((select sum(r.quantidade) from est_movimentos r where r.tipo='RECEBIMENTO' and r.documento_tipo='nf_entrada' and r.documento_id=m.documento_id and r.sku=m.sku),0);

-- RLS ---------------------------------------------------------------------------------------
alter table est_depositos enable row level security;
alter table est_tipos_movimento enable row level security;
alter table est_movimentos enable row level security;
alter table est_bling_saldos enable row level security;
alter table est_pendencias_bling enable row level security;
alter table est_config enable row level security;
alter table est_usuarios enable row level security;
alter table est_funcoes enable row level security;
alter table est_usuarios_funcoes enable row level security;
alter table est_auditoria enable row level security;

do $$ declare t text; begin
  foreach t in array array['est_depositos','est_tipos_movimento','est_movimentos','est_bling_saldos','est_pendencias_bling','est_config','est_usuarios','est_funcoes','est_usuarios_funcoes','est_auditoria'] loop
    execute format('drop policy if exists est_sel on %1$s; create policy est_sel on %1$s for select to authenticated using (est_usuario_ativo());', t);
  end loop; end $$;

-- Escrita: movimentos só via RPC (security definer); pendências/config/usuários por permissão
drop policy if exists est_pend_ins on est_pendencias_bling;
create policy est_pend_ins on est_pendencias_bling for insert to authenticated with check (est_tem_permissao('editar_saldos', true));
drop policy if exists est_pend_upd on est_pendencias_bling;
create policy est_pend_upd on est_pendencias_bling for update to authenticated using (est_tem_permissao('editar_saldos', true) or est_tem_permissao('enviar_bling', true));
drop policy if exists est_cfg_upd on est_config;
create policy est_cfg_upd on est_config for all to authenticated using (est_tem_permissao('config', true)) with check (est_tem_permissao('config', true));
drop policy if exists est_dep_upd on est_depositos;
create policy est_dep_upd on est_depositos for update to authenticated using (est_tem_permissao('config', true));
drop policy if exists est_usr_all on est_usuarios;
create policy est_usr_all on est_usuarios for all to authenticated using (est_tem_permissao('usuarios', true)) with check (est_tem_permissao('usuarios', true));
drop policy if exists est_uf_all on est_usuarios_funcoes;
create policy est_uf_all on est_usuarios_funcoes for all to authenticated using (est_tem_permissao('usuarios', true)) with check (est_tem_permissao('usuarios', true));

grant execute on function est_tem_permissao(text, boolean) to authenticated;
grant execute on function est_usuario_ativo() to authenticated;
grant execute on function est_minhas_permissoes() to authenticated;
grant execute on function est_registrar_movimento(text,text,text,numeric,text,text,text,numeric,numeric,text,text,text,uuid,text,text,timestamptz) to authenticated;
grant execute on function est_estornar_movimento(uuid, text) to authenticated;
grant execute on function est_entrada_nf(uuid) to authenticated;

-- Primeiro admin
insert into est_usuarios (email, nome, papel, criado_por) values ('marcuspinho@yahoo.com.br','Neco','admin','migração')
on conflict (email) do nothing;
