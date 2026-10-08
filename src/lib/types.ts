/** Tipos de las filas que devuelven las vistas y funciones de la base de datos. */
export type SellableVariant = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  variant_count: number;
  sku: string | null;
  brand_name: string | null;
  category_name: string | null;
  stock: number;
  normal_sale_price: number | null;
  photo_path: string | null;
};

export type AvailableLot = {
  lot_id: string;
  label: string;
  purchase_order_number: number | null;
  received_at: string;
  quantity_available: number;
  unit_cost: number | null;
};

export type SaleLine = {
  sale_item_id: string;
  sale_id: string;
  sale_number: string;
  sale_date: string;
  responsible_id: string;
  responsible_name: string;
  platform_id: string;
  platform_name: string;
  requires_shipping: boolean;
  carrier_name: string | null;
  mobile_number: number | null;
  mobile_name: string | null;
  shipping_status: "pendiente" | "enviado" | null;
  external_reference: string | null;
  line_number: number;
  variant_id: string;
  variant_name: string;
  product_id: string;
  product_name: string;
  category_name: string | null;
  brand_name: string | null;
  sku: string | null;
  lot_id: string;
  purchase_order_number: number | null;
  lot_label: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  returned_qty: number;
  restocked_qty: number;
  refunded_amount: number;
  net_quantity: number;
  net_amount: number;
  lot_unit_cost: number;
  cost_amount: number;
  profit: number;
  line_notes: string | null;
  sale_notes: string | null;
  source_ref: string | null;
};

export type Option = { id: string; name: string };
export type PlatformOption = { id: string; name: string; requires_shipping: boolean };
export type MobileOption = { id: string; number: number; name: string };

/** Nombre "Producto · Variante" (sin la variante si es la única/genérica). */
export function variantDisplay(product: string, variant: string | null | undefined, count = 1) {
  if (!variant || (count <= 1 && (variant === "Única" || variant === "Sin especificar"))) return product;
  return `${product} · ${variant}`;
}
