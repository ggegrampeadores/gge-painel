-- 003 — Revisão completa da fase 1 (18/10/2026)
-- Aplicada no Supabase em 18/10/2026 via SQL direto (o apply_migration e qualquer DROP/ALTER são cancelados neste projeto; por isso nada é apagado nem alterado — só criado ou substituído). Idempotente.
-- Resumo: Filial SP ativa com saldo zero · kits não entram no livro · estorno de NF GGE→Toow ·
-- corte da abertura (NFs anteriores não são lançadas) · fator de conversão NF→estoque (est_fator_nf) ·
-- CFOP de compra unificado (fn_cfop_compra) · NFs pendentes só de fornecedor homologado ·
-- divergências sem kits · uma pendência aberta por célula · anon sem acesso às tabelas est_*.

-- 1) Filial SP: existe, ativa, saldo zero (decisão Neco 18/10/2026)
do $$ begin
  update est_depositos set ativo = true, editavel = true,
    observacao = 'Sem operação desde out/2026; saldo zero; reativação prevista em ~3 meses. Mantida ativa para o programa rodar completo.'
  where id = 'FILIAL_GGE';
end $$;

-- 2) Parâmetros novos
insert into est_config (chave, valor, descricao) values
  ('data_corte_abertura', 'null'::jsonb, 'Data da contagem de abertura. NF com entrada até esta data não é lançada (já está na contagem). Preenchida automaticamente na primeira abertura.'),
  ('tolerancia_recontagem_pct', '2'::jsonb, 'Diferença contagem × Bling (%) acima da qual o SKU vai para recontagem antes de gravar a abertura')
on conflict (chave) do nothing;

-- 3) Kit? (formato diferente de S no Bling e sem cadastro simples com o mesmo código)
create or replace function est_eh_kit(p_sku text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from bling_produtos b where b.codigo = p_sku and b.formato is distinct from 'S')
     and not exists (select 1 from bling_produtos b where b.codigo = p_sku and b.formato = 'S');
$$;

-- 4) Validação de movimento: kits bloqueados; ESTORNO herda o sentido entre empresas do movimento original
create or replace function public.est_mov_validar()
 returns trigger language plpgsql set search_path = public as $function$
declare t est_tipos_movimento%rowtype; d est_depositos%rowtype; s numeric; emp_orig text; emp_dest text; o est_movimentos%rowtype;
begin
  select * into t from est_tipos_movimento where codigo = new.tipo;
  if not found or not t.ativo then raise exception 'Tipo de movimento % inativo ou inexistente', new.tipo; end if;
  if t.exige_origem and new.deposito_origem_id is null then raise exception 'Tipo % exige depósito de origem', new.tipo; end if;
  if t.exige_destino and new.deposito_destino_id is null then raise exception 'Tipo % exige depósito de destino', new.tipo; end if;
  if est_eh_kit(new.sku) then raise exception 'SKU % é kit/composição no Bling: o estoque é dos componentes. Movimente o componente.', new.sku; end if;

  emp_orig := new.empresa; emp_dest := new.empresa;
  if new.tipo = 'VENDA_GGE_TOOW' then
    if new.empresa <> 'GGE' then raise exception 'VENDA_GGE_TOOW é registrado pela GGE'; end if;
    emp_dest := 'TOOW';
  elsif new.tipo = 'ESTORNO' then
    if new.estorna_id is null then raise exception 'ESTORNO exige o movimento original (estorna_id)'; end if;
    select * into o from est_movimentos where id = new.estorna_id;
    if not found then raise exception 'Movimento original não encontrado'; end if;
    if o.tipo = 'ESTORNO' then raise exception 'Não se estorna um estorno; registre um movimento novo'; end if;
    if o.tipo = 'VENDA_GGE_TOOW' then emp_orig := 'TOOW'; emp_dest := 'GGE'; end if;
  end if;

  if new.deposito_origem_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('est|' || emp_orig || '|' || new.sku || '|' || new.deposito_origem_id, 0));
    select * into d from est_depositos where id = new.deposito_origem_id;
    if d.empresa <> emp_orig then raise exception 'Depósito de origem % é de outra empresa', d.id; end if;
    if not d.ativo then raise exception 'Depósito % inativo', d.id; end if;
    if d.tipo <> 'externo' and not d.permite_negativo then
      select coalesce(saldo,0) into s from vw_est_saldos where empresa = d.empresa and sku = new.sku and deposito_id = new.deposito_origem_id;
      if coalesce(s,0) - new.quantidade < -1e-9 then
        raise exception 'Saldo insuficiente de % em % (saldo %, saída %)', new.sku, d.nome, coalesce(s,0), new.quantidade;
      end if;
    end if;
  end if;
  if new.deposito_destino_id is not null then
    select * into d from est_depositos where id = new.deposito_destino_id;
    if d.empresa <> emp_dest then raise exception 'Depósito de destino % é de outra empresa', d.id; end if;
    if not d.ativo then raise exception 'Depósito % inativo', d.id; end if;
  end if;
  if new.tipo = 'SALDO_INICIAL' and exists (
      select 1 from est_movimentos where empresa = new.empresa and sku = new.sku
        and (deposito_destino_id = new.deposito_destino_id or deposito_origem_id = new.deposito_destino_id)) then
    raise exception 'Já existe movimento de % em %; abertura não permitida (use ajuste)', new.sku, new.deposito_destino_id;
  end if;
  if new.tipo in ('AJUSTE_ENTRADA','AJUSTE_SAIDA','ENTRADA_MANUAL') and coalesce(new.motivo,'') = '' then
    raise exception 'Motivo obrigatório para %', new.tipo;
  end if;
  return new;
