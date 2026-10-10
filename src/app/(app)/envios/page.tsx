import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { date } from "@/lib/format";
import { groupByCarrier, loadPendingShipments } from "./data";

export const metadata: Metadata = { title: "Pendientes de envío" };

export default async function ShipmentsPage() {
  const user = await requireUser();
  const { rows, error } = await loadPendingShipments();
  const groups = groupByCarrier(rows);
  const total = rows.length;

  return (
    <>
      <PageHeader
        title="Pendientes de envío"
        description={
          total > 0
            ? `${total} ${total === 1 ? "paquete" : "paquetes"} por enviar${can(user, "ventas_todas") ? "" : " de tus ventas"}. Toca una paquetería para ver el detalle.`
            : undefined
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}

      {!error && total === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-good/30 bg-good-soft px-6 py-14 text-center">
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-good text-[28px] font-bold text-on-good">
            ✓
          </span>
          <h2 className="text-[22px] font-bold text-good-ink">Todo enviado</h2>
          <p className="max-w-[46ch] text-sm text-ink-soft">
            No queda ningún paquete pendiente. Cuando registres una venta de Vinted o Wallapop, aparecerá aquí hasta que la marques como enviada.
          </p>
        </section>
      )}

      {groups.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key}>
              <Link
                href={`/envios/${g.key}`}
                className="group flex h-full flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 transition-colors hover:border-brand focus-visible:border-brand"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="display text-[26px] uppercase text-ink">{g.name}</h2>
                  <span className="display num flex h-10 min-w-10 items-center justify-center rounded-full bg-brand px-2 text-[22px] text-on-brand">
                    {g.count}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-muted">{g.count === 1 ? "Paquete" : "Paquetes"}</dt>
                  <dd className="num font-semibold">{g.count} por enviar</dd>
                  <dt className="text-muted">El más antiguo</dt>
                  <dd className="num">{date(g.oldest)}</dd>
                  <dt className="text-muted">Etiquetas</dt>
                  <dd className={g.withoutLabel ? "font-semibold text-warn" : ""}>{g.withoutLabel ? `${g.withoutLabel} sin etiqueta` : "Todas subidas"}</dd>
                </dl>
                <span className="mt-auto text-[13px] font-semibold text-brand-ink group-hover:underline">Ver detalle ›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
