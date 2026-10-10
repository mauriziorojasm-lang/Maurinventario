"use server";
import { z } from "zod";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type RecoverState = { error: string | null; sent?: boolean };

/** Siempre responde lo mismo, exista o no la cuenta (no revela qué emails están registrados). */
export async function recover(_prev: RecoverState, formData: FormData): Promise<RecoverState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Escribe un email válido." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/confirmar?next=/nueva-clave` });
  if (error && /rate limit/i.test(error.message)) return { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  return { error: null, sent: true };
}
