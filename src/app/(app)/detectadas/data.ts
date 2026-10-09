import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Ventas que han llegado por correo y esperan a que el administrador las
 * confirme. Aquí se calcula también si se parecen a alguna venta apuntada
 * a mano (posible duplicado), siempre con datos reales de la base de datos.
 */

export type SaleOption = { id: string; label: string; date: string; price: number | null; productMatch: boolean };

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
  note: string | null;
  doubt: boolean;
  suggestion: { id: string; label: string; stock: number } | null;
  alternatives: { id: string; label: string; stock: number }[];
  duplicates: SaleOption[];
  otherSales: SaleOption[];
};

type Parsed = {
  product?: string;
  price?: number;
  shipping?: number | null;
  total?: number | null;
  buyer?: string | null;
  account?: string | null;
  sale_date?: string | null;
  doubt?: string | null;
};

const madridDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(iso));
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const strip = (o: SaleOption & { near: boolean }): SaleOption => ({ id: o.id, label: o.label, date: o.date, price: o.price, productMatch: o.productMatch });
const money = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

export async function loadDetected(): Promise<{ rows: DetectedSale[]; error: string | null }> {
  const supabase = await createClient();
  const { data: emails, error } = await supabase
    .from("email_messages")
    .select("id, platform, received_at, parsed, variant_id, candidates, review_reason")
    .eq("status", "detectada")
    .order("received_at")
    .limit(200);
  if (error) return { rows: [], error: error.message };
  if (!emails?.length) return { rows: [], error: null };

  // Productos sugeridos (y alternativas) con su stock
  const variantIds = new Set<string>();
  for (const e of emails) {
    if (e.variant_id) variantIds.add(e.variant_id);
    for (const c of (e.candidates ?? []) as { variant_id?: string }[]) if (c.variant_id) variantIds.add(c.variant_id);
  }
  const variants = new Map<string, { label: string; stock: number }>();
  if (variantIds.size) {
    const ids = [...variantIds];
    const [{ data: vs }, { data: lots }] = await Promise.all([
      supabase.from("product_variants").select("id, name, product_id, products(name)").in("id", ids),
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
      const pname = (v.products as unknown as { name: string } | null)?.name ?? "";
      const single = (perProduct.get(v.product_id) ?? 1) <= 1;
      variants.set(v.id, { label: single ? pname : `${pname} · ${v.name}`, stock: stock.get(v.id) ?? 0 });
    }
  }

  // Ventas activas apuntadas sin correo (posibles duplicados), desde 30 días antes del correo más antiguo
  const dates = emails.map((e) => ((e.parsed as Parsed).sale_date as string | undefined) ?? madridDate(e.received_at));
  const since = new Date(Date.parse(dates.reduce((a, b) => (a < b ? a : b))) - 30 * 86400_000).toISOString().slice(0, 10);
  const [{ data: platforms }, { data: sales }, { data: linked }] = await Promise.all([
    supabase.from("platforms").select("id, name"),
    supabase
      .from("sales")
      .select("id, sale_number, sale_date, platform_id, buyer_name, sale_items(variant_id, unit_price, quantity)")
      .eq("status", "activa")
      .is("source_email_id", null)
      .gte("sale_date", since)
      .order("sale_date", { ascending: false })
      .limit(500),
    supabase.from("email_messages").select("sale_id").eq("status", "duplicado").not("sale_id", "is", null),
  ]);
  const platformId = new Map((platforms ?? []).map((p) => [p.name.toLowerCase(), p.id as string]));
  const taken = new Set((linked ?? []).map((l) => l.sale_id as string));
  type SaleRow = { id: string; sale_number: string; sale_date: string; platform_id: string; buyer_name: string | null; sale_items: { variant_id: string; unit_price: number; quantity: number }[] };
  const pool = ((sales ?? []) as SaleRow[]).filter((s) => !taken.has(s.id));

  const rows = emails.map((e, i): DetectedSale => {
    const p = (e.parsed ?? {}) as Parsed;
    const saleDate = dates[i];
    const price = typeof p.price === "number" ? p.price : null;
    const sameP = pool.filter((s) => s.platform_id === platformId.get(e.platform));
    const options = sameP.map((s): SaleOption & { near: boolean } => {
      const total = s.sale_items.reduce((a, it) => a + Number(it.unit_price) * Number(it.quantity), 0);
      const productMatch = !!e.variant_id && s.sale_items.some((it) => it.variant_id === e.variant_id);
      return {
        id: s.id,
        date: s.sale_date,
        price: total,
        productMatch,
        near: dayDiff(s.sale_date, saleDate) <= 3,
        label: `${s.sale_number} · ${fmtDate(s.sale_date)} · ${money(total)}${s.buyer_name ? ` · ${s.buyer_name}` : ""}`,
      };
    });
    // Posible duplicado: misma plataforma, fecha cercana y mismo producto (o, si no se sabe el producto, mismo precio)
    const duplicates = options.filter((o) => o.near && (o.productMatch || (!e.variant_id && price !== null && Math.abs((o.price ?? 0) - price) < 0.01)));
    const dupIds = new Set(duplicates.map((d) => d.id));
    const sug = e.variant_id ? variants.get(e.variant_id) : undefined;
    const alternatives = ((e.candidates ?? []) as { variant_id?: string }[])
      .filter((c) => c.variant_id && c.variant_id !== e.variant_id && variants.has(c.variant_id))
      .map((c) => ({ id: c.variant_id!, ...variants.get(c.variant_id!)! }));
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
      note: e.review_reason,
      doubt: !!p.doubt,
      suggestion: e.variant_id && sug ? { id: e.variant_id, ...sug } : null,
      alternatives,
      duplicates: duplicates.map(strip),
      otherSales: options.filter((o) => !dupIds.has(o.id) && dayDiff(o.date, saleDate) <= 30).slice(0, 25).map(strip),
    };
  });
  return { rows, error: null };
}
