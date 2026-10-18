// est-bling-enviar — envia pendências (est_pendencias_bling) ao Bling por diferença (E/S), com releitura antes.
// POST { ids: uuid[] }  — exige função 'enviar_bling' (editar).
// v4 (18/10/2026): ignora cadastros excluídos no Bling (situacao E).
// v2 (17/10/2026): trava contra envio duplicado ('enviando'), bloqueia sem leitura prévia,
// bloqueia saldo negativo onde não é permitido, registra aviso persistente se o livro falhar,
// só envia produto simples (formato 'S'); kits/composição têm estoque derivado dos componentes.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BLING_API = 'https://api.bling.com.br/Api/v3';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise(s => setTimeout(s, ms));
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function callerOk(req: Request, funcao: string, editar: boolean) {
  const auth = req.headers.get('Authorization') ?? '';
  const c = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const u = await c.auth.getUser();
  if (u.error || !u.data.user?.email) return { ok: false, email: null, erro: 'não autenticado' };
  const p = await c.rpc('est_tem_permissao', { p_funcao: funcao, p_editar: editar });
  return { ok: !!p.data && !p.error, email: u.data.user.email, erro: p.error?.message ?? (p.data ? null : 'sem permissão: ' + funcao) };
}
async function blingToken(sb: any, empresa: string, origem: string): Promise<string> {
  const ler = async () => (await sb.from('contas_bling').select('access_token, token_expires_at').eq('empresa', empresa).maybeSingle()).data;
  const valido = (c: any) => c?.access_token && c?.token_expires_at && new Date(c.token_expires_at).getTime() - Date.now() > 2 * 60 * 1000;
  let c = await ler(); if (valido(c)) return c.access_token;
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bling-refresh-token`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }, body: JSON.stringify({ empresa, limiar_min: 10, origem }) }).catch(() => null);
  c = await ler(); if (valido(c)) return c.access_token;
  throw new Error(`Token Bling ${empresa} indisponível`);
}
async function bling(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const run = () => fetch(`${BLING_API}${path}`, { method, headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let r = await run(); if (r.status === 429 && method === 'GET') { await sleep(1500); r = await run(); }
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const who = await callerOk(req, 'enviar_bling', true);
    if (!who.ok) return json({ error: who.erro }, 403);
    const { ids } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: 'ids obrigatório' }, 400);
    const sb = admin();
    const { data: deps } = await sb.from('est_depositos').select('id, empresa, bling_deposito_id, editavel, permite_negativo, ativo');
    const dep = (id: string) => (deps || []).find((d: any) => d.id === id);
    const tokens: Record<string, string> = {};
    let enviados = 0, bloqueados = 0, erros = 0, ignorados = 0; const detalhes: any[] = [];

    for (const id of ids) {
      // 1) Trava: só um envio por pendência. Se outro processo já pegou, ignora.
      const { data: claim } = await sb.from('est_pendencias_bling')
        .update({ status: 'enviando', enviado_por: who.email, enviado_em: new Date().toISOString() })
        .eq('id', id).in('status', ['pendente', 'bloqueado', 'erro']).select('*');
      const p = claim?.[0];
      if (!p) { ignorados++; detalhes.push({ id, status: 'ignorado', msg: 'já enviada, cancelada ou em envio' }); continue; }

      const d = dep(p.deposito_id);
      const fim = async (status: string, resposta: any, extra: any = {}) => {
        await sb.from('est_pendencias_bling').update({ status, resposta_bling: resposta, enviado_por: who.email, enviado_em: new Date().toISOString(), ...extra }).eq('id', p.id);
      };
      const fail = async (msg: string, status = 'erro', extra: any = {}) => {
        if (status === 'erro') erros++; else bloqueados++;
        detalhes.push({ id: p.id, sku: p.sku, status, msg }); await fim(status, { erro: msg }, extra);
      };
      try {
        // 2) Pré-condições, antes de qualquer chamada de escrita ao Bling
        if (!d || !d.ativo || !d.bling_deposito_id || !d.editavel) { await fail('depósito inativo, sem id Bling ou não editável'); continue; }
        if (d.empresa !== p.empresa) { await fail('depósito é de outra empresa'); continue; }
        if (p.saldo_lido === null || p.saldo_lido === undefined) { await fail('sem leitura prévia do Bling: releia os saldos e refaça a alteração', 'bloqueado'); continue; }
        if (Number(p.saldo_novo) < 0 && !d.permite_negativo) { await fail('saldo novo negativo não permitido neste depósito'); continue; }

        if (!tokens[p.empresa]) tokens[p.empresa] = await blingToken(sb, p.empresa, 'est-bling-enviar');
        const token = tokens[p.empresa];
        const { data: bps } = await sb.from('bling_produtos').select('bling_id, formato, situacao').eq('empresa', p.empresa).eq('codigo', p.sku).neq('situacao', 'E'); const bp = (bps || []).find((x: any) => x.formato === 'S') ?? bps?.[0];
        let pid = bp?.bling_id ? String(bp.bling_id) : null; let formato = bp?.formato ?? null;
        if (!pid) { const f = await bling(token, 'GET', `/produtos?codigo=${encodeURIComponent(p.sku)}`); pid = f?.data?.[0]?.id ? String(f.data[0].id) : null; formato = f?.data?.[0]?.formato ?? null; }
        if (!pid) { await fail('SKU não existe no Bling da ' + p.empresa); continue; }
        if (formato !== 'S') { await fail(`produto com formato '${formato ?? '?'}' no Bling (kit/composição/variação): o estoque é dos componentes; ajuste o componente`, 'bloqueado'); continue; }

        // 3) Releitura: se o Bling mudou desde a leitura, bloqueia
        const s = await bling(token, 'GET', `/estoques/saldos?idsProdutos[]=${pid}`);
        const depBl = (s?.data?.[0]?.depositos || []).find((x: any) => String(x.id) === String(d.bling_deposito_id));
        const atual = Number(depBl?.saldoFisico ?? 0);
        if (Math.abs(atual - Number(p.saldo_lido)) > 1e-9) { await fail(`saldo mudou no Bling (lido ${p.saldo_lido}, agora ${atual})`, 'bloqueado', { bloqueio_saldo_atual: atual }); continue; }
        const delta = Number(p.saldo_novo) - atual;
        if (Math.abs(delta) < 1e-9) { await fim('enviado', { nota: 'sem diferença; nada enviado' }); enviados++; continue; }

        // 4) Envio da diferença (nunca balanço). Sem nova tentativa automática em escrita.
        const resp = await bling(token, 'POST', '/estoques', { produto: { id: Number(pid) }, deposito: { id: Number(d.bling_deposito_id) }, operacao: delta > 0 ? 'E' : 'S', quantidade: Math.abs(delta), observacoes: `Controle de Estoque GGE · ${p.motivo || 'ajuste'} · ${who.email}` });

        // 5) Livro: ajusta o nosso saldo ao novo valor
        const { data: sal } = await sb.from('vw_est_saldos').select('saldo').eq('empresa', p.empresa).eq('sku', p.sku).eq('deposito_id', p.deposito_id).maybeSingle();
        const nosso = Number(sal?.saldo ?? 0); const dl = Number(p.saldo_novo) - nosso; let movId: string | null = null; let avisoLivro: string | null = null;
        if (Math.abs(dl) > 1e-9) {
          const { data: mv, error: me } = await sb.from('est_movimentos').insert({ empresa: p.empresa, sku: p.sku, tipo: dl > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA', deposito_origem_id: dl > 0 ? null : p.deposito_id, deposito_destino_id: dl > 0 ? p.deposito_id : null, quantidade: Math.abs(dl), documento_tipo: 'pendencia_bling', documento_id: p.id, motivo: p.motivo || 'ajuste via painel (enviado ao Bling)', usuario_email: who.email, origem_registro: 'edge' }).select('id').single();
          if (me) { avisoLivro = 'Bling atualizado, livro NÃO: ' + me.message; detalhes.push({ id: p.id, sku: p.sku, aviso: avisoLivro }); } else movId = mv.id;
        }
        await fim('enviado', avisoLivro ? { bling: resp, aviso_livro: avisoLivro, delta_enviado: delta } : { bling: resp, delta_enviado: delta }, { movimento_id: movId });
        await sb.from('est_bling_saldos').upsert({ empresa: p.empresa, sku: p.sku, deposito_id: p.deposito_id, saldo_fisico: Number(p.saldo_novo), bling_produto_id: pid, lido_em: new Date().toISOString() }, { onConflict: 'empresa,sku,deposito_id' });
        enviados++;
        await sleep(400);
      } catch (e: any) { await fail(String(e.message || e)); }
    }
    return json({ ok: true, enviados, bloqueados, erros, ignorados, detalhes });
  } catch (e: any) { return json({ error: String(e.message || e) }, 500); }
});
