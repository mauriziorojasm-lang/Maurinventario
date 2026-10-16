import { CarrierIcon } from "@/components/marks";
import { Empty, Figures, Notice, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { money, percent } from "@/lib/format";
import { loadShippingStats } from "@/lib/tracking/data";

const days = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })} d`);
const pct = (a: number, b: number) => (b ? percent((a / b) * 100) : "—");

/**
 * Informe de envíos: tiempos de entrega por transportista (desde «Marcar
 * como enviado» hasta «Entregado»), incidencias, retrasos, devoluciones y
 * lo que está ahora en camino.
 */
export async function ShippingReport({ from, to }: { from: string | null; to: string | null }) {
  const st = await loadShippingStats(from, to);
  if (!st) return <Notice tone="bad">No se ha podido calcular el informe de envíos.</Notice>;
  const carriers = st.carriers.filter((c) => c.shipments > 0);
  const measured = carriers.filter((c) => c.delivered > 0 && c.avg_days !== null);
  const fastest = [...measured].sort((a, b) => Number(a.avg_days) - Number(b.avg_days))[0];
  const slowest = [...measured].sort((a, b) => Number(b.avg_days) - Number(a.avg_days))[0];
  const worst = [...carriers].sort((a, b) => b.incidents / b.shipments - a.incidents / a.shipments)[0];
  const maxAvg = Math.max(1, ...measured.map((c) => Number(c.avg_days)));
  const it = st.in_transit;

  return (
    <div className="flex flex-col gap-5">
      <Figures
        items={[
          { label: "Envíos con seguimiento", value: String(st.totals.shipments) },
          { label: "Entregados", value: String(st.totals.delivered), note: pct(st.totals.delivered, st.totals.shipments) },
          { label: "Tiempo medio de entrega", value: days(st.overall.avg_days), note: `mediana ${days(st.overall.median_days)}` },
          { label: "En tránsito ahora", value: String(it?.count ?? 0), note: it?.value !== null && it?.value !== undefined ? `${money(it.value)} · beneficio ${money(it.profit ?? 0)}` : undefined },
          { label: "Antigüedad en tránsito", value: days(it?.avg_age_days), note: `la más antigua ${days(it?.max_age_days)}` },
        ]}
      />

      {measured.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <Answer q="¿Qué transportista tarda menos?" name={fastest?.carrier} a={fastest ? `${days(fastest.avg_days)} de media` : null} />
          <Answer
            q="¿Cuál tarda más?"
            name={measured.length > 1 ? slowest?.carrier : null}
            a={measured.length > 1 && slowest ? `${days(slowest.avg_days)} de media` : "Hace falta comparar al menos dos transportistas"}
          />
          <Answer
            q="¿Cuál tiene más incidencias?"
            name={worst && worst.incidents > 0 ? worst.carrier : null}
            a={worst && worst.incidents > 0 ? `${worst.incidents} de ${worst.shipments} (${pct(worst.incidents, worst.shipments)})` : "Ninguna incidencia"}
          />
        </dl>
      )}

      <Panel title="Comparativa por transportista" description="Tiempo medido desde que marcas «Enviado» hasta que el transportista confirma «Entregado»." padded={false}>
        {carriers.length === 0 ? (
          <Empty title="Aún no hay envíos con seguimiento">Los datos empiezan a contar desde que marcas un paquete como enviado en Resellap.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Transportista</Th>
                <Th className="min-w-[180px]">Tiempo medio</Th>
                <Th num>Mediana</Th>
                <Th num>Envíos</Th>
                <Th num>Entregados</Th>
                <Th num>En camino</Th>
                <Th num>Incidencias</Th>
                <Th num>Retrasos</Th>
                <Th num>Devueltos</Th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <Tr key={c.carrier_id ?? "sin"}>
                  <Td>
                    <CarrierIcon name={c.carrier_id ? c.carrier : null} size={20} className="font-medium" />
                  </Td>
                  <Td>
                    {c.avg_days !== null ? (
                      <span className="flex items-center gap-2" title={`${c.carrier}: ${days(c.avg_days)} de media (mín. ${days(c.min_days)}, máx. ${days(c.max_days)})`}>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                          <span
                            className={`block h-full rounded-full ${c === fastest && measured.length > 1 ? "bg-brand-mark" : "bg-ink"}`}
                            style={{ width: `${Math.max(4, (Number(c.avg_days) / maxAvg) * 100)}%` }}
                          />
                        </span>
                        <span className="num w-12 text-right text-[13px] font-semibold">{days(c.avg_days)}</span>
                      </span>
                    ) : (
                      <span className="text-faint">Sin entregas medidas</span>
                    )}
                  </Td>
                  <Td num>{days(c.median_days)}</Td>
                  <Td num>{c.shipments}</Td>
                  <Td num>
                    {c.delivered} <span className="text-faint">({pct(c.delivered, c.shipments)})</span>
                  </Td>
                  <Td num>{c.in_transit}</Td>
                  <Td num className={c.incidents ? "font-semibold text-warn" : undefined}>
                    {c.incidents} <span className="font-normal text-faint">({pct(c.incidents, c.shipments)})</span>
                  </Td>
                  <Td num>
                    {c.delayed} <span className="text-faint">({pct(c.delayed, c.shipments)})</span>
                  </Td>
                  <Td num>{c.returned}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {st.legacy_shipped > 0 && (
        <p className="text-[12.5px] text-faint">
          No incluye {st.legacy_shipped} ventas enviadas antes de activar el seguimiento (no se sabe a qué hora se enviaron). Retraso = más de 5 días sin entregar o pasada la fecha estimada.
        </p>
      )}
    </div>
  );
}

function Answer({ q, name, a }: { q: string; name: string | null | undefined; a: string | null }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3">
      <dt className="text-[12.5px] text-faint">{q}</dt>
      <dd className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] font-semibold">
        {name ? <CarrierIcon name={name} size={20} /> : null}
        {a && <span className="font-normal text-muted">{a}</span>}
        {!name && !a && <span className="font-normal text-faint">Aún sin datos</span>}
      </dd>
    </div>
  );
}