end $function$;

-- 5) Estorno: não estorna estorno; motivo obrigatório
create or replace function public.est_estornar_movimento(p_id uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $function$
declare m est_movimentos%rowtype; v_id uuid;
begin
  if not est_tem_permissao('entrada_manual', true) then raise exception 'Sem permissão para estornar'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Motivo obrigatório'; end if;
  select * into m from est_movimentos where id = p_id;
  if not found then raise exception 'Movimento não encontrado'; end if;
  if m.tipo = 'ESTORNO' then raise exception 'Não se estorna um estorno; registre um movimento novo'; end if;
  if exists (select 1 from est_movimentos where estorna_id = p_id) then raise exception 'Movimento já estornado'; end if;
  insert into est_movimentos (empresa, sku, tipo, deposito_origem_id, deposito_destino_id, quantidade, unidade, custo_unitario,
    documento_tipo, documento_id, documento_numero, lote_id, estorna_id, motivo, usuario_email, origem_registro)
  values (m.empresa, m.sku, 'ESTORNO', m.deposito_destino_id, m.deposito_origem_id, m.quantidade, m.unidade, m.custo_unitario,
    m.documento_tipo, m.documento_id, m.documento_numero, m.lote_id, p_id, p_motivo, lower(coalesce(auth.jwt() ->> 'email','')), 'painel')
  returning id into v_id;
  return v_id;
end $function$;

-- 6) Abertura: data = fim do dia de corte; kits recusados; grava data_corte_abertura na primeira abertura
create or replace function public.est_abertura_lote(p_empresa text, p_deposito text, p_data date, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare r record; n int := 0; erros jsonb := '[]'::jsonb; v_custo numeric; v_lote uuid := gen_random_uuid();
        v_email text := lower(coalesce(auth.jwt() ->> 'email','')); v_data timestamptz := (p_data::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'America/Sao_Paulo';
begin
  if not est_tem_permissao('abertura', true) then raise exception 'Sem permissão para abertura'; end if;
  if p_data is null then raise exception 'Data de corte obrigatória'; end if;
  if not exists (select 1 from est_depositos where id = p_deposito and empresa = p_empresa and tipo = 'fisico' and ativo) then
    raise exception 'Depósito % não é físico/ativo da %', p_deposito, p_empresa; end if;
  for r in select x->>'sku' sku, (x->>'quantidade')::numeric qtd from jsonb_array_elements(p_itens) x loop
    begin
      if r.qtd is null or r.sku is null or trim(r.sku) = '' then continue; end if;
      if est_eh_kit(r.sku) then raise exception 'kit/composição: conte o componente'; end if;
      v_custo := null;
      select case when p_empresa = 'TOOW' then custo_toow else custo_gge_rj end into v_custo from vw_custo_precificacao where sku = r.sku;
      if r.qtd > 0 then
        insert into est_movimentos (data, empresa, sku, tipo, deposito_destino_id, quantidade, custo_unitario, documento_tipo, documento_id, lote_id, motivo, usuario_email, origem_registro)
        values (v_data, p_empresa, r.sku, 'SALDO_INICIAL', p_deposito, r.qtd, v_custo, 'abertura', p_data::text, v_lote, 'Inventário de abertura', v_email, 'painel');
      elsif r.qtd < 0 then
        if not exists (select 1 from est_depositos where id = p_deposito and permite_negativo) then raise exception 'abertura negativa não permitida em %', p_deposito; end if;
        insert into est_movimentos (data, empresa, sku, tipo, deposito_origem_id, quantidade, custo_unitario, documento_tipo, documento_id, lote_id, motivo, usuario_email, origem_registro)
        values (v_data, p_empresa, r.sku, 'AJUSTE_SAIDA', p_deposito, -r.qtd, v_custo, 'abertura', p_data::text, v_lote, 'Inventário de abertura (saldo negativo)', v_email, 'painel');
      else continue; end if;
      n := n + 1;
    exception when others then
      erros := erros || jsonb_build_object('sku', r.sku, 'erro', sqlerrm);
    end;
  end loop;
  if n > 0 then
    update est_config set valor = to_jsonb(p_data::text), atualizado_em = now(), atualizado_por = v_email
     where chave = 'data_corte_abertura' and (valor is null or valor = 'null'::jsonb);
  end if;
  return jsonb_build_object('lote', v_lote, 'gravados', n, 'erros', erros);
end $function$;

-- 7) Fator de conversão NF → unidade de estoque, em tabela própria (ex.: NF em caixas, estoque em milheiros)
create table if not exists est_fator_nf (
  codigo_bling text, descricao text, fator_estoque numeric not null default 1 check (fator_estoque > 0),
  atualizado_em timestamptz default now(), atualizado_por text,
  primary key (codigo_bling, descricao)
);
alter table est_fator_nf enable row level security;
create policy est_sel on est_fator_nf for select to authenticated using (est_usuario_ativo());
revoke all on est_fator_nf from anon;
comment on table est_fator_nf is 'Controle de Estoque: quantidade de estoque por unidade da NF, por item (código+descrição do fornecedor). 1 = mesma unidade.';

create or replace function public.est_mapear_item_nf(p_item_id uuid, p_sku text) returns void
language plpgsql security definer set search_path = public as $function$
declare it nfs_entrada_itens%rowtype; nf nfs_entrada%rowtype;
begin
  if not est_tem_permissao('entrada_nf', true) then raise exception 'Sem permissão'; end if;
  if p_sku <> 'IGNORAR' and est_eh_kit(p_sku) then raise exception 'SKU % é kit no Bling: mapeie para o componente', p_sku; end if;
  select * into it from nfs_entrada_itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado'; end if;
  select * into nf from nfs_entrada where id = it.nf_entrada_id;
  if exists (select 1 from nf_itens_depara d where d.codigo_bling is not distinct from it.codigo_bling and d.descricao is not distinct from it.descricao) then
    update nf_itens_depara set sku = p_sku, confirmado = true, status = 'ok'
     where codigo_bling is not distinct from it.codigo_bling and descricao is not distinct from it.descricao;
  else
    insert into nf_itens_depara (codigo_bling, descricao, sku, confirmado, status, fornecedor, origem)
    values (it.codigo_bling, it.descricao, p_sku, true, 'ok', nf.fornecedor_nome, 'painel-estoque');
  end if;
  update nfs_entrada_itens set sku = p_sku
   where sku is null and codigo_bling is not distinct from it.codigo_bling and descricao is not distinct from it.descricao;
end $function$;

create or replace function public.est_definir_fator_nf(p_item_id uuid, p_fator numeric) returns void
language plpgsql security definer set search_path = public as $function$
declare it nfs_entrada_itens%rowtype;
begin
  if not est_tem_permissao('entrada_nf', true) then raise exception 'Sem permissão'; end if;
  if p_fator is null or p_fator <= 0 then raise exception 'Fator inválido'; end if;
  select * into it from nfs_entrada_itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado'; end if;
  insert into est_fator_nf (codigo_bling, descricao, fator_estoque, atualizado_por)
  values (coalesce(it.codigo_bling,''), coalesce(it.descricao,''), p_fator, lower(coalesce(auth.jwt() ->> 'email','')))
  on conflict (codigo_bling, descricao) do update set fator_estoque = excluded.fator_estoque, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
end $function$;

-- 8) Entrada por NF: CFOP pela função canônica, corte da abertura, fator, kits, fornecedor homologado.
--    est_entrada_nf(uuid) mantém a assinatura (respeita o corte); est_entrada_nf_sem_corte(uuid) lança mesmo assim.
create or replace function public.est_entrada_nf_impl(p_nf_id uuid, p_ignorar_corte boolean) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare nf nfs_entrada%rowtype; it record; v_lote uuid := gen_random_uuid(); n int := 0; pul int := 0; v_dest text;
        v_email text := lower(coalesce(auth.jwt() ->> 'email','')); v_corte date; v_fator numeric; pulados jsonb := '[]'::jsonb;
