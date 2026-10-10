"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { APPEARANCE_COOKIE, appearanceCookieValue, prefsSchema, resolvePrefs, type StoredPrefs } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

type Section = keyof StoredPrefs;
const SECTION_LABEL: Record<Section, string> = {
  dashboard: "Panel de inicio",
  appearance: "Aspecto",
  tables: "Tablas",
  notifications: "Avisos",
  sales: "Ventas e inventario",
};

async function currentStored(): Promise<{ userId: string; stored: StoredPrefs } | null> {
  const user = await getCurrentUser();
  if (!user?.active) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_preferences").select("prefs").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(friendlyError(error));
  return { userId: user.id, stored: (data?.prefs as StoredPrefs) ?? {} };
}

async function setAppearanceCookie(stored: StoredPrefs) {
  const jar = await cookies();
  jar.set(APPEARANCE_COOKIE, appearanceCookieValue(resolvePrefs(stored).appearance), {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Guarda una sección de los ajustes del usuario (solo las suyas). */
export async function savePreferences<S extends Section>(section: S, value: StoredPrefs[S]): Promise<ActionResult> {
  const cur = await currentStored();
  if (!cur) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };
  if (!(section in SECTION_LABEL)) return { ok: false, error: "Sección no válida." };
  const next = prefsSchema.safeParse({ ...cur.stored, [section]: value });
  if (!next.success) return { ok: false, error: "Algún valor no es válido. Revisa los cambios." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: cur.userId, prefs: next.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: friendlyError(error) };
  if (section === "appearance") await setAppearanceCookie(next.data);
  await supabase.rpc("log_user_event", { p_action: "preferencias", p_summary: `Ajustes guardados: ${SECTION_LABEL[section]}` });
  revalidatePath("/", "layout");
  return { ok: true, message: "Cambios guardados." };
}

/** Vuelve a los valores por defecto (todas las secciones o una). Nunca toca datos del negocio. */
export async function resetPreferences(section?: Section): Promise<ActionResult> {
  const cur = await currentStored();
  if (!cur) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };
  const supabase = await createClient();
  const rest: StoredPrefs = section ? { ...cur.stored, [section]: undefined } : {};
  const { error } = section
    ? await supabase.from("user_preferences").upsert({ user_id: cur.userId, prefs: JSON.parse(JSON.stringify(rest)), updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    : await supabase.from("user_preferences").delete().eq("user_id", cur.userId);
  if (error) return { ok: false, error: friendlyError(error) };
  if (!section || section === "appearance") await setAppearanceCookie(rest);
  await supabase.rpc("log_user_event", {
    p_action: "restablecer_preferencias",
    p_summary: section ? `Restablecido: ${SECTION_LABEL[section]}` : "Restablecidos todos los ajustes personales",
  });
  revalidatePath("/", "layout");
  return { ok: true, message: section ? "Restablecido." : "Ajustes restablecidos. Tus datos no se han tocado." };
}

/** Cierra la sesión en todos los dispositivos (también en este). */
export async function signOutEverywhere(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión ha caducado." };
  const supabase = await createClient();
  await supabase.rpc("log_user_event", { p_action: "cerrar_sesiones", p_summary: "Sesión cerrada en todos los dispositivos" });
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}
