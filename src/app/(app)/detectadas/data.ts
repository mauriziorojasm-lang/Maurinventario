import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { carrierMark, normalizeKey } from "@/lib/carriers";
import { scoreExistingSale, type ExistingSale } from "@/lib/email/matching";
import { Catalog } from "@/lib/email/sync";
import { saleThumbs, signPhotos } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Ventas que han llegado por correo y esperan a que el administrador las
 * confirme. Aquí se reúne todo lo que Resellap ha detectado (producto,
 * transportista, responsable, foto, comprador, referencia) y qué ventas
 * apuntadas a mano se le parecen, siempre con datos reales.
 */

export type Option = { id: string; name: string };
export type ProductGuess = { id: string; label: string; stock: number; photo: string | null; score: number | null; reasons: string[] };
export type ExistingOption = {
  id: string;
  number: string;
  date: string;
  price: number;
  buyer: string | null;
  product: string;
  photo: string | null;
  carrier: string | null;
  score: number;
  reasons: string[];
};

export type DetectedSale = {
  id: string;
  platform: "vinted" | "wallapop";
  receivedAt: string;
  saleDate: string;
  product: string;
  price: number | null;
  shipping: number | null;
  total: number | null;
  buyer: string | null;
  account: string | null;
  reference: string | null;
  image: string | null;
  note: string | null;
  doubt: boolean;
  suggestion: ProductGuess | null;
  alternatives: ProductGuess[];
  carrier: { id: string; name: string; source: "correo" | "etiqueta" } | null;
  tracking: string | null;
  responsibleId: string | null;
  /** Ventas apuntadas a mano que se parecen (la más probable primero). */
  existing: ExistingOption[];
  /** ¿Es probable que ya estuviera apuntada? (alguna con puntuación alta) */
  likelyDuplicate: boolean;
};

type Parsed = {
  product?: string;
  product_norm?: string;
  price?: number;
  shipping?: number | null;
  total?: number | null;
  buyer?: string | null;
  account?: string | null;
  account_norm?: string | null;
  sale_date?: string | null;
  doubt?: string | null;
  transaction_id?: string | null;
  order_id?: string | null;
  carrier_name?: string | null;
  image_path?: string | null;
  match?: { confidence?: number; reasons?: string[] };
};
type Cand = { variant_id?: string; label: string; score?: number; reasons?: string[] };

const madridDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(iso));
const DUPLICATE_SCORE = 0.55;

