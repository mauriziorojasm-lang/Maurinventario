"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { thumbPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Galería de fotos de cada producto. Los archivos se suben directamente
 * desde el dispositivo al almacén privado (product-photos); aquí solo se
 * registran, se ordenan y se borran. Solo administradores.
 */

async function admin() {
  const u = await getCurrentUser();
  if (!u || !u.active || !can(u, "catalogo")) throw new Error("No tienes permisos para cambiar las fotos.");
  return u;
}

/** La primera foto es la portada: se copia a la ficha del producto para las miniaturas. */
async function syncCover(productId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("product_photos").select("path").eq("product_id", productId).order("position").order("created_at").limit(1);
  await supabase.rpc("update_product", { p: { id: productId, photo_path: data?.[0]?.path ?? null } });
}

function refresh(productId: string) {
  revalidatePath(`/productos/${productId}`, "layout");
  revalidatePath("/productos");
  revalidatePath("/anuncios");
}

const addSchema = z.object({
  productId: z.uuid(),
  photos: z
    .array(z.object({ path: z.string().min(5).max(300), width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000) }))
    .min(1)
    .max(30),
});

export async function addProductPhotos(input: z.input<typeof addSchema>): Promise<ActionResult> {
  const user = await admin();
  const v = addSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Datos de las fotos no válidos." };
  const { productId, photos } = v.data;
  if (photos.some((p) => !p.path.startsWith(`${productId}/`))) return { ok: false, error: "Las fotos no corresponden a este producto." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("product_photos").select("position").eq("product_id", productId).order("position", { ascending: false }).limit(1);
  const start = (last?.[0]?.position ?? -1) + 1;
  const { error } = await supabase
    .from("product_photos")
    .upsert(
      photos.map((p, i) => ({ product_id: productId, path: p.path, width: p.width, height: p.height, position: start + i, created_by: user.id })),
      { onConflict: "organization_id,path", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: friendlyError(error) };
  await syncCover(productId);
  refresh(productId);
  return { ok: true, message: photos.length === 1 ? "Foto guardada." : `${photos.length} fotos guardadas.` };
}

export async function deleteProductPhoto(photoId: string): Promise<ActionResult> {
  await admin();
  if (!z.uuid().safeParse(photoId).success) return { ok: false, error: "Foto no válida." };
  const supabase = await createClient();
  const { data: ph } = await supabase.from("product_photos").select("product_id, path").eq("id", photoId).maybeSingle();
  if (!ph) return { ok: true };
  const { error } = await supabase.from("product_photos").delete().eq("id", photoId);
  if (error) return { ok: false, error: friendlyError(error) };
  await supabase.storage.from("product-photos").remove([ph.path, thumbPath(ph.path)]);
  await syncCover(ph.product_id);
  refresh(ph.product_id);
  return { ok: true, message: "Foto borrada." };
}

/** Nuevo orden (la primera pasa a ser la portada). */
export async function reorderProductPhotos(productId: string, ids: string[]): Promise<ActionResult> {
  await admin();
  const v = z.object({ productId: z.uuid(), ids: z.array(z.uuid()).min(1).max(60) }).safeParse({ productId, ids });
  if (!v.success) return { ok: false, error: "Orden no válido." };
  const supabase = await createClient();
  // Todo el orden de una vez (y la portada) en la base de datos
  const { error } = await supabase.rpc("reorder_product_photos", { p_product_id: productId, p_ids: ids });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh(productId);
  return { ok: true };
}

/** Marca (o desmarca) fotos como ya usadas en una plataforma. */
export async function setPhotosUsed(ids: string[], platform: "vinted" | "wallapop", used: boolean): Promise<ActionResult> {
  await admin();
  const v = z.object({ ids: z.array(z.uuid()).min(1).max(60), platform: z.enum(["vinted", "wallapop"]) }).safeParse({ ids, platform });
  if (!v.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = used
    ? await supabase.from("photo_uses").upsert(ids.map((photo_id) => ({ photo_id, platform })), { onConflict: "photo_id,platform", ignoreDuplicates: true })
    : await supabase.from("photo_uses").delete().in("photo_id", ids).eq("platform", platform);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/productos", "layout");
  return { ok: true, message: used ? `Marcadas como usadas en ${platform === "vinted" ? "Vinted" : "Wallapop"}.` : "Desmarcadas." };
}
