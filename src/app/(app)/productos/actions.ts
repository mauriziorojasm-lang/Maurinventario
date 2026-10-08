"use server";
import { callRpc } from "@/lib/rpc";
import type { ActionResult } from "@/lib/errors";

export type ProductInput = {
  id?: string;
  name: string;
  brand_name?: string | null;
  category_name?: string | null;
  sku?: string | null;
  description?: string | null;
  normal_sale_price?: string | null;
  photo_path?: string | null;
  notes?: string | null;
  variants?: { name: string; sku?: string | null; normal_sale_price?: string | null }[];
};

export async function createProduct(p: ProductInput): Promise<ActionResult<string>> {
  return callRpc<string>("create_product", { p }, ["/productos", "/inventario"], "Producto creado.");
}

export async function updateProduct(p: ProductInput & { id: string }): Promise<ActionResult> {
  return callRpc("update_product", { p }, ["/productos", "/inventario"], "Producto actualizado.");
}

export async function setProductPhoto(id: string, photo_path: string | null): Promise<ActionResult> {
  return callRpc("update_product", { p: { id, photo_path } }, ["/productos"], "Foto actualizada.");
}

export async function saveVariant(v: { id?: string; product_id: string; name: string; sku?: string | null; normal_sale_price?: string | null }): Promise<ActionResult<string>> {
  return callRpc<string>("save_variant", { p: v }, ["/productos", "/inventario"], "Variante guardada.");
}

export async function deleteVariant(id: string): Promise<ActionResult> {
  return callRpc("delete_variant", { p_variant_id: id }, ["/productos", "/inventario"], "Variante eliminada.");
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  return callRpc("delete_product", { p_product_id: id }, ["/productos", "/inventario"], "Producto eliminado.");
}
