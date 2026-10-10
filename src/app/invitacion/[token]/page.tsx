import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitation } from "./accept";

export const metadata: Metadata = { title: "Invitación" };

const ROLE = { admin: "administrador", vendedor: "vendedor", almacen: "almacén" } as const;

export default async function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await createClient();
  const info = valid ? ((await supabase.rpc("invitation_info", { p_token: token })).data as { organization: string; email: string; role: keyof typeof ROLE; state: string } | null) : null;
  const user = await getCurrentUser();
  const here = `/invitacion/${token}`;

  if (!info || info.state !== "valida") {
    return (
      <AuthLayout title="Invitación no válida" subtitle="El enlace no existe, ya se usó, se ha revocado o ha caducado. Pide a quien te invitó que te envíe una nueva.">
        <Link href="/" className={buttonClass("secondary", "md")}>
          Ir al inicio
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Te han invitado" subtitle={<>Únete a <strong>{info.organization}</strong> como {ROLE[info.role]}.</>}>
      {!user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">La invitación es para <strong>{info.email}</strong>.</p>
          <Link href={`/registro?next=${encodeURIComponent(here)}`} className={buttonClass("primary", "md")}>
            Crear cuenta
          </Link>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className={buttonClass("secondary", "md")}>
            Ya tengo cuenta: entrar
          </Link>
        </div>
      ) : user.email.toLowerCase() !== info.email ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Has entrado como <strong>{user.email}</strong>, pero la invitación es para <strong>{info.email}</strong>.
          </p>
          <form action="/auth/salir" method="post">
            <button className={buttonClass("secondary", "md")}>Cerrar sesión y entrar con el otro email</button>
          </form>
        </div>
      ) : (
        <AcceptInvitation token={token} />
      )}
    </AuthLayout>
  );
}
