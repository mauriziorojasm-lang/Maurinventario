import "server-only";
import { saleThumbs } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";

/** Identificador en la dirección para las ventas sin paquetería indicada. */
export const NO_CARRIER = "sin-paqueteria";

export type PendingShipment = {
  id: string;
  sale_number: string;
  sale_date: string;
  carrier_id: string | null;
  carrier_name: string;
  platform_name: string;
  responsible_name: string;
  mobile: string | null;
  external_reference: string | null;
  notes: string | null;
  label_path: string | null;
  items: { text: string; quantity: number }[];
  buyer: string | null;
  total: number;
  tracking_number: string | null;
  deadline: string | null;
  photo: string | null;
};

/**
 * Ventas activas con envío pendiente. El vendedor solo recibe las suyas:
 * lo garantiza la seguridad de la base de datos (RLS), no esta consulta.
 */
export async function loadPendingShipments(): Promise<{ rows: PendingShipment[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, carrier_id, external_reference, notes, shipping_label_path, buyer_name, tracking_number, shipping_deadline, image_path, carriers(name), platforms(name), responsibles(name), mobile_devices(number, name), sale_items(line_number, quantity, unit_price, product_variants(name, products(name, photo_path)))",
    )
    .eq("status", "activa")
    .eq("shipping_status", "pendiente")
    .order("sale_date", { ascending: true })
    .order("sale_number", { ascending: true })
    .limit(1000);
  type Row = {
    id: string;
    sale_number: string;
    sale_date: string;
    carrier_id: string | null;
    external_reference: string | null;
    notes: string | null;
    shipping_label_path: string | null;
    buyer_name: string | null;
    tracking_number: string | null;
    shipping_deadline: string | null;
    image_path: string | null;
    carriers: { name: string } | null;
    platforms: { name: string } | null;
    responsibles: { name: string } | null;
    mobile_devices: { number: number; name: string } | null;
    sale_items: { line_number: number; quantity: number; unit_price: number; product_variants: { name: string; products: { name: string; photo_path: string | null } | null } | null }[];
  };
  const raw = (data ?? []) as unknown as Row[];
  const photos = await saleThumbs(raw.map((r) => ({ key: r.id, image_path: r.image_path, product_photo: r.sale_items[0]?.product_variants?.products?.photo_path ?? null })));
  const rows = raw.map<PendingShipment>((r) => ({
    id: r.id,
    sale_number: r.sale_number,
    sale_date: r.sale_date,
    carrier_id: r.carrier_id,
    carrier_name: r.carriers?.name ?? "Sin paquetería",
    platform_name: r.platforms?.name ?? "",
    responsible_name: r.responsibles?.name ?? "",
    mobile: r.mobile_devices ? `Móvil ${r.mobile_devices.number}` : null,
    external_reference: r.external_reference,
    notes: r.notes,
    label_path: r.shipping_label_path,
    items: [...r.sale_items]
      .sort((a, b) => a.line_number - b.line_number)
      .map((i) => ({ quantity: i.quantity, text: variantDisplay(i.product_variants?.products?.name ?? "", i.product_variants?.name) })),
    buyer: r.buyer_name,
    total: r.sale_items.reduce((a, i) => a + Number(i.unit_price) * Number(i.quantity), 0),
    tracking_number: r.tracking_number,
    deadline: r.shipping_deadline,
    photo: photos.get(r.id) ?? null,
  }));
  return { rows, error: error ? "No se han podido cargar los envíos pendientes." : null };
}

export type CarrierGroup = { key: string; name: string; count: number; oldest: string; withoutLabel: number; photos: string[]; deadline: string | null };

export function groupByCarrier(rows: PendingShipment[]): CarrierGroup[] {
  const map = new Map<string, CarrierGroup>();
  for (const r of rows) {
    const key = r.carrier_id ?? NO_CARRIER;
    const g = map.get(key) ?? { key, name: r.carrier_name, count: 0, oldest: r.sale_date, withoutLabel: 0, photos: [], deadline: null };
    g.count++;
    if (r.photo && g.photos.length < 4) g.photos.push(r.photo);
    if (r.deadline && (!g.deadline || r.deadline < g.deadline)) g.deadline = r.deadline;
    if (r.sale_date < g.oldest) g.oldest = r.sale_date;
    if (!r.label_path) g.withoutLabel++;
    map.set(key, g);
  }
  // Primero las que más paquetes tienen; las «sin paquetería», al final
  return [...map.values()].sort((a, b) => (a.key === NO_CARRIER ? 1 : b.key === NO_CARRIER ? -1 : b.count - a.count || a.name.localeCompare(b.name)));
}
