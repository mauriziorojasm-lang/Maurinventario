import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Figures, Notice, PageHeader, Panel } from "@/components/ui";
import { date } from "@/lib/format";
import { PRICE_LABEL } from "@/lib/site";
import { loadPlatform } from "./data";

export const metadata: Metadata = { title: "Resumen" };

const PRICE = 4.99;

/** Resumen del negocio: SOLO cifras y estado de las cuentas, nunca el contenido de un espacio. */
export default async function AdminHome() {
  const { stats: s, orgs, error } = await loadPlatform();
  const mrr = ((s.active ?? 0) * PRICE).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const attention = orgs.filter((o) => o.subscription_status === "past_due" || o.status === "suspendida" || o.status === "eliminacion_solicitada");
  const trialsEnding = orgs
    .filter((o) => o.subscription_status === "trialing" && o.trial_ends_at && !o.comped && Date.parse(o.trial_ends_at) > Date.now())
    .sort((a, b) => Date.parse(a.trial_ends_at!) - Date.parse(b.trial_ends_at!))
    .slice(0, 6);
  const recent = [...orgs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
  return (
    <>
      <PageHeader title="Resumen del negocio" description={`Cifras agregadas de Resellap (${PRICE_LABEL} al mes por espacio). Desde aquí no se puede ver el inventario, las ventas ni los archivos de ningún cliente.`} />
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      <Figures
        items={[
          { label: "Ingresos recurrentes (MRR)", value: mrr, note: "antes de comisiones e IVA" },
          { label: "Suscripciones de pago", value: String(s.active ?? 0), note: `${s.cancel_scheduled ?? 0} cancelan al final del periodo` },
          { label: "En prueba", value: String(s.trials_active ?? 0), note: `${s.trials_expired ?? 0} pruebas terminadas sin pagar` },
          { label: "Problemas de pago", value: String(s.past_due ?? 0), tone: (s.past_due ?? 0) > 0 ? "bad" : "default", note: `${s.canceled ?? 0} canceladas` },
        ]}
      />
      <Figures
        className="mt-3"
        items={[
          { label: "Espacios", value: String(s.organizations ?? 0), note: `${s.new_last_30d ?? 0} nuevos en 30 días` },
          { label: "Usuarios", value: String(s.users ?? 0) },
          { label: "Gratis", value: String(s.comped ?? 0) },
          { label: "Suspendidos", value: String(s.suspended ?? 0), note: `${s.deletion_requested ?? 0} con eliminación pedida` },
        ]}
      />
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title="Requieren atención" padded={false}>
          {attention.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Nada pendiente.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{o.name}</span>
                  <Badge tone={o.subscription_status === "past_due" ? "bad" : "warn"}>
                    {o.subscription_status === "past_due" ? "pago pendiente" : o.status.replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Pruebas que terminan pronto" padded={false}>
          {trialsEnding.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Ninguna.</p>
          ) : (
            <ul className="divide-y divide-line">
              {trialsEnding.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{o.name}</span>
                  <span className="num text-muted">{date(o.trial_ends_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Altas recientes" padded={false} actions={<Link href="/admin/espacios" className="text-[13px] font-semibold text-brand-ink hover:underline">Ver todos</Link>}>
          <ul className="divide-y divide-line">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{o.name}</span>
                <span className="num text-muted">{date(o.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
