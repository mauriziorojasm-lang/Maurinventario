"use server";
import { callRpc } from "@/lib/rpc";
import type { ActionResult } from "@/lib/errors";

export type POInput = {
  id?: string;
  order_number?: number | null;
  supplier_id?: string;
  order_date?: string;
  notes?: string | null;
  items?: { variant_id: string; quantity: number; unit_cost: number; notes?: string | null }[];
  costs?: { cost_type: string; amount: number; description?: string | null }[];
};

export async function savePurchaseOrder(p: POInput): Promise<ActionResult<string>> {
  return callRpc<string>("save_purchase_order", { p }, ["/compras"], "Pedido guardado.");
}

export async function receivePurchaseOrder(p: {
  purchase_order_id: string;
  received_at: string;
  lines: { item_id: string; quantity_received: number; substitute_variant_id?: string | null; substitute_quantity?: number | null; notes?: string | null }[];
}): Promise<ActionResult> {
  return callRpc("receive_purchase_order", { p }, ["/compras", "/inventario", "/productos", "/"], "Pedido recibido. El stock ya está disponible.");
}

export async function cancelPurchaseOrder(id: string, reason: string): Promise<ActionResult> {
  return callRpc("cancel_purchase_order", { p_po_id: id, p_reason: reason }, ["/compras"], "Pedido cancelado.");
}

export async function setPurchaseCosts(purchase_order_id: string, costs: { cost_type: string; amount: number; description?: string | null }[]): Promise<ActionResult> {
  return callRpc("set_purchase_costs", { p: { purchase_order_id, costs } }, ["/compras", "/inventario", "/productos", "/ventas"], "Costes guardados y coste real recalculado.");
}
