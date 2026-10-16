import "server-only";
import { saleThumbs } from "../storage";
import { createClient } from "../supabase/server";
import { variantDisplay } from "../types";

/**
 * Envíos para la pantalla de Seguimiento y la ficha de cada venta. Las
 * reglas de acceso de la base de datos deciden qué ventas ve cada uno
 * (el vendedor, solo las suyas).
 */

export type Shipment = {
  id: string;
  number: string;
  saleDate: string;
  product: string;
  photo: string | null;
  buyer: string | null;
  platform: string | null;
  carrier: string | null;
  carrierId: string | null;
  total: number;
  tracking: string | null;
  status: string;
  statusAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  eta: string | null;
  lastEvent: string | null;
  lastLocation: string | null;
  error: string | null;
  provider: string | null;
  checkedAt: string | null;
};

const COLS =
  "id, sale_number, sale_date, buyer_name, image_path, carrier_id, tracking_number, tracking_status, tracking_status_at, shipped_at, delivered_at, tracking_eta, tracking_last_event, tracking_last_location, tracking_error, tracking_provider, tracking_checked_at, shipping_status, platforms(name), carriers(name), sale_items(line_number, quantity, unit_price, product_variants(name, products(name, photo_path)))";

type Row = {
  id: string;
  sale_number: string;
  sale_date: string;
  buyer_name: string | null;
  image_path: string | null;
  carrier_id: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  tracking_status_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_eta: string | null;
  tracking_last_event: string | null;
  tracking_last_location: string | null;
  tracking_error: string | null;
  tracking_provider: string | null;
  tracking_checked_at: string | null;
  shipping_status: string | null;
  platforms: { name: string } | null;
  carriers: { name: string } | null;
  sale_items: { line_number: number; quantity: number; unit_price: number; product_variants: { name: string; products: { name: string; photo_path: string | null } | null } | null }[];
};

async function toShipments(rows: Row[]): Promise<Shipment[]> {
  const photos = await saleThumbs(rows.map((r) => ({ key: r.id, image_path: r.image_path, product_photo: r.sale_items[0]?.product_variants?.products?.photo_path ?? null })));
  return rows.map((r) => ({
    id: r.id,
    number: r.sale_number,
    saleDate: r.sale_date,
    product:
      [...r.sale_items]
        .sort((a, b) => a.line_number - b.line_number)
        .map((i) => {
          const t = variantDisplay(i.product_variants?.products?.name ?? "", i.product_variants?.name);
          return i.quantity > 1 ? `${i.quantity} × ${t}` : t;
        })
        .join(", ") || "—",
    photo: photos.get(r.id) ?? null,
    buyer: r.buyer_name,
    platform: r.platforms?.name ?? null,
    carrier: r.carriers?.name ?? null,
    carrierId: r.carrier_id,
    total: r.sale_items.reduce((a, i) => a + Number(i.unit_price) * Number(i.quantity), 0),
    tracking: r.tracking_number,
    status: r.tracking_status ?? (r.shipping_status === "enviado" ? "enviado" : "pendiente"),
    statusAt: r.tracking_status_at,
    shippedAt: r.shipped_at,
    deliveredAt: r.delivered_at,
    eta: r.tracking_eta,
    lastEvent: r.tracking_last_event,
    lastLocation: r.tracking_last_location,
    error: r.tracking_error,
    provider: r.tracking_provider,
    checkedAt: r.tracking_checked_at,
  }));
}

export type ShipmentView = "curso" | "incidencias" | "entregados" | "todos";
const OPEN = ["enviado", "en_transito", "en_reparto", "desconocido", "incidencia"];

export async function loadShipments(view: ShipmentView, q: string): Promise<{ rows: Shipment[]; error: string | null }> {
  const supabase = await createClient();
  let query = supabase.from("sales").select(COLS).eq("status", "activa").not("shipped_at", "is", null).order("shipped_at", { ascending: false }).limit(300);
  if (view === "curso") query = query.in("tracking_status", OPEN);
  if (view === "incidencias") query = query.in("tracking_status", ["incidencia", "devuelto", "desconocido"]);
  if (view === "entregados") query = query.eq("tracking_status", "entregado");
  const term = q.trim().replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`tracking_number.ilike.%${term}%,buyer_name.ilike.%${term}%,sale_number.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return { rows: [], error: "No se ha podido cargar el seguimiento." };
  return { rows: await toShipments((data ?? []) as unknown as Row[]), error: null };
}

export async function loadShipment(id: string): Promise<Shipment | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("sales").select(COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return (await toShipments([data as unknown as Row]))[0];
}

export async function loadEvents(saleId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tracking_events")
    .select("id, occurred_at, status, description, location, source")
    .eq("sale_id", saleId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((e) => ({ id: e.id as number, at: e.occurred_at as string, status: e.status as string, description: e.description as string, location: e.location as string | null, source: e.source as string }));
}

export type ShipmentAlert = { id: number; saleId: string; kind: string; message: string; createdAt: string };

export async function loadAlerts(): Promise<ShipmentAlert[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("shipment_alerts").select("id, sale_id, kind, message, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((a) => ({ id: a.id as number, saleId: a.sale_id as string, kind: a.kind as string, message: a.message as string, createdAt: a.created_at as string }));
}

export type CarrierStat = {
  carrier_id: string | null;
  carrier: string;
  shipments: number;
  delivered: number;
  in_transit: number;
  incidents: number;
  returned: number;
  delayed: number;
  avg_days: number | null;
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
};
export type ShippingStats = {
  carriers: CarrierStat[];
  in_transit: { count: number; value: number | null; profit: number | null; avg_age_days: number | null; max_age_days: number | null };
  totals: { shipments: number; delivered: number; incidents: number; returned: number; delayed: number };
  overall: { avg_days: number | null; median_days: number | null };
  legacy_shipped: number;
};

export async function loadShippingStats(from?: string | null, to?: string | null): Promise<ShippingStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shipping_stats", { p_from: from ?? null, p_to: to ?? null });
  if (error || !data) return null;
  return data as ShippingStats;
}
