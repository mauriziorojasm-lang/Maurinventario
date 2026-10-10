import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "vendedor";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  active: boolean;
  responsibleId: string | null;
  responsibleName: string | null;
};

/** Usuario actual con su perfil y su ficha de responsable (si la tiene). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const [{ data: profile, error }, { data: resp }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, active").eq("id", sub).maybeSingle(),
    supabase.from("responsibles").select("id, name").eq("profile_id", sub).is("deleted_at", null).maybeSingle(),
  ]);
  // Si la base de datos falla, se muestra el error (no se echa al usuario)
  if (error) throw new Error("No se ha podido cargar tu usuario. Revisa la conexión y vuelve a intentarlo.");
  // Sesión válida pero sin perfil (usuario borrado): se trata como desactivado
  if (!profile) {
    return { id: sub, email: "", fullName: null, role: "vendedor", active: false, responsibleId: null, responsibleName: null };
  }
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    active: profile.active,
    responsibleId: resp?.id ?? null,
    responsibleName: resp?.name ?? null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Hay que cerrar la sesión: con ella abierta, /login devolvería al inicio
  if (!user.active) redirect("/auth/salir?motivo=inactivo");
  return user;
}

/** Para páginas solo de administración: el vendedor vuelve al inicio. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?aviso=sin-permiso");
  return user;
}
