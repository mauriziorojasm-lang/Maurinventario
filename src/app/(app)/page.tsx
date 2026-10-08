import Link from "next/link";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { Figures, LinkButton, Notice, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, udsLabel, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Stats = {
  today: { units: number; revenue: number; orders: number; profit: number };
  month: { units: number; revenue: number; orders: number; profit: number };
  inventory: {
    units: number;
    products_with_stock: number;
    products: number;
    stock_value: number;
    potential_value: number;
    potential_profit: number;
    unpriced_units: number;
    estimated_units: number;
  };
  best_seller_month: { name: string; revenue: number; units: number } | null;
  best_seller_all: { name: string; revenue: number; units: number } | null;
  top_product_month: { name: string; units: number; revenue: number } | null;
  top_product_all: { name: string; units: number; revenue: number } | null;
  monthly: { month: string; revenue: number; profit: number; orders: number; units: number }[];
  losses_month: number;
  pending_shipments: number;
  pending_reviews: number;
};

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const sinPermiso = sp.aviso === "sin-permiso" && (
    <Notice tone="warn" className="mb-4">
      Esa sección es solo para administradores.
    </Notice>
  );

  if (user.role !== "admin") {
    const { data } = await supabase.rpc("my_dashboard");
    const d = data as { linked: boolean; today: { units: number; revenue: number; orders: number }; month: { units: number; revenue: number; orders: number }; pending_shipments: number } | null;
    return (
      <>
        {sinPermiso}
        <PageHeader
          title={`Hola${user.responsibleName ? `, ${user.responsibleName.split(" ")[0]}` : ""}`}
          description="Tus ventas de hoy y de este mes."
          actions={
            <LinkButton href="/ventas/nueva" variant="primary">
              Nueva venta
            </LinkButton>
          }
        />
        {!d?.linked && (
          <Notice tone="warn" className="mb-4" title="Tu usuario no está vinculado a un responsable">
            Hasta que el administrador lo vincule no podrás registrar ventas.
          </Notice>
        )}
        <Figures
          items={[
            { label: "Ventas de hoy", value: units(d?.today.orders ?? 0), note: udsLabel(d?.today.units ?? 0) },
            { label: "Importe de hoy", value: money(d?.today.revenue ?? 0) },
            { label: "Ventas del mes", value: units(d?.month.orders ?? 0), note: udsLabel(d?.month.units ?? 0) },
            { label: "Importe del mes", value: money(d?.month.revenue ?? 0) },
          ]}
        />
        {(d?.pending_shipments ?? 0) > 0 && (
          <Notice tone="warn" className="mt-4">
            Tienes {d!.pending_shipments} envío{d!.pending_shipments === 1 ? "" : "s"} pendiente{d!.pending_shipments === 1 ? "" : "s"}.{" "}
            <Link href="/ventas?shipping_status=pendiente">Ver envíos pendientes</Link>
          </Notice>
        )}
      </>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_stats");
  const s = data as Stats | null;
  if (error || !s) {
    return (
      <>
        <PageHeader title="Inicio" />
        <Notice tone="bad" title="No se han podido cargar los datos">
          {error?.message ?? "Comprueba la conexión con Supabase y que las migraciones están aplicadas (ver README)."}
        </Notice>
      </>
    );
  }
  const inv = s.inventory;

  return (
    <>
      {sinPermiso}
      <PageHeader
        title="Inicio"
        description="Cómo va el día, qué hay en el almacén y cómo van las ventas."
        actions={
          <LinkButton href="/ventas/nueva" variant="primary">
            Nueva venta
          </LinkButton>
        }
      />

      {(s.pending_reviews > 0 || s.pending_shipments > 0) && (
        <div className="mb-5 flex flex-col gap-2 sm:flex-row">
          {s.pending_shipments > 0 && (
            <Notice tone="warn" className="flex-1">
              {s.pending_shipments} envío{s.pending_shipments === 1 ? "" : "s"} pendiente{s.pending_shipments === 1 ? "" : "s"} de Vinted o Wallapop.{" "}
              <Link href="/ventas?shipping_status=pendiente">Ver envíos</Link>
            </Notice>
          )}
          {s.pending_reviews > 0 && (
            <Notice tone="info" className="flex-1">
              {s.pending_reviews} dato{s.pending_reviews === 1 ? "" : "s"} pendiente{s.pending_reviews === 1 ? "" : "s"} de revisar.{" "}
              <Link href="/revision">Revisar</Link>
            </Notice>
          )}
        </div>
      )}

      <h2 className="mb-2 text-[15px] font-bold">Hoy</h2>
      <Figures
        items={[
          { label: "Unidades vendidas", value: units(s.today.units) },
          { label: "Importe vendido", value: money(s.today.revenue) },
          { label: "Pedidos", value: units(s.today.orders) },
          { label: "Beneficio", value: money(s.today.profit), tone: s.today.profit < 0 ? "bad" : "good" },
        ]}
      />

      <h2 className="mb-2 mt-7 text-[15px] font-bold">Almacén</h2>
      <Figures
        items={[
          { label: "Productos con stock", value: units(inv.products_with_stock), note: `de ${units(inv.products)} en el catálogo` },
          { label: "Unidades", value: units(inv.units) },
          { label: "Valor del almacén", value: money(inv.stock_value), note: "a coste medio ponderado" },
          {
            label: "Valor potencial de venta",
            value: money(inv.potential_value),
            note:
              inv.estimated_units > 0 || inv.unpriced_units > 0
                ? `${inv.estimated_units} uds. con precio medio de venta${inv.unpriced_units ? `, ${inv.unpriced_units} sin precio` : ""}`
                : "con el precio normal de venta",
          },
          { label: "Beneficio potencial", value: money(inv.potential_profit), tone: "good" },
        ]}
      />

      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel title="Ventas mensuales" description="Importe vendido en los últimos 12 meses (descontadas las devoluciones).">
          <MonthlyBars data={s.monthly} />
        </Panel>
        <Panel title="Rendimiento">
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-[13px] text-muted">Mejor vendedor este mes</dt>
              <dd className="mt-0.5 font-semibold">
                {s.best_seller_month ? (
                  <>
                    {s.best_seller_month.name} <span className="num font-normal text-muted">· {money(s.best_seller_month.revenue)}</span>
                  </>
                ) : (
                  <span className="font-normal text-muted">Sin ventas este mes</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Producto más vendido este mes</dt>
              <dd className="mt-0.5 font-semibold">
                {s.top_product_month ? (
                  <>
                    {s.top_product_month.name} <span className="num font-normal text-muted">· {udsLabel(s.top_product_month.units)}</span>
                  </>
                ) : (
                  <span className="font-normal text-muted">Sin ventas este mes</span>
                )}
              </dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="text-[13px] text-muted">Mejor vendedor (histórico)</dt>
              <dd className="mt-0.5 font-semibold">{s.best_seller_all ? `${s.best_seller_all.name} · ${money(s.best_seller_all.revenue)}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Producto más vendido (histórico)</dt>
              <dd className="mt-0.5 font-semibold">{s.top_product_all ? `${s.top_product_all.name} · ${udsLabel(s.top_product_all.units)}` : "—"}</dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="text-[13px] text-muted">Este mes</dt>
              <dd className="num mt-0.5">
                {money(s.month.revenue)} vendidos, {money(s.month.profit)} de beneficio
                {s.losses_month > 0 && <span className="block text-danger">{money(s.losses_month)} en salidas sin venta</span>}
              </dd>
            </div>
          </dl>
          <Link href="/responsables" className="mt-4 inline-block text-[13px] font-semibold text-ledger hover:underline">
            Ver rendimiento de responsables
          </Link>
        </Panel>
      </div>
    </>
  );
}
