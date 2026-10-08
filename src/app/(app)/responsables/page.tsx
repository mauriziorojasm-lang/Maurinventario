import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { Badge, Empty, LotTag, Notice, PageHeader, Pagination, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { filtersFrom, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { date, money, percent, units } from "@/lib/format";
import { loadCatalogOptions } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { type SaleLine, variantDisplay } from "@/lib/types";
import { ResponsibleButton } from "./responsible-form";

export const metadata: Metadata = { title: "Responsables" };

type Perf = { responsible_id: string; responsible_name: string; active: boolean; units: number; orders: number; revenue: number; avg_ticket: number; revenue_pct: number; profit: number; ranking: number };

export default async function ResponsiblesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  const { page, from, to, size } = pageFrom(sp, 50);
  const supabase = await createClient();
  const hasFilters = Object.keys(filters).length > 0;
  const [{ data: perf, error }, { data: resp }, { data: profiles }, { data: products }, cat, lines] = await Promise.all([
    supabase.rpc("report_responsibles", { p_filters: filters }),
    supabase.from("responsibles").select("id, name, email, active, is_partner, profile_id").is("deleted_at", null).order("name"),
    supabase.from("profiles").select("id, email, role, active").order("email"),
    supabase.from("products").select("id, name").is("deleted_at", null).order("name").limit(2000),
    loadCatalogOptions(),
    hasFilters ? supabase.rpc("report_sale_lines", { p_filters: filters }, { count: "exact" }).range(from, to) : Promise.resolve({ data: null, count: 0 }),
  ]);
  const rows = (perf ?? []) as Perf[];
  const linked = new Set((resp ?? []).map((r) => r.profile_id).filter(Boolean));
  const users = (profiles ?? []).map((p) => ({ id: p.id, email: p.email, linked: linked.has(p.id) }));
  const respById = new Map((resp ?? []).map((r) => [r.id, r]));
  const userEmail = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const saleLines = (lines.data ?? []) as SaleLine[];

  return (
    <>
      <PageHeader
        title="Responsables"
        description="Rendimiento de cada vendedor. Los filtros se combinan; sin fechas se muestra todo el histórico."
        actions={<ResponsibleButton users={users} />}
      />
      <FilterBar
        basePath="/responsables"
        values={filters}
        fields={[
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
          { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
          { type: "select", name: "product_id", label: "Producto", options: (products ?? []).map((p) => ({ value: p.id, label: p.name })) },
          { type: "select", name: "category_id", label: "Categoría", empty: "Todas", options: cat.categories.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "responsible_id", label: "Responsable", options: (resp ?? []).map((r) => ({ value: r.id, label: r.name })) },
        ]}
        extra={<ExportLinks type="responsables" filters={filters} />}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      <Panel title="Ranking" padded={false}>
        {rows.length === 0 ? (
          <Empty title="Aún no hay responsables" action={<ResponsibleButton users={users} />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th num>#</Th>
                <Th>Responsable</Th>
                <Th>Usuario</Th>
                <Th>Estado</Th>
                <Th num>Unidades</Th>
                <Th num>Pedidos</Th>
                <Th num>Facturación</Th>
                <Th num>Ticket medio</Th>
                <Th num>% ventas</Th>
                <Th num>Beneficio</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const full = respById.get(r.responsible_id);
                return (
                  <Tr key={r.responsible_id} muted={!r.active}>
                    <Td num className="font-bold">
                      {r.orders > 0 ? r.ranking : "—"}
                    </Td>
                    <Td className="font-semibold">
                      {r.responsible_name}
                      {full?.is_partner && <span className="ml-2 align-middle"><Badge tone="info">Socio</Badge></span>}
                    </Td>
                    <Td>{full?.profile_id ? userEmail.get(full.profile_id) : <span className="text-muted">Sin usuario</span>}</Td>
                    <Td>{r.active ? <Badge tone="good">Activo</Badge> : <Badge>Inactivo</Badge>}</Td>
                    <Td num>{units(r.units)}</Td>
                    <Td num>{units(r.orders)}</Td>
                    <Td num>{money(r.revenue)}</Td>
                    <Td num>{money(r.avg_ticket)}</Td>
                    <Td num>{percent(r.revenue_pct)}</Td>
                    <Td num>{money(r.profit)}</Td>
                    <Td>
                      {full && (
                        <ResponsibleButton
                          users={users}
                          initial={{ id: full.id, name: full.name, email: full.email, active: full.active, is_partner: full.is_partner, profile_id: full.profile_id }}
                        />
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      {hasFilters && (
        <Panel title="Ventas incluidas" description="Las líneas de venta que cumplen los filtros." className="mt-5" padded={false}>
          {saleLines.length === 0 ? (
            <Empty title="Ninguna venta cumple estos filtros" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Venta</Th>
                  <Th>Producto</Th>
                  <Th>Lote</Th>
                  <Th>Responsable</Th>
                  <Th num>Uds.</Th>
                  <Th num>Importe</Th>
                  <Th num>Beneficio</Th>
                </tr>
              </thead>
              <tbody>
                {saleLines.map((l) => (
                  <Tr key={l.sale_item_id}>
                    <Td className="num">{date(l.sale_date)}</Td>
                    <Td>
                      <Link href={`/ventas/${l.sale_id}`} className="whitespace-nowrap font-semibold text-ledger hover:underline">
                        {l.sale_number}
                      </Link>
                    </Td>
                    <Td>{variantDisplay(l.product_name, l.variant_name)}</Td>
                    <Td>
                      <LotTag label={l.lot_label} />
                    </Td>
                    <Td>{l.responsible_name}</Td>
                    <Td num>{l.net_quantity}</Td>
                    <Td num>{money(l.net_amount)}</Td>
                    <Td num>{money(l.profit)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={page} size={size} total={lines.count ?? 0} hrefFor={(p) => `/responsables${toQuery({ ...filters, page: p })}`} />
        </Panel>
      )}
    </>
  );
}
