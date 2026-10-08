"use server";
import { callRpc } from "@/lib/rpc";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { AvailableLot, SellableVariant } from "@/lib/types";

export async function searchVariants(query: string, onlyInStock = false): Promise<ActionResult<SellableVariant[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_sellable_variants", { p_query: query, p_only_in_stock: onlyInStock, p_limit: 25 });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: (data ?? []) as SellableVariant[] };
}

export async function getLots(variantId: string): Promise<ActionResult<AvailableLot[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_lots", { p_variant_id: variantId });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: (data ?? []) as AvailableLot[] };
}

export type NewSale = {
  sale_date: string;
  responsible_id?: string | null;
  platform_id: string;
  carrier_id?: string | null;
  mobile_device_id?: string | null;
  shipping_status?: "pendiente" | "enviado" | null;
  external_reference?: string | null;
  notes?: string | null;
  items: { variant_id: string; lot_id: string; quantity: number; unit_price: number; notes?: string | null }[];
};

export async function createSale(sale: NewSale): Promise<ActionResult<string>> {
  return callRpc<string>("create_sale", { p: sale }, ["/ventas", "/"], "Venta registrada.");
}

export async function updateSale(patch: Record<string, unknown> & { id: string }): Promise<ActionResult> {
  return callRpc("update_sale", { p: patch }, ["/ventas"], "Cambios guardados.");
}

export async function updateSaleItem(patch: { id: string; unit_price?: number; notes?: string | null }): Promise<ActionResult> {
  return callRpc("update_sale_item", { p: patch }, ["/ventas"], "Línea actualizada.");
}

export async function voidSale(id: string, reason: string): Promise<ActionResult> {
  return callRpc("void_sale", { p_sale_id: id, p_reason: reason }, ["/ventas", "/"], "Venta anulada. Las unidades han vuelto a su lote.");
}

export async function labelUrl(path: string): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("shipping-labels").createSignedUrl(path, 60 * 10);
  if (error || !data) return { ok: false, error: "No se ha podido abrir la etiqueta." };
  return { ok: true, data: data.signedUrl };
}

export async function quickCreateProduct(p: {
  name: string;
  brand_name?: string;
  category_name?: string;
  normal_sale_price?: string;
  variants?: { name: string }[];
}): Promise<ActionResult<string>> {
  return callRpc<string>("create_product", { p }, ["/productos"], "Producto creado. Recuerda: no tiene stock hasta que entre en una compra.");
}
