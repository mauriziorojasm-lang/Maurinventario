import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { signPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { SellableVariant } from "@/lib/types";

/**
 * Buscador de productos (GET). A diferencia de una acción del servidor,
 * varias búsquedas pueden ir a la vez y la anterior se cancela al escribir.
 * Los permisos los aplica la base de datos.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.active) return NextResponse.json({ error: "Tu sesión ha caducado. Vuelve a entrar." }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ data: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_sellable_variants", { p_query: q, p_only_in_stock: sp.get("stock") === "1", p_limit: 25 });
  if (error) return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  const rows = (data ?? []) as SellableVariant[];
  const photos = await signPhotos(rows.map((r) => r.photo_path), { thumbs: true });
  return NextResponse.json(
    { data: rows.map((r) => ({ ...r, photo_url: r.photo_path ? (photos.get(r.photo_path) ?? null) : null })) },
    { headers: { "cache-control": "private, no-store" } },
  );
}
