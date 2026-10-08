"use client";
import { createClient } from "@/lib/supabase/client";

/** Sube una foto al bucket product-photos y devuelve su ruta. */
export async function uploadProductPhoto(productId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (!file.type.startsWith("image/")) return { error: "La foto debe ser una imagen (JPG, PNG o WebP)." };
  if (file.size > 5 * 1024 * 1024) return { error: "La foto no puede pasar de 5 MB." };
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${productId}/${Date.now()}.${ext.replace(/[^a-z0-9]/g, "")}`;
  const { error } = await supabase.storage.from("product-photos").upload(path, file, { contentType: file.type });
  if (error) return { error: `No se ha podido subir la foto: ${error.message}` };
  return { path };
}
