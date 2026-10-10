import "server-only";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { resolvePrefs, type Prefs, type StoredPrefs } from "./preferences";
import { createClient } from "./supabase/server";

/** Preferencias guardadas tal cual (sin completar). */
export const loadStoredPrefs = cache(async (): Promise<StoredPrefs> => {
  const user = await getCurrentUser();
  if (!user?.active) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("user_preferences").select("prefs").eq("user_id", user.id).maybeSingle();
  return (data?.prefs as StoredPrefs) ?? {};
});

/** Preferencias del usuario actual, completas (con valores por defecto). */
export const loadPrefs = cache(async (): Promise<Prefs> => resolvePrefs(await loadStoredPrefs()));
