import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { safeNext } from "@/lib/safe-redirect";
import { PRICE_LABEL, TRIAL_DAYS } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignupPage({ searchParams }: PageProps<"/registro">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/bienvenida");
  // Si viene de una invitación, el email es el de la invitación
  let invitedEmail: string | undefined;
  const m = /^\/invitacion\/([0-9a-f]{64})$/.exec(next);
  if (m) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("invitation_info", { p_token: m[1] });
    invitedEmail = (data as { email?: string; state?: string } | null)?.state === "valida" ? (data as { email: string }).email : undefined;
  }
  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle={invitedEmail ? "Crea tu cuenta para unirte al equipo." : `${TRIAL_DAYS} días gratis, sin tarjeta. Después, ${PRICE_LABEL} al mes.`}
    >
      <SignupForm next={next} invitedEmail={invitedEmail} />
      <p className="mt-6 text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href={`/login${next !== "/bienvenida" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-ink underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
