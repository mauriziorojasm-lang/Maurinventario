import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Datos">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted">Nombre</dt>
            <dd>{user.fullName ?? "—"}</dd>
            <dt className="text-muted">Rol</dt>
            <dd>{user.role === "admin" ? "Administrador" : "Vendedor"}</dd>
            <dt className="text-muted">Responsable</dt>
            <dd>{user.responsibleName ?? "Sin vincular"}</dd>
          </dl>
        </Panel>
        <Panel title="Cambiar contraseña">
          <PasswordForm />
        </Panel>
      </div>
    </>
  );
}
