"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function requestDeletionAction(confirmName: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_org_deletion", { p_confirm_name: confirmName });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Eliminación solicitada. Tienes 30 días para anularla y exportar tus datos." };
}

export async function cancelDeletionAction(): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_org_deletion");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Eliminación anulada. El espacio vuelve a estar activo." };
}
