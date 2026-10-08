"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Gestión de usuarios. Necesita la service role key (solo en el servidor)
 * porque crear usuarios o cambiar contraseñas de otros no se puede hacer
 * con la clave pública. Siempre se comprueba antes que quien lo pide es admin.
 */

export async function createUserAction(input: {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "vendedor";
  responsible: "none" | "new" | string;
}): Promise<ActionResult> {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "El email no es válido." };
  if (input.password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falta configurar la service role key." };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name.trim() || null },
    app_metadata: { role: input.role },
  });
  if (error || !data.user) {
    return { ok: false, error: /already been registered|already exists/i.test(error?.message ?? "") ? "Ya existe un usuario con ese email." : (error?.message ?? "No se ha podido crear el usuario.") };
  }
  const supabase = await createClient();
  // El trigger crea el perfil; nos aseguramos del rol y del nombre
  await supabase.from("profiles").update({ role: input.role, full_name: input.full_name.trim() || null }).eq("id", data.user.id);
  if (input.responsible === "new") {
    const { error: e2 } = await supabase.from("responsibles").insert({ name: input.full_name.trim() || email, email, profile_id: data.user.id });
    if (e2) return { ok: false, error: `Usuario creado, pero no el responsable: ${friendlyError(e2)}` };
  } else if (input.responsible !== "none") {
    const { error: e3 } = await supabase.from("responsibles").update({ profile_id: data.user.id }).eq("id", input.responsible);
    if (e3) return { ok: false, error: `Usuario creado, pero no se ha podido vincular: ${friendlyError(e3)}` };
  }
  revalidatePath("/usuarios");
  revalidatePath("/responsables");
  return { ok: true, message: "Usuario creado. Ya puede iniciar sesión con su email y contraseña." };
}

export async function updateUserAction(input: { id: string; role: "admin" | "vendedor"; active: boolean; full_name: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  if (input.id === me.id && (!input.active || input.role !== "admin")) return { ok: false, error: "No puedes quitarte a ti mismo el rol de administrador ni desactivarte." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: input.role, active: input.active, full_name: input.full_name.trim() || null }).eq("id", input.id);
  if (error) return { ok: false, error: friendlyError(error) };
  try {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(input.id, { ban_duration: input.active ? "none" : "876000h", app_metadata: { role: input.role } });
  } catch {
    // Sin service role el perfil ya queda desactivado: la base de datos le niega el acceso igualmente.
  }
  revalidatePath("/usuarios");
  return { ok: true, message: "Usuario actualizado." };
}

export async function resetPasswordAction(id: string, password: string): Promise<ActionResult> {
  await requireAdmin();
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falta configurar la service role key." };
  }
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Contraseña cambiada. Comunícasela al usuario." };
}
