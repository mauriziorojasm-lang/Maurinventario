import "server-only";
import { must } from "./db";
import { signUrls, thumbPath } from "./storage";
import { createClient } from "./supabase/server";

export type GalleryPhoto = {
  id: string;
  url: string;
  /** Miniatura de 320 px (o la foto completa si aún no tiene). */
  thumb: string;
  /** Ruta de la foto, para crearle la miniatura si le falta. */
  path: string;
  needsThumb: boolean;
  width: number | null;
  height: number | null;
  usedOn: ("vinted" | "wallapop")[];
};

/** Fotos de un producto, en orden, con enlace temporal y dónde se han usado. */
export async function loadProductPhotos(productId: string): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  const data = must(
    await supabase
      .from("product_photos")
      .select("id, path, width, height, photo_uses(platform)")
      .eq("product_id", productId)
      .order("position")
      .order("created_at"),
    "las fotos",
  );
  const rows = (data ?? []) as { id: string; path: string; width: number | null; height: number | null; photo_uses: { platform: "vinted" | "wallapop" }[] }[];
  const paths = rows.map((r) => r.path);
  const [full, thumbs] = await Promise.all([signUrls("product-photos", paths), signUrls("product-photos", paths.map(thumbPath))]);
  return rows
    .filter((r) => full.has(r.path))
    .map((r) => {
      const t = thumbs.get(thumbPath(r.path));
      return {
        id: r.id,
        url: full.get(r.path)!,
        thumb: t ?? full.get(r.path)!,
        path: r.path,
        needsThumb: !t,
        width: r.width,
        height: r.height,
        usedOn: r.photo_uses.map((u) => u.platform),
      };
    });
}
