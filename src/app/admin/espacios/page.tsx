import type { Metadata } from "next";
import { Badge, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { date, olderThanDays } from "@/lib/format";
import { loadPlatform } from "../data";
import { OrgActions } from "../org-actions";

export const metadata: Metadata = { title: "Espacios y suscripciones" };

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = { activa: "good", suspendida: "warn", eliminacion_solicitada: "bad" };

/**
 * Panel del dueño del servicio: SOLO cifras y estado de las cuentas. No hay
 * forma de ver el inventario, las ventas ni los archivos de ningún cliente.
 */
export default async function OrgsPage() {
  const { orgs: list, error } = await loadPlatform();
  return (
    <>
      <PageHeader title="Espacios y suscripciones" description="Estado de cada cuenta: suscripción, prueba, acceso gratuito, suspensión y eliminación. Sin acceso a su contenido." />
      {error && (
        <Notice tone="bad" className="mb-4">
          {error}
        </Notice>
      )}
      <Panel padded={false}>
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
