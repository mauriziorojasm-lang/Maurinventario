import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { Badge, Empty, LinkButton, Notice, PageHeader, Pagination, Panel, StockBadge, Table, Td, Th, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { filtersFrom, first, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { money, units } from "@/lib/format";
import { loadCatalogOptions } from "@/lib/options";
import { signedPhotoUrls } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { type SellableVariant, variantDisplay } from "@/lib/types";
import { ProductCards, ProductThumb } from "./product-cards";

export const metadata: Metadata = { title: "Productos" };

type ProductRow = {
  product_id: string;
  product_name: string;
  brand_name: string | null;
  category_name: string | null;
  photo_path: string | null;
  sku: string | null;
  normal_sale_price: number | null;
  variant_count: number;
  stock: number;
  stock_value: number;
  weighted_avg_cost: number | null;
  units_sold: number;
  avg_sale_price: number | null;
  has_missing_data: boolean;
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const isAdmin = user.role === "admin";

  if (!isAdmin) {
    const q = first(sp.search) ?? "";
    const { data } = await supabase.rpc("search_sellable_variants", { p_query: q || null, p_only_in_stock: first(sp.only_in_stock) === "true", p_limit: 200 });
    const rows = (data ?? []) as SellableVariant[];
    const sellerPhotos = await signedPhotoUrls(rows.map((r) => r.photo_path));
    return (
      <>
        <PageHeader title="Productos" description="Stock disponible y precio normal de cada producto." />
        <FilterBar
          basePath="/productos"
          values={{ search: q, only_in_stock: first(sp.only_in_stock) }}
          fields={[
            { type: "text", name: "search", label: "Buscar", placeholder: "Nombre, marca o SKU" },
            { type: "checkbox", name: "only_in_stock", label: "Solo con stock" },
          ]}
        />
        <ProductCards
          items={rows.map((v) => ({
            key: v.variant_id,
            href: `/productos/${v.product_id}`,
            name: variantDisplay(v.product_name, v.variant_name, v.variant_count),
            subtitle: [v.brand_name, v.sku].filter(Boolean).join(" · ") || "—",
            photo: v.photo_path ? sellerPhotos.get(v.photo_path) : undefined,
            stock: v.stock,
            price: v.normal_sale_price,
          }))}
        />
        <Panel padded={false} className={rows.length ? "max-md:hidden" : undefined}>
          {rows.length === 0 ? (
            <Empty title="No hay productos con esa búsqueda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Marca</Th>
                  <Th>SKU</Th>
                  <Th num>Stock</Th>
                  <Th num>Precio</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <Tr key={v.variant_id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <ProductThumb url={v.photo_path ? sellerPhotos.get(v.photo_path) : undefined} size={40} />
                        <Link href={`/productos/${v.product_id}`} className="font-semibold hover:underline">
                          {variantDisplay(v.product_name, v.variant_name, v.variant_count)}
                        </Link>
                      </div>
                    </Td>
                    <Td>{v.brand_name ?? "—"}</Td>
                    <Td>{v.sku ?? "—"}</Td>
                    <Td num>
                      <StockBadge stock={v.stock} />
                    </Td>
                    <Td num>{money(v.normal_sale_price)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </>
    );
  }

  const filters = filtersFrom(sp);
  const missing = first(sp.missing) === "true";
  const { page, from, to, size } = pageFrom(sp, 50);
  const opts = await loadCatalogOptions();
  let q = supabase.from("v_product_inventory").select("*", { count: "exact" });
  if (filters.search) q = q.or(`product_name.ilike.%${filters.search.replace(/[%,()]/g, " ")}%,sku.ilike.%${filters.search.replace(/[%,()]/g, " ")}%`);
  if (filters.category_id) q = q.eq("category_id", filters.category_id);
  if (filters.brand_id) q = q.eq("brand_id", filters.brand_id);
  if (filters.only_in_stock === "true") q = q.gt("stock", 0);
  if (missing) q = q.eq("has_missing_data", true);
  const { data, count, error } = await q.order("stock", { ascending: false }).order("product_name").range(from, to);
  const rows = (data ?? []) as ProductRow[];
  const photos = await signedPhotoUrls(rows.map((r) => r.photo_path));
  const hrefFor = (p: number) => `/productos${toQuery({ ...filters, missing: missing ? "true" : undefined, page: p })}`;

  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo con stock, costes y ventas. Los productos sin unidades aparecen como «Sin stock»."
        actions={
          <LinkButton href="/productos/nuevo" variant="primary">
            Nuevo producto
          </LinkButton>
        }
      />
      <FilterBar
        basePath="/productos"
        values={{ ...filters, missing: missing ? "true" : undefined }}
        fields={[
          { type: "text", name: "search", label: "Buscar", placeholder: "Nombre o SKU" },
          { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: opts.categories.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "brand_id", label: "Marca", empty: "Todas", options: opts.brands.map((c) => ({ value: c.id, label: c.name })) },
          { type: "checkbox", name: "only_in_stock", label: "Solo con stock" },
          { type: "checkbox", name: "missing", label: "Con datos pendientes" },
        ]}
        extra={<ExportLinks type="inventario" filters={filters} />}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      <ProductCards
        items={rows.map((r) => ({
          key: r.product_id,
          href: `/productos/${r.product_id}`,
          name: r.product_name,
          subtitle: [r.brand_name ?? "Marca pendiente", r.category_name, r.variant_count > 1 ? `${r.variant_count} variantes` : null]
            .filter(Boolean)
            .join(" · "),
          photo: r.photo_path ? photos.get(r.photo_path) : undefined,
          stock: r.stock,
          price: r.normal_sale_price,
          extra: [
            { label: "Coste", value: money(r.weighted_avg_cost) },
            { label: "Vendidas", value: units(r.units_sold) },
          ],
          warn: r.has_missing_data ? "Datos pendientes" : null,
        }))}
      />
      <Panel padded={false} className={rows.length ? "max-md:mt-3 max-md:border-0 max-md:bg-transparent max-md:shadow-none" : undefined}>
        {rows.length === 0 ? (
          <Empty title="No hay productos con estos filtros" action={<LinkButton href="/productos/nuevo">Crear producto</LinkButton>} />
        ) : (
          <Table className="max-md:hidden">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Categoría</Th>
                <Th num>Stock</Th>
                <Th num>Coste medio</Th>
                <Th num>Precio normal</Th>
                <Th num>Precio medio venta</Th>
                <Th num>Vendidas</Th>
                <Th num>Valor almacén</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.product_id} muted={r.stock <= 0}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProductThumb url={r.photo_path ? photos.get(r.photo_path) : undefined} size={40} />
                      <div className="min-w-0">
                        <Link href={`/productos/${r.product_id}`} className="font-semibold text-ink hover:underline">
                          {r.product_name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {[r.brand_name ?? "Marca pendiente", r.sku ?? "Sin SKU", r.variant_count > 1 ? `${r.variant_count} variantes` : null]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.category_name ?? <Badge tone="warn">Pendiente</Badge>}</Td>
                  <Td num>
                    <StockBadge stock={r.stock} />
                  </Td>
                  <Td num>{money(r.weighted_avg_cost)}</Td>
                  <Td num>{r.normal_sale_price !== null ? money(r.normal_sale_price) : <span className="text-faint">—</span>}</Td>
                  <Td num>{money(r.avg_sale_price)}</Td>
                  <Td num>{units(r.units_sold)}</Td>
                  <Td num>{money(r.stock_value)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} size={size} total={count ?? 0} hrefFor={hrefFor} />
      </Panel>
    </>
  );
}
