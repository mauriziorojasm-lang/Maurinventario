import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Copia la foto del anuncio (la que trae el correo de Vinted o Wallapop)
 * al almacén privado «sale-images», en la carpeta de la organización. Así
 * se ve aunque la plataforma borre la foto, y nadie de fuera puede verla.
 * Si algo falla, no pasa nada: la venta se detecta igual, sin foto.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function storeListingImage(db: SupabaseClient, org: string, messageId: string, url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    const path = `${org}/${messageId.replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`;
    const up = await db.storage.from("sale-images").upload(path, buf, { contentType: type, upsert: true });
    return up.error ? null : path;
  } catch {
    return null;
  }
}

/** Texto de un PDF (etiqueta de envío) para reconocer transportista y código. Vacío si no se puede leer. */
export async function pdfText(buf: Buffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).slice(0, 20_000);
  } catch {
    return "";
  }
}
