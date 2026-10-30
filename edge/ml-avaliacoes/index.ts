// Lê as avaliações de compradores dos anúncios da própria GGE no Mercado Livre,
// já resolvidas: pagina tudo, descobre a UF do comprador pelo pedido e traz as
// fotos que o cliente anexou.
//
// Mesma regra da ml-anuncio: usa o token que já está em public.contas e NUNCA o
// renova. Renovar aqui, com a gravação podendo falhar, arriscaria invalidar o
// refresh_token e derrubar a integração inteira da GGE.
//
// O teste de propriedade é o pedido: se o token da GGE consegue LER o pedido da
// avaliação, a venda foi da GGE. Se o ML responde 403, aquele comprador é de
// outro vendedor do mesmo anúncio de catálogo — e a avaliação não é nossa.
//
// A função não joga nada fora em silêncio: devolve as descartadas com o motivo,
// para dar para auditar o que ficou de fora.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Palavras que sugerem que o elogio é à entrega, não ao produto. Não decidem
// nada sozinhas: só marcam a avaliação para leitura humana. "Chegou perfeito"
// fala do produto; "chegou rápido" fala do Mercado Livre.
const LOGISTICA = /\b(entrega|entregue|entregou|chegou|chegaram|prazo|frete|correios|transportadora|envio|enviado|postagem|demorou|demora|atras[oa]|r[áa]pid[oa]|rapidez|antes do previsto|no dia)\b/i;

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

  const { skus = [], maxPorAnuncio = 200, comFotos = true } = await req.json().catch(() => ({}));
  if (!Array.isArray(skus) || !skus.length) return json({ erro: "Mande a lista de skus." }, 400);

  const banco = createClient(url, servico);
  const { data: contas } = await banco.from("contas").select("id, nome, access_token, token_expires_at");
  const valida = (contas ?? []).filter((c: any) => new Date(c.token_expires_at) > new Date());
  if (!valida.length) {
    return json({ erro: "Nenhum token do Mercado Livre válido agora. A renovação é feita pela rotina da GGE, não por aqui." }, 503);
  }

  const { data: anuncios } = await banco.from("anuncios")
    .select("mlb_id, sku_vendedor, conta_id, data_criacao")
    .in("sku_vendedor", skus).eq("status", "active");

  const porSku: Record<string, any[]> = {};
  for (const a of anuncios ?? []) {
    const k = String(a.sku_vendedor).trim().toUpperCase();
    (porSku[k] = porSku[k] ?? []).push(a);
  }

  // um pedido pode aparecer em mais de uma avaliação; não consulta duas vezes
  const cachePedido = new Map<string, any>();

  async function pedido(id: string) {
    if (cachePedido.has(id)) return cachePedido.get(id);
    let achou: any = { da_gge: false, motivo: "pedido não lido por nenhuma conta" };
    for (const conta of valida) {
      const r = await fetch(`https://api.mercadolibre.com/orders/${id}`, {
        headers: { Authorization: `Bearer ${conta.access_token}` },
      });
      if (!r.ok) { achou.http = r.status; continue; }
      const o = await r.json();
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
      achou = { da_gge: true, conta: conta.nome, uf, cidade, data_pedido: o.date_created };
      break;
    }
    cachePedido.set(id, achou);
    return achou;
  }

  const saida: Record<string, any> = {};

  for (const sku of skus) {
    const k = String(sku).trim().toUpperCase();
    const lista = porSku[k] ?? [];
    const aceitas: any[] = [];
    const descartadas: any[] = [];
    let nota_ml = null, total_ml = 0;

    for (const a of lista) {
      const conta = valida.find((c: any) => c.id === a.conta_id) ?? valida[0];
      const cabecalho = { Authorization: `Bearer ${conta.access_token}` };

      // pagina até acabar ou até o teto
      let offset = 0;
      const vistas: any[] = [];
      while (offset < maxPorAnuncio) {
        const r = await fetch(
          `https://api.mercadolibre.com/reviews/item/${a.mlb_id}?offset=${offset}&limit=50`,
          { headers: cabecalho },
        );
        if (!r.ok) break;
        const j = await r.json();
        if (j.rating_average) nota_ml = j.rating_average;
        if (j.paging?.total) total_ml = Math.max(total_ml, j.paging.total);
        const lote = j.reviews ?? [];
        vistas.push(...lote);
        if (lote.length < 50) break;
        offset += 50;
      }

      for (const rev of vistas) {
        const base = {
          mlb_id: a.mlb_id,
          review_id: rev.id,
          nota: rev.rate,
          titulo: (rev.title ?? "").trim(),
          texto: (rev.content ?? "").trim(),
          data: rev.date_created,
          data_compra: rev.buying_date,
          curtidas: rev.likes ?? 0,
          order_id: rev.order_id ?? null,
          catalogo: !!rev.catalog_listing,
          fotos: comFotos ? (rev.media ?? []) : [],
        };

        if (!base.texto && !base.titulo) {
          descartadas.push({ ...base, motivo: "nota sem texto" });
          continue;
        }
        if (base.catalogo) {
          descartadas.push({ ...base, motivo: "avaliação de anúncio de catálogo" });
          continue;
        }
        if (!base.order_id) {
          descartadas.push({ ...base, motivo: "sem pedido para conferir" });
          continue;
        }

        const p = await pedido(String(base.order_id));
        if (!p.da_gge) {
          descartadas.push({ ...base, motivo: `pedido não é da GGE (${p.http ?? "sem resposta"})` });
          continue;
        }

        aceitas.push({
          ...base,
          uf: p.uf,
          cidade: p.cidade,
          conta: p.conta,
          mencao_logistica: LOGISTICA.test(`${base.titulo} ${base.texto}`),
        });
      }
    }

    saida[k] = {
      anuncios: lista.length,
      nota_media_ml: nota_ml,
      total_declarado_ml: total_ml,
      aceitas,
      descartadas,
    };
  }

  return json({ ok: true, resultado: saida });
});
