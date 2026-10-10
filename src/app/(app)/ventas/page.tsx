import type { Metadata } from "next";
import Link from "next/link";
import { ExportLinks, FilterBar } from "@/components/filter-bar";
import { Badge, Empty, Figures, LinkButton, LotTag, Notice, PageHeader, Pagination, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { filtersFrom, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { date, money, units } from "@/lib/format";
import { loadSaleOptions } from "@/lib/options";
import { SALES_COLUMNS } from "@/lib/preferences";
import { loadPrefs } from "@/lib/user-prefs";
import { createClient } from "@/lib/supabase/server";
import { type SaleLine, variantDisplay } from "@/lib/types";
import { BulkShippingBar, SaleCheckbox, SelectAllCheckbox, ShippingSelection } from "./bulk-shipping";
import { SaleCards, type CardSale } from "./sale-cards";

export const metadata: Metadata = { title: "Ventas" };

type Ship = "pendiente" | "enviado" | null;
const shipOf = (status: string | null, requires: boolean): Ship => (requires ? (status === "enviado" ? "enviado" : "pendiente") : null);

function ShippingBadge({ status, requires }: { status: string | null; requires: boolean }) {
  if (!requires) return <span className="text-xs text-muted">En mano</span>;
  return status === "enviado" ? <Badge tone="good">Enviado</Badge> : <Badge tone="warn">Pendiente</Badge>;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  // Preferencias de la tabla (Ajustes → Tablas)
  const tp = (await loadPrefs()).tables.ventas;
  const cols = tp.columns.filter((c) => c.visible).map((c) => c.key);
  const { page, from, to, size } = pageFrom(sp, tp.pageSize);
  const supabase = await createClient();
  const hrefFor = (p: number) => `/ventas${toQuery({ ...filters, page: p })}`;

  if (user.role !== "admin") {
    // Vendedor: solo sus ventas (lo garantiza la base de datos)
    let q = supabase
      .from("sales")
      .select(
        "id, sale_number, sale_date, shipping_status, platforms(name, requires_shipping), sale_items(quantity, unit_price, product_variants(name, products(name)))",
        { count: "exact" },
      )
      .eq("status", "activa")
      .order("sale_date", { ascending: false })
      .order("sale_number", { ascending: false })
      .range(from, to);
    if (filters.from) q = q.gte("sale_date", filters.from);
    if (filters.to) q = q.lte("sale_date", filters.to);
    if (filters.shipping_status) q = q.eq("shipping_status", filters.shipping_status);
    const { data, count, error } = await q;
    type Row = {
      id: string;
      sale_number: string;
      sale_date: string;
      shipping_status: string | null;
      platforms: { name: string; requires_shipping: boolean } | null;
      sale_items: {
        quantity: number;
        unit_price: number;
        product_variants: {
          name: string;
          products: { name: string } | null;
        } | null;
      }[];
    };
    const rows = (data ?? []) as unknown as Row[];
    return (
      <>
        <PageHeader title="Mis ventas" />
        <FilterBar
          basePath="/ventas"
          values={filters}
          fields={[
            { type: "date", name: "from", label: "Desde" },
            { type: "date", name: "to", label: "Hasta" },
            {
              type: "select",
              name: "shipping_status",
              label: "Envío",
              options: [
                { value: "pendiente", label: "Pendiente" },
                { value: "enviado", label: "Enviado" },
              ],
            },
          ]}
        />
        {error && <Notice tone="bad">{error.message}</Notice>}
        <ShippingSelection>
          <BulkShippingBar />
          <SaleCards
            sales={rows.map<CardSale>((s) => ({
              id: s.id,
              number: s.sale_number,
              date: s.sale_date,
              total: s.sale_items.reduce((a, i) => a + i.quantity * Number(i.unit_price), 0),
              platform: s.platforms?.name ?? "",
              shipping: shipOf(s.shipping_status, !!s.platforms?.requires_shipping),
              lines: s.sale_items.map((i) => ({
                quantity: i.quantity,
                text: variantDisplay(i.product_variants?.products?.name ?? "", i.product_variants?.name),
              })),
            }))}
          />
          <Panel padded={false} className={rows.length ? "max-lg:mt-3 max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none" : undefined}>
            {rows.length === 0 ? (
              <Empty title="Aún no hay ventas con estos filtros" action={<LinkButton href="/ventas/nueva">Registrar una venta</LinkButton>} />
            ) : (
              <Table className="max-lg:hidden">
                <thead>
                  <tr>
                    <Th className="w-8">
                      <SelectAllCheckbox
                        sales={rows.map((s) => ({
                          id: s.id,
                          status: shipOf(s.shipping_status, !!s.platforms?.requires_shipping),
                        }))}
                      />
                    </Th>
                    <Th>Fecha</Th>
                    <Th>Venta</Th>
                    <Th>Productos</Th>
                    <Th>Plataforma</Th>
                    <Th>Envío</Th>
                    <Th num>Importe</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <SaleCheckbox saleId={s.id} status={shipOf(s.shipping_status, !!s.platforms?.requires_shipping)} label={`la venta ${s.sale_number}`} />
                      </Td>
                      <Td className="num">{date(s.sale_date)}</Td>
                      <Td>
                        <Link className="whitespace-nowrap font-semibold text-brand-ink hover:underline" href={`/ventas/${s.id}`}>
                          {s.sale_number}
                        </Link>
                      </Td>
                      <Td>
                        {s.sale_items.map((i, k) => (
                          <span key={k} className="block">
                            {i.quantity} x {variantDisplay(i.product_variants?.products?.name ?? "", i.product_variants?.name)}
                          </span>
                        ))}
                      </Td>
                      <Td>{s.platforms?.name}</Td>
                      <Td>
                        <ShippingBadge status={s.shipping_status} requires={!!s.platforms?.requires_shipping} />
                      </Td>
                      <Td num>{money(s.sale_items.reduce((a, i) => a + i.quantity * Number(i.unit_price), 0))}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination page={page} size={size} total={count ?? 0} hrefFor={hrefFor} />
          </Panel>
        </ShippingSelection>
      </>
    );
  }

  const [{ data, count, error }, { data: summary }, opts] = await Promise.all([
    supabase.rpc("report_sale_lines", { p_filters: filters }, { count: "exact" }).range(from, to),
    supabase.rpc("report_sales_summary", { p_filters: filters }),
    loadSaleOptions(),
  ]);
  const rows = (data ?? []) as SaleLine[];
  const sum = summary as {
    orders: number;
    units: number;
    net_amount: number;
    profit: number;
    avg_ticket: number;
    refunded_amount: number;
  } | null;

  return (
    <>
      <PageHeader title="Ventas" description="Cada línea muestra de qué pedido/lote salió la unidad y el beneficio real con el coste de ese lote." />
      <FilterBar
        basePath="/ventas"
        values={filters}
        fields={[
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
          {
            type: "text",
            name: "search",
            label: "Buscar",
            placeholder: "Nº de venta, producto o referencia",
          },
          {
            type: "select",
            name: "responsible_id",
            label: "Responsable",
            options: opts.responsibles.map((r) => ({
              value: r.id,
              label: r.name,
            })),
          },
          {
            type: "select",
            name: "platform_id",
            label: "Plataforma",
            empty: "Todas",
            options: opts.platforms.map((p) => ({
              value: p.id,
              label: p.name,
            })),
          },
          {
            type: "select",
            name: "shipping_status",
            label: "Envío",
            options: [
              { value: "pendiente", label: "Pendiente" },
              { value: "enviado", label: "Enviado" },
            ],
          },
          {
            type: "number",
            name: "purchase_order_number",
            label: "Pedido/lote nº",
          },
        ]}
        extra={<ExportLinks type="ventas" filters={filters} />}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      {sum && (
        <Figures
          className="mb-4"
          items={[
            { label: "Pedidos", value: units(sum.orders) },
            { label: "Unidades", value: units(sum.units) },
            {
              label: "Facturación",
              value: money(sum.net_amount),
              note: sum.refunded_amount > 0 ? `${money(sum.refunded_amount)} devueltos` : undefined,
            },
            { label: "Ticket medio", value: money(sum.avg_ticket) },
            {
              label: "Beneficio",
              value: money(sum.profit),
              tone: sum.profit < 0 ? "bad" : "good",
            },
          ]}
        />
      )}
      <ShippingSelection>
        <BulkShippingBar />
        <SaleCards sales={groupLines(rows)} />
        <Panel padded={false} className={rows.length ? "max-lg:mt-3 max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none" : undefined}>
          {rows.length === 0 ? (
            <Empty title="No hay ventas con estos filtros" action={<LinkButton href="/ventas/nueva">Registrar una venta</LinkButton>} />
          ) : (
            <Table className="max-lg:hidden">
              <thead>
                <tr>
                  <Th className="w-8">
                    <SelectAllCheckbox
                      sales={rows.map((l) => ({
                        id: l.sale_id,
                        status: shipOf(l.shipping_status, l.requires_shipping),
                      }))}
                    />
                  </Th>
                  {cols.map((c) => (
                    <Th key={c} num={["uds", "precio", "importe", "beneficio"].includes(c)}>
                      {SALES_COLUMNS[c]}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <Tr key={l.sale_item_id}>
                    <Td>
                      <SaleCheckbox saleId={l.sale_id} status={shipOf(l.shipping_status, l.requires_shipping)} label={`la venta ${l.sale_number}`} />
                    </Td>
                    {cols.map((c) => {
                      switch (c) {
                        case "fecha":
                          return (
                            <Td key={c} className="num">
                              {date(l.sale_date)}
                            </Td>
                          );
                        case "venta":
                          return (
                            <Td key={c}>
                              <Link className="whitespace-nowrap font-semibold text-brand-ink hover:underline" href={`/ventas/${l.sale_id}`}>
                                {l.sale_number}
                              </Link>
                            </Td>
                          );
                        case "producto":
                          return (
                            <Td key={c}>
                              <Link href={`/productos/${l.product_id}`} className="hover:underline">
                                {variantDisplay(l.product_name, l.variant_name)}
                              </Link>
                              {l.line_notes && <span className="block text-xs text-muted">{l.line_notes}</span>}
                            </Td>
                          );
                        case "lote":
                          return (
                            <Td key={c}>
                              <LotTag label={l.lot_label} />
                            </Td>
                          );
                        case "uds":
                          return (
                            <Td key={c} num>
                              {l.quantity}
                              {l.returned_qty > 0 && <span className="block text-xs text-danger">−{l.returned_qty} dev.</span>}
                            </Td>
                          );
                        case "precio":
                          return (
                            <Td key={c} num>
                              {money(l.unit_price)}
                            </Td>
                          );
                        case "importe":
                          return (
                            <Td key={c} num>
                              {money(l.net_amount)}
                            </Td>
                          );
                        case "beneficio":
                          return (
                            <Td key={c} num className={Number(l.profit) < 0 ? "text-danger" : undefined}>
                              {money(l.profit)}
                            </Td>
                          );
                        case "responsable":
                          return <Td key={c}>{l.responsible_name}</Td>;
                        case "plataforma":
                          return <Td key={c}>{l.platform_name}</Td>;
                        case "envio":
                          return (
                            <Td key={c}>
                              <ShippingBadge status={l.shipping_status} requires={l.requires_shipping} />
                            </Td>
                          );
                      }
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={page} size={size} total={count ?? 0} hrefFor={hrefFor} />
        </Panel>
      </ShippingSelection>
    </>
  );
}

/** Junta las líneas de cada venta en una sola tarjeta (mismo orden que la tabla). */
function groupLines(rows: SaleLine[]): CardSale[] {
  const map = new Map<string, CardSale>();
  for (const l of rows) {
    let c = map.get(l.sale_id);
    if (!c) {
      c = {
        id: l.sale_id,
        number: l.sale_number,
        date: l.sale_date,
        total: 0,
        profit: 0,
        platform: l.platform_name,
        responsible: l.responsible_name,
        shipping: shipOf(l.shipping_status, l.requires_shipping),
        lines: [],
      };
      map.set(l.sale_id, c);
    }
    c.total += Number(l.net_amount);
    c.profit = (c.profit ?? 0) + Number(l.profit);
    c.lines.push({ quantity: l.quantity, text: variantDisplay(l.product_name, l.variant_name), lot: l.lot_label, returned: l.returned_qty });
  }
  return [...map.values()];
}
