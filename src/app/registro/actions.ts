"use server";
import { z } from "zod";
import { safeNext } from "@/lib/safe-redirect";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error: string | null; sent?: boolean; email?: string; next?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre.").max(80),
  email: z.email("Escribe un email válido.").max(200),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200),
  business: z.string().trim().max(80).optional(),
  terms: z.literal("on", { error: "Tienes que aceptar las condiciones y la política de privacidad." }),
});

/** Alta de un cliente: Supabase envía el correo de confirmación. El espacio se crea después de confirmar. */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const next = safeNext(String(formData.get("next") ?? "/bienvenida"));
  const v = schema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: formData.get("password"),
    business: formData.get("business") || undefined,
    terms: formData.get("terms"),
  });
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisa los datos.", email: String(formData.get("email") ?? ""), next };
  const supabase = await createClient();
  const base = await siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email: v.data.email,
    password: v.data.password,
    options: {
      emailRedirectTo: `${base}/auth/confirmar?next=${encodeURIComponent(next)}`,
      data: { full_name: v.data.name, business_name: v.data.business ?? null },
    },
  });
  if (error) {
    const msg = /registered|already/i.test(error.message)
      ? "Ya existe una cuenta con ese email. Entra o recupera tu contraseña."
      : /signups not allowed|disabled/i.test(error.message)
        ? "El registro no está disponible ahora mismo."
        : /rate limit/i.test(error.message)
          ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
          : "No se ha podido crear la cuenta. Inténtalo de nuevo.";
    return { error: msg, email: v.data.email, next };
  }
  // Si el proyecto no exige confirmar el correo, ya hay sesión
  if (data.session) return { error: null, sent: false, email: v.data.email, next };
  return { error: null, sent: true, email: v.data.email, next };
}
