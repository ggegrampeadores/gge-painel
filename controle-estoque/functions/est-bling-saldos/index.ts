// est-bling-saldos — lê saldos por depósito no Bling e grava em est_bling_saldos.
// POST { empresa: 'GGE'|'TOOW', skus?: string[] }  (sem skus = todos os produtos da empresa em bling_produtos)
// Chamada pelo painel (JWT do usuário, função 'saldos') ou pelo cron (service role).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BLING_API = 'https://api.bling.com.br/Api/v3';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise(s => setTimeout(s, ms));
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function callerOk(req: Request, funcao: string, editar: boolean) {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return { ok: true, email: 'cron' };
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
  throw new Error(`Token Bling ${empresa} indisponível (ver vw_bling_token_status)`);
}
async function bling(token: string, path: string): Promise<any> {
  const run = () => fetch(`${BLING_API}${path}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  let r = await run(); if (r.status === 429) { await sleep(1500); r = await run(); }
  const t = await r.text(); if (!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const who = await callerOk(req, 'saldos', false);
    if (!who.ok) return json({ error: who.erro }, 403);
    const body = await req.json().catch(() => ({}));
    const empresa = (body.empresa || 'GGE').toUpperCase();
    const sb = admin();
    const token = await blingToken(sb, empresa, 'est-bling-saldos');

    // depósitos desta empresa com id Bling
    const { data: deps } = await sb.from('est_depositos').select('id, bling_deposito_id').eq('empresa', empresa).not('bling_deposito_id', 'is', null);
    const depMap: Record<string, string> = {}; for (const d of (deps || [])) depMap[String(d.bling_deposito_id)] = d.id;
    if (!Object.keys(depMap).length) return json({ error: `Nenhum depósito da ${empresa} tem id Bling configurado (Parâmetros › Depósitos)` }, 400);

    // SKUs → id Bling (bling_produtos da empresa; fallback consulta /produtos?codigo=)
    let q = sb.from('bling_produtos').select('codigo, bling_id').eq('empresa', empresa);
    if (Array.isArray(body.skus) && body.skus.length) q = q.in('codigo', body.skus);
    const { data: prods } = await q;
    const idMap: Record<string, string> = {}; for (const p of (prods || [])) if (p.codigo && p.bling_id) idMap[p.codigo] = String(p.bling_id);
    const semId: string[] = [];
    if (Array.isArray(body.skus)) for (const s of body.skus) if (!idMap[s]) {
      try { const d = await bling(token, `/produtos?codigo=${encodeURIComponent(s)}`); const pid = d?.data?.[0]?.id; if (pid) idMap[s] = String(pid); else semId.push(s); } catch { semId.push(s); }
      await sleep(350);
    }
    const porId: Record<string, string> = {}; for (const [sku, id] of Object.entries(idMap)) porId[id] = sku;
    const ids = Object.values(idMap);
    let linhas = 0; const agora = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 25) {
      const lote = ids.slice(i, i + 25);
      const d = await bling(token, `/estoques/saldos?${lote.map(id => `idsProdutos[]=${id}`).join('&')}`);
      const rows: any[] = [];
      for (const p of (d?.data || [])) {
        const sku = porId[String(p?.produto?.id)]; if (!sku) continue;
        for (const dep of (p?.depositos || [])) {
          const depId = depMap[String(dep.id)]; if (!depId) continue;
          rows.push({ empresa, sku, deposito_id: depId, saldo_fisico: Number(dep.saldoFisico ?? 0), saldo_virtual: Number(dep.saldoVirtual ?? 0), bling_produto_id: String(p.produto.id), lido_em: agora });
        }
      }
      if (rows.length) { const { error } = await sb.from('est_bling_saldos').upsert(rows, { onConflict: 'empresa,sku,deposito_id' }); if (error) throw new Error('upsert: ' + error.message); linhas += rows.length; }
      await sleep(400);
    }
    return json({ ok: true, empresa, produtos: ids.length, linhas, sem_id_bling: semId, por: who.email });
  } catch (e: any) { return json({ error: String(e.message || e) }, 500); }
});