begin
  if not est_tem_permissao('entrada_nf', true) then raise exception 'Sem permissão para entrada por NF'; end if;
  select * into nf from nfs_entrada where id = p_nf_id;
  if not found then raise exception 'NF não encontrada'; end if;
  if coalesce(nf.tipo_nf, 0) <> 0 then raise exception 'NF % não é de entrada', nf.numero_nf; end if;
  if not fn_fornecedor_homologado(nf.fornecedor_cnpj, nf.fornecedor_nome) then
    raise exception 'Emitente % não é fornecedor homologado (fornecedores_reais / fornecedores_aprovados)', coalesce(nf.fornecedor_nome, nf.fornecedor_cnpj, '?'); end if;
  select (valor #>> '{}')::date into v_corte from est_config where chave = 'data_corte_abertura' and valor <> 'null'::jsonb;
  if v_corte is not null and coalesce(nf.data_entrada, nf.data_emissao) <= v_corte and not p_ignorar_corte then
    raise exception 'NF % entrou em % (até o corte %): já está na contagem de abertura. Para lançar mesmo assim, use "lançar ignorando o corte".', nf.numero_nf, coalesce(nf.data_entrada, nf.data_emissao), v_corte; end if;
  v_dest := case nf.empresa when 'TOOW' then 'HUB_TOOW' else 'HUB_GGE' end;
  if exists (select 1 from est_movimentos where documento_tipo = 'nf_entrada' and documento_id = p_nf_id::text and tipo = 'COMPRA_NF') then
    raise exception 'NF % já tem entrada registrada', nf.numero_nf;
  end if;
  for it in select * from nfs_entrada_itens where nf_entrada_id = p_nf_id order by criado_em loop
    if it.sku is null or it.sku = 'IGNORAR' then pul := pul + 1; pulados := pulados || jsonb_build_object('codigo', it.codigo_bling, 'motivo', case when it.sku is null then 'sem SKU' else 'ignorado' end); continue; end if;
    if it.cfop is null or not fn_cfop_compra(left(it.cfop, 4)) then pul := pul + 1; pulados := pulados || jsonb_build_object('codigo', it.codigo_bling, 'motivo', 'CFOP ' || coalesce(it.cfop, '?') || ' não é compra'); continue; end if;
    if est_eh_kit(it.sku) then pul := pul + 1; pulados := pulados || jsonb_build_object('codigo', it.codigo_bling, 'motivo', 'SKU ' || it.sku || ' é kit: mapeie para o componente'); continue; end if;
    select coalesce(f.fator_estoque, 1) into v_fator from (select 1) x left join est_fator_nf f on f.codigo_bling = coalesce(it.codigo_bling,'') and f.descricao = coalesce(it.descricao,'');
    insert into est_movimentos (data, empresa, sku, tipo, deposito_destino_id, quantidade, unidade, qtd_documento, custo_unitario,
      documento_tipo, documento_id, documento_numero, lote_id, observacao, usuario_email, origem_registro)
    values (coalesce(nf.data_emissao::timestamptz, now()), coalesce(nf.empresa,'GGE'), it.sku, 'COMPRA_NF', v_dest,
      it.quantidade * v_fator, case when v_fator <> 1 then 'NF×' || v_fator else null end, it.quantidade,
      case when it.custo_cif_unitario is null then null else it.custo_cif_unitario / v_fator end,
      'nf_entrada', p_nf_id::text, nf.numero_nf, v_lote,
      'Fornecedor ' || coalesce(nf.fornecedor_nome,'') || ' CFOP ' || coalesce(it.cfop,'?'), v_email, 'painel');
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nenhum item lançável na NF % (%)', nf.numero_nf, pulados::text; end if;
  return jsonb_build_object('lote', v_lote, 'itens_lancados', n, 'itens_pulados', pul, 'pulados', pulados);
end $function$;

create or replace function public.est_entrada_nf(p_nf_id uuid) returns jsonb
language sql security definer set search_path = public as $$ select est_entrada_nf_impl(p_nf_id, false); $$;
create or replace function public.est_entrada_nf_sem_corte(p_nf_id uuid) returns jsonb
language sql security definer set search_path = public as $$ select est_entrada_nf_impl(p_nf_id, true); $$;

-- 9) NFs pendentes: só entrada, só fornecedor homologado, só com itens; marca pré-abertura
create or replace view vw_est_nfs_pendentes as
 select nf.id, nf.empresa, nf.numero_nf, nf.fornecedor_nome, nf.fornecedor_cnpj, nf.data_emissao, nf.data_entrada, nf.valor_total,
        count(i.id) as itens,
        count(i.id) filter (where i.sku is null) as itens_sem_sku,
        count(i.id) filter (where i.sku is not null and i.sku <> 'IGNORAR' and not exists (select 1 from bling_produtos bp where bp.codigo = i.sku and bp.empresa = coalesce(nf.empresa,'GGE'))) as itens_fora_bling,
        exists (select 1 from est_movimentos m where m.documento_tipo = 'nf_entrada' and m.documento_id = nf.id::text and m.tipo = 'COMPRA_NF') as lancada,
        count(i.id) filter (where i.cfop is not null and fn_cfop_compra(left(i.cfop,4))) as itens_compra,
        count(i.id) filter (where i.sku is not null and i.sku <> 'IGNORAR' and est_eh_kit(i.sku)) as itens_kit,
        (select (c.valor #>> '{}')::date from est_config c where c.chave = 'data_corte_abertura' and c.valor <> 'null'::jsonb) is not null
          and coalesce(nf.data_entrada, nf.data_emissao) <= (select (c.valor #>> '{}')::date from est_config c where c.chave = 'data_corte_abertura' and c.valor <> 'null'::jsonb) as pre_abertura
   from nfs_entrada nf
   left join nfs_entrada_itens i on i.nf_entrada_id = nf.id
  where coalesce(nf.tipo_nf, 0) = 0
    and coalesce(nf.status_processamento,'') <> 'excluida_bling'
    and fn_fornecedor_homologado(nf.fornecedor_cnpj, nf.fornecedor_nome)
  group by nf.id
 having count(i.id) > 0;
revoke all on vw_est_nfs_pendentes from anon;

-- 10) Divergências: sem kits (o Bling calcula o kit a partir dos componentes)
create or replace view vw_est_divergencias as
 select coalesce(s.empresa, b.empresa) as empresa, coalesce(s.sku, b.sku) as sku, coalesce(s.deposito_id, b.deposito_id) as deposito_id,
        coalesce(s.saldo, 0::numeric) as nosso, b.saldo_fisico as bling,
        coalesce(s.saldo, 0::numeric) - coalesce(b.saldo_fisico, 0::numeric) as divergencia, b.lido_em
   from vw_est_saldos s
   full join est_bling_saldos b on b.empresa = s.empresa and b.sku = s.sku and b.deposito_id = s.deposito_id
   join est_depositos d on d.id = coalesce(s.deposito_id, b.deposito_id)
  where d.fonte_saldo = 'bling' and not est_eh_kit(coalesce(s.sku, b.sku));
revoke all on vw_est_divergencias from anon;

-- 11) Saldos por SKU: marca kit (coluna nova no fim)
create or replace view vw_est_saldos_sku as
 select s.empresa, s.sku, coalesce(sc.descricao, bp.nome) as descricao, coalesce(sc.unidade, 'UN'::text) as unidade,
        cp.custo_gge_rj, cp.custo_gge_sp, cp.custo_toow, sc.preco_fob, bp.bling_id is not null as existe_no_bling,
        sum(s.saldo) filter (where d.tipo <> 'externo'::text) as total_empresa,
        jsonb_object_agg(s.deposito_id, s.saldo) as saldos,
        est_eh_kit(s.sku) as eh_kit
   from vw_est_saldos s
   join est_depositos d on d.id = s.deposito_id
   left join skus_custo sc on sc.sku = s.sku
   left join bling_produtos bp on bp.codigo = s.sku and bp.empresa = s.empresa
   left join vw_custo_precificacao cp on cp.sku = s.sku
  group by s.empresa, s.sku, sc.descricao, bp.nome, sc.unidade, cp.custo_gge_rj, cp.custo_gge_sp, cp.custo_toow, sc.preco_fob, bp.bling_id;
revoke all on vw_est_saldos_sku from anon;

-- 12) Uma pendência aberta por célula
create unique index if not exists idx_est_pend_aberta on est_pendencias_bling (empresa, sku, deposito_id) where status in ('pendente','enviando');

-- 13) Defesa extra: anon sem privilégio nas tabelas do módulo (RLS já bloqueia; isto fecha a porta de vez)
revoke all on est_depositos, est_tipos_movimento, est_movimentos, est_bling_saldos, est_pendencias_bling, est_config, est_usuarios, est_funcoes, est_usuarios_funcoes, est_auditoria, est_fator_nf from anon;
revoke all on vw_est_saldos, vw_est_hub_aberto, vw_est_abertura_status, vw_est_full_ml from anon;
-- Funções novas/recriadas nascem com EXECUTE para PUBLIC: fechar de novo
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'est\_%' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- 14) Kit é por empresa e ignora cadastros excluídos (situacao E). PNF30CX5 é kit na GGE e produto simples na Toow.
--     est_eh_kit(empresa, sku) é a versão canônica; est_eh_kit(sku) = GGE (mantida por compatibilidade).
--     Validador, abertura, mapeamento, entrada por NF e as views passaram a usar a versão por empresa (aplicado em 18/10/2026).
create or replace function est_eh_kit(p_empresa text, p_sku text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from bling_produtos b where b.empresa = p_empresa and b.codigo = p_sku and b.formato is distinct from 'S' and coalesce(b.situacao,'A') <> 'E')
     and not exists (select 1 from bling_produtos b where b.empresa = p_empresa and b.codigo = p_sku and b.formato = 'S' and coalesce(b.situacao,'A') <> 'E');
