import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListEditor } from "./list-editor";

export const metadata: Metadata = { title: "Listas" };

export default async function SettingsPage() {
  await requirePerm("configuracion");
  const supabase = await createClient();
  const [platforms, carriers, mobiles, accounts, categories, brands, products] = await Promise.all([
    supabase.from("platforms").select("id, name, requires_shipping, active").order("sort_order").order("name"),
    supabase.from("carriers").select("id, name, active").order("name"),
    supabase.from("mobile_devices").select("id, number, name, active").order("number"),
    supabase.from("mobile_device_accounts").select("mobile_device_id, email, phone"),
    supabase.from("categories").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("brands").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("products").select("category_id, brand_id").is("deleted_at", null).limit(10000),
  ]);
  const acc = new Map((accounts.data ?? []).map((a) => [a.mobile_device_id, a]));
  const usesCat = new Map<string, number>();
  const usesBrand = new Map<string, number>();
  for (const p of products.data ?? []) {
    if (p.category_id) usesCat.set(p.category_id, (usesCat.get(p.category_id) ?? 0) + 1);
    if (p.brand_id) usesBrand.set(p.brand_id, (usesBrand.get(p.brand_id) ?? 0) + 1);
  }
  return (
    <>
      <PageHeader title="Listas" back={{ href: "/configuracion", label: "Ajustes" }} description="Las opciones que aparecen en los desplegables de ventas y productos." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Plataformas de venta" description="«Con envío» muestra transportista, etiqueta y estado del envío al vender." padded={false}>
          <ListEditor list="platforms" kind="platform" rows={platforms.data ?? []} />
        </Panel>
        <Panel title="Empresas de transporte" padded={false}>
          <ListEditor list="carriers" kind="active" rows={carriers.data ?? []} />
        </Panel>
        <Panel title="Móviles" description="El correo y el teléfono solo los ven los administradores." padded={false} className="lg:col-span-2">
          <ListEditor
            list="mobile_devices"
            kind="mobile"
            rows={(mobiles.data ?? []).map((m) => ({ ...m, email: acc.get(m.id)?.email ?? null, phone: acc.get(m.id)?.phone ?? null }))}
          />
        </Panel>
        <Panel title="Categorías" padded={false}>
          <ListEditor list="categories" kind="simple" rows={(categories.data ?? []).map((c) => ({ ...c, uses: usesCat.get(c.id) ?? 0 }))} />
        </Panel>
        <Panel title="Marcas" padded={false}>
          <ListEditor list="brands" kind="simple" rows={(brands.data ?? []).map((c) => ({ ...c, uses: usesBrand.get(c.id) ?? 0 }))} />
        </Panel>
      </div>
    </>
  );
}
