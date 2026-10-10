"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Cambiar al otro espacio de trabajo (la base de datos comprueba que eres miembro). */
export async function switchOrganization(orgId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orgId).success) return { ok: false, error: "Espacio no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_org", { p_org: orgId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
