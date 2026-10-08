"use server";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function changeOwnPassword(password: string): Promise<ActionResult> {
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Contraseña cambiada." };
}
