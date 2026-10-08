import "server-only";
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
      "id, sale_number, sale_date, carrier_id, external_reference, notes, shipping_label_path, carriers(name), platforms(name), responsibles(name), mobile_devices(number, name), sale_items(line_number, quantity, product_variants(name, products(name)))",
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
    carriers: { name: string } | null;
    platforms: { name: string } | null;
    responsibles: { name: string } | null;
    mobile_devices: { number: number; name: string } | null;
    sale_items: { line_number: number; quantity: number; product_variants: { name: string; products: { name: string } | null } | null }[];
  };
  const rows = ((data ?? []) as unknown as Row[]).map<PendingShipment>((r) => ({
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
  }));
  return { rows, error: error ? "No se han podido cargar los envíos pendientes." : null };
}

export type CarrierGroup = { key: string; name: string; count: number; oldest: string; withoutLabel: number };

export function groupByCarrier(rows: PendingShipment[]): CarrierGroup[] {
  const map = new Map<string, CarrierGroup>();
  for (const r of rows) {
    const key = r.carrier_id ?? NO_CARRIER;
    const g = map.get(key) ?? { key, name: r.carrier_name, count: 0, oldest: r.sale_date, withoutLabel: 0 };
    g.count++;
    if (r.sale_date < g.oldest) g.oldest = r.sale_date;
    if (!r.label_path) g.withoutLabel++;
    map.set(key, g);
  }
  // Primero las que más paquetes tienen; las «sin paquetería», al final
  return [...map.values()].sort((a, b) => (a.key === NO_CARRIER ? 1 : b.key === NO_CARRIER ? -1 : b.count - a.count || a.name.localeCompare(b.name)));
}
