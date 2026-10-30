// Lê os anúncios da própria GGE no Mercado Livre.
//
// Usa o token que já está em public.contas — a mesma integração que alimenta a
// tabela de anúncios. NÃO renova token: se o access_token tiver vencido, a
// função avisa e para. Renovar aqui, com a gravação podendo falhar, arriscaria
// invalidar o refresh_token e derrubar a integração inteira da GGE.
//
// Devolve, por SKU: as fotos (já baixadas, em base64, para o navegador não
// esbarrar em CORS do CDN do ML), o GTIN e os atributos técnicos do anúncio.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// A foto do ML vem em vários tamanhos: -O é a original, que é a que queremos.
// O resto da URL é o mesmo, só muda o sufixo antes da extensão.
function originalJpg(url: string) {
  return url.replace(/-[A-Z]\.(jpg|jpeg|png|webp)(\?.*)?$/i, "-O.jpg");
}

async function baixaJpg(url: string) {
  const r = await fetch(originalJpg(url));
  if (!r.ok) return null;
  const tipo = r.headers.get("content-type") ?? "";
  if (!/image\//.test(tipo)) return null;
  const bin = new Uint8Array(await r.arrayBuffer());
  if (bin.length < 2000) return null;              // miniatura ou erro disfarçado
  let s = "";
  for (let i = 0; i < bin.length; i += 8192) {
    s += String.fromCharCode(...bin.subarray(i, i + 8192));
  }
  return { bytes: bin.length, tipo, b64: btoa(s) };
}

const GTIN_ATTR = ["GTIN", "EAN", "CODIGO_UNIVERSAL_DE_PRODUTO", "SELLER_SKU"];

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

  const { skus = [], comFotos = true, maxFotos = 4 } = await req.json().catch(() => ({}));
  if (!Array.isArray(skus) || !skus.length) return json({ erro: "Mande a lista de skus." }, 400);

  const banco = createClient(url, servico);

  const { data: contas } = await banco.from("contas")
    .select("id, nome, access_token, token_expires_at");
  const valida = (contas ?? []).filter((c: any) => new Date(c.token_expires_at) > new Date());
  if (!valida.length) {
    return json({ erro: "Nenhum token do Mercado Livre válido agora. A integração precisa renovar — isso é feito pela rotina da GGE, não por aqui." }, 503);
  }

  const { data: anuncios } = await banco.from("anuncios")
    .select("mlb_id, sku_vendedor, conta_id, status, data_criacao")
    .in("sku_vendedor", skus)
    .eq("status", "active");

  const porSku: Record<string, any[]> = {};
  for (const a of anuncios ?? []) {
    const k = String(a.sku_vendedor).trim().toUpperCase();
    (porSku[k] = porSku[k] ?? []).push(a);
  }

  const saida: Record<string, any> = {};
  for (const sku of skus) {
    const k = String(sku).trim().toUpperCase();
    const lista = porSku[k];
    if (!lista?.length) { saida[k] = { erro: "sem anúncio ativo no ML" }; continue; }

    // o anúncio mais novo costuma ter as fotos melhores
    lista.sort((a, b) => String(b.data_criacao ?? "").localeCompare(String(a.data_criacao ?? "")));

    let achou = null;
    for (const a of lista) {
      const conta = valida.find((c: any) => c.id === a.conta_id) ?? valida[0];
      const r = await fetch(`https://api.mercadolibre.com/items/${a.mlb_id}`, {
        headers: { Authorization: `Bearer ${conta.access_token}` },
      });
      if (!r.ok) continue;
      const item = await r.json();
      const atributos = (item.attributes ?? []).map((x: any) => ({
        id: x.id, nome: x.name, valor: x.value_name,
      })).filter((x: any) => x.valor);
      const gtin = (item.attributes ?? [])
        .find((x: any) => GTIN_ATTR.includes(x.id) && x.id !== "SELLER_SKU" && x.value_name)?.value_name ?? null;

      const fotos: any[] = [];
      if (comFotos) {
        for (const p of (item.pictures ?? []).slice(0, maxFotos)) {
          const img = await baixaJpg(p.secure_url ?? p.url);
          if (img) fotos.push({ id: p.id, ...img });
        }
      }
      achou = {
        mlb_id: a.mlb_id, titulo: item.title, conta: conta.nome,
        total_fotos_no_ml: (item.pictures ?? []).length,
        gtin, atributos, fotos,
      };
      break;
    }
    saida[k] = achou ?? { erro: "o ML não devolveu nenhum dos anúncios desse SKU" };
  }

  return json({ ok: true, resultado: saida });
});
