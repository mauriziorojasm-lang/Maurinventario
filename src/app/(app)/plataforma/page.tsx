import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Figures, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { date, olderThanDays } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OrgActions } from "./org-actions";

export const metadata: Metadata = { title: "Plataforma" };

type Stats = Record<
  "organizations" | "users" | "trials_active" | "trials_expired" | "active" | "past_due" | "canceled" | "cancel_scheduled" | "comped" | "suspended" | "deletion_requested" | "new_last_30d",
  number
>;
type Org = {
  id: string;
  name: string;
  created_at: string;
  status: string;
  owner_email: string | null;
  members: number;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  comped: boolean | null;
  deletion_requested_at: string | null;
};

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = { activa: "good", suspendida: "warn", eliminacion_solicitada: "bad" };

/**
 * Panel del dueño del servicio: SOLO cifras y estado de las cuentas. No hay
 * forma de ver el inventario, las ventas ni los archivos de ningún cliente.
 */
export default async function PlatformPage() {
  const me = await requireSession();
  if (!me.isPlatformAdmin) redirect("/?aviso=sin-permiso");
  const supabase = await createClient();
  const [stats, orgs] = await Promise.all([supabase.rpc("platform_stats"), supabase.rpc("platform_organizations")]);
  const s = (stats.data ?? {}) as Partial<Stats>;
  const list = (orgs.data ?? []) as Org[];
  const mrr = ((s.active ?? 0) * 4.99).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return (
    <>
      <PageHeader title="Plataforma" description="Cifras agregadas y estado de las cuentas. Desde aquí no se puede ver el contenido de ningún espacio." />
      {(stats.error || orgs.error) && (
        <Notice tone="bad" className="mb-4">
          No se han podido cargar los datos.
        </Notice>
      )}
      <Figures
        items={[
          { label: "Espacios", value: String(s.organizations ?? 0), note: `${s.new_last_30d ?? 0} nuevos en 30 días` },
          { label: "Usuarios", value: String(s.users ?? 0) },
          { label: "De pago", value: String(s.active ?? 0), note: `≈ ${mrr}/mes antes de comisiones` },
          { label: "En prueba", value: String(s.trials_active ?? 0), note: `${s.trials_expired ?? 0} pruebas terminadas sin pagar` },
          { label: "Con problemas de pago", value: String(s.past_due ?? 0), note: `${s.canceled ?? 0} canceladas · ${s.cancel_scheduled ?? 0} cancelan al final del periodo` },
          { label: "Gratis / suspendidos", value: `${s.comped ?? 0} / ${s.suspended ?? 0}`, note: `${s.deletion_requested ?? 0} con eliminación pedida` },
        ]}
      />
      <Panel padded={false} className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Espacio</Th>
              <Th>Estado</Th>
              <Th>Suscripción</Th>
              <Th num>Miembros</Th>
              <Th>Alta</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const canPurge = o.status === "eliminacion_solicitada" && olderThanDays(o.deletion_requested_at, 30);
              return (
                <Tr key={o.id}>
                  <Td>
                    <span className="font-semibold">{o.name}</span>
                    <span className="block text-xs text-muted">{o.owner_email ?? "—"}</span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status.replace("_", " ")}</Badge>
                    {o.deletion_requested_at && <span className="block text-xs text-muted">pedida {date(o.deletion_requested_at)}</span>}
                  </Td>
                  <Td>
                    {o.comped ? <Badge tone="good">gratis</Badge> : <Badge>{o.subscription_status ?? "—"}</Badge>}
                    <span className="block text-xs text-muted">
                      {o.subscription_status === "trialing" && o.trial_ends_at ? `prueba hasta ${date(o.trial_ends_at)}` : o.current_period_end ? `${o.cancel_at_period_end ? "termina" : "renueva"} ${date(o.current_period_end)}` : ""}
                    </span>
                  </Td>
                  <Td num>{o.members}</Td>
                  <Td>{date(o.created_at)}</Td>
                  <Td className="text-right">
                    <OrgActions org={{ id: o.id, name: o.name, status: o.status, comped: !!o.comped, canPurge }} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
