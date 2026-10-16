import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPinned } from "lucide-react";
import { CarrierIcon } from "@/components/marks";
import { ProductThumb } from "@/components/thumb";
import { Empty, Notice, PageHeader, LinkButton, clsx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, dateTime } from "@/lib/format";
import { trackingConfigured } from "@/lib/tracking/seventeen";
import { RefreshAllButton } from "../seguimiento/tracking-actions";
import { groupByCarrier, loadPendingShipments, NO_CARRIER } from "./data";

export const metadata: Metadata = { title: "Pendientes de envío" };

export default async function ShipmentsPage() {
  const user = await requireUser();
  const { rows, error } = await loadPendingShipments();
  const groups = groupByCarrier(rows);
  const total = rows.length;
  const urgent = rows.filter((r) => r.deadline && Date.parse(r.deadline) - Date.now() < 36 * 3600_000).length;

  return (
    <>
      <PageHeader
        title="Pendientes de envío"
        description={
          total > 0
            ? `${total} ${total === 1 ? "paquete" : "paquetes"} por enviar${user.role === "admin" ? "" : " de tus ventas"}, separados por transportista. Al marcar uno como enviado empieza su seguimiento.`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {trackingConfigured() && <RefreshAllButton />}
            <LinkButton href="/seguimiento">
              <MapPinned size={17} strokeWidth={1.75} />
              Seguimiento
            </LinkButton>
          </div>
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {urgent > 0 && (
        <Notice tone="warn" className="mb-4">
          {urgent === 1 ? "1 paquete tiene" : `${urgent} paquetes tienen`} la fecha límite de envío en menos de 36 horas.
        </Notice>
      )}

      {!error && total === 0 && (
        <div className="rounded-[var(--radius-md)] border border-line bg-surface">
          <Empty title="Todo enviado" action={<LinkButton href="/seguimiento">Ver el seguimiento</LinkButton>}>
            No queda ningún paquete pendiente. Cuando confirmes una venta con envío, aparecerá aquí hasta que la marques como enviada.
          </Empty>
        </div>
      )}

      {groups.length > 0 && (
        <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key}>
              <Link
                href={`/envios/${g.key}`}
                className="press group flex h-full flex-col gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4 transition-colors hover:border-line-strong focus-visible:border-brand"
              >
                <div className="flex items-center gap-3">
                  {g.key === NO_CARRIER ? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-dashed border-line-strong text-[13px] text-faint">?</span>
                  ) : (
                    <CarrierIcon name={g.name} size={40} showName={false} />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] font-semibold text-ink">{g.name}</h2>
                    <p className="text-[13px] text-faint">
                      {g.count} {g.count === 1 ? "pedido pendiente" : "pedidos pendientes"}
                    </p>
                  </div>
                  <span className="num flex h-9 min-w-9 items-center justify-center rounded-full bg-brand px-2.5 text-[16px] font-semibold text-on-brand">{g.count}</span>
                </div>
                {g.photos.length > 0 && (
                  <div className="flex -space-x-2">
                    {g.photos.map((p, i) => (
                      <ProductThumb key={i} src={p} alt="" size={40} rounded={10} className="ring-2 ring-surface" />
                    ))}
                    {g.count > g.photos.length && (
                      <span className="num flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-[12px] font-semibold text-muted ring-2 ring-surface">
                        +{g.count - g.photos.length}
                      </span>
                    )}
                  </div>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-faint">El más antiguo</dt>
                  <dd className="num">{date(g.oldest)}</dd>
                  {g.deadline && (
                    <>
                      <dt className="text-faint">Enviar antes de</dt>
                      <dd className={clsx("num", Date.parse(g.deadline) - Date.now() < 36 * 3600_000 && "font-semibold text-warn")}>{dateTime(g.deadline)}</dd>
                    </>
                  )}
                  <dt className="text-faint">Etiquetas</dt>
                  <dd className={g.withoutLabel ? "font-semibold text-warn" : "text-good-ink"}>{g.withoutLabel ? `${g.withoutLabel} sin etiqueta` : "Todas preparadas"}</dd>
                </dl>
                <span className="mt-auto inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-ink">
                  Ver pedidos <ChevronRight size={16} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
