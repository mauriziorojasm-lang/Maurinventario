/**
 * Panel de negocio del Inicio (solo administrador).
 * Todos los datos vienen de la función business_dashboard de la base de
 * datos, con los mismos criterios que el resto de la app. Nada inventado:
 * si un dato no se puede calcular, se dice.
 */
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Minus,
  PackageMinus,
  PackagePlus,
  Receipt,
  RotateCcw,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { CountUp } from "@/components/count-up";
import { Notice, Panel, clsx } from "@/components/ui";
import { MOVEMENT_TYPES, date, money, units } from "@/lib/format";
import type { Badges } from "@/lib/badges";
import { createClient } from "@/lib/supabase/server";
import { HomeTasks, QuickActions } from "./home-tasks";
import { variantDisplay } from "@/lib/types";

type Totals = { revenue: number; cost: number; profit: number; orders: number; units: number };
type ProductStat = { product_id: string; product_name: string; profit: number; revenue: number; units: number };
type AgingLot = {
  product_id: string;
  product_name: string;
  variant_name: string;
  lot_label: string;
  received_at: string;
  days: number;
  units: number;
  value: number;
};
type Movement = {
  id: number;
  movement_type: string;
  occurred_at: string;
  created_at: string;
  quantity: number;
  product_id: string;
  product_name: string;
  variant_name: string;
  lot_label: string;
  sale_id: string | null;
  sale_number: string | null;
  purchase_order_id: string | null;
  purchase_order_number: number | null;
  exit_reason: string | null;
  responsible_name: string | null;
};
type Business = {
  today: string;
  month_start: string;
  prev_start: string;
  prev_end: string;
  months: number;
  current: Totals;
  previous: Totals;
  today_stats: { revenue: number; profit: number; orders: number };
  inventory: {
    units: number;
    stock_value: number;
    potential_value: number;
    potential_profit: number;
    unpriced_units: number;
    estimated_units: number;
    products_with_stock: number;
  };
  inventory_then: { units: number; stock_value: number } | null;
  series: { month: string; revenue: number; profit: number; orders: number; units: number }[];
  top_profit: ProductStat[];
  top_units: ProductStat[];
  aging: AgingLot[];
  recent: Movement[];
  pending_shipments: number;
  pending_reviews: number;
};

const n = (v: unknown) => Number(v ?? 0);
const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};

// ---------------------------------------------------------------------
// Tarjeta de indicador
// ---------------------------------------------------------------------
type Delta = { text: string; dir: "up" | "down" | "flat"; tone: "good" | "bad" | "neutral" } | { note: string };

function KpiCard({ label, value, delta, foot, className }: { label: string; value: ReactNode; delta?: Delta; foot?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]", className)}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
      <div className="display num text-[32px] leading-none sm:text-[34px]">{value}</div>
      {delta &&
        ("note" in delta ? (
          <p className="text-[12px] text-muted">{delta.note}</p>
        ) : (
          <p
            className={clsx(
              "flex items-start gap-1 text-[12.5px] font-semibold leading-snug [&>svg]:mt-px [&>svg]:shrink-0",
              delta.tone === "good" && "text-good",
              delta.tone === "bad" && "text-danger",
              delta.tone === "neutral" && "text-ink-soft",
            )}
          >
            {delta.dir === "up" ? (
              <ArrowUpRight size={15} strokeWidth={2.5} />
            ) : delta.dir === "down" ? (
              <ArrowDownRight size={15} strokeWidth={2.5} />
            ) : (
              <Minus size={15} strokeWidth={2.5} />
            )}
            <span className="min-w-0 [font-variant-numeric:tabular-nums]">{delta.text}</span>
          </p>
        ))}
      {foot && <p className="mt-auto pt-1 text-[12px] text-muted">{foot}</p>}
    </div>
  );
}

