// est-bling-produtos — catálogo do Bling (GGE e Toow) em bling_produtos: código, formato (S simples / E composição / V variação),
// situação e, para composições, a estrutura (componentes, tipoEstoque). É o que define "kit" no Controle de Estoque.
// POST { empresa?: 'GGE'|'TOOW'|'ALL', estruturas?: boolean }  — painel (JWT, função 'config') ou cron (service role).
// Token Bling: só leitura; quem renova é a bling-refresh-token.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BLING_API = 'https://api.bling.com.br/Api/v3';
const BUDGET_MS = 115_000;
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
  const p = await c.rpc('est_tem_permissao', { p_funcao: 'config', p_editar: true });
  return { ok: !!p.data && !p.error, email: u.data.user.email, erro: p.error?.message ?? (p.data ? null : 'sem permissão: config') };
}
async function blingToken(sb: any, empresa: string): Promise<string> {
  const ler = async () => (await sb.from('contas_bling').select('access_token, token_expires_at').eq('empresa', empresa).maybeSingle()).data;
  const valido = (c: any) => c?.access_token && c?.token_expires_at && new Date(c.token_expires_at).getTime() - Date.now() > 2 * 60 * 1000;
  let c = await ler(); if (valido(c)) return c.access_token;
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bling-refresh-token`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }, body: JSON.stringify({ empresa, limiar_min: 10, origem: 'est-bling-produtos' }) }).catch(() => null);
  c = await ler(); if (valido(c)) return c.access_token;
  throw new Error(`Token Bling ${empresa} indisponível`);
}
async function bling(token: string, path: string): Promise<any> {
  const run = () => fetch(`${BLING_API}${path}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  let r = await run(); if (r.status === 429) { await sleep(1500); r = await run(); }
  const t = await r.text(); if (!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const t0 = Date.now();
  try {
    const who = await callerOk(req);
    if (!who.ok) return json({ error: who.erro }, 403);
    const body = await req.json().catch(() => ({}));
    const filtro = String(body.empresa || 'ALL').toUpperCase();
    const comEstruturas = body.estruturas !== false;
    const sb = admin();
    const out: any[] = [];
    for (const empresa of ['GGE', 'TOOW']) {
      if (filtro !== 'ALL' && filtro !== empresa) continue;
      const token = await blingToken(sb, empresa);
      let pagina = 1, lidos = 0, kits: string[] = [];
      // 1) lista completa (criterio 5 = todos)
      while (Date.now() - t0 < BUDGET_MS) {
        const d = await bling(token, `/produtos?pagina=${pagina}&limite=100&criterio=5`);
        const prods: any[] = d?.data || [];
        if (!prods.length) break;
        const rows = prods.filter(p => p?.id).map(p => ({
          bling_id: p.id, empresa, codigo: p.codigo || null, nome: p.nome ?? p.descricao ?? null, tipo: p.tipo ?? null,
          formato: p.formato ?? null, situacao: p.situacao ?? null, preco: p.preco ?? null, preco_custo: p.precoCusto ?? p.preco_custo ?? null,
          atualizado_em: new Date().toISOString(),
        }));
        const { error } = await sb.from('bling_produtos').upsert(rows, { onConflict: 'bling_id' });
        if (error) throw new Error('upsert produtos: ' + error.message);
        lidos += rows.length;
        for (const p of prods) if (p.formato === 'E') kits.push(String(p.id));
        if (prods.length < 100) break;
        pagina++; await sleep(350);
      }
      // 2) estrutura das composições sem estrutura ou com mais de 7 dias
      let estruturas = 0, pendentes = 0;
      if (comEstruturas && kits.length) {
        const { data: ja } = await sb.from('bling_produtos').select('bling_id, estrutura_em').eq('empresa', empresa).eq('formato', 'E');
        const limite = Date.now() - 7 * 86400_000;
        const fila = (ja || []).filter(x => !x.estrutura_em || new Date(x.estrutura_em).getTime() < limite).map(x => String(x.bling_id));
        for (const id of fila) {
          if (Date.now() - t0 > BUDGET_MS) { pendentes = fila.length - estruturas; break; }
          try {
            const d = await bling(token, `/produtos/${id}`);
            const p = d?.data; if (!p) continue;
            const estrutura = p.estrutura ?? null;
            await sb.from('bling_produtos').update({ estrutura_json: estrutura, estrutura_em: new Date().toISOString(), formato: p.formato ?? 'E' }).eq('bling_id', Number(id));
            estruturas++;
          } catch (_) { /* tenta na próxima */ }
          await sleep(350);
        }
      }
      out.push({ empresa, produtos_lidos: lidos, composicoes: kits.length, estruturas_atualizadas: estruturas, estruturas_pendentes: pendentes });
    }
    return json({ ok: true, empresas: out, por: who.email, ms: Date.now() - t0 });
  } catch (e: any) { return json({ error: String(e.message || e) }, 500); }
});