export async function loadDetected(): Promise<{ rows: DetectedSale[]; error: string | null; carriers: Option[]; responsibles: Option[] }> {
  const supabase = await createClient();
  const [emailsRes, { data: carriersData }, { data: respData }, { data: accounts }, { data: integ }] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id, platform, received_at, parsed, variant_id, candidates, review_reason")
      .eq("status", "detectada")
      .order("received_at")
      .limit(200),
    supabase.from("carriers").select("id, name").eq("active", true).order("name"),
    supabase.from("responsibles").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("email_accounts").select("platform, handle_norm, responsible_id"),
    supabase.from("email_integration").select("default_responsible_id").maybeSingle(),
  ]);
  const carriers = (carriersData ?? []) as Option[];
  const responsibles = (respData ?? []) as Option[];
  if (emailsRes.error) return { rows: [], error: emailsRes.error.message, carriers, responsibles };
  const emails = emailsRes.data ?? [];
  if (!emails.length) return { rows: [], error: null, carriers, responsibles };

  // Si el catálogo ha cambiado (producto nuevo, stock), se vuelve a buscar el producto de las que no lo tienen
  const unresolved = emails.filter((e) => !e.variant_id);
  if (unresolved.length) {
    const user = await getCurrentUser();
    if (user?.orgId) {
      const db = createAdminClient();
      const catalog = new Catalog(db, user.orgId);
      for (const e of unresolved) {
        const p = (e.parsed ?? {}) as Parsed;
        const m = await catalog.match(p.product ?? "", { price: typeof p.price === "number" ? p.price : null, platform: e.platform });
        if (m.variantId || m.candidates.length) {
          e.variant_id = m.variantId;
          e.candidates = m.candidates;
          e.parsed = { ...p, match: { confidence: m.confidence, reasons: m.reasons, at: new Date().toISOString() } };
          await db
            .from("email_messages")
            .update({ variant_id: m.variantId, candidates: m.candidates.length ? m.candidates : null, parsed: e.parsed })
            .eq("organization_id", user.orgId)
            .eq("id", e.id)
            .eq("status", "detectada");
        }
      }
    }
  }

  // Productos propuestos y alternativas: nombre, stock y foto
  const variantIds = new Set<string>();
  for (const e of emails) {
    if (e.variant_id) variantIds.add(e.variant_id);
    for (const c of (e.candidates ?? []) as Cand[]) if (c.variant_id) variantIds.add(c.variant_id);
  }
  const variants = new Map<string, { label: string; stock: number; photoPath: string | null }>();
  if (variantIds.size) {
    const ids = [...variantIds];
    const [{ data: vs }, { data: lots }] = await Promise.all([
      supabase.from("product_variants").select("id, name, product_id, products(name, photo_path)").in("id", ids),
      supabase.from("inventory_lots").select("variant_id, quantity_available").in("variant_id", ids),
    ]);
    const productIds = [...new Set((vs ?? []).map((v) => v.product_id as string))];
    const { data: siblings } = productIds.length
      ? await supabase.from("product_variants").select("product_id").in("product_id", productIds).is("deleted_at", null)
      : { data: [] };
    const perProduct = new Map<string, number>();
    for (const s of siblings ?? []) perProduct.set(s.product_id, (perProduct.get(s.product_id) ?? 0) + 1);
    const stock = new Map<string, number>();
    for (const l of lots ?? []) stock.set(l.variant_id, (stock.get(l.variant_id) ?? 0) + Number(l.quantity_available));
    for (const v of vs ?? []) {
      const prod = v.products as unknown as { name: string; photo_path: string | null } | null;
      const single = (perProduct.get(v.product_id) ?? 1) <= 1;
      variants.set(v.id, { label: single ? (prod?.name ?? "") : `${prod?.name ?? ""} · ${v.name}`, stock: stock.get(v.id) ?? 0, photoPath: prod?.photo_path ?? null });
    }
  }

  // Etiquetas de Vinted que ya han llegado y esperan a esta venta: dicen el transportista y el código
  const { data: waitingLabels } = await supabase
    .from("email_messages")
    .select("parsed")
    .eq("kind", "vinted_etiqueta")
    .in("status", ["esperando", "revision"])
    .is("sale_id", null)
    .limit(200);

  // Ventas activas apuntadas sin correo (posibles duplicados), desde 30 días antes del correo más antiguo
  const dates = emails.map((e) => ((e.parsed as Parsed).sale_date as string | undefined) ?? madridDate(e.received_at));
  const since = new Date(Date.parse(dates.reduce((a, b) => (a < b ? a : b))) - 30 * 86400_000).toISOString().slice(0, 10);
  const [{ data: platforms }, { data: sales }, { data: linked }] = await Promise.all([
    supabase.from("platforms").select("id, name"),
    supabase
      .from("sales")
      .select(
        "id, sale_number, sale_date, platform_id, buyer_name, image_path, platform_transaction_id, carriers(name), sale_items(variant_id, unit_price, quantity, product_variants(name, products(name, photo_path)))",
      )
      .eq("status", "activa")
      .is("source_email_id", null)
      .gte("sale_date", since)
      .order("sale_date", { ascending: false })
      .limit(500),
    supabase.from("email_messages").select("sale_id").eq("status", "duplicado").not("sale_id", "is", null),
  ]);
  const platformId = new Map((platforms ?? []).map((p) => [p.name.toLowerCase(), p.id as string]));
  const taken = new Set((linked ?? []).map((l) => l.sale_id as string));
  type SaleRow = {
    id: string;
    sale_number: string;
    sale_date: string;
    platform_id: string;
    buyer_name: string | null;
    image_path: string | null;
    platform_transaction_id: string | null;
    carriers: { name: string } | null;
    sale_items: { variant_id: string; unit_price: number; quantity: number; product_variants: { name: string; products: { name: string; photo_path: string | null } | null } | null }[];
  };
  const pool = ((sales ?? []) as unknown as SaleRow[]).filter((s) => !taken.has(s.id));

  // Fotos: anuncio de cada correo, productos propuestos y ventas parecidas
  const [emailImgs, productPhotos, saleImgs] = await Promise.all([
    saleThumbs(emails.map((e) => ({ key: e.id, image_path: (e.parsed as Parsed).image_path ?? null }))),
    signPhotos([...variants.values()].map((v) => v.photoPath), { thumbs: true }),
    saleThumbs(pool.map((s) => ({ key: s.id, image_path: s.image_path, product_photo: s.sale_items[0]?.product_variants?.products?.photo_path ?? null }))),
  ]);
  const guess = (id: string, score: number | null, reasons: string[]): ProductGuess | null => {
    const v = variants.get(id);
    return v ? { id, label: v.label, stock: v.stock, photo: v.photoPath ? (productPhotos.get(v.photoPath) ?? null) : null, score, reasons } : null;
  };
  const carrierByName = (name: string | null | undefined) => {
    if (!name) return null;
    const mark = carrierMark(name);
    const n = normalizeKey(name);
    return carriers.find((c) => normalizeKey(c.name) === n || (mark && carrierMark(c.name)?.key === mark.key)) ?? null;
  };
  const accountResp = new Map((accounts ?? []).map((a) => [`${a.platform}:${a.handle_norm}`, a.responsible_id as string | null]));
  const defaultResp = (integ as { default_responsible_id?: string | null } | null)?.default_responsible_id ?? null;

  const rows = emails.map((e, i): DetectedSale => {
    const p = (e.parsed ?? {}) as Parsed;
    const saleDate = dates[i];
    const price = typeof p.price === "number" ? p.price : null;
    const reference = p.transaction_id ?? p.order_id ?? null;

    // Transportista: el del correo o, si no, el de la etiqueta que ya llegó para este artículo
    let carrier: DetectedSale["carrier"] = null;
    let tracking: string | null = null;
    const fromMail = carrierByName(p.carrier_name);
    if (fromMail) carrier = { ...fromMail, source: "correo" };
    const label = (waitingLabels ?? [])
      .map((l) => l.parsed as { product_norm?: string; account_norm?: string; carrier_text?: string; tracking_number?: string; transaction_id?: string })
      .find((l) => (reference && l.transaction_id === reference) || (l.product_norm && l.product_norm === p.product_norm && (!p.account_norm || !l.account_norm || l.account_norm === p.account_norm)));
    if (label) {
      tracking = label.tracking_number ?? null;
      const fromLabel = carrierByName(label.carrier_text);
      if (!carrier && fromLabel) carrier = { ...fromLabel, source: "etiqueta" };
    }

    // Ventas parecidas apuntadas a mano: puntuación por producto, comprador, precio, fecha y referencia
    const sameP = pool.filter((s) => s.platform_id === platformId.get(e.platform));
    const existing = sameP
      .map((s) => {
        const total = s.sale_items.reduce((a, it) => a + Number(it.unit_price) * Number(it.quantity), 0);
        const names = s.sale_items.map((it) => {
          const pv = it.product_variants;
          return pv?.products?.name ? (pv.name && !/^(única|unica|sin especificar)$/i.test(pv.name) ? `${pv.products.name} ${pv.name}` : pv.products.name) : "";
        });
        const ex: ExistingSale = {
          id: s.id,
          date: s.sale_date,
          price: total,
          buyer: s.buyer_name,
          platform: e.platform,
          variantIds: s.sale_items.map((it) => it.variant_id),
          productNames: names,
          reference: s.platform_transaction_id,
        };
        const sc = scoreExistingSale({ date: saleDate, price, buyer: p.buyer ?? null, platform: e.platform, variantId: e.variant_id, name: p.product ?? "", reference }, ex);
        return {
          id: s.id,
          number: s.sale_number,
          date: s.sale_date,
          price: total,
          buyer: s.buyer_name,
          product: names.filter(Boolean).join(", ") || "—",
          photo: saleImgs.get(s.id) ?? null,
          carrier: s.carriers?.name ?? null,
          score: sc.score,
          reasons: sc.reasons,
        } satisfies ExistingOption;
      })
      .filter((o) => o.score >= 0.2 || Math.abs(Date.parse(o.date) - Date.parse(saleDate)) <= 7 * 86400_000)
      .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
      .slice(0, 12);

    const cands = (e.candidates ?? []) as Cand[];
    const suggestion = e.variant_id ? guess(e.variant_id, p.match?.confidence ?? null, p.match?.reasons ?? []) : null;
    const alternatives = cands
      .filter((c) => c.variant_id && c.variant_id !== e.variant_id)
      .map((c) => guess(c.variant_id!, c.score ?? null, c.reasons ?? []))
      .filter((x): x is ProductGuess => !!x);

    return {
      id: e.id,
      platform: e.platform,
      receivedAt: e.received_at,
      saleDate,
      product: p.product ?? "",
      price,
      shipping: p.shipping ?? null,
      total: p.total ?? null,
      buyer: p.buyer ?? null,
      account: p.account ?? null,
      reference,
      image: emailImgs.get(e.id) ?? suggestion?.photo ?? null,
      note: e.review_reason,
      doubt: !!p.doubt,
      suggestion,
      alternatives,
      carrier,
      tracking,
      responsibleId: (p.account_norm ? accountResp.get(`${e.platform}:${p.account_norm}`) : null) ?? defaultResp,
      existing,
      likelyDuplicate: existing.some((x) => x.score >= DUPLICATE_SCORE),
    };
  });
  return { rows, error: null, carriers, responsibles };
}
