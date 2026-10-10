import type { Metadata } from "next";
import { Badge, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { mailConfigured } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { InviteButton, MemberActions, RevokeButton } from "./team-forms";

export const metadata: Metadata = { title: "Equipo" };

const ROLE = { admin: "Administrador", vendedor: "Vendedor", almacen: "Almacén" } as const;
const ROLE_TONE = { admin: "info", vendedor: "neutral", almacen: "warn" } as const;
const STATE_TONE = { pendiente: "warn", aceptada: "good", revocada: "neutral", caducada: "neutral" } as const;

type Member = { user_id: string; email: string; full_name: string | null; role: keyof typeof ROLE; joined_at: string; is_me: boolean };
type Invitation = { id: string; email: string; role: keyof typeof ROLE; created_at: string; expires_at: string; state: keyof typeof STATE_TONE };

export default async function TeamPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [members, invitations] = await Promise.all([supabase.rpc("org_members"), supabase.rpc("org_invitations")]);
  const list = (members.data ?? []) as Member[];
  const invites = (invitations.data ?? []) as Invitation[];
  const admins = list.filter((m) => m.role === "admin").length;
  return (
    <>
      <PageHeader
        title="Equipo"
        description={`Quién trabaja en ${me.orgName} y con qué permisos. Los permisos los aplica la base de datos, no solo la pantalla.`}
        actions={me.hasAccess ? <InviteButton mail={mailConfigured()} /> : undefined}
      />
      {(members.error || invitations.error) && (
        <Notice tone="bad" className="mb-4">
          No se ha podido cargar el equipo. Vuelve a intentarlo.
        </Notice>
      )}
      <Panel padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Persona</Th>
              <Th>Rol</Th>
              <Th>Desde</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <Tr key={m.user_id}>
                <Td>
                  <span className="font-semibold">{m.full_name || m.email}</span>
                  {m.is_me && <span className="ml-2 text-xs text-muted">(tú)</span>}
                  {m.full_name && <span className="block text-xs text-muted">{m.email}</span>}
                </Td>
                <Td>
                  <Badge tone={ROLE_TONE[m.role]}>{ROLE[m.role]}</Badge>
                </Td>
                <Td>{dateTime(m.joined_at)}</Td>
                <Td className="text-right">
                  <MemberActions member={m} lastAdmin={m.role === "admin" && admins <= 1} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <div className="mt-4 grid gap-2 text-[13px] text-muted sm:grid-cols-3">
        <p><strong className="text-ink">Administrador:</strong> todo, incluidos costes, beneficios, equipo y suscripción.</p>
        <p><strong className="text-ink">Vendedor:</strong> registra y consulta sus ventas; no ve costes ni las ventas de otros.</p>
        <p><strong className="text-ink">Almacén:</strong> ve stock y envíos y marca los envíos; no ve costes ni crea ventas.</p>
      </div>

      {invites.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-lg font-semibold">Invitaciones</h2>
          <Panel padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th>Caduca</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <Tr key={i.id} muted={i.state !== "pendiente"}>
                    <Td>{i.email}</Td>
                    <Td>{ROLE[i.role]}</Td>
                    <Td>
                      <Badge tone={STATE_TONE[i.state]}>{i.state}</Badge>
                    </Td>
                    <Td>{dateTime(i.expires_at)}</Td>
                    <Td className="text-right">{i.state === "pendiente" && <RevokeButton id={i.id} email={i.email} />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </>
  );
}
