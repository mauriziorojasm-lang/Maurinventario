import type { Metadata } from "next";
import { Download, LogOut } from "lucide-react";
import { PageHeader, Panel, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "../../cuenta/password-form";
import { SignOutEverywhere } from "./sign-out-everywhere";

export const metadata: Metadata = { title: "Seguridad y privacidad" };

export default async function SecuritySettings() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Seguridad y privacidad" back={{ href: "/configuracion", label: "Ajustes" }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Contraseña" description="Si la olvidas, el administrador puede ponerte una nueva desde Usuarios.">
          <PasswordForm />
        </Panel>
        <Panel title="Sesiones" description={`Has entrado como ${user.email}.`}>
          <div className="flex flex-col gap-3">
            <form action="/auth/salir" method="post">
              <button className={buttonClass("secondary", "md")}>
                <LogOut size={17} /> Cerrar sesión en este dispositivo
              </button>
            </form>
            <SignOutEverywhere />
            <p className="text-[13px] text-muted">«En todos los dispositivos» cierra también el iPhone, el iPad y cualquier otro navegador donde hayas entrado.</p>
          </div>
        </Panel>
        <Panel title="Tus datos">
          <p className="mb-3 text-sm text-ink-soft">
            Descarga un archivo con tu perfil, tus ajustes, tu historial de actividad{user.responsibleId ? " y tus ventas" : ""}. Solo incluye lo tuyo.
          </p>
          <a href="/api/mis-datos" className={buttonClass("secondary", "md")} download>
            <Download size={17} /> Descargar mis datos
          </a>
          <p className="mt-4 text-[13px] text-muted">
            Las cuentas las crea y desactiva el administrador desde «Usuarios». No se pueden borrar del todo desde aquí porque las ventas registradas deben conservarse
            para la contabilidad; al desactivar una cuenta, ya no puede entrar.
          </p>
        </Panel>
        <Panel title="Privacidad">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-soft">
            <li>Los datos se guardan en tu proyecto de Supabase (base de datos y almacén privados). Solo entran los usuarios dados de alta por el administrador.</li>
            <li>Cada vendedor ve únicamente sus ventas; los costes y beneficios solo los ven los administradores. Lo controla la base de datos, no solo la pantalla.</li>
            <li>Las fotos se guardan sin datos internos (ubicación, fecha o modelo de móvil).</li>
            <li>Las contraseñas no se guardan en la app: las gestiona el sistema de acceso de Supabase.</li>
            <li>Tus ajustes solo afectan a tu usuario.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
