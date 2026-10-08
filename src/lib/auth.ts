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
  const { data: profile } = await supabase.from("profiles").select("id, email, full_name, role, active").eq("id", sub).maybeSingle();
  if (!profile) return null;
  const { data: resp } = await supabase
    .from("responsibles")
    .select("id, name")
    .eq("profile_id", sub)
    .is("deleted_at", null)
    .maybeSingle();
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
  if (!user.active) redirect("/login?error=inactivo");
  return user;
}

/** Para páginas solo de administración: el vendedor vuelve al inicio. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?aviso=sin-permiso");
  return user;
}
