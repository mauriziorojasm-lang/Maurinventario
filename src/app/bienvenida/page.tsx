import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { requireSession } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Bienvenida" };

/** Primer paso tras registrarse: crear el espacio de trabajo (o esperar una invitación). */
export default async function WelcomePage() {
  const user = await requireSession();
  if (user.orgId) redirect("/");
  const supabase = await createClient();
  const { data: orgs } = await supabase.rpc("my_organizations");
  const suspended = ((orgs ?? []) as { status: string }[]).some((o) => o.status === "suspendida");
  const { data: meta } = await supabase.auth.getUser();
  const suggested = (meta.user?.user_metadata?.business_name as string | undefined) ?? "";
  return (
    <AuthLayout
      title={`Hola${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
      subtitle={suspended ? undefined : `Crea tu espacio de trabajo: ahí estarán tu inventario, tus ventas y tu equipo. Tienes ${TRIAL_DAYS} días gratis.`}
      aside={<p className="font-[family-name:var(--font-display)] text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] text-white sm:text-[40px] lg:text-[52px]">Tu negocio, <span className="text-[#36C784]">tus datos</span>. Solo los ve tu equipo.</p>}
    >
      {suspended && (
        <p className="mb-5 rounded-[var(--radius-sm)] bg-warn-soft px-3 py-2 text-sm text-ink">
          Tu espacio de trabajo está suspendido. Escríbenos para resolverlo; tus datos se conservan.
        </p>
      )}
      <CreateOrgForm suggested={suggested} />
      <p className="mt-5 text-[13px] text-muted">¿Te han invitado a un equipo? Abre el enlace de la invitación y entra con este mismo email ({user.email}).</p>
      <form action="/auth/salir" method="post" className="mt-4">
        <button className="text-[13px] text-muted underline">Cerrar sesión</button>
      </form>
    </AuthLayout>
  );
}
