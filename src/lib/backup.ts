import "server-only";

/**
 * Tablas que entran en la copia de seguridad (todas las de datos del
 * negocio). Se dejan fuera, a propósito, las que guardan secretos o datos
 * técnicos: la conexión de Gmail (permiso cifrado y claves), el contador
 * del generador de IA y los ajustes personales de cada usuario.
 */
export const BACKUP_TABLES: { name: string; select?: string; order: string }[] = [
  { name: "profiles", select: "id, email, full_name, role, active, created_at, updated_at", order: "created_at" },
  { name: "responsibles", order: "created_at" },
  { name: "platforms", order: "name" },
  { name: "carriers", order: "name" },
  { name: "mobile_devices", order: "number" },
  { name: "mobile_device_accounts", order: "mobile_device_id" },
  { name: "categories", order: "name" },
  { name: "brands", order: "name" },
  { name: "suppliers", order: "name" },
  { name: "products", order: "created_at" },
  { name: "product_variants", order: "created_at" },
  { name: "product_photos", order: "created_at" },
  { name: "photo_uses", order: "used_at" },
  { name: "listings", order: "created_at" },
  { name: "product_aliases", order: "created_at" },
  { name: "purchase_orders", order: "created_at" },
  { name: "purchase_order_items", order: "id" },
  { name: "purchase_order_costs", order: "id" },
  { name: "inventory_lots", order: "created_at" },
  { name: "inventory_movements", order: "id" },
  { name: "sales", order: "created_at" },
  { name: "sale_items", order: "id" },
  { name: "returns", order: "created_at" },
  { name: "return_items", order: "id" },
  { name: "stock_exits", order: "created_at" },
  { name: "stock_adjustments", order: "created_at" },
  { name: "partner_transfers", order: "created_at" },
  { name: "email_accounts", order: "created_at" },
  { name: "email_messages", order: "created_at" },
  { name: "review_items", order: "created_at" },
  { name: "import_batches", order: "created_at" },
  { name: "audit_log", order: "id" },
];

export const BACKUP_FORMAT = "maurinventario-copia";
export const BACKUP_VERSION = 1;
