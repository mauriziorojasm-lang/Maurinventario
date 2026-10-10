import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { Badge, Empty, LinkButton, Notice, PageHeader, Pagination, Panel, StockBadge, Table, Td, Th, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { filtersFrom, first, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { money, units } from "@/lib/format";
import { loadCatalogOptions } from "@/lib/options";
import { must } from "@/lib/db";
import { PRODUCT_COLUMNS, PRODUCT_SORTS, type ProductSort } from "@/lib/preferences";
import { loadPrefs } from "@/lib/user-prefs";
import { signPhotos } from "@/lib/storage";
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
  // Lista completa (valor de almacén, costes) con «costes»; crear productos con «productos»
  const isAdmin = can(user, "costes");
  const canCreate = can(user, "catalogo");

  if (!isAdmin) {
    const q = first(sp.search) ?? "";
    const data = must(await supabase.rpc("search_sellable_variants", { p_query: q || null, p_only_in_stock: first(sp.only_in_stock) === "true", p_limit: 200 }), "los productos");
    const rows = (data ?? []) as SellableVariant[];
    const sellerPhotos = await signPhotos(rows.map((r) => r.photo_path), { thumbs: true });
    return (
      <>
        <PageHeader
          title="Productos"
          description="Stock disponible y precio normal de cada producto."
          actions={
            canCreate ? (
              <LinkButton href="/productos/nuevo" variant="primary">
                Nuevo producto
              </LinkButton>
            ) : undefined
          }
        />
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
        <Panel padded={false} className={rows.length ? "max-lg:hidden" : undefined}>
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
  // Preferencias de la tabla (Ajustes → Tablas): columnas, orden y filas por página
  const tp = (await loadPrefs()).tables.productos;
  const low = Number(first(sp.bajo));
  const lowStock = Number.isInteger(low) && low >= 1 && low <= 1000 ? low : null;
  const sortKey: ProductSort = Object.hasOwn(PRODUCT_SORTS, first(sp.orden) ?? "") ? (first(sp.orden) as ProductSort) : tp.sort;
  const { page, from, to, size } = pageFrom(sp, tp.pageSize);
  let q = supabase.from("v_product_inventory").select("*", { count: "exact" });
  if (filters.search) q = q.or(`product_name.ilike.%${filters.search.replace(/[%,()]/g, " ")}%,sku.ilike.%${filters.search.replace(/[%,()]/g, " ")}%`);
  if (filters.category_id) q = q.eq("category_id", filters.category_id);
  if (filters.brand_id) q = q.eq("brand_id", filters.brand_id);
  if (filters.only_in_stock === "true") q = q.gt("stock", 0);
  if (missing) q = q.eq("has_missing_data", true);
  if (lowStock) q = q.gte("stock", 1).lte("stock", lowStock);
  q =
    sortKey === "nombre"
      ? q.order("product_name")
      : sortKey === "recientes"
        ? q.order("created_at", { ascending: false })
        : sortKey === "valor"
          ? q.order("stock_value", { ascending: false, nullsFirst: false })
          : sortKey === "vendidas"
            ? q.order("units_sold", { ascending: false, nullsFirst: false })
            : q.order("stock", { ascending: false });
  const [{ data, count, error }, opts] = await Promise.all([q.order("product_name").order("product_id").range(from, to), loadCatalogOptions()]);
  const cols = tp.columns.filter((c) => c.visible).map((c) => c.key);
  const rows = (data ?? []) as ProductRow[];
  const photos = await signPhotos(rows.map((r) => r.photo_path), { thumbs: true });
  const hrefFor = (p: number) =>
    `/productos${toQuery({ ...filters, missing: missing ? "true" : undefined, bajo: lowStock ? String(lowStock) : undefined, orden: first(sp.orden), page: p })}`;

  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo con stock, costes y ventas. Los productos sin unidades aparecen como «Sin stock»."
        actions={
          canCreate ? (
            <LinkButton href="/productos/nuevo" variant="primary">
              Nuevo producto
            </LinkButton>
          ) : undefined
        }
      />
      <FilterBar
        basePath="/productos"
        values={{ ...filters, missing: missing ? "true" : undefined, orden: first(sp.orden) }}
        fields={[
          { type: "text", name: "search", label: "Buscar", placeholder: "Nombre o SKU" },
          { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: opts.categories.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "brand_id", label: "Marca", empty: "Todas", options: opts.brands.map((c) => ({ value: c.id, label: c.name })) },
          { type: "checkbox", name: "only_in_stock", label: "Solo con stock" },
          { type: "checkbox", name: "missing", label: "Con datos pendientes" },
          { type: "select", name: "orden", label: "Ordenar", empty: PRODUCT_SORTS[tp.sort], options: (Object.keys(PRODUCT_SORTS) as ProductSort[]).filter((k) => k !== tp.sort).map((k) => ({ value: k, label: PRODUCT_SORTS[k] })) },
        ]}
        extra={<ExportLinks type="inventario" filters={filters} />}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      {lowStock && (
        <Notice tone="info" className="mb-3">
          Mostrando productos con stock bajo (entre 1 y {lowStock} {lowStock === 1 ? "unidad" : "unidades"}).{" "}
          <Link href="/productos">Ver todos</Link>
        </Notice>
      )}
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
      <Panel padded={false} className={rows.length ? "max-lg:mt-3 max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none" : undefined}>
        {rows.length === 0 ? (
          <Empty title="No hay productos con estos filtros" action={canCreate ? <LinkButton href="/productos/nuevo">Crear producto</LinkButton> : undefined} />
        ) : (
          <Table className="max-lg:hidden">
            <thead>
              <tr>
                {cols.map((c) => (
                  <Th key={c} num={c !== "producto" && c !== "categoria"}>
                    {PRODUCT_COLUMNS[c]}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.product_id} muted={r.stock <= 0}>
                  {cols.map((c) => {
                    switch (c) {
                      case "producto":
                        return (
                          <Td key={c}>
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
                        );
                      case "categoria":
                        return <Td key={c}>{r.category_name ?? <Badge tone="warn">Pendiente</Badge>}</Td>;
                      case "stock":
                        return (
                          <Td key={c} num>
                            <StockBadge stock={r.stock} />
                          </Td>
                        );
                      case "coste":
                        return <Td key={c} num>{money(r.weighted_avg_cost)}</Td>;
                      case "precio":
                        return <Td key={c} num>{r.normal_sale_price !== null ? money(r.normal_sale_price) : <span className="text-faint">—</span>}</Td>;
                      case "precio_medio":
                        return <Td key={c} num>{money(r.avg_sale_price)}</Td>;
                      case "vendidas":
                        return <Td key={c} num>{units(r.units_sold)}</Td>;
                      case "valor":
                        return <Td key={c} num>{money(r.stock_value)}</Td>;
                    }
                  })}
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
