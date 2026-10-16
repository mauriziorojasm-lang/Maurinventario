import Link from "next/link";
import { CarrierIcon, PlatformIcon } from "@/components/marks";
import { ProductThumb } from "@/components/thumb";
import { TrackingBadge, TrackingProgress, TrackingTimeline } from "@/components/tracking";
import { Notice, Panel } from "@/components/ui";
import { trackingLink } from "@/lib/carriers";
import { date, dateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadEvents, type Shipment } from "@/lib/tracking/data";
import { trackingConfigured } from "@/lib/tracking/seventeen";
import { TrackingCode, TrackingEditor } from "./tracking-actions";

const days = (ms: number) => {
  const d = Math.max(0, Math.round(ms / 8640_000) / 10);
  return `${d.toLocaleString("es-ES")} ${d === 1 ? "día" : "días"}`;
};

/**
 * Seguimiento de un envío: resumen, línea de tiempo y acciones. Se usa en
 * «Seguimiento» y dentro de la ficha de la venta (sin salir de ella).
 */
export async function TrackingPanel({ shipment: s, showSaleLink }: { shipment: Shipment; showSaleLink?: boolean }) {
  const supabase = await createClient();
  const [events, { data: carriers }] = await Promise.all([loadEvents(s.id), supabase.from("carriers").select("id, name").eq("active", true).order("name")]);
  const shipped = !!s.shippedAt;
  const automatic = trackingConfigured();
  const link = trackingLink(s.carrier, s.tracking);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
          <div className="flex gap-4 p-4 sm:p-5">
            <ProductThumb src={s.photo} alt={s.product} size={88} rounded={14} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[16px] font-semibold leading-snug">{s.product}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                <PlatformIcon name={s.platform} size={16} />
                {s.buyer && <span>· {s.buyer}</span>}
                <span className="num font-semibold text-ink">· {money(s.total)}</span>
              </p>
              <div className="mt-2">
                <TrackingBadge status={s.status} />
              </div>
            </div>
          </div>
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <TrackingProgress status={s.status} />
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-[13px]">
            <div className="bg-surface px-4 py-3">
              <dt className="text-faint">Transportista</dt>
              <dd className="mt-1 font-medium">
                <CarrierIcon name={s.carrier} size={18} />
              </dd>
            </div>
            <div className="min-w-0 bg-surface px-4 py-3">
              <dt className="text-faint">Código</dt>
              <dd className="mt-0.5">{s.tracking ? <TrackingCode code={s.tracking} link={link} /> : <span className="text-faint">Sin código</span>}</dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-faint">Enviado</dt>
              <dd className="num mt-1 font-medium">{s.shippedAt ? dateTime(s.shippedAt) : "Pendiente de envío"}</dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-faint">{s.deliveredAt ? "Entregado" : "Fecha estimada"}</dt>
              <dd className="num mt-1 font-medium">{s.deliveredAt ? dateTime(s.deliveredAt) : s.eta ? date(s.eta) : "—"}</dd>
            </div>
            {s.shippedAt && (
              <div className="col-span-2 bg-surface px-4 py-3">
                <dt className="text-faint">{s.deliveredAt ? "Tiempo de entrega" : "Tiempo desde el envío"}</dt>
                <dd className="num mt-1 font-medium">{days((s.deliveredAt ? Date.parse(s.deliveredAt) : Date.now()) - Date.parse(s.shippedAt))}</dd>
              </div>
            )}
          </dl>
        </section>

        <Panel title={s.tracking ? "Código y estado" : "Añadir código de seguimiento"}>
          {s.error && (
            <Notice tone="warn" className="mb-4">
              {s.error}
            </Notice>
          )}
          {automatic && s.checkedAt && <p className="mb-3 text-[12.5px] text-faint">Última consulta al transportista: {dateTime(s.checkedAt)}</p>}
          <TrackingEditor saleId={s.id} code={s.tracking} carrierId={s.carrierId} carriers={carriers ?? []} shipped={shipped} status={s.status} automatic={automatic} />
        </Panel>
        {showSaleLink && (
          <Link href={`/ventas/${s.id}`} className="text-[13.5px] font-semibold text-brand-ink hover:underline">
            Ver la venta {s.number} ›
          </Link>
        )}
      </div>

      <Panel title="Historial del envío" description={events.length ? `${events.length} ${events.length === 1 ? "movimiento" : "movimientos"}` : undefined}>
        <TrackingTimeline events={events} />
      </Panel>
    </div>
  );
}
