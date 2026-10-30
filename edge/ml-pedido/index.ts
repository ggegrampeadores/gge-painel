// Consulta pedidos da GGE no Mercado Livre pelo número do pedido.
// Serve para dois fins: saber se a venda foi mesmo da GGE (se o token lê o
// pedido, foi) e pegar a UF de entrega. Não renova token, como as demais.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: usuario } = await comoUsuario.auth.getUser();
  if (!usuario?.user) return json({ erro: "Faça login no painel." }, 401);
  const { data: ok } = await comoUsuario.rpc("gge_autorizado");
  if (ok !== true) return json({ erro: "E-mail não liberado no painel." }, 403);

  const { pedidos = [] } = await req.json().catch(() => ({}));
  if (!Array.isArray(pedidos) || !pedidos.length) return json({ erro: "Mande a lista de pedidos." }, 400);

  const banco = createClient(url, servico);
  const { data: contas } = await banco.from("contas").select("id, nome, access_token, token_expires_at");
  const valida = (contas ?? []).filter((c: any) => new Date(c.token_expires_at) > new Date());
  if (!valida.length) return json({ erro: "Token do Mercado Livre vencido." }, 503);

  const saida: Record<string, any> = {};
  for (const p of pedidos) {
    let achou: any = { da_gge: false };
    for (const conta of valida) {
      const r = await fetch(`https://api.mercadolibre.com/orders/${p}`, {
        headers: { Authorization: `Bearer ${conta.access_token}` },
      });
      if (!r.ok) { achou.status_ultimo = r.status; continue; }
      const o = await r.json();
      // a UF sai do endereço de entrega do envio
      let uf = null, cidade = null;
      if (o.shipping?.id) {
        const s = await fetch(`https://api.mercadolibre.com/shipments/${o.shipping.id}`, {
          headers: { Authorization: `Bearer ${conta.access_token}` },
        });
        if (s.ok) {
          const sh = await s.json();
          uf = sh.receiver_address?.state?.name ?? sh.receiver_address?.state?.id ?? null;
          cidade = sh.receiver_address?.city?.name ?? null;
        }
      }
      achou = {
        da_gge: true, conta: conta.nome, status: o.status,
        data: o.date_created, uf, cidade,
        itens: (o.order_items ?? []).map((i: any) => i.item?.seller_sku ?? i.item?.id),
      };
      break;
    }
    saida[p] = achou;
  }
  return json({ ok: true, resultado: saida });
});