function pctDelta(cur: number, prev: number, vs: string, goodWhenUp = true): Delta {
  if (prev === 0 && cur === 0) return { note: `Sin datos ${vs} para comparar` };
  if (prev <= 0) return { note: `${vs}: ${money(prev)} (sin porcentaje comparable)` };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const dir = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  const tone = dir === "flat" ? "neutral" : (dir === "up") === goodWhenUp ? "good" : "bad";
  return { text: `${pct > 0 ? "+" : ""}${pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} % ${vs}`, dir, tone };
}

// ---------------------------------------------------------------------
// Listas de productos
// ---------------------------------------------------------------------
function RankList({
  title,
  empty,
  items,
  periodLabel,
}: {
  title: string;
  empty: string;
  periodLabel?: string;
  items: { key: string; href: string; name: string; sub: string; value: string }[];
}) {
  return (
    <Panel title={title} description={periodLabel} padded={false}>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((it, i) => (
            <li key={it.key}>
              <Link href={it.href} className="press flex items-center gap-3 px-4 py-2.5 hover:bg-brand-soft/40">
                <span className="display num w-5 shrink-0 text-[18px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.name}</span>
                  <span className="block truncate text-[12px] text-muted">{it.sub}</span>
                </span>
                <span className="display num shrink-0 text-[19px]">{it.value}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Actividad reciente
// ---------------------------------------------------------------------
const MOVE_ICON: Record<string, typeof Receipt> = {
  entrada_compra: PackagePlus,
  venta: Receipt,
  anulacion_venta: RotateCcw,
  devolucion: Undo2,
  salida_sin_venta: PackageMinus,
  anulacion_salida: RotateCcw,
  ajuste_entrada: ArrowLeftRight,
  ajuste_salida: ArrowLeftRight,
};

function movementLink(m: Movement): string {
  if (m.sale_id) return `/ventas/${m.sale_id}`;
  if (m.purchase_order_id) return `/compras/${m.purchase_order_id}`;
  return `/productos/${m.product_id}`;
}

function movementTitle(m: Movement): string {
  const label = MOVEMENT_TYPES[m.movement_type] ?? m.movement_type;
  if (m.sale_number) return `${label} ${m.sale_number}`;
  if (m.purchase_order_number) return `${label} · pedido #${m.purchase_order_number}`;
  if (m.exit_reason) return `${label} · ${m.exit_reason}`;
  return label;
}

// ---------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------
export async function BusinessDashboard({ months, badges }: { months: number; badges: Badges }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_dashboard", { p_months: months });
  if (error || !data) {
    return (
      <Notice tone="bad" title="No se han podido cargar los datos del panel">
        {error?.message?.includes("business_dashboard")
          ? "Falta la función business_dashboard en la base de datos (migración 20261009150000_panel_negocio.sql)."
          : "Comprueba la conexión y vuelve a cargar la página."}
      </Notice>
    );
  }
  const b = data as Business;
  const cur = { revenue: n(b.current.revenue), profit: n(b.current.profit), cost: n(b.current.cost), orders: n(b.current.orders), units: n(b.current.units) };
  const prev = { revenue: n(b.previous.revenue), profit: n(b.previous.profit) };
  const vs = `vs ${shortDate(b.prev_start)}–${shortDate(b.prev_end)}`;
  const margin = cur.revenue > 0 ? (cur.profit / cur.revenue) * 100 : null;
  const prevMargin = prev.revenue > 0 ? (prev.profit / prev.revenue) * 100 : null;
  const inv = b.inventory;
  const then = b.inventory_then;
  const periodLabel = `Últimos ${b.months} meses`;
  const hasSales = b.series.some((s) => n(s.revenue) !== 0);

  const marginDelta: Delta | undefined =
    margin === null
      ? undefined
      : prevMargin === null
        ? { note: `Sin ventas ${vs} para comparar` }
        : (() => {
            const d = margin - prevMargin;
            const dir = Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
            return {
              text: `${d > 0 ? "+" : ""}${d.toLocaleString("es-ES", { maximumFractionDigits: 1 })} puntos ${vs}`,
              dir,
              tone: dir === "flat" ? "neutral" : dir === "up" ? "good" : "bad",
            } as Delta;
          })();

  const stockDelta = (now: number, past: number | undefined, kind: "units" | "money"): Delta => {
    if (past === undefined) return { note: "Sin histórico fiable para comparar" };
    const d = now - past;
    const dir = Math.abs(d) < 0.005 ? "flat" : d > 0 ? "up" : "down";
    const val = kind === "units" ? `${d > 0 ? "+" : ""}${units(d)} uds.` : `${d > 0 ? "+" : ""}${money(d)}`;
    return { text: `${val} vs ${shortDate(b.prev_end)}`, dir, tone: "neutral" };
  };

  return (
    <div className="flex flex-col gap-6">
      {/* A · Indicadores principales */}
      <section aria-label="Indicadores del mes" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          className="col-span-2 border-t-4 border-t-brand lg:col-span-1"
          label="Ventas del mes"
          value={<CountUp value={cur.revenue} />}
          delta={pctDelta(cur.revenue, prev.revenue, vs)}
          foot={
            <>
              {units(cur.orders)} {cur.orders === 1 ? "venta" : "ventas"} · hoy {money(b.today_stats.revenue)}
            </>
          }
        />
        <KpiCard
          label="Beneficio bruto del mes"
          value={
            <span className={cur.profit < 0 ? "text-danger" : undefined}>
              <CountUp value={cur.profit} />
            </span>
          }
          delta={cur.revenue === 0 && cur.profit === 0 ? { note: "Sin ventas este mes" } : pctDelta(cur.profit, prev.profit, vs)}
          foot={<>Ventas − coste real de cada lote</>}
        />
        <KpiCard
          label="Margen bruto"
          value={
            margin === null ? <span className="text-[22px] text-muted">Sin ventas</span> : `${margin.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`
          }
          delta={margin === null ? { note: "No se calcula sin ventas en el mes" } : marginDelta}
          foot={<>Beneficio bruto ÷ ventas</>}
        />
        <KpiCard
          label="Productos en stock"
          value={
            <>
              <CountUp value={n(inv.units)} format="units" /> <span className="text-[18px] text-muted">uds.</span>
            </>
          }
          delta={stockDelta(n(inv.units), then ? n(then.units) : undefined, "units")}
          foot={<>{units(inv.products_with_stock)} productos distintos</>}
        />
        <KpiCard
          label="Capital invertido en stock"
          value={<CountUp value={n(inv.stock_value)} />}
          delta={stockDelta(n(inv.stock_value), then ? n(then.stock_value) : undefined, "money")}
          foot={<>A coste medio ponderado</>}
        />
      </section>

      {/* Tareas pendientes y accesos rápidos */}
      <HomeTasks badges={badges} admin />
      <QuickActions admin />

      {/* B · Evolución */}
      <Panel title="Evolución del negocio" description={`${periodLabel}: ventas (verde) y beneficio bruto (oscuro). Toca un mes para ver los importes.`}>
        {hasSales ? (
          <MonthlyBars data={b.series.map((s) => ({ ...s, revenue: n(s.revenue), profit: n(s.profit), orders: n(s.orders), units: n(s.units) }))} />
        ) : (
          <p className="py-8 text-center text-sm text-muted">Todavía no hay ventas registradas en este periodo. El gráfico aparecerá con la primera venta.</p>
        )}
      </Panel>

      {/* C · Rendimiento del inventario */}
      <section aria-label="Rendimiento del inventario" className="flex flex-col gap-3">
        <h2 className="display text-[24px] uppercase">Rendimiento del inventario</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RankList
            title="Más rentables"
            periodLabel={`${periodLabel} · beneficio bruto`}
            empty="Aún no hay ventas con beneficio en este periodo."
            items={b.top_profit.map((p) => ({
              key: p.product_id,
              href: `/productos/${p.product_id}`,
              name: p.product_name,
              sub: `${units(p.units)} uds. · ventas ${money(p.revenue)}`,
              value: money(p.profit),
            }))}
          />
          <RankList
            title="Más vendidos"
            periodLabel={`${periodLabel} · unidades`}
            empty="Aún no hay ventas en este periodo."
            items={b.top_units.map((p) => ({
              key: p.product_id,
              href: `/productos/${p.product_id}`,
              name: p.product_name,
              sub: `ventas ${money(p.revenue)} · beneficio ${money(p.profit)}`,
              value: `${units(p.units)} uds.`,
            }))}
          />
          <RankList
            title="Más tiempo en stock"
            periodLabel="Desde la recepción del lote"
            empty="No hay unidades en el almacén."
            items={b.aging.map((a, i) => ({
              key: `${a.product_id}-${a.lot_label}-${i}`,
              href: `/productos/${a.product_id}`,
              name: variantDisplay(a.product_name, a.variant_name),
              sub: `${a.lot_label} · ${units(a.units)} uds. · ${money(a.value)} · desde ${date(a.received_at)}`,
              value: `${units(a.days)} días`,
            }))}
          />
          <Panel title="Valor del inventario" description="Unidades disponibles hoy">
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Capital invertido</dt>
                <dd className="display num text-[22px]">{money(inv.stock_value)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Valor potencial de venta</dt>
                <dd className="display num text-[22px]">{money(inv.potential_value)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Beneficio potencial</dt>
                <dd className="display num text-[22px] text-good">{money(inv.potential_profit)}</dd>
              </div>
              {(n(inv.estimated_units) > 0 || n(inv.unpriced_units) > 0) && (
                <p className="border-t border-line pt-2.5 text-[12px] text-muted">
                  {n(inv.estimated_units) > 0 && <>{units(inv.estimated_units)} uds. valoradas con su precio medio de venta. </>}
                  {n(inv.unpriced_units) > 0 && <>{units(inv.unpriced_units)} uds. sin precio de venta: no cuentan en el valor potencial.</>}
                </p>
              )}
              <Link href="/inventario" className="text-[13px] font-semibold text-brand-ink hover:underline">
                Ver inventario y lotes ›
              </Link>
            </dl>
          </Panel>
        </div>
      </section>

      {/* D · Actividad reciente */}
      <Panel
        title="Actividad reciente"
        description="Últimos movimientos de stock registrados"
        padded={false}
        actions={
          <Link href="/auditoria" className="text-[13px] font-semibold text-brand-ink hover:underline">
            Ver todo ›
          </Link>
        }
      >
        {b.recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {b.recent.map((m) => {
              const Icon = MOVE_ICON[m.movement_type] ?? ArrowLeftRight;
              const q = n(m.quantity);
              return (
                <li key={m.id}>
                  <Link href={movementLink(m)} className="press flex items-center gap-3 px-4 py-2.5 hover:bg-brand-soft/40">
                    <span
                      className={clsx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        q > 0 ? "bg-good-soft text-good-ink" : "bg-brand-soft text-brand-ink",
                      )}
                    >
                      <Icon size={17} strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{movementTitle(m)}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {variantDisplay(m.product_name, m.variant_name)} · {m.lot_label}
                        {m.responsible_name ? ` · ${m.responsible_name}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={clsx("num block text-sm font-bold", q > 0 ? "text-good" : "text-ink")}>
                        {q > 0 ? "+" : "−"}
                        {units(Math.abs(q))}
                      </span>
                      <span className="num block text-[11.5px] text-muted">{date(m.occurred_at)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Mientras cargan los datos */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Cargando el panel" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={clsx("h-[132px] animate-pulse rounded-[var(--radius-md)] bg-surface-2", (i === 0 || i === 4) && "col-span-2 lg:col-span-1")}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
    </div>
  );
}
