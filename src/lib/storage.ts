import "server-only";
import { createClient } from "./supabase/server";

/**
 * Enlaces temporales a los archivos privados (fotos y etiquetas).
 *
 * Los enlaces de las fotos se reutilizan durante ~50 minutos: así la misma
 * foto tiene siempre la misma dirección y el navegador la saca de su caché
 * en vez de volver a descargarla en cada pantalla. Las etiquetas no se
 * reutilizan entre usuarios (cada vendedor solo puede ver las suyas).
 */
type Bucket = "product-photos" | "shipping-labels";

const TTL = 60 * 60; // validez de cada enlace: 1 hora
const REUSE_MARGIN = 10 * 60 * 1000; // se reutiliza mientras le queden >10 min
const MAX_ENTRIES = 5000;
const cache = new Map<string, { url: string; exp: number }>();

export async function signUrls(bucket: Bucket, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const reuse = bucket === "product-photos";
  const now = Date.now();
  const missing: string[] = [];
  for (const p of unique) {
    const hit = reuse ? cache.get(p) : undefined;
    if (hit && hit.exp - now > REUSE_MARGIN) out.set(p, hit.url);
    else missing.push(p);
  }
  if (!missing.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL);
  if (reuse && cache.size > MAX_ENTRIES) cache.clear();
  for (const d of data ?? []) {
    if (!d.path || !d.signedUrl || d.error) continue;
    out.set(d.path, d.signedUrl);
    if (reuse) cache.set(d.path, { url: d.signedUrl, exp: now + TTL * 1000 });
  }
  return out;
}

/** Ruta de la miniatura (320 px) de una foto: «<producto>/thumb/<archivo>». */
export function thumbPath(path: string): string {
  const i = path.lastIndexOf("/");
  return `${path.slice(0, i + 1)}thumb/${path.slice(i + 1)}`;
}

/**
 * Enlaces de fotos. Con `thumbs`, se usa la miniatura si existe (mucho más
 * ligera para listas) y, si no, la foto completa.
 */
export async function signPhotos(paths: (string | null | undefined)[], opts: { thumbs?: boolean } = {}): Promise<Map<string, string>> {
  if (!opts.thumbs) return signUrls("product-photos", paths);
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const all = await signUrls("product-photos", [...unique.map(thumbPath), ...unique]);
  const out = new Map<string, string>();
  for (const p of unique) {
    const url = all.get(thumbPath(p)) ?? all.get(p);
    if (url) out.set(p, url);
  }
  return out;
}

/** Etiquetas de envío (las que el usuario tiene permiso para ver). */
export function signLabels(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  return signUrls("shipping-labels", paths);
}
