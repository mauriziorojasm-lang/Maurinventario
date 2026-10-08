import "server-only";
import { createClient } from "./supabase/server";

/**
 * Prepara de una vez los enlaces temporales (1 hora) de varias etiquetas
 * de envío. Así, al pulsar «Ver etiqueta», se abre al instante sin tener
 * que preguntar al servidor. Solo se firman las etiquetas que el usuario
 * tiene permiso para ver (lo comprueba Supabase Storage).
 */
export async function signLabels(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("shipping-labels").createSignedUrls(unique, 60 * 60);
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  return out;
}
