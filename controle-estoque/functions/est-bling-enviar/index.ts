// est-bling-enviar — envia pendências (est_pendencias_bling) ao Bling por diferença (E/S), com releitura antes.
// POST { ids: uuid[] }  — exige função 'enviar_bling' (editar). Para cada pendência:
//   1. relê saldo atual no Bling; se ≠ saldo_lido → status 'bloqueado' (bloqueio_saldo_atual)
//   2. senão POST /estoques (operacao E ou S, quantidade |delta|) e grava AJUSTE_* no livro
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
  let r = await run(); if (r.status === 429) { await sleep(1500); r = await run(); }
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
    const { data: pend } = await sb.from('est_pendencias_bling').select('*').in('id', ids).in('status', ['pendente', 'bloqueado', 'erro']);
    const { data: deps } = await sb.from('est_depositos').select('id, empresa, bling_deposito_id, editavel');
    const dep = (id: string) => (deps || []).find((d: any) => d.id === id);
    const tokens: Record<string, string> = {};
    let enviados = 0, bloqueados = 0, erros = 0; const detalhes: any[] = [];

    for (const p of (pend || [])) {
      const d = dep(p.deposito_id);
      const fail = async (msg: string, status = 'erro', extra: any = {}) => { erros += status === 'erro' ? 1 : 0; bloqueados += status === 'bloqueado' ? 1 : 0; detalhes.push({ id: p.id, sku: p.sku, status, msg }); await sb.from('est_pendencias_bling').update({ status, resposta_bling: { erro: msg }, enviado_por: who.email, enviado_em: new Date().toISOString(), ...extra }).eq('id', p.id); };
      try {
        if (!d || !d.bling_deposito_id || !d.editavel) { await fail('depósito sem id Bling ou não editável'); continue; }
        if (!tokens[p.empresa]) tokens[p.empresa] = await blingToken(sb, p.empresa, 'est-bling-enviar');
        const token = tokens[p.empresa];
        // id do produto no Bling
        let { data: bp } = await sb.from('bling_produtos').select('bling_id').eq('empresa', p.empresa).eq('codigo', p.sku).maybeSingle();
        let pid = bp?.bling_id ? String(bp.bling_id) : null;
        if (!pid) { const f = await bling(token, 'GET', `/produtos?codigo=${encodeURIComponent(p.sku)}`); pid = f?.data?.[0]?.id ? String(f.data[0].id) : null; }
        if (!pid) { await fail('SKU não existe no Bling da ' + p.empresa); continue; }
        // releitura
        const s = await bling(token, 'GET', `/estoques/saldos?idsProdutos[]=${pid}`);
        const depBl = (s?.data?.[0]?.depositos || []).find((x: any) => String(x.id) === String(d.bling_deposito_id));
        const atual = Number(depBl?.saldoFisico ?? 0);
        if (p.saldo_lido !== null && Math.abs(atual - Number(p.saldo_lido)) > 1e-9) { await fail(`saldo mudou no Bling (lido ${p.saldo_lido}, agora ${atual})`, 'bloqueado', { bloqueio_saldo_atual: atual }); continue; }
        const delta = Number(p.saldo_novo) - atual;
        if (Math.abs(delta) < 1e-9) { await sb.from('est_pendencias_bling').update({ status: 'enviado', resposta_bling: { nota: 'sem diferença' }, enviado_por: who.email, enviado_em: new Date().toISOString() }).eq('id', p.id); enviados++; continue; }
        const resp = await bling(token, 'POST', '/estoques', { produto: { id: Number(pid) }, deposito: { id: Number(d.bling_deposito_id) }, operacao: delta > 0 ? 'E' : 'S', quantidade: Math.abs(delta), observacoes: `Controle de Estoque GGE · ${p.motivo || 'ajuste'} · ${who.email}` });
        // livro: ajuste equivalente, nosso saldo deve igualar saldo_novo
        const { data: sal } = await sb.from('vw_est_saldos').select('saldo').eq('empresa', p.empresa).eq('sku', p.sku).eq('deposito_id', p.deposito_id).maybeSingle();
        const nosso = Number(sal?.saldo ?? 0); const dl = Number(p.saldo_novo) - nosso; let movId: string | null = null;
        if (Math.abs(dl) > 1e-9) {
          const { data: mv, error: me } = await sb.from('est_movimentos').insert({ empresa: p.empresa, sku: p.sku, tipo: dl > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA', deposito_origem_id: dl > 0 ? null : p.deposito_id, deposito_destino_id: dl > 0 ? p.deposito_id : null, quantidade: Math.abs(dl), documento_tipo: 'pendencia_bling', documento_id: p.id, motivo: p.motivo || 'ajuste via painel (enviado ao Bling)', usuario_email: who.email, origem_registro: 'edge' }).select('id').single();
          if (me) detalhes.push({ id: p.id, sku: p.sku, aviso: 'Bling atualizado, livro não: ' + me.message }); else movId = mv.id;
        }
        await sb.from('est_pendencias_bling').update({ status: 'enviado', resposta_bling: resp, enviado_por: who.email, enviado_em: new Date().toISOString(), movimento_id: movId }).eq('id', p.id);
        await sb.from('est_bling_saldos').upsert({ empresa: p.empresa, sku: p.sku, deposito_id: p.deposito_id, saldo_fisico: Number(p.saldo_novo), bling_produto_id: pid, lido_em: new Date().toISOString() }, { onConflict: 'empresa,sku,deposito_id' });
        enviados++;
        await sleep(400);
      } catch (e: any) { await fail(String(e.message || e)); }
    }
    return json({ ok: true, enviados, bloqueados, erros, detalhes });
  } catch (e: any) { return json({ error: String(e.message || e) }, 500); }
});
