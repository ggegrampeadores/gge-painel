-- Fase 1 — complementos: mapeamento de item de NF e abertura em lote.

-- Mapear item da NF para SKU (grava de-para e atualiza o item). Exige função entrada_nf (editar).
create or replace function est_mapear_item_nf(p_item_id uuid, p_sku text) returns void
language plpgsql security definer set search_path = public as $$
declare it nfs_entrada_itens%rowtype; nf nfs_entrada%rowtype;
begin
  if not est_tem_permissao('entrada_nf', true) then raise exception 'Sem permissão'; end if;
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
  -- aplica a todos os itens iguais ainda sem SKU (mesma NF ou outras)
  update nfs_entrada_itens set sku = p_sku
   where sku is null and codigo_bling is not distinct from it.codigo_bling and descricao is not distinct from it.descricao;
end $$;
grant execute on function est_mapear_item_nf(uuid, text) to authenticated;

-- Abertura em lote: recebe [{sku, quantidade}] para um depósito; grava SALDO_INICIAL com custo vigente.
create or replace function est_abertura_lote(p_empresa text, p_deposito text, p_data date, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; erros jsonb := '[]'::jsonb; v_custo numeric; v_lote uuid := gen_random_uuid(); v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if not est_tem_permissao('abertura', true) then raise exception 'Sem permissão para abertura'; end if;
  for r in select x->>'sku' sku, (x->>'quantidade')::numeric qtd from jsonb_array_elements(p_itens) x loop
    begin
      if r.qtd is null then continue; end if;
      select case when p_empresa='TOOW' then custo_toow else custo_gge_rj end into v_custo from vw_custo_precificacao where sku = r.sku;
      if r.qtd > 0 then
        insert into est_movimentos (data, empresa, sku, tipo, deposito_destino_id, quantidade, custo_unitario, documento_tipo, documento_id, lote_id, motivo, usuario_email, origem_registro)
        values (p_data::timestamptz, p_empresa, r.sku, 'SALDO_INICIAL', p_deposito, r.qtd, v_custo, 'abertura', p_data::text, v_lote, 'Inventário de abertura', v_email, 'painel');
      elsif r.qtd < 0 then
        -- só depósitos com permite_negativo aceitam abertura negativa (Toow): registra como ajuste de saída
        if not exists (select 1 from est_depositos where id = p_deposito and permite_negativo) then raise exception 'Abertura negativa não permitida em %', p_deposito; end if;
        insert into est_movimentos (data, empresa, sku, tipo, deposito_origem_id, quantidade, custo_unitario, documento_tipo, documento_id, lote_id, motivo, usuario_email, origem_registro)
        values (p_data::timestamptz, p_empresa, r.sku, 'AJUSTE_SAIDA', p_deposito, -r.qtd, v_custo, 'abertura', p_data::text, v_lote, 'Inventário de abertura (saldo negativo)', v_email, 'painel');
      else continue; end if;
      n := n + 1;
    exception when others then
      erros := erros || jsonb_build_object('sku', r.sku, 'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('lote', v_lote, 'gravados', n, 'erros', erros);
end $$;
grant execute on function est_abertura_lote(text, text, date, jsonb) to authenticated;

-- Depósitos já abertos (têm SALDO_INICIAL)
create or replace view vw_est_abertura_status as
select d.id deposito_id, d.empresa, d.nome, d.tipo,
       count(m.id) filter (where m.tipo='SALDO_INICIAL') skus_abertos,
       min(m.data) filter (where m.tipo='SALDO_INICIAL') data_abertura,
       count(m.id) movimentos
from est_depositos d left join est_movimentos m on m.deposito_destino_id = d.id or m.deposito_origem_id = d.id
group by d.id, d.empresa, d.nome, d.tipo;
