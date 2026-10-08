import Link from "next/link";
import { ChevronRight, Plus, Truck } from "lucide-react";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { CountUp } from "@/components/count-up";
import { Figures, LinkButton, Notice, PageHeader, Panel, clsx } from "@/components/ui";
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
    const d = data as {
      linked: boolean;
      today: { units: number; revenue: number; orders: number };
      month: { units: number; revenue: number; orders: number };
      pending_shipments: number;
    } | null;
    return (
      <>
        {sinPermiso}
        <PageHeader
          title={`Hola${user.responsibleName ? `, ${user.responsibleName.split(" ")[0]}` : ""}`}
          description="Tus ventas de hoy y de este mes."
          actions={
            <LinkButton href="/ventas/nueva" variant="primary" className="max-lg:hidden">
              <Plus size={17} strokeWidth={2.75} />
              Nueva venta
            </LinkButton>
          }
        />
        {!d?.linked && (
          <Notice tone="warn" className="mb-4" title="Tu usuario no está vinculado a un responsable">
            Hasta que el administrador lo vincule no podrás registrar ventas.
          </Notice>
        )}
        <Hero
          today={{ revenue: d?.today.revenue ?? 0, orders: d?.today.orders ?? 0, units: d?.today.units ?? 0 }}
          month={{ revenue: d?.month.revenue ?? 0, orders: d?.month.orders ?? 0, units: d?.month.units ?? 0 }}
        />
        {(d?.pending_shipments ?? 0) > 0 && <ShipmentsCallout n={d!.pending_shipments} className="mt-4" />}
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
        title={`Hola${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description="Cómo va el día, qué hay en el almacén y cómo van las ventas."
      />

      <Hero
        today={{ revenue: s.today.revenue, orders: s.today.orders, units: s.today.units, profit: s.today.profit }}
        month={{ revenue: s.month.revenue, orders: s.month.orders, units: s.month.units, profit: s.month.profit }}
        losses={s.losses_month}
      />

      {(s.pending_reviews > 0 || s.pending_shipments > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {s.pending_shipments > 0 && <ShipmentsCallout n={s.pending_shipments} />}
          {s.pending_reviews > 0 && (
            <Link
              href="/revision"
              className="press flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] hover:border-ink/30"
            >
              <span className="display num flex h-11 min-w-11 items-center justify-center rounded-[12px] bg-tag px-2 text-[24px] text-tag-ink">
                {s.pending_reviews}
              </span>
              <span className="flex-1 text-sm">
                <span className="block font-semibold">Pendientes de revisar</span>
                <span className="text-muted">Datos del Excel que necesitan tu confirmación</span>
              </span>
              <ChevronRight size={20} className="text-muted" />
            </Link>
          )}
        </div>
      )}

      <h2 className="display mb-2.5 mt-8 text-[22px] uppercase">Almacén</h2>
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
        <Panel title="Ventas mensuales" description="Últimos 12 meses, descontadas las devoluciones.">
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
          <Link href="/responsables" className="mt-5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline">
            Ver rendimiento de responsables
          </Link>
        </Panel>
      </div>
    </>
  );
}

type Period = { revenue: number; orders: number; units: number; profit?: number };

/** Lo primero que se ve: facturación y beneficio de hoy y del mes, en grande. */
function Hero({ today, month, losses = 0 }: { today: Period; month: Period; losses?: number }) {
  const block = (label: string, p: Period, main: boolean) => (
    <div className={clsx("flex flex-col gap-3 p-5 sm:p-6", main ? "bg-chrome text-chrome-ink" : "bg-chrome-2 text-chrome-ink")}>
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-chrome-ink/55">
        {main && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />}
        {label}
      </p>
      <div>
        <p className="text-[12px] font-medium text-chrome-ink/55">Facturación</p>
        <p className="display text-[46px] sm:text-[56px]">
          <CountUp value={p.revenue} />
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {p.profit !== undefined && (
          <div>
            <p className="text-[12px] font-medium text-chrome-ink/55">Beneficio</p>
            <p className={clsx("display text-[28px]", p.profit < 0 ? "text-danger" : "text-brand")}>
              {p.profit > 0 ? "+" : ""}
              <CountUp value={p.profit} />
            </p>
          </div>
        )}
        <div className="pb-1 text-[13px] text-chrome-ink/70">
          <span className="num font-semibold text-chrome-ink">{units(p.orders)}</span> {p.orders === 1 ? "venta" : "ventas"} ·{" "}
          <span className="num font-semibold text-chrome-ink">{units(p.units)}</span> {p.units === 1 ? "ud." : "uds."}
        </div>
      </div>
      {!main && losses > 0 && <p className="text-[12.5px] text-chrome-ink/55">{money(losses)} en salidas sin venta este mes</p>}
    </div>
  );
  return (
    <section
      className="grid overflow-hidden rounded-[var(--radius-lg)] border border-white/6 shadow-[var(--shadow-pop)] md:grid-cols-2"
      aria-label="Facturación y beneficio"
    >
      {block("Hoy", today, true)}
      {block("Este mes", month, false)}
    </section>
  );
}

function ShipmentsCallout({ n, className }: { n: number; className?: string }) {
  return (
    <Link
      href="/envios"
      className={clsx(
        "press flex items-center gap-3 rounded-[var(--radius-md)] border border-brand/40 bg-brand-soft p-4 shadow-[var(--shadow-card)] hover:border-brand",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-brand text-on-brand">
        <Truck size={22} strokeWidth={2.25} />
      </span>
      <span className="flex-1 text-sm">
        <span className="display num block text-[22px] uppercase leading-none">
          {n} {n === 1 ? "paquete" : "paquetes"} por enviar
        </span>
        <span className="text-muted">Ver por paquetería</span>
      </span>
      <ChevronRight size={20} className="text-muted" />
    </Link>
  );
}
