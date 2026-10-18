// est-ml-full — lê o estoque no Full do Mercado Livre por inventory_id (todos os anúncios, ativos ou não)
// e grava em est_full_saldos. Fonte confiável do Full (decisão Neco 17/10/2026).
// POST { empresa?: 'GGE'|'TOOW'|'ALL' }  — painel (JWT, função 'saldos') ou cron (service role).
// Token ML: só leitura; quem renova é a ml-refresh-tokens.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ML = 'https://api.mercadolibre.com';
const BUDGET_MS = 110_000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise(s => setTimeout(s, ms));
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function callerOk(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return { ok: true, email: 'cron' };
  const c = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const u = await c.auth.getUser();
  if (u.error || !u.data.user?.email) return { ok: false, email: null, erro: 'não autenticado' };
  const p = await c.rpc('est_tem_permissao', { p_funcao: 'saldos', p_editar: false });
  return { ok: !!p.data && !p.error, email: u.data.user.email, erro: p.error?.message ?? (p.data ? null : 'sem permissão: saldos') };
}
async function mlToken(sb: any, contaId: string): Promise<string> {
  const ler = async () => (await sb.from('contas').select('access_token, token_expires_at').eq('id', contaId).maybeSingle()).data;
  const valido = (c: any) => c?.access_token && c?.token_expires_at && new Date(c.token_expires_at).getTime() - Date.now() > 5 * 60 * 1000;
  let c = await ler(); if (valido(c)) return c.access_token;
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-refresh-tokens`, { method: 'POST', headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` } }).catch(() => null);
  c = await ler(); if (c?.access_token) return c.access_token;
  throw new Error('Token ML indisponível');
}
function empresaDaConta(nome: string) { return /toow/i.test(nome) ? 'TOOW' : 'GGE'; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const t0 = Date.now();
  try {
    const who = await callerOk(req);
    if (!who.ok) return json({ error: who.erro }, 403);
    const body = await req.json().catch(() => ({}));
    const filtro = String(body.empresa || 'ALL').toUpperCase();
    const sb = admin();
    const { data: contas } = await sb.from('contas').select('id, nome, ml_user_id');
    const res: any[] = []; let lidos = 0, erros = 0, pendentes = 0;

    for (const conta of (contas || [])) {
      const empresa = empresaDaConta(conta.nome);
      if (filtro !== 'ALL' && filtro !== empresa) continue;
      // Inventários desta conta (qualquer status de anúncio), do mais antigo lido para o mais recente
      const { data: ans } = await sb.from('anuncios').select('mlb_id, inventory_id, sku_vendedor, status').eq('conta_id', conta.id).not('inventory_id', 'is', null);
      const porInv: Record<string, { mlbs: string[]; sku: string | null }> = {};
      for (const a of (ans || [])) { const k = String(a.inventory_id); (porInv[k] ||= { mlbs: [], sku: null }).mlbs.push(a.mlb_id); if (!porInv[k].sku && a.sku_vendedor) porInv[k].sku = a.sku_vendedor; }
      const invs = Object.keys(porInv);
      if (!invs.length) { res.push({ conta: conta.nome, empresa, inventarios: 0 }); continue; }
      const { data: lidosAntes } = await sb.from('est_full_saldos').select('inventory_id, lido_em').eq('empresa', empresa).in('inventory_id', invs);
      const quando: Record<string, string> = {}; for (const l of (lidosAntes || [])) quando[l.inventory_id] = l.lido_em;
      invs.sort((a, b) => (quando[a] || '').localeCompare(quando[b] || ''));
      const token = await mlToken(sb, conta.id);
      let n = 0, e = 0;
      for (const inv of invs) {
        if (Date.now() - t0 > BUDGET_MS) { pendentes += invs.length - n - e; break; }
        try {
          let r = await fetch(`${ML}/inventories/${inv}/stock/fulfillment`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.status === 429) { await sleep(1500); r = await fetch(`${ML}/inventories/${inv}/stock/fulfillment`, { headers: { Authorization: `Bearer ${token}` } }); }
          const agora = new Date().toISOString();
          if (r.status === 404) {
            await sb.from('est_full_saldos').upsert({ empresa, inventory_id: inv, sku: porInv[inv].sku, mlb_ids: porInv[inv].mlbs, disponivel: 0, reservada: 0, quarentena: 0, danificada: 0, nao_disponivel_outros: 0, total: 0, status_http: 404, lido_em: agora }, { onConflict: 'empresa,inventory_id' });
            n++; continue;
          }
          if (!r.ok) { e++; await sb.from('est_full_saldos').upsert({ empresa, inventory_id: inv, sku: porInv[inv].sku, mlb_ids: porInv[inv].mlbs, status_http: r.status, erro_em: agora }, { onConflict: 'empresa,inventory_id' }); continue; }
          const d = await r.json();
          const na = d?.not_available_quantity ?? {};
          const nd = d?.not_available_detail ?? [];
          const det = (s: string) => Number((Array.isArray(nd) ? nd.find((x: any) => x.status === s)?.quantity : na[s]) ?? 0);
          const reservada = det('reserved'), quarentena = det('quarantine'), danificada = det('damaged');
          const naTotal = Number(d?.not_available_quantity ?? 0);
          const outros = Math.max(0, (isNaN(naTotal) ? 0 : naTotal) - reservada - quarentena - danificada);
          const disponivel = Number(d?.available_quantity ?? 0);
          const total = Number(d?.total ?? (disponivel + (isNaN(naTotal) ? 0 : naTotal)));
          await sb.from('est_full_saldos').upsert({ empresa, inventory_id: inv, sku: porInv[inv].sku, mlb_ids: porInv[inv].mlbs, disponivel, reservada, quarentena, danificada, nao_disponivel_outros: outros, total, status_http: 200, lido_em: agora, erro_em: null }, { onConflict: 'empresa,inventory_id' });
          n++;
        } catch (ex) { e++; }
        await sleep(150);
      }
      lidos += n; erros += e;
      res.push({ conta: conta.nome, empresa, inventarios: invs.length, lidos: n, erros: e });
    }
    return json({ ok: true, lidos, erros, pendentes_por_tempo: pendentes, contas: res, por: who.email, ms: Date.now() - t0 });
  } catch (e: any) { return json({ error: String(e.message || e) }, 500); }
});
