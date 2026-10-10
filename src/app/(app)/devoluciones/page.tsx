import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Empty, Figures, LinkButton, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { filtersFrom, type SearchParams } from "@/lib/filters";
import { date, money, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { must } from "@/lib/db";

export const metadata: Metadata = { title: "Devoluciones" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const filters = filtersFrom(await searchParams);
  const supabase = await createClient();
  let q = supabase.from("v_returns").select("*");
  if (filters.from) q = q.gte("return_date", filters.from);
  if (filters.to) q = q.lte("return_date", filters.to);
  const data = must(await q.order("return_date", { ascending: false }).limit(500), "las devoluciones");
  const rows = data ?? [];
  const refunded = rows.reduce((a, r) => a + Number(r.refund_amount), 0);
  const lost = rows.reduce((a, r) => a + Number(r.lost_cost), 0);
  return (
    <>
      <PageHeader
        title="Devoluciones"
        description="Productos devueltos y reembolsos de Vinted/Wallapop. Para registrar una, abre la venta y pulsa «Registrar devolución»."
        actions={<LinkButton href="/devoluciones/nueva" variant="primary">Nueva devolución</LinkButton>}
      />
      <FilterBar
        basePath="/devoluciones"
        values={filters}
        fields={[
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
        ]}
      />
      <Figures
        className="mb-4"
        items={[
          { label: "Unidades devueltas", value: units(rows.reduce((a, r) => a + r.quantity, 0)) },
          { label: "Importe reembolsado", value: money(refunded) },
          { label: "Pérdida (sin producto)", value: money(lost), tone: lost > 0 ? "bad" : "default" },
        ]}
      />
      <Panel padded={false}>
        {rows.length === 0 ? (
          <Empty title="No hay devoluciones" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Venta</Th>
                <Th>Producto</Th>
                <Th>Tipo</Th>
                <Th>Plataforma</Th>
                <Th num>Uds.</Th>
                <Th num>Reembolso</Th>
                <Th num>Pérdida</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.return_item_id}>
                  <Td className="num">{date(r.return_date)}</Td>
                  <Td>
                    <Link href={`/ventas/${r.sale_id}`} className="whitespace-nowrap font-semibold text-brand-ink hover:underline">
                      {r.sale_number}
                    </Link>
                  </Td>
                  <Td>
                    {variantDisplay(r.product_name, r.variant_name)}
                    {r.reason && <span className="block text-xs text-muted">{r.reason}</span>}
                  </Td>
                  <Td>{r.restocked ? <Badge tone="good">Vuelve al stock</Badge> : <Badge tone="bad">Sin producto</Badge>}</Td>
                  <Td>{r.platform_name}</Td>
                  <Td num>{r.quantity}</Td>
                  <Td num>{money(r.refund_amount)}</Td>
                  <Td num>{money(r.lost_cost)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
