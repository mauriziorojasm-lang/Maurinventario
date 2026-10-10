"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type NewPasswordState = { error: string | null };

export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const a = String(formData.get("password") ?? "");
  const b = String(formData.get("repeat") ?? "");
  if (a.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (a !== b) return { error: "Las contraseñas no coinciden." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: a });
  if (error) return { error: /same|different/i.test(error.message) ? "Elige una contraseña distinta de la anterior." : "No se ha podido cambiar. Pide un enlace nuevo." };
  redirect("/");
}
