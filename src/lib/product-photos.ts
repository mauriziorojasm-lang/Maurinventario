import "server-only";
import { signedPhotoUrls } from "./photos";
import { createClient } from "./supabase/server";

export type GalleryPhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  usedOn: ("vinted" | "wallapop")[];
};

/** Fotos de un producto, en orden, con enlace temporal y dónde se han usado. */
export async function loadProductPhotos(productId: string): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_photos")
    .select("id, path, width, height, photo_uses(platform)")
    .eq("product_id", productId)
    .order("position")
    .order("created_at");
  const rows = (data ?? []) as { id: string; path: string; width: number | null; height: number | null; photo_uses: { platform: "vinted" | "wallapop" }[] }[];
  const urls = await signedPhotoUrls(rows.map((r) => r.path));
  return rows
    .filter((r) => urls.has(r.path))
    .map((r) => ({ id: r.id, url: urls.get(r.path)!, width: r.width, height: r.height, usedOn: r.photo_uses.map((u) => u.platform) }));
}
