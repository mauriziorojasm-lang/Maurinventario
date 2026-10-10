import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

/** Rol dentro de la organización activa. */
export type Role = "admin" | "vendedor" | "almacen";

export type SubscriptionInfo = {
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  comped: boolean;
  hasCustomer: boolean;
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  /** Sin organización (recién registrado o le han quitado de la suya): role = null. */
  role: Role | null;
  active: boolean;
  orgId: string | null;
  orgName: string | null;
  orgStatus: string | null;
  deletionRequestedAt: string | null;
  /** ¿La organización puede trabajar? (prueba, suscripción al día o acceso concedido) */
  hasAccess: boolean;
  subscription: SubscriptionInfo | null;
  isPlatformAdmin: boolean;
  responsibleId: string | null;
  responsibleName: string | null;
  /** Espacios a los que pertenece (para cambiar de uno a otro). */
  organizations: { id: string; name: string }[];
};

type OrgInfo = {
  id: string;
  name: string;
  status: string;
  role: Role;
  deletion_requested_at: string | null;
  has_access: boolean;
  subscription: {
    status: string | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
    comped: boolean | null;
    has_customer: boolean | null;
  } | null;
};

/**
 * Usuario actual: perfil, organización activa (la decide la base de datos
 * según sus membresías, nunca el navegador), su rol en ella, el estado de
 * la suscripción y su ficha de responsable. Todo en una sola consulta.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: ctx, error } = await supabase.rpc("session_context");
  // Si la base de datos falla, se muestra el error (no se echa al usuario)
  if (error) throw new Error("No se ha podido cargar tu usuario. Revisa la conexión y vuelve a intentarlo.");
  const c = (ctx ?? {}) as {
    profile: { id: string; email: string; full_name: string | null; active: boolean } | null;
    org: OrgInfo | null;
    responsible: { id: string; name: string } | null;
    platform_admin: boolean | null;
    orgs: { id: string; name: string }[] | null;
  };
  const profile = c.profile;
  // Sesión válida pero sin perfil (usuario borrado): se trata como desactivado
  if (!profile) {
    return {
      id: sub,
      email: "",
      fullName: null,
      role: null,
      active: false,
      orgId: null,
      orgName: null,
      orgStatus: null,
      deletionRequestedAt: null,
      hasAccess: false,
      subscription: null,
      isPlatformAdmin: false,
      responsibleId: null,
      responsibleName: null,
      organizations: [],
    };
  }
  const o = c.org ?? null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: o?.role ?? null,
    active: profile.active,
    orgId: o?.id ?? null,
    orgName: o?.name ?? null,
    orgStatus: o?.status ?? null,
    deletionRequestedAt: o?.deletion_requested_at ?? null,
    hasAccess: !!o?.has_access,
    subscription: o?.subscription
      ? {
          status: o.subscription.status,
          trialEndsAt: o.subscription.trial_ends_at,
          currentPeriodEnd: o.subscription.current_period_end,
          cancelAtPeriodEnd: !!o.subscription.cancel_at_period_end,
          comped: !!o.subscription.comped,
          hasCustomer: !!o.subscription.has_customer,
        }
      : null,
    isPlatformAdmin: c.platform_admin === true,
    responsibleId: c.responsible?.id ?? null,
    responsibleName: c.responsible?.name ?? null,
    organizations: c.orgs ?? [],
  };
});

export type OrgUser = CurrentUser & { role: Role; orgId: string; orgName: string };

/** Usuario con sesión y con un espacio de trabajo. Si no tiene ninguno, a crearlo o unirse. */
export async function requireUser(): Promise<OrgUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Hay que cerrar la sesión: con ella abierta, /login devolvería al inicio
  if (!user.active) redirect("/auth/salir?motivo=inactivo");
  if (!user.orgId || !user.role) redirect("/bienvenida");
  return user as OrgUser;
}

/** Para páginas solo de administración: el resto vuelve al inicio. */
export async function requireAdmin(): Promise<OrgUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?aviso=sin-permiso");
  return user;
}

/** Sesión iniciada, tenga o no espacio de trabajo (registro, bienvenida, invitaciones). */
export async function requireSession(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/auth/salir?motivo=inactivo");
  return user;
}
