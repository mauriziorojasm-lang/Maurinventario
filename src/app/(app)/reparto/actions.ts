"use server";
import { revalidatePath } from "next/cache";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function addTransfer(t: { transfer_date: string; from_responsible_id: string; to_responsible_id: string; amount: number; notes?: string | null }): Promise<ActionResult> {
  if (!(t.amount > 0)) return { ok: false, error: "El importe debe ser mayor que 0." };
  if (t.from_responsible_id === t.to_responsible_id) return { ok: false, error: "Quien paga y quien recibe deben ser personas distintas." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const { error } = await supabase.from("partner_transfers").insert({ ...t, notes: t.notes?.trim() || null, created_by: data?.claims?.sub ?? null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/reparto");
  return { ok: true, message: "Pago registrado." };
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("partner_transfers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/reparto");
  return { ok: true, message: "Pago eliminado." };
}
