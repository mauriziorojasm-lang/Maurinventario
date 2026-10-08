"use server";
import { callRpc } from "@/lib/rpc";
import type { ActionResult } from "@/lib/errors";

export async function resolveReview(id: string, status: "resuelto" | "descartado" | "pendiente", note: string): Promise<ActionResult> {
  return callRpc("resolve_review_item", { p_id: id, p_status: status, p_note: note || null }, ["/revision"], status === "pendiente" ? "Marcado como pendiente." : "Guardado.");
}
