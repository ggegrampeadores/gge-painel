// Compartilhado pelas edge functions est-bling-* (copiar o conteúdo para cada função ao deployar; o painel do Supabase não suporta import relativo entre funções)
import { createClient } from 'jsr:@supabase/supabase-js@2';
export const BLING_API = 'https://api.bling.com.br/Api/v3';
export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export function admin() { return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); }

// Cliente com o JWT do chamador (RLS + auth.jwt() funcionam)
export function asCaller(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
}
export async function callerEmailOk(req: Request, funcao: string, editar: boolean) {
  const c = asCaller(req);
  const u = await c.auth.getUser();
  if (u.error || !u.data.user?.email) return { ok: false, email: null, erro: 'não autenticado' };
  const p = await c.rpc('est_tem_permissao', { p_funcao: funcao, p_editar: editar });
  if (p.error) return { ok: false, email: u.data.user.email, erro: p.error.message };
  return { ok: !!p.data, email: u.data.user.email, erro: p.data ? null : 'sem permissão: ' + funcao };
}

// Token Bling: SÓ LEITURA. Quem renova é a bling-refresh-token (único ponto autorizado).
export async function blingToken(sb: any, empresa: string, origem: string): Promise<string> {
  const ler = async () => (await sb.from('contas_bling').select('access_token, token_expires_at').eq('empresa', empresa).maybeSingle()).data;
  const valido = (c: any) => c?.access_token && c?.token_expires_at && new Date(c.token_expires_at).getTime() - Date.now() > 2 * 60 * 1000;
  let c = await ler();
  if (valido(c)) return c.access_token;
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bling-refresh-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ empresa, limiar_min: 10, origem }),
  }).catch(() => null);
  c = await ler();
  if (valido(c)) return c.access_token;
  throw new Error(`Token Bling ${empresa} indisponível (ver vw_bling_token_status)`);
}
export async function bling(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const run = () => fetch(`${BLING_API}${path}`, { method, headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let r = await run();
  if (r.status === 429) { await new Promise(s => setTimeout(s, 1500)); r = await run(); }
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
export const sleep = (ms: number) => new Promise(s => setTimeout(s, ms));
