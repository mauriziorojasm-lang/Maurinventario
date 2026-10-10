/**
 * Panel de negocio del Inicio (solo administrador), por widgets.
 * Qué widgets se ven, su tamaño y su orden se eligen en
 * Ajustes → Personalizar panel (aquí no se pueden mover ni quitar).
 * Todos los datos son reales: dashboard_widgets (ventas por periodo y
 * plataforma, mismos criterios que el resto de la app) y, para antigüedad
 * del stock y actividad, business_dashboard. Si un dato no se puede
 * calcular, se dice.
 */
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Minus,
  PackageMinus,
  PackagePlus,
  Receipt,
  RotateCcw,
  Truck,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { CountUp } from "@/components/count-up";
import { Notice, clsx } from "@/components/ui";
import { MOVEMENT_TYPES, date, money, units } from "@/lib/format";
import { GRANULARITIES, PERIODS, WIDGET_BY_ID, type Period, type WidgetItem, type WidgetSize } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";

type Totals = { revenue: number; cost: number; profit: number; orders: number; units: number };
type ProductStat = { product_id: string; product_name: string; profit: number; revenue: number; units: number; cost?: number };
type SeriesPoint = { key: string; revenue: number; profit: number; orders: number; units: number };
type PlatformStat = { platform_id: string; platform_name: string; orders: number; units: number; revenue: number; profit: number };
export type WidgetsData = {
  period: Period;
  start: string;
  end: string;
  prev_start: string;
  prev_end: string;
  current: Totals;
  previous: Totals;
  platforms: PlatformStat[];
  top_units: ProductStat[];
  top_profit: ProductStat[];
  series: { dia: SeriesPoint[]; semana: SeriesPoint[]; mes: SeriesPoint[] };
  inventory: { units: number; stock_value: number; potential_value: number; potential_profit: number; unpriced_units: number; products_with_stock: number };
  pending_shipments: number;
};
type AgingLot = { product_id: string; product_name: string; variant_name: string; lot_label: string; received_at: string; days: number; units: number; value: number };
type Movement = {
  id: number;
  movement_type: string;
  occurred_at: string;
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
type Extra = { aging: AgingLot[]; recent: Movement[] } | null;

const n = (v: unknown) => Number(v ?? 0);
const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};

// ---------------------------------------------------------------------
// Comparación con el periodo anterior
// ---------------------------------------------------------------------
type Delta = { text: string; dir: "up" | "down" | "flat"; tone: "good" | "bad" | "neutral" } | { note: string };

function pctDelta(cur: number, prev: number, vs: string): Delta {
  if (prev === 0 && cur === 0) return { note: `Sin datos ${vs}` };
  if (prev <= 0) return { note: `${vs}: ${money(prev)} (sin % comparable)` };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const dir = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  return { text: `${pct > 0 ? "+" : ""}${pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} % ${vs}`, dir, tone: dir === "flat" ? "neutral" : dir === "up" ? "good" : "bad" };
}

function DeltaLine({ d }: { d?: Delta }) {
  if (!d) return null;
  if ("note" in d) return <p className="text-[12px] text-muted">{d.note}</p>;
  const Icon = d.dir === "up" ? ArrowUpRight : d.dir === "down" ? ArrowDownRight : Minus;
  return (
    <p
      className={clsx(
        "flex items-start gap-1 text-[12.5px] font-semibold leading-snug [&>svg]:mt-px [&>svg]:shrink-0",
        d.tone === "good" && "text-good",
        d.tone === "bad" && "text-danger",
        d.tone === "neutral" && "text-ink-soft",
      )}
    >
      <Icon size={15} strokeWidth={2.5} aria-hidden />
      <span className="min-w-0 [font-variant-numeric:tabular-nums]">{d.text}</span>
    </p>
  );
}

// ---------------------------------------------------------------------
// Marco común y tamaños de la cuadrícula
// ---------------------------------------------------------------------
export const SIZE_CLASS: Record<WidgetSize, string> = {
  "1x1": "col-span-1",
  "2x1": "col-span-2",
  "2x2": "col-span-2 row-span-2",
};

