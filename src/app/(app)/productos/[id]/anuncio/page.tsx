import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { loadProductPhotos } from "@/lib/product-photos";
import { createClient } from "@/lib/supabase/server";
import { isGeneratorConfigured } from "../../../descripciones/actions";
import { ListingStudio, type ListingDraft, type PriceHistory } from "./listing-studio";

export const metadata: Metadata = { title: "Preparar anuncio" };
export const maxDuration = 60;

export default async function PrepareListing({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("anuncios");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product }, { data: inv }, photos, { data: listings }, { data: history }, aiReady] = await Promise.all([
    supabase.from("products").select("id, name, normal_sale_price, deleted_at").eq("id", id).maybeSingle(),
    supabase.from("v_product_inventory").select("stock, weighted_avg_cost").eq("product_id", id).maybeSingle(),
    loadProductPhotos(id),
    supabase.from("listings").select("platform, status, title, description, price, url, published_at, removed_at").eq("product_id", id),
    supabase.rpc("product_price_history", { p_product_id: id }),
    isGeneratorConfigured(),
  ]);
  if (!product || product.deleted_at) notFound();

  const byPlatform = Object.fromEntries((listings ?? []).map((l) => [l.platform, l])) as Record<string, ListingDraft | undefined>;
  return (
    <>
      <PageHeader
        title="Preparar anuncio"
        description={product.name}
        back={{ href: `/productos/${id}`, label: "Volver al producto" }}
      />
      <ListingStudio
        productId={id}
        name={product.name}
        stock={Number(inv?.stock ?? 0)}
        avgCost={inv?.weighted_avg_cost !== null && inv?.weighted_avg_cost !== undefined ? Number(inv.weighted_avg_cost) : null}
        normalPrice={product.normal_sale_price !== null ? Number(product.normal_sale_price) : null}
        photos={photos}
        listings={{ vinted: byPlatform.vinted ?? null, wallapop: byPlatform.wallapop ?? null }}
        history={(history ?? null) as PriceHistory | null}
        aiReady={aiReady}
      />
    </>
  );
}
