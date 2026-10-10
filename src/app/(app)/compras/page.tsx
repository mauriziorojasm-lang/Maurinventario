import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { POStatus } from "@/components/badges";
import { Badge, Empty, LinkButton, LotTag, Notice, PageHeader, Pagination, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { filtersFrom, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { PO_STATUS, date, money, units } from "@/lib/format";
import { loadSuppliers } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compras" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePerm("compras");
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  const { page, from, to, size } = pageFrom(sp, 50);
  const supabase = await createClient();
  const suppliers = await loadSuppliers();
  let q = supabase.from("v_purchase_orders").select("*", { count: "exact" });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.supplier_id) q = q.eq("supplier_id", filters.supplier_id);
  if (filters.from) q = q.gte("order_date", filters.from);
  if (filters.to) q = q.lte("order_date", filters.to);
  if (filters.purchase_order_number) q = q.eq("order_number", Number(filters.purchase_order_number) || 0);
  const { data, count, error } = await q.order("order_number", { ascending: false }).range(from, to);

  return (
    <>
      <PageHeader
        title="Compras"
        description="Pedidos de compra. Cada línea recibida se convierte en un lote con su coste real."
        actions={<LinkButton href="/compras/nuevo" variant="primary">Nuevo pedido</LinkButton>}
      />
      <FilterBar
        basePath="/compras"
        values={filters}
        fields={[
          { type: "number", name: "purchase_order_number", label: "Nº pedido" },
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
          { type: "select", name: "supplier_id", label: "Proveedor", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
          { type: "select", name: "status", label: "Estado", options: Object.entries(PO_STATUS).map(([value, label]) => ({ value, label })) },
        ]}
        extra={<ExportLinks type="compras" filters={filters} />}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      <Panel padded={false}>
        {(data ?? []).length === 0 ? (
          <Empty title="No hay pedidos de compra" action={<LinkButton href="/compras/nuevo">Crear el primero</LinkButton>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Fecha</Th>
                <Th>Proveedor</Th>
                <Th>Estado</Th>
                <Th num>Líneas</Th>
                <Th num>Uds. pedidas</Th>
                <Th num>Uds. recibidas</Th>
                <Th num>Mercancía</Th>
                <Th num>Costes extra</Th>
                <Th num>Coste total</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((po) => (
                <Tr key={po.id} muted={po.status === "cancelado"}>
                  <Td>
                    <Link href={`/compras/${po.id}`}>
                      <LotTag label={`Pedido #${po.order_number}`} />
                    </Link>
                  </Td>
                  <Td className="num">{date(po.order_date)}</Td>
                  <Td>{po.supplier_is_placeholder ? <Badge tone="warn">Proveedor pendiente</Badge> : po.supplier_name}</Td>
                  <Td>
                    <POStatus status={po.status} />
                  </Td>
                  <Td num>{po.line_count}</Td>
                  <Td num>{units(po.units_ordered)}</Td>
                  <Td num>{po.status === "recibido" ? units(po.units_received) : "—"}</Td>
                  <Td num>{money(po.merchandise_cost)}</Td>
                  <Td num>{money(po.extra_costs)}</Td>
                  <Td num className="font-semibold">
                    {money(po.total_cost)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} size={size} total={count ?? 0} hrefFor={(p) => `/compras${toQuery({ ...filters, page: p })}`} />
      </Panel>
    </>
  );
}
