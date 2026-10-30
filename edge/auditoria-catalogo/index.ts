// Auditoria do catálogo do ggegrampeadores.com.br
//
// Lê os anúncios no WooCommerce, abre a página pública de cada um para conferir
// o JSON-LD, e grava o retrato em public.auditoria_catalogo.
//
// A chave do WooCommerce é somente leitura e vive nos segredos do projeto —
// nunca chega ao navegador. Quem chama precisa estar logado no painel e passar
// pelo gge_autorizado, o mesmo portão do resto do Controle Total.

import { createClient } from "jsr:@supabase/supabase-js@2";

const LOJA = "https://ggegrampeadores.com.br";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------- WooCommerce
async function woo(caminho: string, params: Record<string, string> = {}) {
  const u = new URL(`${LOJA}/wp-json/wc/v3/${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("consumer_key", Deno.env.get("WOO_CK") ?? "");
  u.searchParams.set("consumer_secret", Deno.env.get("WOO_CS") ?? "");
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`WooCommerce ${r.status} em ${caminho}: ${(await r.text()).slice(0, 180)}`);
  return r.json();
}

async function todosOsProdutos() {
  const fora: any[] = [];
  for (let pg = 1; pg <= 6; pg++) {
    const lote = await woo("products", {
      per_page: "100",
      page: String(pg),
      status: "publish",
      orderby: "id",
      order: "asc",
    });
    if (!lote.length) break;
    fora.push(...lote);
    if (lote.length < 100) break;
  }
  return fora;
}

// ---------------------------------------------------------------- página
// O que uma IA lê da página sem precisar interpretar o texto.
const CAMPOS_SCHEMA = [
  "name", "description", "image", "sku", "brand", "gtin", "mpn",
  "price", "priceCurrency", "availability", "itemCondition",
  "weight", "dimensoes", "avaliacoes",
];

function achaProduto(no: any): any | null {
  if (!no || typeof no !== "object") return null;
  if (Array.isArray(no)) {
    for (const f of no) { const a = achaProduto(f); if (a) return a; }
    return null;
  }
  const t = no["@type"];
  const tipos = Array.isArray(t) ? t : [t];
  if (tipos.includes("Product")) return no;
  if (no["@graph"]) return achaProduto(no["@graph"]);
  return null;
}

// Recebe o HTML já lido: a página é aberta uma única vez por anúncio.
function leSchema(html: string) {
  const vazio = { ok: false, campos: {} as Record<string, boolean>, tipos: [] as string[] };
  try {
    const blocos = [...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )].map((m) => m[1]);

    const tipos = new Set<string>();
    let prod: any = null;
    for (const b of blocos) {
      let dado: any;
      try { dado = JSON.parse(b); } catch { continue; }
      const pilha = [dado];
      while (pilha.length) {
        const no = pilha.pop();
        if (!no || typeof no !== "object") continue;
        if (Array.isArray(no)) { pilha.push(...no); continue; }
        const t = no["@type"];
        for (const x of (Array.isArray(t) ? t : [t])) if (x) tipos.add(String(x));
        if (no["@graph"]) pilha.push(no["@graph"]);
        for (const v of Object.values(no)) if (v && typeof v === "object") pilha.push(v);
      }
      prod = prod ?? achaProduto(dado);
    }
    if (!prod) return { ...vazio, tipos: [...tipos] };

    const of = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
    const campos: Record<string, boolean> = {
      name: !!prod.name,
      description: !!prod.description,
      image: !!prod.image,
      sku: !!prod.sku,
      brand: !!prod.brand,
      gtin: !!(prod.gtin || prod.gtin13 || prod.gtin12 || prod.gtin8),
      mpn: !!prod.mpn,
      price: !!(of && (of.price ?? of.lowPrice)),
      priceCurrency: !!(of && of.priceCurrency),
      availability: !!(of && of.availability),
      itemCondition: !!(of && of.itemCondition) || !!prod.itemCondition,
      weight: !!prod.weight,
      dimensoes: !!(prod.depth || prod.width || prod.height),
      avaliacoes: !!(prod.aggregateRating || prod.review),
    };
    return { ok: true, campos, tipos: [...tipos] };
  } catch {
    return vazio;
  }
}

function leCabeca(html: string) {
  const pega = (re: RegExp) => (html.match(re) ?? [])[1] ?? null;
  return {
    meta_titulo: pega(/<title[^>]*>([^<]*)<\/title>/i),
    meta_descricao: pega(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    robots: pega(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    canonical: pega(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
  };
}

// ---------------------------------------------------------------- auditoria
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Peso é o único campo em que o erro silencioso é caro: grama no campo de quilo
// multiplica o frete por mil. Ferramenta de mão acima de 40 kg é sempre engano.
const PESO_ABSURDO = 40;

function auditar(p: any, schema: any, cabeca: any) {
  const imagens = p.images ?? [];
  const semAlt = imagens.filter((i: any) => !String(i.alt ?? "").trim()).length;
  const peso = num(p.weight);
  const d = [num(p.dimensions?.length), num(p.dimensions?.width), num(p.dimensions?.height)];
  const curta = String(p.short_description ?? "").replace(/<[^>]+>/g, "").trim().length;
  const longa = String(p.description ?? "").replace(/<[^>]+>/g, "").trim().length;
  const qtdAval = Number(p.rating_count ?? 0) || 0;
  const notaAval = qtdAval ? (num(p.average_rating) ?? null) : null;

  const faltas: string[] = [];
  if (!p.sku) faltas.push("SKU");
  if (peso === null || peso === 0) faltas.push("peso");
  else if (peso >= PESO_ABSURDO) faltas.push("peso absurdo (grama no campo de quilo?)");
  if (d.every((x) => !x)) faltas.push("dimensões");
  else if (d.some((x) => !x)) faltas.push("dimensões incompletas");
  if (!num(p.regular_price)) faltas.push("preço");
  if (String(p.regular_price ?? "").startsWith("999")) faltas.push("preço 999 (marcado para revisar)");
  if (curta < 40) faltas.push("descrição curta");
  if (longa < 400) faltas.push("descrição longa");
  if (imagens.length === 0) faltas.push("imagem de capa");
  else if (imagens.length < 4) faltas.push(`só ${imagens.length} imagem(ns), o ideal são 4`);
  if (semAlt > 0) faltas.push(`${semAlt} imagem(ns) sem alt`);
  if (p.stock_status !== "instock") faltas.push("sem estoque");
  if (!cabeca.meta_titulo) faltas.push("meta título");
  if (!cabeca.meta_descricao) faltas.push("meta descrição");
  if ((cabeca.robots ?? "").includes("noindex")) faltas.push("noindex");
  if (!(p.categories ?? []).length) faltas.push("categoria");
  // Anúncio sem nenhuma opinião de cliente é página sem prova de que o produto
  // funciona — e, pelo que o Neco vê no Shopping, é o que mais segura a compra.
  if (!qtdAval) faltas.push("sem nenhuma avaliação");

  if (!schema.ok) faltas.push("schema de produto");
  else {
    for (const c of ["sku", "brand", "gtin", "image", "price", "availability", "weight", "dimensoes", "avaliacoes"]) {
      if (!schema.campos[c]) faltas.push(`schema sem ${c}`);
    }
  }

  // A nota é a fração dos 23 pontos de conferência que passaram.
  const TOTAL = 23;
  const nota = Math.max(0, Math.round(((TOTAL - faltas.length) / TOTAL) * 100));

  return {
    produto_id: p.id,
    sku: p.sku || null,
    titulo: p.name,
    permalink: p.permalink,
    status: p.status,
    visibilidade: p.catalog_visibility,
    preco: num(p.regular_price),
    preco_promo: num(p.sale_price),
    estoque: p.stock_status,
    estoque_qtd: p.stock_quantity ?? null,
    peso,
    dim_c: d[0], dim_l: d[1], dim_a: d[2],
    desc_curta: curta,
    desc_longa: longa,
    imagens: imagens.length,
    imagens_sem_alt: semAlt,
    nota_media: notaAval,
    qtd_avaliacoes: qtdAval,
    categorias: (p.categories ?? []).map((c: any) => c.name),
    meta_titulo: cabeca.meta_titulo,
    meta_descricao: cabeca.meta_descricao,
    robots: cabeca.robots,
    canonical: cabeca.canonical,
    schema_campos: schema.ok ? schema.campos : null,
    faltas,
    nota,
    lido_em: new Date().toISOString(),
  };
}

// As páginas são abertas de poucas em poucas: a loja é compartilhada com os
// clientes e não faz sentido a auditoria atrapalhar quem está comprando.
async function emLotes<T, R>(itens: T[], tamanho: number, fn: (x: T) => Promise<R>) {
  const fora: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    fora.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  }
  return fora;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  // mesmo portão do painel: estar logado não basta, tem de estar liberado
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: usuario } = await comoUsuario.auth.getUser();
  if (!usuario?.user) return json({ erro: "Faça login no painel." }, 401);
  const { data: liberado } = await comoUsuario.rpc("gge_autorizado");
  if (liberado !== true) return json({ erro: "Este e-mail não está liberado no painel." }, 403);

  if (!Deno.env.get("WOO_CK") || !Deno.env.get("WOO_CS")) {
    return json({ erro: "A chave do WooCommerce ainda não foi cadastrada nos segredos do projeto (WOO_CK e WOO_CS)." }, 503);
  }

  const banco = createClient(url, servico);
  const { data: exec } = await banco.from("auditoria_execucao")
    .insert({ por: usuario.user.email }).select().single();

  try {
    const produtos = await todosOsProdutos();
    const linhas = await emLotes(produtos, 6, async (p: any) => {
      let cabeca = { meta_titulo: null, meta_descricao: null, robots: null, canonical: null };
      let schema: any = { ok: false, campos: {}, tipos: [] };
      try {
        const r = await fetch(p.permalink, { headers: { "User-Agent": "GGE-Auditoria/1.0" } });
        if (r.ok) {
          const html = await r.text();
          cabeca = leCabeca(html) as any;
          schema = leSchema(html);
        }
      } catch { /* página fora do ar entra como falta, não derruba a varredura */ }
      return auditar(p, schema, cabeca);
    });

    await banco.from("auditoria_catalogo").upsert(linhas, { onConflict: "produto_id" });
    const media = linhas.reduce((s, l) => s + l.nota, 0) / (linhas.length || 1);
    await banco.from("auditoria_execucao").update({
      terminou_em: new Date().toISOString(),
      produtos: linhas.length,
      nota_media: Math.round(media * 10) / 10,
    }).eq("id", exec!.id);

    return json({ ok: true, produtos: linhas.length, nota_media: Math.round(media * 10) / 10 });
  } catch (e) {
    await banco.from("auditoria_execucao").update({
      terminou_em: new Date().toISOString(),
      erro: String(e).slice(0, 400),
    }).eq("id", exec!.id);
    return json({ erro: String(e).slice(0, 400) }, 500);
  }
});
