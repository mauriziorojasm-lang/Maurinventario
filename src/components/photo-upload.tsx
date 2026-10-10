"use client";
import { addProductPhotos } from "@/app/(app)/productos/photo-actions";
import { THUMB_SIDE, prepareImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

export type UploadProgress = { done: number; total: number; failed: string[] };

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Sube varias fotos a un producto: cada una se convierte en el dispositivo a
 * JPG ligero sin datos internos (también las HEIC del iPhone), se sube al
 * almacén privado y se registra en la galería. Se suben de 3 en 3.
 */
export async function uploadProductPhotos(
  productId: string,
  files: File[],
  onProgress?: (p: UploadProgress) => void,
): Promise<{ saved: number; errors: string[] }> {
  const supabase = createClient();
  const saved: { path: string; width: number; height: number }[] = [];
  const errors: string[] = [];
  let done = 0;
  const report = () => onProgress?.({ done, total: files.length, failed: errors });
  report();

  const queue = files.map((f, i) => ({ f, i }));
  const order = new Map<string, number>();
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const img = await prepareImage(item.f);
        const name = `${newId()}.jpg`;
        const path = `${productId}/${name}`;
        const { error } = await supabase.storage.from("product-photos").upload(path, img.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (error) throw new Error(error.message);
        // Miniatura ligera para listas y cuadrículas (si falla, se usa la foto completa)
        try {
          const small = await prepareImage(img.blob, THUMB_SIDE);
          await supabase.storage.from("product-photos").upload(`${productId}/thumb/${name}`, small.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        } catch {
          /* no es imprescindible */
        }
        order.set(path, item.i);
        saved.push({ path, width: img.width, height: img.height });
      } catch (e) {
        errors.push(`${item.f.name || "Foto"}: ${e instanceof Error ? e.message : "no se ha podido subir"}`);
      }
      done++;
      report();
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  if (saved.length) {
    // Se guardan en el mismo orden en que se eligieron
    saved.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    const r = await addProductPhotos({ productId, photos: saved });
    if (!r.ok) {
      errors.push(r.error);
      await supabase.storage.from("product-photos").remove(saved.flatMap((s) => [s.path, thumbOf(s.path)]));
      return { saved: 0, errors };
    }
  }
  return { saved: saved.length, errors };
}

const thumbOf = (path: string) => path.replace(/\/([^/]+)$/, "/thumb/$1");

/** Crea la miniatura de una foto antigua que no la tiene (solo administradores). */
export async function createMissingThumb(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) return;
  const small = await prepareImage(await res.blob(), THUMB_SIDE);
  await createClient().storage.from("product-photos").upload(thumbOf(path), small.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
}
