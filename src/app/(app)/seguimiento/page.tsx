import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { AlertTriangle, Bell, PackageCheck, Search, Timer, Truck } from "lucide-react";
import { CarrierIcon, PlatformIcon } from "@/components/marks";
import { ProductThumb } from "@/components/thumb";
import { TrackingBadge, TrackingProgress } from "@/components/tracking";
import { Empty, Notice, PageHeader, clsx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, dateTime, money } from "@/lib/format";
import { loadAlerts, loadShipments, loadShippingStats, type ShipmentView } from "@/lib/tracking/data";
import { trackingConfigured } from "@/lib/tracking/seventeen";
import { checkStaleShipments } from "@/lib/tracking/service";
import { MarkAlertsReadButton, RefreshAllButton } from "./tracking-actions";

export const metadata: Metadata = { title: "Seguimiento" };

const VIEWS: { key: ShipmentView | "alertas"; label: string }[] = [
  { key: "curso", label: "En curso" },
  { key: "incidencias", label: "Incidencias" },
  { key: "entregados", label: "Entregados" },
  { key: "todos", label: "Todos" },
  { key: "alertas", label: "Alertas" },
];

const days = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${n === 1 ? "día" : "días"}`);

export default async function TrackingPage({ searchParams }: PageProps<"/seguimiento">) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = (VIEWS.some((v) => v.key === sp.vista) ? sp.vista : "curso") as ShipmentView | "alertas";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const automatic = trackingConfigured();
  const [{ rows, error }, alerts, stats] = await Promise.all([
    view === "alertas" ? Promise.resolve({ rows: [], error: null }) : loadShipments(view, q),
    loadAlerts(),
    loadShippingStats(),
  ]);
  // Al abrir solo se revisan las alertas por tiempo (no consulta al transportista: eso, con «Actualizar envíos»)
  after(() => checkStaleShipments().catch(() => undefined));

  const inTransit = stats?.in_transit;
  const fastest = stats?.carriers.filter((c) => c.delivered >= 2 && c.avg_days !== null).sort((a, b) => (a.avg_days ?? 99) - (b.avg_days ?? 99))[0];

  return (
    <>
      <PageHeader
        title="Seguimiento"
        description="Todos tus envíos desde que los marcas como enviados hasta que llegan. El tiempo de entrega se mide desde «Marcar como enviado» hasta «Entregado»."
        actions={automatic ? <RefreshAllButton /> : undefined}
      />
      {!automatic && (
        <Notice tone="neutral" className="mb-4" title="Seguimiento manual">
          El seguimiento automático con el transportista no está activado todavía. Mientras tanto, Resellap guarda cuándo envías cada paquete, te avisa si tarda demasiado y puedes marcar
          «Entregado» o «Incidencia» a mano desde cada envío.
          {user.role === "admin" && " Para activarlo hace falta una clave gratuita de 17TRACK (ver la guía de configuración)."}
        </Notice>
      )}

      {/* Cifras clave */}
      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line lg:grid-cols-4">
        <Kpi icon={Truck} label="En tránsito" value={String(inTransit?.count ?? 0)} note={inTransit?.value !== null && inTransit?.value !== undefined ? `${money(inTransit.value)} en camino` : undefined} dark />
        <Kpi icon={PackageCheck} label="Entregados" value={String(stats?.totals.delivered ?? 0)} note={`de ${stats?.totals.shipments ?? 0} con seguimiento`} />
        <Kpi icon={Timer} label="Tiempo medio de entrega" value={days(stats?.overall.avg_days)} note={stats?.overall.median_days !== null && stats?.overall.median_days !== undefined ? `mediana ${days(stats.overall.median_days)}` : "aún sin entregas medidas"} />
        <Kpi
          icon={AlertTriangle}
          label="Incidencias"
          value={String(stats?.totals.incidents ?? 0)}
          note={fastest ? `Más rápido: ${fastest.carrier} (${days(fastest.avg_days)})` : `${stats?.totals.delayed ?? 0} con retraso`}
        />
      </dl>

      {/* Pestañas y búsqueda */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:px-0" aria-label="Vistas">
          {VIEWS.map((v) => {
            const on = v.key === view;
            const n = v.key === "alertas" ? alerts.length : null;
            return (
              <Link
                key={v.key}
                href={{ pathname: "/seguimiento", query: { vista: v.key, ...(q && v.key !== "alertas" ? { q } : {}) } }}
                aria-current={on ? "page" : undefined}
                className={clsx(
                  "press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium",
                  on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {v.key === "alertas" && <Bell size={14} strokeWidth={1.75} />}
                {v.label}
                {n ? <span className={clsx("num rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-paper text-ink" : "bg-danger text-white")}>{n}</span> : null}
              </Link>
            );
          })}
        </nav>
        {view !== "alertas" && (
          <form className="relative w-full lg:max-w-xs" action="/seguimiento">
            <input type="hidden" name="vista" value={view} />
            <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Código, comprador o nº de venta"
              className="h-11 w-full rounded-[10px] border border-line-strong bg-surface pl-9 pr-3 text-base placeholder:text-faint focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 sm:h-10 sm:text-[14px]"
            />
          </form>
        )}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {view === "alertas" ? (
        alerts.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-line bg-surface">
            <Empty title="Sin alertas">Te avisaremos aquí cuando un envío se entregue, se retrase, tenga una incidencia o vuelva.</Empty>
          </div>
        ) : (
          <section className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-[14px] font-semibold">{alerts.length === 1 ? "1 alerta sin ver" : `${alerts.length} alertas sin ver`}</p>
              <MarkAlertsReadButton ids={null} label="Marcar todas como vistas" />
            </div>
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span aria-hidden className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.kind === "entregado" ? "bg-brand-mark" : a.kind === "devolucion" ? "bg-danger" : "bg-warn")} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/seguimiento/${a.saleId}`} className="text-[14px] font-medium text-ink hover:underline">
                      {a.message}
                    </Link>
                    <p className="num text-[12.5px] text-faint">{dateTime(a.createdAt)}</p>
                  </div>
                  <MarkAlertsReadButton ids={[a.id]} label="Vista" />
                </li>
              ))}
            </ul>
          </section>
        )
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-line bg-surface">
          <Empty title={q ? "Nada coincide con la búsqueda" : view === "curso" ? "Ningún envío en camino" : "Nada por aquí"}>
            {view === "curso" && !q ? "Cuando marques un paquete como enviado en «Pendientes de envío», aparecerá aquí y empezará su seguimiento." : undefined}
          </Empty>
        </div>
      ) : (
        <ul className="stagger grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                href={`/seguimiento/${s.id}`}
                className="press group flex h-full flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex gap-3">
                  <ProductThumb src={s.photo} alt="" size={60} rounded={12} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{s.product}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
                      <PlatformIcon name={s.platform} size={15} />
                      {s.buyer && <span>· {s.buyer}</span>}
                    </p>
                  </div>
                  <TrackingBadge status={s.status} />
                </div>
                <TrackingProgress status={s.status} />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
                  <CarrierIcon name={s.carrier} size={18} className="font-medium" />
                  <span className="num text-faint">{s.tracking ?? "Sin código"}</span>
                </div>
                <p className="line-clamp-2 min-h-[2.5em] text-[13px] text-ink-soft">
                  {s.lastEvent ?? "Marcado como enviado"}
                  {s.lastLocation ? ` · ${s.lastLocation}` : ""}
                </p>
                <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
                  <div>
                    <dt className="text-faint">Enviado</dt>
                    <dd className="num font-medium">{s.shippedAt ? date(s.shippedAt) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">{s.deliveredAt ? "Entregado" : "Estimado"}</dt>
                    <dd className="num font-medium">{s.deliveredAt ? date(s.deliveredAt) : s.eta ? date(s.eta) : "—"}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-faint">{s.deliveredAt ? "Tardó" : "Lleva"}</dt>
                    <dd className="num font-medium">
                      {s.shippedAt ? days(Math.round(((s.deliveredAt ? Date.parse(s.deliveredAt) : Date.now()) - Date.parse(s.shippedAt)) / 8640_000) / 10) : "—"}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {stats && stats.legacy_shipped > 0 && view === "todos" && (
        <p className="mt-4 text-[12.5px] text-faint">
          {stats.legacy_shipped} ventas enviadas antes de activar el seguimiento no aparecen aquí: no se sabe la hora exacta en que se enviaron y no cuentan en los tiempos.
        </p>
      )}
    </>
  );
}

function Kpi({ icon: Icon, label, value, note, dark }: { icon: typeof Truck; label: string; value: string; note?: string; dark?: boolean }) {
  return (
    <div className={clsx("px-4 py-3.5", dark ? "bg-[#0B0F0E] text-white" : "bg-surface")}>
      <dt className={clsx("flex items-center gap-1.5 text-[12.5px]", dark ? "text-[#8A9590]" : "text-faint")}>
        <Icon size={14} strokeWidth={1.75} />
        {label}
      </dt>
      <dd className="num mt-1 text-[24px] font-semibold tracking-[-0.02em]">{value}</dd>
      {note && <p className={clsx("mt-0.5 truncate text-[12.5px]", dark ? "text-[#6FDCA6]" : "text-faint")}>{note}</p>}
    </div>
  );
}
