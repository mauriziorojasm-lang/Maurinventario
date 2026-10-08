/**
 * Convierte los errores de Supabase/PostgreSQL en mensajes claros.
 * Los errores de las funciones de negocio ya vienen en español.
 */
type PgError = { message?: string; code?: string; details?: string | null; hint?: string | null } | null | undefined;

const CONSTRAINTS: Record<string, string> = {
  products_name_uq: "Ya existe un producto con ese nombre.",
  products_sku_uq: "Ese SKU ya está en uso.",
  product_variants_sku_uq: "Ese SKU ya está en uso.",
  product_variants_name_uq: "Ese producto ya tiene una variante con ese nombre.",
  responsibles_name_uq: "Ya existe un responsable con ese nombre.",
  suppliers_name_uq: "Ya existe un proveedor con ese nombre.",
  brands_name_uq: "Ya existe una marca con ese nombre.",
  categories_name_uq: "Ya existe una categoría con ese nombre.",
  platforms_name_uq: "Ya existe una plataforma con ese nombre.",
  carriers_name_uq: "Ya existe una empresa de transporte con ese nombre.",
  mobile_devices_number_key: "Ya existe un móvil con ese número.",
  purchase_orders_order_number_key: "Ya existe un pedido de compra con ese número.",
  responsibles_profile_id_key: "Ese usuario ya está vinculado a otro responsable.",
  inventory_lots_stock_no_negativo: "No hay stock suficiente.",
};

export function friendlyError(e: PgError): string {
  if (!e) return "Ha ocurrido un error.";
  const msg = e.message ?? "";
  for (const [name, text] of Object.entries(CONSTRAINTS)) if (msg.includes(name)) return text;
  if (e.code === "42501" && !/[áéíóúñ]/i.test(msg)) return "No tienes permisos para realizar esta acción.";
  if (e.code === "23505") return "Ya existe un registro con esos datos.";
  if (e.code === "23503") return "No se puede completar: hay datos relacionados que lo impiden.";
  if (/fetch failed|Failed to fetch|NetworkError/i.test(msg)) return "No se puede conectar con la base de datos. Revisa tu conexión.";
  if (/JWT|session/i.test(msg)) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  return msg || "Ha ocurrido un error.";
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
