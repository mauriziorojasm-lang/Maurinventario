import type { Metadata } from "next";
import { ExportLinks, FilterBar, type FilterField } from "@/components/filter-bar";
import { Empty, Figures, Notice, PageHeader, Pagination, Panel, Table, Tabs, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { filtersFrom, first, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { date, money, percent, units } from "@/lib/format";
import { loadCatalogOptions, loadSaleOptions, loadSuppliers } from "@/lib/options";
import { REPORTS, type Column, type ReportType } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Informes" };

function fmt(c: Column, r: Record<string, unknown>) {
  const v = c.value(r);
  if (v === null || v === undefined || v === "") return "—";
  switch (c.kind) {
    case "date":
      return date(String(v));
    case "money":
      return money(Number(v));
    case "money4":
      return money(Number(v), { precise: true });
    case "int":
      return units(Number(v));
    case "pct":
      return percent(Number(v));
    default:
      return String(v);
  }
}

const TABS: { key: ReportType; label: string }[] = [
  { key: "ventas", label: "Ventas" },
  { key: "inventario", label: "Inventario" },
  { key: "compras", label: "Compras" },
  { key: "responsables", label: "Responsables" },
  { key: "salidas", label: "Salidas sin venta" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === first(sp.tab))?.key ?? "ventas") as ReportType;
  const filters = filtersFrom(sp);
  const { page, from, to, size } = pageFrom(sp, 100);
  const report = REPORTS[tab];
  const supabase = await createClient();
  const [sale, cat, suppliers, { data: products }] = await Promise.all([
    loadSaleOptions(),
    loadCatalogOptions(),
    loadSuppliers(),
    supabase.from("products").select("id, name").is("deleted_at", null).order("name").limit(2000),
  ]);
  const productOpts = (products ?? []).map((p) => ({ value: p.id, label: p.name }));
  const catOpts = cat.categories.map((c) => ({ value: c.id, label: c.name }));

  const fieldsByTab: Record<ReportType, FilterField[]> = {
    ventas: [
      { type: "date", name: "from", label: "Desde" },
      { type: "date", name: "to", label: "Hasta" },
      { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
      { type: "select", name: "product_id", label: "Producto", options: productOpts },
      { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: catOpts },
      { type: "select", name: "responsible_id", label: "Responsable", options: sale.responsibles.map((r) => ({ value: r.id, label: r.name })) },
      { type: "select", name: "platform_id", label: "Plataforma", empty: "Todas", options: sale.platforms.map((p) => ({ value: p.id, label: p.name })) },
    ],
    inventario: [
      { type: "text", name: "search", label: "Producto", placeholder: "Nombre o SKU" },
      { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: catOpts },
      { type: "select", name: "brand_id", label: "Marca", empty: "Todas", options: cat.brands.map((b) => ({ value: b.id, label: b.name })) },
      { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
      { type: "checkbox", name: "only_in_stock", label: "Solo con stock" },
    ],
    compras: [
      { type: "date", name: "from", label: "Desde" },
      { type: "date", name: "to", label: "Hasta" },
      { type: "number", name: "purchase_order_number", label: "Nº pedido" },
      { type: "select", name: "supplier_id", label: "Proveedor", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
      { type: "select", name: "product_id", label: "Producto", options: productOpts },
    ],
    responsables: [
      { type: "date", name: "from", label: "Desde" },
      { type: "date", name: "to", label: "Hasta" },
      { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
      { type: "select", name: "product_id", label: "Producto", options: productOpts },
      { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: catOpts },
    ],
    salidas: [],
  };

  const query =
    tab === "salidas"
      ? supabase.from("v_stock_exits").select("*", { count: "exact" }).eq("status", "activa").order("exit_date", { ascending: false }).range(from, to)
      : supabase.rpc(report.rpc, { p_filters: filters }, { count: "exact" }).range(from, to);
  const [{ data, count, error }, summary] = await Promise.all([
    query,
    tab === "ventas"
      ? supabase.rpc("report_sales_summary", { p_filters: filters })
      : tab === "inventario"
        ? supabase.rpc("report_inventory_summary", { p_filters: filters })
        : Promise.resolve({ data: null }),
  ]);
  const rows = (data ?? []) as Record<string, unknown>[];
  const s = summary.data as Record<string, number> | null;

  return (
    <>
      <PageHeader title="Informes" description="Todos se pueden exportar a Excel o CSV con los filtros aplicados." />
      <Tabs current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/informes?tab=${t.key}` }))} />
      <FilterBar
        basePath={`/informes?tab=${tab}`}
        values={filters}
        fields={[...fieldsByTab[tab]]}
        extra={
          <>
            <input type="hidden" name="tab" value={tab} />
            <ExportLinks type={tab} filters={filters} />
          </>
        }
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      {tab === "ventas" && s && (
        <Figures
          className="mb-4"
          items={[
            { label: "Pedidos", value: units(s.orders) },
            { label: "Unidades", value: units(s.units) },
            { label: "Facturación", value: money(s.net_amount) },
            { label: "Coste (de cada lote)", value: money(s.cost_amount) },
            { label: "Beneficio", value: money(s.profit), tone: s.profit < 0 ? "bad" : "good" },
          ]}
        />
      )}
      {tab === "inventario" && s && (
        <Figures
          className="mb-4"
          items={[
            { label: "Unidades", value: units(s.units) },
            { label: "Valor almacén", value: money(s.stock_value) },
            { label: "Valor potencial", value: money(s.potential_value) },
            { label: "Beneficio potencial", value: money(s.potential_profit), tone: "good" },
          ]}
        />
      )}
      <Panel padded={false}>
        {rows.length === 0 ? (
          <Empty title="No hay datos con estos filtros" />
        ) : (
          <Table>
            <thead>
              <tr>
                {report.columns.map((c) => (
                  <Th key={c.key} num={c.kind !== "text" && c.kind !== "date"}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Tr key={i}>
                  {report.columns.map((c) => (
                    <Td key={c.key} num={c.kind !== "text" && c.kind !== "date"} className={c.kind === "date" ? "num" : undefined}>
                      {fmt(c, r)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} size={size} total={count ?? 0} hrefFor={(p) => `/informes${toQuery({ ...filters, tab, page: p })}`} />
      </Panel>
    </>
  );
}
