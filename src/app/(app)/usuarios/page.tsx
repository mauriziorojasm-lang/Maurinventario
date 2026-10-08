import type { Metadata } from "next";
import { Badge, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { EditUserButton, NewUserButton } from "./user-forms";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, { data: resp }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("responsibles").select("id, name, profile_id").is("deleted_at", null).order("name"),
  ]);
  const respOf = new Map((resp ?? []).filter((r) => r.profile_id).map((r) => [r.profile_id as string, r.name as string]));
  const free = (resp ?? []).filter((r) => !r.profile_id).map((r) => ({ id: r.id, name: r.name }));
  const serviceRole = !!process.env.SUPABASE_SECRET_KEY;
  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién puede entrar y con qué permisos. Los permisos los aplica la base de datos, no solo la pantalla."
        actions={<NewUserButton freeResponsibles={free} />}
      />
      {!serviceRole && (
        <Notice tone="warn" className="mb-4" title="Falta SUPABASE_SECRET_KEY">
          Sin ella no se pueden crear usuarios ni cambiar contraseñas desde aquí. Añádela en las variables de entorno (ver README) o crea los usuarios desde el panel de Supabase.
        </Notice>
      )}
      <Panel padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th>Responsable vinculado</Th>
              <Th>Alta</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <Tr key={p.id} muted={!p.active}>
                <Td>
                  <span className="font-semibold">{p.full_name ?? p.email}</span>
                  {p.full_name && <span className="block text-xs text-muted">{p.email}</span>}
                </Td>
                <Td>{p.role === "admin" ? <Badge tone="info">Administrador</Badge> : <Badge>Vendedor</Badge>}</Td>
                <Td>{p.active ? <Badge tone="good">Activo</Badge> : <Badge tone="bad">Desactivado</Badge>}</Td>
                <Td>{respOf.get(p.id) ?? (p.role === "vendedor" ? <Badge tone="warn">Sin vincular</Badge> : "—")}</Td>
                <Td>{dateTime(p.created_at)}</Td>
                <Td>
                  <EditUserButton user={p} isMe={p.id === me.id} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <p className="mt-3 text-[13px] text-muted">Para vincular un usuario a un responsable que ya existe, edita el responsable en Responsables.</p>
    </>
  );
}
