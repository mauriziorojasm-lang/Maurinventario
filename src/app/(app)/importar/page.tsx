import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import type { ImportExisting } from "@/lib/import/plan";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar Excel" };

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default async function ImportPage() {
  await requirePerm("importar");
  const supabase = await createClient();
  const [products, pos, sales, exits, resp, mobiles, platforms, carriers, batches] = await Promise.all([
    fetchAll<{ name: string }>((a, b) => supabase.from("products").select("name").is("deleted_at", null).range(a, b)),
    fetchAll<{ order_number: number }>((a, b) => supabase.from("purchase_orders").select("order_number").range(a, b)),
    fetchAll<{ import_fingerprint: string }>((a, b) => supabase.from("sales").select("import_fingerprint").not("import_fingerprint", "is", null).range(a, b)),
    fetchAll<{ import_fingerprint: string }>((a, b) => supabase.from("stock_exits").select("import_fingerprint").not("import_fingerprint", "is", null).range(a, b)),
    supabase.from("responsibles").select("name").is("deleted_at", null),
    supabase.from("mobile_devices").select("number"),
    supabase.from("platforms").select("name, requires_shipping"),
    supabase.from("carriers").select("name"),
    supabase.from("import_batches").select("id, file_name, created_at, summary").order("created_at", { ascending: false }).limit(10),
  ]);
  const existing: ImportExisting = {
    productNames: products.map((p) => p.name),
    purchaseOrderNumbers: pos.map((p) => p.order_number),
    saleFingerprints: sales.map((s) => s.import_fingerprint),
    exitFingerprints: exits.map((s) => s.import_fingerprint),
    responsibles: (resp.data ?? []).map((r) => r.name),
    mobileNumbers: (mobiles.data ?? []).map((m) => m.number),
    platforms: (platforms.data ?? []) as ImportExisting["platforms"],
    carriers: (carriers.data ?? []).map((c) => c.name),
  };
  return (
    <>
      <PageHeader
        title="Importar Excel"
        description="Lee tu Excel, relaciona sus columnas con MaurInventario, revisa los avisos y simula antes de guardar. No se sobrescribe nada que ya exista."
      />
      <ImportWizard existing={existing} previous={(batches.data ?? []) as { id: string; file_name: string; created_at: string; summary: Record<string, unknown> }[]} />
    </>
  );
}
