import "server-only";
import { createClient } from "./supabase/server";

/** Enlaces temporales (1 hora) para mostrar fotos del bucket privado. */
export async function signedPhotoUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("product-photos").createSignedUrls(unique, 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}