$$;
create or replace function est_eh_kit(p_sku text) returns boolean
language sql stable set search_path = public as $$ select est_eh_kit('GGE', p_sku); $$;

-- 15) Full ML lido direto por inventory_id (todos os anúncios): tabela + view com preferência pela leitura direta
create table if not exists est_full_saldos (
  empresa text not null check (empresa in ('GGE','TOOW')),
  inventory_id text not null,
  sku text, mlb_ids text[],
  disponivel numeric default 0, reservada numeric default 0, quarentena numeric default 0, danificada numeric default 0, nao_disponivel_outros numeric default 0, total numeric default 0,
  status_http int, lido_em timestamptz, erro_em timestamptz,
  primary key (empresa, inventory_id)
);
alter table est_full_saldos enable row level security;
create policy est_sel on est_full_saldos for select to authenticated using (est_usuario_ativo());
revoke all on est_full_saldos from anon;
create index if not exists idx_est_full_sku on est_full_saldos (empresa, sku);
-- vw_est_full_ml: ver definição aplicada (fs = est_full_saldos; ed = estoque_diario como reserva; fonte_direta no fim)

-- 16) Índices de apoio (advisor)
create index if not exists idx_est_mov_estorna on est_movimentos (estorna_id) where estorna_id is not null;
create index if not exists idx_est_pend_dep on est_pendencias_bling (empresa, deposito_id, sku);
create index if not exists idx_est_bling_saldos_dep on est_bling_saldos (deposito_id);

-- 17) Agendamentos (pg_cron): est-bling-saldos-gge 15 */6, est-bling-saldos-toow 25 */6, est-ml-full 35 */6, est-bling-produtos 40 5 (UTC)