function Frame({ title, sub, href, children, className, accent }: { title: string; sub?: string; href?: string; children: ReactNode; className?: string; accent?: boolean }) {
  return (
    <section
      aria-label={title}
      className={clsx(
        "flex min-w-0 flex-col gap-2 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]",
        accent && "border-t-4 border-t-brand",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</h3>
          {sub && <p className="truncate text-[11.5px] text-faint">{sub}</p>}
        </div>
        {href && (
          <Link href={href} className="-m-1 flex shrink-0 items-center rounded-full p-1 text-faint hover:text-ink" aria-label={`Ver ${title.toLowerCase()}`}>
            <ChevronRight size={18} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Big({ children, small }: { children: ReactNode; small?: boolean }) {
  return <div className={clsx("display num leading-none", small ? "text-[26px] sm:text-[30px]" : "text-[30px] sm:text-[34px]")}>{children}</div>;
}

// ---------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------
function Rank({ items, empty }: { items: { key: string; href: string; name: string; sub: string; value: string; tone?: "bad" }[]; empty: string }) {
  if (!items.length) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ol className="-mx-4 divide-y divide-line">
      {items.map((it, i) => (
        <li key={it.key}>
          <Link href={it.href} className="flex items-center gap-3 px-4 py-2 hover:bg-brand-soft/40">
            <span className="display num w-5 shrink-0 text-[17px] text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{it.name}</span>
              <span className="block truncate text-[12px] text-muted">{it.sub}</span>
            </span>
            <span className={clsx("display num shrink-0 text-[18px]", it.tone === "bad" && "text-danger")}>{it.value}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

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
// Un widget
// ---------------------------------------------------------------------
type Ctx = { w: WidgetsData; extra: Extra; compare: boolean; granularity: keyof typeof GRANULARITIES; scope: string; vs: string };

function Widget({ item, ctx }: { item: WidgetItem; ctx: Ctx }) {
  const { w, compare, scope, vs } = ctx;
  const def = WIDGET_BY_ID.get(item.id);
  if (!def) return null;
  const size = item.size;
  const wide = size !== "1x1";
  const big = size === "2x2";
  const cls = SIZE_CLASS[size];
  const cur = { revenue: n(w.current.revenue), profit: n(w.current.profit), cost: n(w.current.cost), orders: n(w.current.orders), units: n(w.current.units) };
  const prev = { revenue: n(w.previous.revenue), profit: n(w.previous.profit), cost: n(w.previous.cost), orders: n(w.previous.orders), units: n(w.previous.units) };
  const d = (a: number, b: number) => (compare ? pctDelta(a, b, vs) : undefined);
  const prevLine = (v: string) => wide && compare && <p className="mt-auto text-[12px] text-muted">Periodo anterior: {v}</p>;

  switch (item.id) {
    case "ventas":
      return (
        <Frame title={def.title} sub={scope} className={cls} href="/ventas">
          <Big small={!wide}>
            <CountUp value={cur.orders} format="units" />
          </Big>
          <p className="text-[12.5px] text-muted">
            {units(cur.units)} {cur.units === 1 ? "unidad" : "unidades"}
          </p>
          <DeltaLine d={d(cur.orders, prev.orders)} />
          {prevLine(`${units(prev.orders)} ventas`)}
        </Frame>
      );
    case "ingresos":
      return (
        <Frame title={def.title} sub={scope} className={cls} accent href="/ventas">
          <Big small={!wide}>
            <CountUp value={cur.revenue} />
          </Big>
          <DeltaLine d={d(cur.revenue, prev.revenue)} />
          {wide && <p className="text-[12px] text-muted">Ventas menos devoluciones · coste de lo vendido {money(cur.cost)}</p>}
          {prevLine(money(prev.revenue))}
        </Frame>
      );
    case "beneficio_bruto":
      return (
        <Frame title={def.title} sub={scope} className={cls}>
          <Big small={!wide}>
            <span className={cur.profit < 0 ? "text-danger" : undefined}>
              <CountUp value={cur.profit} />
            </span>
          </Big>
          <DeltaLine d={d(cur.profit, prev.profit)} />
          <p className="text-[12px] text-muted">Sin gastos del negocio: no es beneficio neto</p>
          {prevLine(money(prev.profit))}
        </Frame>
      );
    case "margen": {
      const m = cur.revenue > 0 ? (cur.profit / cur.revenue) * 100 : null;
      const pm = prev.revenue > 0 ? (prev.profit / prev.revenue) * 100 : null;
      let delta: Delta | undefined;
      if (compare && m !== null) {
        if (pm === null) delta = { note: `Sin ventas ${vs}` };
        else {
          const dd = m - pm;
          const dir = Math.abs(dd) < 0.05 ? "flat" : dd > 0 ? "up" : "down";
          delta = { text: `${dd > 0 ? "+" : ""}${dd.toLocaleString("es-ES", { maximumFractionDigits: 1 })} puntos ${vs}`, dir, tone: dir === "flat" ? "neutral" : dir === "up" ? "good" : "bad" };
        }
      }
      return (
        <Frame title={def.title} sub={scope} className={cls}>
          <Big small={!wide}>{m === null ? <span className="text-[20px] text-muted">Sin ventas</span> : `${m.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`}</Big>
          <DeltaLine d={delta} />
          {prevLine(pm === null ? "sin ventas" : `${pm.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`)}
        </Frame>
      );
    }
    case "ticket": {
      const t = cur.orders > 0 ? cur.revenue / cur.orders : null;
      const pt = prev.orders > 0 ? prev.revenue / prev.orders : 0;
      return (
        <Frame title={def.title} sub={scope} className={cls}>
          <Big small={!wide}>{t === null ? <span className="text-[20px] text-muted">Sin ventas</span> : <CountUp value={t} />}</Big>
          {t !== null && <DeltaLine d={d(t, pt)} />}
          {prevLine(prev.orders > 0 ? money(pt) : "sin ventas")}
        </Frame>
      );
    }
    case "stock":
      return (
        <Frame title={def.title} sub="Hoy" className={cls} href="/inventario">
          <Big small={!wide}>
            <CountUp value={n(w.inventory.units)} format="units" /> <span className="text-[16px] text-muted">uds.</span>
          </Big>
          <p className="text-[12.5px] text-muted">{units(w.inventory.products_with_stock)} productos distintos</p>
        </Frame>
      );
    case "valor_inventario":
      return (
        <Frame title={def.title} sub="Hoy · a coste medio" className={cls} href="/inventario">
          <Big small={!wide}>
            <CountUp value={n(w.inventory.stock_value)} />
          </Big>
          {wide ? (
            <dl className="mt-auto grid grid-cols-2 gap-2 text-[12.5px]">
              <div>
                <dt className="text-muted">Valor potencial de venta</dt>
                <dd className="num font-semibold">{money(w.inventory.potential_value)}</dd>
              </div>
              <div>
                <dt className="text-muted">Beneficio potencial</dt>
                <dd className="num font-semibold text-good">{money(w.inventory.potential_profit)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-[12px] text-muted">Capital invertido</p>
          )}
          {n(w.inventory.unpriced_units) > 0 && wide && <p className="text-[11.5px] text-muted">{units(w.inventory.unpriced_units)} uds. sin precio de venta no cuentan en el potencial.</p>}
        </Frame>
      );
    case "envios_pendientes": {
      const p = n(w.pending_shipments);
      return (
        <Frame title={def.title} sub="Ahora" className={cls} href="/envios">
          <div className="flex items-center gap-3">
            <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]", p > 0 ? "bg-brand text-on-brand" : "bg-good-soft text-good-ink")}>
              <Truck size={22} strokeWidth={2.25} />
            </span>
            <Big small>{units(p)}</Big>
          </div>
          <p className="text-[12.5px] text-muted">{p === 0 ? "Todo enviado" : p === 1 ? "paquete por enviar" : "paquetes por enviar"}</p>
        </Frame>
      );
    }
    case "evolucion": {
      const g = ctx.granularity;
      const data = (w.series[g] ?? []).map((s) => ({ month: s.key, revenue: n(s.revenue), profit: n(s.profit), orders: n(s.orders), units: n(s.units) }));
      const any = data.some((p) => p.revenue !== 0);
      const label = g === "dia" ? "Últimos 30 días" : g === "semana" ? "Últimas 12 semanas" : "Últimos 12 meses";
      return (
        <Frame title={def.title} sub={`${label}${scope.includes("·") ? ` · ${scope.split("·")[1].trim()}` : ""}`} className={cls}>
          {any ? (
            <MonthlyBars data={g === "dia" && !big ? data.slice(-14) : data} unit={g} height={big ? 240 : 150} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">Aún no hay ventas en este tramo.</p>
          )}
        </Frame>
      );
    }
    case "mas_vendidos":
      return (
        <Frame title={def.title} sub={scope} className={cls}>
          <Rank
            empty="Sin ventas en este periodo."
            items={w.top_units.slice(0, big ? 8 : 3).map((p) => ({
              key: p.product_id,
              href: `/productos/${p.product_id}`,
              name: p.product_name,
              sub: `ingresos ${money(p.revenue)} · beneficio ${money(p.profit)}`,
              value: `${units(p.units)} uds.`,
            }))}
          />
        </Frame>
      );
    case "rentabilidad":
      return (
        <Frame title={def.title} sub={`${scope} · beneficio bruto`} className={cls}>
          <Rank
            empty="Sin ventas en este periodo."
            items={w.top_profit.slice(0, big ? 8 : 3).map((p) => {
              const margin = n(p.revenue) !== 0 ? (n(p.profit) / n(p.revenue)) * 100 : null;
              return {
                key: p.product_id,
                href: `/productos/${p.product_id}`,
                name: p.product_name,
                sub: `${units(p.units)} uds. · margen ${margin === null ? "—" : `${margin.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`}`,
                value: money(p.profit),
                tone: n(p.profit) < 0 ? "bad" : undefined,
              };
            })}
          />
        </Frame>
      );
    case "por_plataforma": {
      const total = w.platforms.reduce((a, p) => a + Math.max(0, n(p.revenue)), 0);
      const list = w.platforms.slice(0, big ? 8 : 4);
      return (
        <Frame title={def.title} sub={scope} className={cls}>
          {list.length === 0 ? (
            <p className="py-4 text-sm text-muted">Sin ventas en este periodo.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {list.map((p) => {
                const share = total > 0 ? Math.max(0, n(p.revenue)) / total : 0;
                return (
                  <li key={p.platform_id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{p.platform_name}</span>
                      <span className="num shrink-0">
                        {money(p.revenue)} <span className="text-[12px] text-muted">· {units(p.orders)} {n(p.orders) === 1 ? "venta" : "ventas"}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/6" aria-hidden>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Frame>
      );
    }
    case "antiguedad":
      return (
        <Frame title={def.title} sub="Desde la recepción del lote" className={cls} href="/inventario">
          {!ctx.extra ? (
            <p className="py-4 text-sm text-muted">No se ha podido cargar.</p>
          ) : (
            <Rank
              empty="No hay unidades en el almacén."
              items={ctx.extra.aging.slice(0, big ? 6 : 3).map((a, i) => ({
                key: `${a.product_id}-${a.lot_label}-${i}`,
                href: `/productos/${a.product_id}`,
                name: variantDisplay(a.product_name, a.variant_name),
                sub: `${a.lot_label} · ${units(a.units)} uds. · ${money(a.value)}`,
                value: `${units(a.days)} d`,
              }))}
            />
          )}
        </Frame>
      );
    case "actividad":
      return (
        <Frame title={def.title} sub="Últimos movimientos de stock" className={cls} href="/auditoria">
          {!ctx.extra ? (
            <p className="py-4 text-sm text-muted">No se ha podido cargar.</p>
          ) : ctx.extra.recent.length === 0 ? (
            <p className="py-4 text-sm text-muted">Todavía no hay movimientos.</p>
          ) : (
            <ul className="-mx-4 divide-y divide-line">
              {ctx.extra.recent.slice(0, big ? 6 : 3).map((m) => {
                const Icon = MOVE_ICON[m.movement_type] ?? ArrowLeftRight;
                const q = n(m.quantity);
                return (
                  <li key={m.id}>
                    <Link href={movementLink(m)} className="flex items-center gap-3 px-4 py-2 hover:bg-brand-soft/40">
                      <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", q > 0 ? "bg-good-soft text-good-ink" : "bg-brand-soft text-brand-ink")}>
                        <Icon size={16} strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{movementTitle(m)}</span>
                        <span className="block truncate text-[12px] text-muted">{variantDisplay(m.product_name, m.variant_name)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={clsx("num block text-sm font-bold", q > 0 ? "text-good" : "text-ink")}>
                          {q > 0 ? "+" : "−"}
                          {units(Math.abs(q))}
                        </span>
                        <span className="num block text-[11px] text-muted">{date(m.occurred_at)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Frame>
      );
    default:
      return null;
  }
}

/** Cuadrícula de widgets: 2 columnas en el móvil y el iPad, 4 en el ordenador. */
export function WidgetGrid({ items, ctx }: { items: WidgetItem[]; ctx: Ctx }) {
  return (
    <div className="grid grid-flow-row-dense auto-rows-[minmax(140px,auto)] grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Widget key={it.id} item={it} ctx={ctx} />
      ))}
    </div>
  );
}

/** Carga los datos y pinta el panel con los widgets elegidos. */
export async function BusinessDashboard({
  items,
  period,
  platformId,
  platformName,
  compare,
  granularity,
}: {
  items: WidgetItem[];
  period: Period;
  platformId: string | null;
  platformName: string | null;
  compare: boolean;
  granularity: keyof typeof GRANULARITIES;
}) {
  const supabase = await createClient();
  const needExtra = items.some((i) => i.id === "antiguedad" || i.id === "actividad");
  const [main, extra] = await Promise.all([
    supabase.rpc("dashboard_widgets", { p_period: period, p_platform: platformId }),
    needExtra ? supabase.rpc("business_dashboard", { p_months: 6 }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (main.error || !main.data) {
    return (
      <Notice tone="bad" title="No se han podido cargar los datos del panel">
        {main.error?.message?.includes("dashboard_widgets") ? "Falta la función dashboard_widgets en la base de datos (migración 20261011120000_ajustes_y_widgets.sql)." : "Comprueba la conexión y vuelve a cargar la página."}
      </Notice>
    );
  }
  const w = main.data as WidgetsData;
  const ex = extra.data ? { aging: (extra.data as { aging: AgingLot[] }).aging ?? [], recent: (extra.data as { recent: Movement[] }).recent ?? [] } : null;
  const scope = `${PERIODS[period]}${platformName ? ` · ${platformName}` : ""}`;
  const vs = period === "dia" ? "vs ayer" : `vs ${shortDate(w.prev_start)}–${shortDate(w.prev_end)}`;
  if (!items.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
        No tienes widgets en el panel.{" "}
        <Link href="/configuracion/panel" className="font-semibold text-brand-ink underline">
          Añade los que quieras
        </Link>
        .
      </div>
    );
  }
  return <WidgetGrid items={items} ctx={{ w, extra: needExtra ? ex : null, compare, granularity, scope, vs }} />;
}

/** Mientras cargan los datos */
export function DashboardSkeleton() {
  return (
    <div className="grid auto-rows-[140px] grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cargando el panel" aria-busy>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={clsx("skeleton rounded-[var(--radius-md)]", (i === 0 || i === 5) && "col-span-2", i === 5 && "row-span-2")} />
      ))}
    </div>
  );
}
