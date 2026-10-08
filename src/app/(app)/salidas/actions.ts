"use server";
import { callRpc } from "@/lib/rpc";
import type { ActionResult } from "@/lib/errors";

const paths = ["/salidas", "/inventario", "/productos", "/", "/revision"];

export async function createStockExit(p: { exit_date: string; variant_id: string; lot_id: string; quantity: number; reason: string; responsible_id?: string | null; notes?: string | null }): Promise<ActionResult<string>> {
  return callRpc<string>("create_stock_exit", { p }, paths, "Salida sin venta registrada.");
}

export async function updateStockExit(id: string, reason: string, notes?: string | null): Promise<ActionResult> {
  return callRpc("update_stock_exit", { p_exit_id: id, p_reason: reason, p_notes: notes ?? null }, paths, "Motivo guardado.");
}

export async function voidStockExit(id: string, reason: string): Promise<ActionResult> {
  return callRpc("void_stock_exit", { p_exit_id: id, p_reason: reason }, paths, "Salida anulada. Las unidades han vuelto a su lote.");
}

export async function createAdjustment(p: { adjustment_date: string; direction: "entrada" | "salida"; variant_id: string; quantity: number; lot_id?: string | null; unit_cost?: number | null; reason: string }): Promise<ActionResult<string>> {
  return callRpc<string>("create_stock_adjustment", { p }, paths, "Ajuste registrado.");
}
