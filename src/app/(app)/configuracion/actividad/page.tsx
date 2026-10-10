import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { must } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Historial de actividad" };

const LABEL: Record<string, string> = {
  exportar: "Exportación",
  exportar_mis_datos: "Descarga de mis datos",
  copia_seguridad: "Copia de seguridad",
  comprobar_copia: "Comprobación de copia",
  preferencias: "Ajustes",
  restablecer_preferencias: "Ajustes restablecidos",
  cerrar_sesiones: "Sesiones cerradas",
  crear_venta: "Venta",
};

export default async function ActivityPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const rows = (must(await supabase.rpc("my_activity", { p_limit: 100 }), "tu historial") ?? []) as { occurred_at: string; action: string; entity: string; summary: string }[];
  return (
    <>
      <PageHeader
        title="Historial de actividad"
        back={{ href: "/configuracion", label: "Ajustes" }}
        description="Tus últimas operaciones registradas: exportaciones, copias, cambios de ajustes y acciones sobre ventas e inventario. Solo aparece lo que se registró en su momento."
      />
      {user.role === "admin" && (
        <p className="mb-4 text-sm text-ink-soft">
          Para ver todos los cambios de todos los usuarios, usa{" "}
          <Link href="/auditoria" className="font-semibold text-brand-ink underline">
            Auditoría
          </Link>
          .
        </p>
      )}
      <Panel padded={false}>
        {rows.length === 0 ? (
          <Empty title="Aún no hay operaciones registradas" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="num w-36 shrink-0 text-[13px] text-muted">{dateTime(r.occurred_at)}</span>
                <span className="w-44 shrink-0 text-[13px] font-semibold">{LABEL[r.action] ?? r.action.replace(/_/g, " ")}</span>
                <span className="min-w-0 flex-1 text-sm">{r.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
