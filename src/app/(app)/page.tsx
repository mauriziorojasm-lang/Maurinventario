import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { CountUp } from "@/components/count-up";
import { LinkButton, Notice, PageHeader, clsx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BusinessDashboard, DashboardSkeleton } from "./business-dashboard";
import { HomeTasks, QuickActions } from "./home-tasks";
import { loadBadges } from "@/lib/badges";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const [supabase, badges] = await Promise.all([createClient(), loadBadges()]);
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
            <LinkButton href="/ventas/nueva" variant="primary" className="max-md:hidden">
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
        <div className="mt-5 flex flex-col gap-5">
          <HomeTasks badges={badges} admin={false} />
          <QuickActions admin={false} />
        </div>
      </>
    );
  }

  // Panel de negocio (administrador). Periodo del gráfico y rankings: 6 o 12 meses.
  const months = sp.meses === "12" ? 12 : 6;
  return (
    <>
      {sinPermiso}
      <PageHeader
        title={`Hola${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description="Cómo va el negocio: ventas, beneficio bruto, stock y actividad. Solo datos reales."
        actions={
          <nav aria-label="Periodo" className="flex rounded-full border border-line-strong bg-surface p-1 text-[13px] font-semibold">
            {[6, 12].map((m) => (
              <Link
                key={m}
                href={m === 6 ? "/" : "/?meses=12"}
                aria-current={months === m ? "page" : undefined}
                className={clsx("press whitespace-nowrap rounded-full px-3.5 py-1.5", months === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}
              >
                {m} meses
              </Link>
            ))}
          </nav>
        }
      />
      <Suspense key={months} fallback={<DashboardSkeleton />}>
        <BusinessDashboard months={months} badges={badges} />
      </Suspense>
    </>
  );
}

type Period = { revenue: number; orders: number; units: number; profit?: number };

/** Lo primero que se ve: facturación y beneficio de hoy y del mes, en grande. */
function Hero({ today, month, losses = 0 }: { today: Period; month: Period; losses?: number }) {
  const block = (label: string, p: Period, main: boolean) => (
    <div className={clsx("flex flex-col gap-3 p-5 sm:p-6", main ? "bg-chrome text-chrome-ink" : "bg-chrome-2 text-chrome-ink")}>
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-chrome-ink/55">
        {main && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-bright" aria-hidden />}
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
            <p className={clsx("display text-[28px]", p.profit < 0 ? "text-danger" : "text-brand-bright")}>
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
