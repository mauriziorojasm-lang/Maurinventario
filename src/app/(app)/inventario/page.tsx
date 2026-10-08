import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { Empty, Figures, LinkButton, LotTag, Notice, PageHeader, Pagination, Panel, StockBadge, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { filtersFrom, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { money, units } from "@/lib/format";
import { loadCatalogOptions } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";

export const metadata: Metadata = { title: "Inventario" };

type Row = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  variant_count: number;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  stock: number;
  weighted_avg_cost: number | null;
  stock_value: number;
  normal_sale_price: number | null;
  avg_sale_price: number | null;
  potential_unit_price: number | null;
  potential_is_estimated: boolean;
  potential_value: number | null;
  potential_profit: number | null;
  units_sold: number;
  lot_labels: string[];
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  const { page, from, to, size } = pageFrom(sp, 60);
  const supabase = await createClient();
  const [opts, list, sum] = await Promise.all([
    loadCatalogOptions(),
    supabase.rpc("report_inventory", { p_filters: filters }, { count: "exact" }).range(from, to),
    supabase.rpc("report_inventory_summary", { p_filters: filters }),
  ]);
  const rows = (list.data ?? []) as Row[];
  const s = sum.data as { units: number; products_with_stock: number; stock_value: number; potential_value: number; potential_profit: number; weighted_avg_cost: number | null; unpriced_units: number; estimated_units: number } | null;

  return (
    <>
      <PageHeader
        title="Inventario y lotes"
        description="El valor del almacén usa el coste medio ponderado de las unidades que quedan. El beneficio de cada venta usa el coste real de su lote."
        actions={<LinkButton href="/salidas">Ajustes y salidas sin venta</LinkButton>}
      />
      <FilterBar
        basePath="/inventario"
        values={filters}
        fields={[
          { type: "text", name: "search", label: "Producto o variante", placeholder: "Nombre o SKU" },
          { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: opts.categories.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "brand_id", label: "Marca", empty: "Todas", options: opts.brands.map((c) => ({ value: c.id, label: c.name })) },
          { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
          { type: "checkbox", name: "only_in_stock", label: "Solo con stock" },
        ]}
        extra={<ExportLinks type="inventario" filters={filters} />}
      />
      {list.error && <Notice tone="bad">{list.error.message}</Notice>}
      {s && (
        <Figures
          className="mb-4"
          items={[
            { label: "Unidades", value: units(s.units), note: `${units(s.products_with_stock)} productos con stock` },
            { label: "Coste medio ponderado", value: money(s.weighted_avg_cost, { precise: true }) },
            { label: "Valor del almacén", value: money(s.stock_value) },
            {
              label: "Valor potencial de venta",
              value: money(s.potential_value),
              note: s.estimated_units || s.unpriced_units ? `${s.estimated_units} uds. con precio medio, ${s.unpriced_units} sin precio` : undefined,
            },
            { label: "Beneficio potencial", value: money(s.potential_profit), tone: "good" },
          ]}
        />
      )}
      <Panel padded={false}>
        {rows.length === 0 ? (
          <Empty title="No hay productos con estos filtros" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>SKU</Th>
                <Th num>Stock</Th>
                <Th num>Coste medio</Th>
                <Th num>Valor almacén</Th>
                <Th num>Precio venta</Th>
                <Th num>Valor potencial</Th>
                <Th num>Beneficio pot.</Th>
                <Th num>Vendidas</Th>
                <Th>Lotes con stock</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.variant_id} muted={r.stock <= 0}>
                  <Td>
                    <Link href={`/productos/${r.product_id}`} className="font-semibold text-ink hover:underline">
                      {variantDisplay(r.product_name, r.variant_name, r.variant_count)}
                    </Link>
                    <span className="block text-xs text-muted">{[r.brand_name, r.category_name].filter(Boolean).join(", ")}</span>
                  </Td>
                  <Td>{r.sku ?? "—"}</Td>
                  <Td num>
                    <StockBadge stock={r.stock} />
                  </Td>
                  <Td num>{money(r.weighted_avg_cost, { precise: true })}</Td>
                  <Td num>{money(r.stock_value)}</Td>
                  <Td num>
                    {r.potential_unit_price !== null ? money(r.potential_unit_price) : <span className="text-faint">Sin precio</span>}
                    {r.potential_is_estimated && <span className="block text-xs text-muted">precio medio</span>}
                  </Td>
                  <Td num>{money(r.potential_value)}</Td>
                  <Td num>{money(r.potential_profit)}</Td>
                  <Td num>{units(r.units_sold)}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {r.lot_labels.map((l, i) => (
                        <LotTag key={i} label={l} />
                      ))}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} size={size} total={list.count ?? 0} hrefFor={(p) => `/inventario${toQuery({ ...filters, page: p })}`} />
      </Panel>
    </>
  );
}
