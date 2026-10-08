"use server";
import { callRpc } from "@/lib/rpc";
import type { ActionResult } from "@/lib/errors";

export async function createReturn(p: {
  sale_id: string;
  return_date: string;
  return_type: "devolucion_producto" | "reembolso_sin_producto";
  reason?: string | null;
  notes?: string | null;
  items: { sale_item_id: string; quantity: number; refund_amount: number }[];
}): Promise<ActionResult<string>> {
  return callRpc<string>("create_return", { p }, ["/devoluciones", "/ventas", "/inventario", "/"], "Devolución registrada.");
}
